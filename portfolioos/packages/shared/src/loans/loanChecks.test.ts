import { describe, it, expect } from 'vitest';
import { Decimal } from '../decimal.js';
import {
  approxInr, compareWithMarket, nextResetOnOrAfter, passThroughEstimate, rateLoanTypeForLoan, switchingCost,
  DEFAULT_SWITCHING_COSTS, REFINANCE_MIN_GAP_PP,
} from './loanChecks.js';

const D = (v: string | number) => new Decimal(v);

describe('rateLoanTypeForLoan (spec s6.1)', () => {
  it.each([
    ['HOME', 'HOME'], ['CAR', 'CAR'], ['PERSONAL', 'PERSONAL'], ['EDUCATION', 'EDUCATION'],
    ['GOLD', 'GOLD'], ['LAS', 'LAS'], ['BUSINESS', 'BUSINESS'],
  ])('%s -> %s', (loanType, want) => expect(rateLoanTypeForLoan(loanType)).toBe(want));
  it.each(['OTHER', '', 'toString', 'home', 'LAP'])('%j has no market data', (loanType) => {
    expect(rateLoanTypeForLoan(loanType)).toBeNull();
  });
});

describe('switching costs', () => {
  it('defaults to 0.5 % of outstanding plus Rs 10,000', () => {
    const cost = switchingCost(D(3000000), D(DEFAULT_SWITCHING_COSTS.processingPct), D(DEFAULT_SWITCHING_COSTS.otherCharges));
    expect(cost.toFixed(2)).toBe('25000.00');
  });
  it('rounds to the paisa', () => expect(switchingCost(D('123456.78'), D('0.5'), D(0)).toFixed(2)).toBe('617.28'));
  it('the refinance gap is 0.50 pp', () => expect(REFINANCE_MIN_GAP_PP.toFixed(2)).toBe('0.50'));
});

describe('compareWithMarket', () => {
  const base = { outstanding: D(3000000), remainingMonths: 180, currentRatePct: D('9.10'), marketRatePct: D('8.35') };

  it('same remaining tenure at both rates: EMI, interest, net saving and break-even', () => {
    const r = compareWithMarket({ ...base, switchingCost: D(25000) })!;
    expect(r.currentEmi.toFixed(0)).toBe('30607');
    expect(r.newEmi.toFixed(0)).toBe('29280');
    expect(r.currentInterest.toFixed(2)).toBe('2509153.08');
    expect(r.newInterest.toFixed(2)).toBe('2270044.38');
    expect(r.grossSaving.toFixed(2)).toBe('239108.70');
    expect(r.netSaving.toFixed(2)).toBe('214108.70');
    // 25,000 / 1,327 a month -> paid back during month 19.
    expect(r.breakEvenMonth).toBe(19);
  });

  it('no switching costs -> break-even in month 1', () => {
    const r = compareWithMarket({ ...base, switchingCost: D(0) })!;
    expect(r.netSaving.toFixed(2)).toBe('239108.70');
    expect(r.breakEvenMonth).toBe(1);
  });

  it('costs larger than the saving -> negative net, no break-even', () => {
    const r = compareWithMarket({ outstanding: D(200000), remainingMonths: 12, currentRatePct: D('9.00'), marketRatePct: D('8.50'), switchingCost: D(11000) })!;
    expect(r.grossSaving.toFixed(2)).toBe('555.74');
    expect(r.netSaving.toFixed(2)).toBe('-10444.26');
    expect(r.breakEvenMonth).toBeNull();
  });

  it('a market rate above the current rate is a loss, not a saving', () => {
    const r = compareWithMarket({ ...base, currentRatePct: D('8.35'), marketRatePct: D('9.10'), switchingCost: D(25000) })!;
    expect(r.grossSaving.toFixed(2)).toBe('-239108.70');
    expect(r.breakEvenMonth).toBeNull();
  });

  it('nothing left to compare -> null', () => {
    expect(compareWithMarket({ ...base, remainingMonths: 0, switchingCost: D(0) })).toBeNull();
    expect(compareWithMarket({ ...base, outstanding: D(0), switchingCost: D(0) })).toBeNull();
    expect(compareWithMarket({ ...base, remainingMonths: 1.5, switchingCost: D(0) })).toBeNull();
  });
});

describe('passThroughEstimate (full pass-through of a benchmark change)', () => {
  it('a 0.25 cut: lower EMI over the same months, or 5 months fewer at the same EMI', () => {
    const e = passThroughEstimate({ outstanding: D(3000000), remainingMonths: 180, currentRatePct: D('8.50'), deltaPct: D('-0.25') })!;
    expect(e.currentEmi.toFixed(0)).toBe('29543');
    expect(e.newRatePct.toFixed(2)).toBe('8.25');
    expect(e.newEmi.toFixed(0)).toBe('29105');
    expect(e.tenureDeltaMonths).toBe(-5);
  });
  it('a 0.25 rise: higher EMI, or 6 more months', () => {
    const e = passThroughEstimate({ outstanding: D(3000000), remainingMonths: 180, currentRatePct: D('8.50'), deltaPct: D('0.25') })!;
    expect(e.newEmi.toFixed(0)).toBe('29984');
    expect(e.tenureDeltaMonths).toBe(6);
  });
  it('a rise the old EMI can no longer cover -> no tenure estimate', () => {
    const e = passThroughEstimate({ outstanding: D(3000000), remainingMonths: 360, currentRatePct: D('8.50'), deltaPct: D('3') })!;
    expect(e.tenureDeltaMonths).toBeNull();
    expect(e.newEmi.toFixed(0)).toBe('29709');
  });
  it('the rate never goes below zero', () => {
    const e = passThroughEstimate({ outstanding: D(120000), remainingMonths: 12, currentRatePct: D('0.10'), deltaPct: D('-0.50') })!;
    expect(e.newRatePct.toFixed(2)).toBe('0.00');
  });
  it('nothing outstanding -> null', () => {
    expect(passThroughEstimate({ outstanding: D(0), remainingMonths: 12, currentRatePct: D('8'), deltaPct: D('-0.25') })).toBeNull();
  });
});

describe('nextResetOnOrAfter', () => {
  it('rolls a past repo reset forward in 3-month steps', () => {
    expect(nextResetOnOrAfter('2026-07-01', '2026-10-12', 'REPO')).toBe('2027-01-01');
  });
  it('rolls a past MCLR reset forward in 12-month steps', () => {
    expect(nextResetOnOrAfter('2025-04-01', '2026-10-08', 'MCLR')).toBe('2027-04-01');
  });
  it('keeps a future date and a same-day date', () => {
    expect(nextResetOnOrAfter('2027-01-01', '2026-10-08', 'MCLR')).toBe('2027-01-01');
    expect(nextResetOnOrAfter('2026-10-08', '2026-10-08', 'REPO')).toBe('2026-10-08');
  });
  it('steps from the original day (31st stays 31st where the month has one)', () => {
    expect(nextResetOnOrAfter('2026-01-31', '2026-06-01', 'REPO')).toBe('2026-07-31');
  });
  it('unknown reset date -> null', () => expect(nextResetOnOrAfter(null, '2026-10-08', 'REPO')).toBeNull());
});

describe('approxInr', () => {
  it.each([
    ['214108.70', '₹2.1 lakh'],
    ['100000', '₹1 lakh'],
    ['12500000', '₹1.3 crore'],
    ['45000.40', '₹45,000'],
    ['-10444.26', '-₹10,444'],
  ])('%s -> %s', (v, want) => expect(approxInr(D(v))).toBe(want));
});
