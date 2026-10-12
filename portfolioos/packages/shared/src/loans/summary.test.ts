import { describe, it, expect } from 'vitest';
import { Decimal } from '../decimal.js';
import { summariseLoan, compareLoanOffers, groupScheduleByFy } from './summary.js';
import type { LoanInput } from './emi.types.js';

const D = (v: string | number) => new Decimal(v);
const base: LoanInput = { principal: D(100000), annualRatePct: D(12), tenureMonths: 12, firstEmiDate: '2026-11-05' };

describe('summariseLoan', () => {
  it('adds fees, APR and total cost', () => {
    const s = summariseLoan({ ...base, fees: { processingFeeKind: 'PCT', processingFeeValue: D(2), gstPct: D(18), otherCharges: D(0) } });
    expect(s.fees.total.toFixed(2)).toBe('2360.00');
    expect(s.aprPct.toFixed(2)).toBe('17.88');
    expect(s.nominalPct.toFixed(2)).toBe('16.56');
    expect(s.totalCost.equals(s.totalPaid.plus(s.fees.total))).toBe(true);
    expect(s.tax).toBeUndefined();
  });
  it('with tax: post-tax cost = total cost - tax saved', () => {
    const s = summariseLoan(base, { regime: 'OLD', loanKind: 'HOME_SELF', slabPct: D(30), remaining80C: D(150000) });
    expect(s.tax).toBeDefined();
    expect(s.postTaxCost!.equals(s.totalCost.minus(s.tax!.totalTaxSaved))).toBe(true);
  });
});

describe('groupScheduleByFy', () => {
  it('groups rows by Indian FY with sums and FY-end closing', () => {
    const s = summariseLoan(base); // Nov 2026 .. Oct 2027
    const g = groupScheduleByFy(s.schedule);
    expect(g.map((x) => x.fy)).toEqual(['2026-27', '2027-28']);
    expect(g[0]!.rows).toHaveLength(5);
    expect(g[1]!.rows).toHaveLength(7);
    expect(g[0]!.interest.plus(g[1]!.interest).equals(s.totalInterest)).toBe(true);
    expect(g[1]!.closing.toFixed(2)).toBe('0.00');
  });
});

describe('compareLoanOffers', () => {
  it('flags the cheapest by total cost and post-tax cost', () => {
    const c = compareLoanOffers([
      { label: 'A', input: { ...base, annualRatePct: D(12) } },
      { label: 'B', input: { ...base, annualRatePct: D(11), fees: { processingFeeKind: 'AMOUNT', processingFeeValue: D(5000), gstPct: D(18), otherCharges: D(0) } } },
      { label: 'C', input: { ...base, annualRatePct: D('11.5') } },
    ]);
    expect(c.offers.map((o) => o.label)).toEqual(['A', 'B', 'C']);
    expect(c.cheapestTotal).toEqual([2]);
    expect(c.cheapestPostTax).toBeNull();
  });
  it('marks every offer tied at the minimum', () => {
    const tax = { regime: 'OLD' as const, loanKind: 'HOME_SELF' as const, slabPct: D(30), remaining80C: D(150000) };
    const c = compareLoanOffers([
      { label: 'A', input: base, tax },
      { label: 'B', input: { ...base, annualRatePct: D(13) }, tax },
      { label: 'C', input: base, tax },
    ]);
    expect(c.cheapestTotal).toEqual([0, 2]);
    expect(c.cheapestPostTax).toEqual([0, 2]);
  });
});
