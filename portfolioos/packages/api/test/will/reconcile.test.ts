import { describe, it, expect } from 'vitest';
import type { WillAssetItem } from '@everypaisa/shared';
import { reconcileEstate, candidateToItem, OWNERSHIP_CHANGED_NOTE } from '../../src/services/will/estate/reconcile.js';
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

  it('keeps an ownership-change flag across refreshes until the user acts', () => {
    const joint = { type: 'JOINT' as const, sharePct: '50.00' };
    const first = reconcileEstate(
      [existing({ sourceKey: 'prop:1', ownership: { type: 'SOLE', sharePct: '100' }, review: 'CONFIRMED' })],
      [cand({ sourceKey: 'prop:1', ownership: joint, review: 'CONFIRMED' })],
    );
    expect(first[0]).toMatchObject({ review: 'NEEDS_REVIEW', note: OWNERSHIP_CHANGED_NOTE });
    // Second refresh: same source, candidate still CONFIRMED. The flag must stay.
    const second = reconcileEstate(first, [cand({ sourceKey: 'prop:1', ownership: joint, review: 'CONFIRMED' })]);
    expect(second[0]).toMatchObject({ review: 'NEEDS_REVIEW', note: OWNERSHIP_CHANGED_NOTE, ownership: joint });
    // The user confirms; the next refresh keeps the confirmation and the adapter's own note returns.
    const confirmed = second.map((i) => ({ ...i, review: 'CONFIRMED' as const }));
    const third = reconcileEstate(confirmed, [cand({ sourceKey: 'prop:1', ownership: joint, review: 'CONFIRMED' })]);
    expect(third[0]).toMatchObject({ review: 'CONFIRMED', note: null });
  });

  it('keeps an exclusion when the ownership changes, adopting the new ownership', () => {
    const out = reconcileEstate(
      [existing({ sourceKey: 'prop:1', ownership: { type: 'SOLE', sharePct: '100' }, review: 'EXCLUDED' })],
      [cand({ sourceKey: 'prop:1', ownership: { type: 'JOINT', sharePct: '50.00' } })],
    );
    expect(out[0]).toMatchObject({ review: 'EXCLUDED', ownership: { type: 'JOINT', sharePct: '50.00' } });
  });

  it('a confirmed item follows a new adapter exclusion, but not one the user already overrode', () => {
    const note = 'May duplicate your bank accounts - include it only if it is separate cash';
    const excludedNow = cand({ sourceKey: 'holdings:p:CASH', kind: 'HOLDING', review: 'EXCLUDED', note });
    const newlyExcluded = reconcileEstate([existing({ sourceKey: 'holdings:p:CASH', kind: 'HOLDING', review: 'CONFIRMED' })], [excludedNow]);
    expect(newlyExcluded[0]).toMatchObject({ review: 'EXCLUDED', note });
    // The user includes it again; the same exclusion must not undo that.
    const included = newlyExcluded.map((i) => ({ ...i, review: 'CONFIRMED' as const }));
    expect(reconcileEstate(included, [excludedNow])[0]).toMatchObject({ review: 'CONFIRMED', note });
  });
});
