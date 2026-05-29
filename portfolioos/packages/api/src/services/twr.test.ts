import { describe, it, expect } from 'vitest';
import { Decimal } from 'decimal.js';
import { modifiedDietzAnnualized, type CashFlow } from './xirr.service.js';

const cf = (date: string, amount: number): CashFlow => ({ date: new Date(date), amount: new Decimal(amount) });

describe('modifiedDietzAnnualized', () => {
  it('returns null with no cashflows', () => {
    expect(modifiedDietzAnnualized([], new Decimal(100))).toBeNull();
  });

  it('a single contribution that grows ~10% over a year annualizes to ~10%', () => {
    // One buy of 100 (cf negative = money in) on day 0; terminal value 110 a year later.
    // MDR = (110 − 0 − 100) / (0 + 100×1) = 0.10; over ~1y → ~10%.
    const flows = [cf('2025-01-01', -100), cf('2026-01-01', 0)];
    const r = modifiedDietzAnnualized(flows, new Decimal(110));
    expect(r).not.toBeNull();
    expect(r!).toBeCloseTo(0.10, 1);
  });

  it('a loss yields a negative return', () => {
    const flows = [cf('2025-01-01', -100), cf('2026-01-01', 0)];
    const r = modifiedDietzAnnualized(flows, new Decimal(90));
    expect(r!).toBeLessThan(0);
  });

  it('returns null when the weighted denominator is non-positive', () => {
    // Only an outflow (sell) and no begin value → denominator ≤ 0.
    const flows = [cf('2025-01-01', 100)];
    expect(modifiedDietzAnnualized(flows, new Decimal(0))).toBeNull();
  });
});
