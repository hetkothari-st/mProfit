import { describe, it, expect } from 'vitest';
import { Decimal } from 'decimal.js';
import { accruedDepositInterestInFy } from '../../../src/services/income/depositInterestAccrual.js';

const day = (s: string) => new Date(`${s}T00:00:00Z`);

describe('accruedDepositInterestInFy', () => {
  it('is zero for a deposit opened after the FY ends', () => {
    const r = accruedDepositInterestInFy(
      [{ principal: new Decimal(100000), ratePct: new Decimal(7), openDate: day('2026-06-01'), maturityDate: null, periodsPerYear: 4 }],
      '2025-26',
      day('2026-11-18'),
    );
    expect(r.toString()).toBe('0');
  });

  it('accrues only the slice that falls inside the FY (annual compounding, 1 year exactly)', () => {
    // 1,00,000 @ 10% annual, opened 1 Oct 2025. FY 2025-26 covers 1 Oct 2025 -> 31 Mar 2026.
    const r = accruedDepositInterestInFy(
      [{ principal: new Decimal(100000), ratePct: new Decimal(10), openDate: day('2025-10-01'), maturityDate: day('2026-10-01'), periodsPerYear: 1 }],
      '2025-26',
      day('2026-11-18'),
    );
    // ~182 days of a 365.25-day year at 10% compounded annually ≈ ₹4,89x; assert a sane band, not a magic number
    expect(r.greaterThan(4800)).toBe(true);
    expect(r.lessThan(5000)).toBe(true);
  });

  it('stops accruing at maturity', () => {
    const open = accruedDepositInterestInFy(
      [{ principal: new Decimal(100000), ratePct: new Decimal(8), openDate: day('2024-04-01'), maturityDate: day('2025-04-01'), periodsPerYear: 4 }],
      '2025-26',
      day('2026-11-18'),
    );
    // matured one day into FY 2025-26: only ~1 day of interest lands there
    expect(open.lessThan(50)).toBe(true);
  });

  it('for the current FY only counts interest earned up to today', () => {
    const upToToday = accruedDepositInterestInFy(
      [{ principal: new Decimal(100000), ratePct: new Decimal(8), openDate: day('2025-01-01'), maturityDate: null, periodsPerYear: 4 }],
      '2026-27',
      day('2026-10-01'),
    );
    const fullYearOut = accruedDepositInterestInFy(
      [{ principal: new Decimal(100000), ratePct: new Decimal(8), openDate: day('2025-01-01'), maturityDate: null, periodsPerYear: 4 }],
      '2026-27',
      day('2027-04-01'),
    );
    expect(upToToday.lessThan(fullYearOut)).toBe(true);
    expect(upToToday.greaterThan(0)).toBe(true);
  });

  it('sums several deposits', () => {
    const one = { principal: new Decimal(50000), ratePct: new Decimal(7), openDate: day('2025-04-01'), maturityDate: null, periodsPerYear: 4 };
    const a = accruedDepositInterestInFy([one], '2025-26', day('2026-11-18'));
    const both = accruedDepositInterestInFy([one, one], '2025-26', day('2026-11-18'));
    expect(both.toString()).toBe(a.times(2).toString());
  });
});
