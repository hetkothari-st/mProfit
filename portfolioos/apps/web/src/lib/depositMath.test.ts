import { describe, it, expect } from 'vitest';
import { Decimal } from '@everypaisa/shared';
import {
  accruedValue, monthsBetween, addMonthsIso, shortMonth, formatDate, daysUntil,
  normalizeText, INR_COMPACT,
} from './depositMath';

describe('monthsBetween', () => {
  it('counts whole calendar months', () => {
    expect(monthsBetween('2020-01-01', '2020-01-01')).toBe(0);
    expect(monthsBetween('2020-01-15', '2020-04-15')).toBe(3);
    expect(monthsBetween('2020-01-01', '2025-01-01')).toBe(60);
    expect(monthsBetween('2020-12-01', '2021-02-01')).toBe(2);
  });
});

describe('addMonthsIso', () => {
  it('advances by whole months, UTC-safe', () => {
    expect(addMonthsIso('2020-01-01', 12)).toBe('2021-01-01');
    expect(addMonthsIso('2020-01-31', 1)).toBe('2020-03-02'); // JS month rollover
    expect(addMonthsIso('2024-06-15', 0)).toBe('2024-06-15');
  });
});

describe('accruedValue (compound)', () => {
  it('returns principal when valuation is at or before start', () => {
    const p = new Decimal('100000');
    expect(
      accruedValue({ principal: p, rate: new Decimal('0.077'), startIso: '2020-01-01', valuationIso: '2020-01-01', periodsPerYear: 1 }).toString(),
    ).toBe('100000');
    expect(
      accruedValue({ principal: p, rate: new Decimal('0.077'), startIso: '2020-06-01', valuationIso: '2020-01-01', periodsPerYear: 1 }).toString(),
    ).toBe('100000');
  });

  it('LUMPSUM: NSC 7.7% annual over ~1 year grows correctly', () => {
    const v = accruedValue({
      principal: new Decimal('100000'),
      rate: new Decimal('0.077'),
      startIso: '2020-01-01',
      valuationIso: '2021-01-01',
      periodsPerYear: 1,
    }).toNumber();
    // ~₹1,07,716 (365.25-day year convention)
    expect(v).toBeGreaterThan(107700);
    expect(v).toBeLessThan(107730);
  });

  it('grows monotonically with time', () => {
    const base = { principal: new Decimal('50000'), rate: new Decimal('0.074'), startIso: '2022-01-01', periodsPerYear: 4 };
    const y1 = accruedValue({ ...base, valuationIso: '2023-01-01' }).toNumber();
    const y2 = accruedValue({ ...base, valuationIso: '2024-01-01' }).toNumber();
    expect(y2).toBeGreaterThan(y1);
    expect(y1).toBeGreaterThan(50000);
  });

  it('RECURRING: two staggered installments accrue independently', () => {
    const rate = new Decimal('0.067');
    const monthly = new Decimal('5000');
    const a = accruedValue({ principal: monthly, rate, startIso: '2023-01-01', valuationIso: '2024-01-01', periodsPerYear: 4 });
    const b = accruedValue({ principal: monthly, rate, startIso: '2023-02-01', valuationIso: '2024-01-01', periodsPerYear: 4 });
    // Earlier deposit accrues more; total exceeds sum of principals.
    expect(a.gt(b)).toBe(true);
    expect(a.plus(b).toNumber()).toBeGreaterThan(10000);
  });
});

describe('formatting helpers', () => {
  it('shortMonth renders mon-YY', () => {
    expect(shortMonth('2024-03-01')).toMatch(/Mar/);
  });
  it('formatDate handles null', () => {
    expect(formatDate(null)).toBe('—');
    expect(formatDate('2024-03-15')).toMatch(/2024/);
  });
  it('INR_COMPACT abbreviates lakhs and crores', () => {
    expect(INR_COMPACT(1500)).toBe('₹1.5K');
    expect(INR_COMPACT(250000)).toBe('₹2.50L');
    expect(INR_COMPACT(15000000)).toBe('₹1.50Cr');
    expect(INR_COMPACT(500)).toBe('₹500');
  });
  it('normalizeText lowercases and collapses whitespace', () => {
    expect(normalizeText('  HDFC   Bank ')).toBe('hdfc bank');
    expect(normalizeText(null)).toBe('');
  });
  it('daysUntil is signed by direction', () => {
    expect(daysUntil('2100-01-01')).toBeGreaterThan(0);
    expect(daysUntil('2000-01-01')).toBeLessThan(0);
  });
});
