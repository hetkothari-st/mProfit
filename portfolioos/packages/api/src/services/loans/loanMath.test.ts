import { describe, it, expect } from 'vitest';
import { Decimal } from 'decimal.js';
import { computeEmi, computeMonthlyRate } from './loans.service.js';

describe('computeMonthlyRate', () => {
  it('is annual% / 100 / 12', () => {
    expect(computeMonthlyRate(new Decimal(12)).toNumber()).toBeCloseTo(0.01, 8);
  });
});

describe('computeEmi (reducing balance)', () => {
  it('matches the standard EMI formula', () => {
    // P=10,00,000, 12% p.a., 12 months → ₹88,848.79
    const emi = computeEmi(new Decimal(1000000), new Decimal(12), 12);
    expect(emi.toNumber()).toBeCloseTo(88848.79, 1);
  });
  it('handles zero-interest loans as principal / tenure', () => {
    const emi = computeEmi(new Decimal(120000), new Decimal(0), 12);
    expect(emi.toNumber()).toBeCloseTo(10000, 6);
  });
  it('a longer tenure lowers the EMI', () => {
    const short = computeEmi(new Decimal(1000000), new Decimal(10), 12);
    const long = computeEmi(new Decimal(1000000), new Decimal(10), 120);
    expect(long.lessThan(short)).toBe(true);
  });
});
