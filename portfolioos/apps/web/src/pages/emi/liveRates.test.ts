import { describe, it, expect } from 'vitest';
import type { LoanRateRowWire } from '@everypaisa/shared';
import { bestRowId, loanKindForRate, rateRange, repoLine } from './liveRates';

const row = (sourceId: string, min: string, over: Partial<LoanRateRowWire> = {}): LoanRateRowWire => ({
  sourceId, lender: sourceId, loanType: 'HOME', basis: 'REPO_LINKED', minRatePct: min, maxRatePct: null,
  effectiveDate: null, asOf: '2026-10-12T02:00:00.000Z', stale: false, sourceUrl: 'https://example.invalid', origin: 'AUTO', ...over,
});

describe('loanKindForRate', () => {
  it('maps loan types to tax defaults and keeps a let-out home choice', () => {
    expect(loanKindForRate('HOME', 'NONE')).toBe('HOME_SELF');
    expect(loanKindForRate('HOME', 'HOME_LET_OUT')).toBe('HOME_LET_OUT');
    expect(loanKindForRate('EDUCATION', 'HOME_SELF')).toBe('EDUCATION');
    expect(loanKindForRate('CAR', 'HOME_SELF')).toBe('NONE');
  });
});

describe('bestRowId', () => {
  it('lowest min rate by decimal value, ignoring stale rows', () => {
    expect(bestRowId([row('a', '8.10'), row('b', '7.95'), row('c', '7.70', { stale: true }), row('d', '10.00')])).toBe('b');
  });
  it('null when nothing is usable', () => {
    expect(bestRowId([])).toBeNull();
    expect(bestRowId([row('a', '8.10', { stale: true })])).toBeNull();
  });
});

describe('text', () => {
  it('rate range uses a plain hyphen; a headline rate reads "from"', () => {
    expect(rateRange({ minRatePct: '8.00', maxRatePct: '13.45' })).toBe('8.00% - 13.45%');
    expect(rateRange({ minRatePct: '7.25', maxRatePct: null })).toBe('from 7.25%');
  });
  it('repo line in dd/mm/yyyy, with the direction of the last change', () => {
    expect(repoLine({ ratePct: '5.50', effectiveDate: '2026-10-08', lastChange: null })).toBe('RBI repo rate 5.50% (as of 08/10/2026)');
    expect(repoLine({ ratePct: '5.50', effectiveDate: '2026-10-08', lastChange: { deltaPct: '-0.25', date: '2026-10-08' } }))
      .toBe('RBI repo rate 5.50% - cut by 0.25% on 08/10/2026');
    expect(repoLine({ ratePct: '5.75', effectiveDate: '2027-02-06', lastChange: { deltaPct: '0.25', date: '2027-02-06' } }))
      .toBe('RBI repo rate 5.75% - raised by 0.25% on 06/02/2027');
  });
});
