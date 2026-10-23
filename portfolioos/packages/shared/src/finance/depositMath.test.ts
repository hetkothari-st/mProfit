import { describe, expect, it } from 'vitest';
import {
  compoundDeposit,
  depositCompoundingLabel,
  depositPeriodsPerYear,
  fdMaturityValue,
  rdMaturityValue,
} from './depositMath.js';

describe('deposit compounding frequency', () => {
  it('defaults to quarterly, and a cumulative FD compounds quarterly', () => {
    expect(depositPeriodsPerYear(null)).toBe(4);
    expect(depositPeriodsPerYear('QUARTERLY')).toBe(4);
    expect(depositPeriodsPerYear('AT_MATURITY')).toBe(4);
    expect(depositPeriodsPerYear('MONTHLY')).toBe(12);
    expect(depositCompoundingLabel(undefined)).toBe('quarterly');
    expect(depositCompoundingLabel('MONTHLY')).toBe('monthly');
  });
});

describe('fdMaturityValue', () => {
  it('compounds quarterly over the day-count tenure', () => {
    // ₹1,00,000 at 7% for 5 years (1826 days incl. one leap day ≈ 4.9993 y)
    const v = fdMaturityValue({
      principal: '100000',
      ratePct: '7',
      openDate: '2020-01-01',
      maturityDate: '2025-01-01',
      frequency: 'QUARTERLY',
    })!;
    // 100000 × 1.0175^(4 × 4.999316) ≈ 141,463
    expect(v.toDP(0).toNumber()).toBeGreaterThan(141400);
    expect(v.toDP(0).toNumber()).toBeLessThan(141500);
  });

  it('matches compoundDeposit exactly (one formula everywhere)', () => {
    const fd = fdMaturityValue({
      principal: '50000', ratePct: '6.5', openDate: '2024-03-10', maturityDate: '2026-03-10', frequency: null,
    })!;
    const direct = compoundDeposit({
      principal: '50000', annualRate: '0.065', start: '2024-03-10', valuation: '2026-03-10', periodsPerYear: 4,
    });
    expect(fd.toString()).toBe(direct.toString());
  });

  it('returns null without a rate or a tenure', () => {
    expect(fdMaturityValue({ principal: '1', ratePct: null, openDate: '2024-01-01', maturityDate: '2025-01-01', frequency: null })).toBeNull();
    expect(fdMaturityValue({ principal: '1', ratePct: '7', openDate: '2024-01-01', maturityDate: '2024-01-01', frequency: null })).toBeNull();
  });
});

describe('rdMaturityValue', () => {
  it('sums each monthly installment compounded quarterly to maturity', () => {
    // ₹5,000/month for 12 months at 7%, quarterly compounding.
    const v = rdMaturityValue({
      installment: '5000', ratePct: '7', openDate: '2024-01-01', maturityDate: '2025-01-01',
      tenureMonths: 12, frequency: 'QUARTERLY',
    })!;
    // Deposits ₹60,000; interest on a 12-month 7% RD is ≈ ₹2,300.
    expect(v.toNumber()).toBeGreaterThan(62200);
    expect(v.toNumber()).toBeLessThan(62400);
  });

  it('is lower than the monthly-compounding annuity the card used to show', () => {
    const quarterly = rdMaturityValue({
      installment: '10000', ratePct: '8', openDate: '2024-01-01', maturityDate: '2029-01-01',
      tenureMonths: 60, frequency: 'QUARTERLY',
    })!;
    const monthly = rdMaturityValue({
      installment: '10000', ratePct: '8', openDate: '2024-01-01', maturityDate: '2029-01-01',
      tenureMonths: 60, frequency: 'MONTHLY',
    })!;
    expect(quarterly.lt(monthly)).toBe(true);
  });
});
