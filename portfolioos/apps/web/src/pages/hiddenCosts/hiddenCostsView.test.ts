import { describe, it, expect } from 'vitest';
import { compactInr, costShare } from './hiddenCostsView';

describe('hidden costs view helpers', () => {
  it('writes big amounts in lakh and crore, small ones in whole rupees', () => {
    expect(compactInr('2766813.79')).toBe('₹27.7 L');
    expect(compactInr('100000.00')).toBe('₹1 L');
    expect(compactInr('15400000.00')).toBe('₹1.54 Cr');
    expect(compactInr('38400.40')).toBe('₹38,400');
    expect(compactInr('0.00')).toBe('₹0');
  });

  it('sizes each bar against the largest source', () => {
    expect(costShare('21600.00', ['21600.00', '9800.00', '1800.00'])).toBe(100);
    expect(costShare('1800.00', ['21600.00', '1800.00'])).toBeCloseTo(8.33, 1);
    expect(costShare('5.00', ['0.00'])).toBe(0);
  });
});
