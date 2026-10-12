import { describe, it, expect } from 'vitest';
import { Decimal } from '@everypaisa/shared';
import { equalShares, isAmountText, isPercentText, normaliseAmountText } from './allocationMath';

describe('allocation maths', () => {
  it('equalShares always sums to exactly 100', () => {
    expect(equalShares(3)).toEqual(['33.34', '33.33', '33.33']);
    expect(equalShares(1)).toEqual(['100.00']);
    expect(equalShares(0)).toEqual([]);
    for (const n of [2, 3, 6, 7, 9, 11, 60]) {
      expect(equalShares(n).reduce((s, v) => s.plus(v), new Decimal(0)).equals(100)).toBe(true);
    }
  });

  it('accepts percentages with up to two decimals, at most 100', () => {
    expect(isPercentText('33.33')).toBe(true);
    expect(isPercentText('100')).toBe(true);
    expect(isPercentText('33.333')).toBe(false);
    expect(isPercentText('101')).toBe(false);
    expect(isPercentText('')).toBe(false);
    expect(isPercentText('33.')).toBe(false);
  });

  it('accepts amounts written the Indian way', () => {
    expect(normaliseAmountText('₹1,00,000.50')).toBe('100000.50');
    expect(isAmountText('1,00,000')).toBe(true);
    expect(isAmountText('12.345')).toBe(false);
    expect(isAmountText('-5')).toBe(false);
  });
});
