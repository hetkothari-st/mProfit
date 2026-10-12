import { describe, it, expect } from 'vitest';
import { Decimal } from '../decimal.js';
import { buildEmiSchedule } from './emi.js';
import { loanApr, loanFees, loanRates } from './apr.js';

const D = (v: string | number) => new Decimal(v);
const sched = buildEmiSchedule({ principal: D(100000), annualRatePct: D(12), tenureMonths: 12, firstEmiDate: '2026-11-05' }).schedule;

describe('loanFees', () => {
  it('percentage fee with GST', () => {
    const f = loanFees(D(100000), { processingFeeKind: 'PCT', processingFeeValue: D(2), gstPct: D(18), otherCharges: D(0) });
    expect(f.processingFee.toFixed(2)).toBe('2000.00');
    expect(f.gst.toFixed(2)).toBe('360.00');
    expect(f.total.toFixed(2)).toBe('2360.00');
  });
  it('flat fee plus other charges', () => {
    const f = loanFees(D(100000), { processingFeeKind: 'AMOUNT', processingFeeValue: D(1000), gstPct: D(18), otherCharges: D(500) });
    expect(f.total.toFixed(2)).toBe('1680.00');
  });
  it('no fees', () => expect(loanFees(D(100000)).total.toFixed(2)).toBe('0.00'));
});

describe('loanApr', () => {
  // Reference: monthly IRR by bisection at 40 digits, annualised as (1+i)^12-1.
  it('no fees -> effective annual rate of the nominal 12%', () => {
    expect(loanApr(D(100000), sched).toFixed(2)).toBe('12.68');
  });
  it('2% fee + GST raises APR to 17.88%', () => {
    expect(loanApr(D(100000 - 2360), sched).toFixed(2)).toBe('17.88');
  });
  it('zero-rate loan without fees has 0% APR', () => {
    const s = buildEmiSchedule({ principal: D(120000), annualRatePct: D(0), tenureMonths: 12, firstEmiDate: '2026-11-05' }).schedule;
    expect(loanApr(D(120000), s).toFixed(2)).toBe('0.00');
  });
});

describe('loanRates', () => {
  it('returns the APR and the nominal rate (monthly IRR x 12) from one bisection', () => {
    const r = loanRates(D(100000 - 2360), sched);
    expect(r.aprPct.toFixed(2)).toBe('17.88');
    expect(r.nominalPct.toFixed(2)).toBe('16.56');
  });
  it('no fees -> nominal equals the contract rate', () => {
    expect(loanRates(D(100000), sched).nominalPct.toFixed(2)).toBe('12.00');
  });
});
