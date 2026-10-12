import { describe, it, expect } from 'vitest';
import type { WillAssetItem } from '@everypaisa/shared';
import { reconcileEstate, candidateToItem } from '../../src/services/will/estate/reconcile.js';
import type { EstateCandidate } from '../../src/services/will/estate/types.js';

function cand(p: Partial<EstateCandidate> & { sourceKey: string }): EstateCandidate {
  return {
    side: 'ASSET', kind: 'BANK_ACCOUNT', label: 'Label', ref: null, value: '100.00', valueAsOf: '2026-10-12',
    ownership: { type: 'SOLE', sharePct: '100' }, review: 'CONFIRMED', note: null, ...p,
  };
}
function existing(p: Partial<WillAssetItem> & { sourceKey: string }): WillAssetItem {
  return { ...candidateToItem(cand({ sourceKey: p.sourceKey })), ...p };
}

describe('reconcileEstate', () => {
  it('adds new candidates with their suggested state', () => {
    const out = reconcileEstate([], [cand({ sourceKey: 'bank:1', review: 'NEEDS_REVIEW' })]);
    expect(out).toEqual([{ ...cand({ sourceKey: 'bank:1', review: 'NEEDS_REVIEW' }), userEdited: false }]);
  });

  it('refreshes value and label but keeps a confirmation', () => {
    const out = reconcileEstate(
      [existing({ sourceKey: 'bank:1', value: '100.00', review: 'CONFIRMED' })],
      [cand({ sourceKey: 'bank:1', value: '250.00', label: 'New label', review: 'NEEDS_REVIEW' })],
    );
    expect(out[0]).toMatchObject({ value: '250.00', label: 'New label', review: 'CONFIRMED' });
  });

  it('keeps an exclusion', () => {
    const out = reconcileEstate([existing({ sourceKey: 'bank:1', review: 'EXCLUDED' })], [cand({ sourceKey: 'bank:1' })]);
    expect(out[0]!.review).toBe('EXCLUDED');
  });

  it('keeps the value and ownership the user edited', () => {
    const out = reconcileEstate(
      [existing({ sourceKey: 'prop:1', value: '500.00', ownership: { type: 'JOINT', sharePct: '50' }, userEdited: true })],
      [cand({ sourceKey: 'prop:1', value: '900.00', ownership: { type: 'SOLE', sharePct: '100' } })],
    );
    expect(out[0]).toMatchObject({ value: '500.00', ownership: { type: 'JOINT', sharePct: '50' }, userEdited: true });
  });

  it('marks vanished items STALE instead of dropping them, but leaves exclusions alone', () => {
    const out = reconcileEstate(
      [existing({ sourceKey: 'bank:gone' }), existing({ sourceKey: 'bank:excl', review: 'EXCLUDED' })],
      [],
    );
    expect(out.map((i) => [i.sourceKey, i.review])).toEqual([['bank:gone', 'STALE'], ['bank:excl', 'EXCLUDED']]);
  });

  it('a STALE item that comes back takes the suggested state', () => {
    const out = reconcileEstate([existing({ sourceKey: 'bank:1', review: 'STALE' })], [cand({ sourceKey: 'bank:1', review: 'NEEDS_REVIEW' })]);
    expect(out[0]!.review).toBe('NEEDS_REVIEW');
  });

  it('never touches manual items', () => {
    const manual = existing({ sourceKey: 'manual:abc', label: 'Gold coins', value: '75000.00', kind: 'OTHER_ASSET' });
    const out = reconcileEstate([manual], [cand({ sourceKey: 'bank:1' })]);
    expect(out).toEqual([{ ...cand({ sourceKey: 'bank:1' }), userEdited: false }, manual]);
  });

  it('leaves the items of a failed adapter untouched, and a later good refresh keeps the confirmation', () => {
    const confirmed = existing({ sourceKey: 'bank:1', value: '100.00', review: 'CONFIRMED' });
    const lent = existing({ sourceKey: 'loanGiven:9' });
    const afterFail = reconcileEstate([confirmed, lent], [], { failedAdapterIds: ['bankAccounts', 'loans'] });
    // 'loans' owns the loan: prefix only, so loanGiven:9 still goes STALE.
    expect(afterFail).toEqual([confirmed, { ...lent, review: 'STALE' }]);
    const afterOk = reconcileEstate(afterFail, [cand({ sourceKey: 'bank:1', value: '300.00', review: 'NEEDS_REVIEW' })]);
    expect(afterOk[0]).toMatchObject({ sourceKey: 'bank:1', value: '300.00', review: 'CONFIRMED' });
  });

  it('marks nothing STALE when the fetch was truncated', () => {
    const out = reconcileEstate([existing({ sourceKey: 'bank:cut' })], [], { failedAdapterIds: ['truncated'] });
    expect(out[0]!.review).toBe('CONFIRMED');
  });

  it('asks for review again when the source ownership changes on an unedited item', () => {
    const out = reconcileEstate(
      [existing({ sourceKey: 'prop:1', ownership: { type: 'SOLE', sharePct: '100' }, review: 'CONFIRMED' })],
      [cand({ sourceKey: 'prop:1', ownership: { type: 'JOINT', sharePct: '50.00' }, review: 'CONFIRMED' })],
    );
    expect(out[0]).toMatchObject({ ownership: { type: 'JOINT', sharePct: '50.00' }, review: 'NEEDS_REVIEW' });
  });

  it('treats an equal share written differently as unchanged', () => {
    const out = reconcileEstate(
      [existing({ sourceKey: 'prop:1', ownership: { type: 'JOINT', sharePct: '50' }, review: 'CONFIRMED' })],
      [cand({ sourceKey: 'prop:1', ownership: { type: 'JOINT', sharePct: '50.00' } })],
    );
    expect(out[0]!.review).toBe('CONFIRMED');
  });

  it('a NEEDS_REVIEW item follows the suggestion', () => {
    const out = reconcileEstate([existing({ sourceKey: 'bank:1', review: 'NEEDS_REVIEW' })], [cand({ sourceKey: 'bank:1', review: 'CONFIRMED' })]);
    expect(out[0]!.review).toBe('CONFIRMED');
  });
});
