import { describe, it, expect } from 'vitest';
import { compactInr, formatShare, shareOfTotal } from './hiddenCostsView';

describe('hidden costs view helpers', () => {
  it('writes big amounts in lakh and crore, small ones in whole rupees', () => {
    expect(compactInr('2766813.79')).toBe('₹27.7 L');
    expect(compactInr('100000.00')).toBe('₹1 L');
    expect(compactInr('15400000.00')).toBe('₹1.54 Cr');
    expect(compactInr('38400.40')).toBe('₹38,400');
    expect(compactInr('0.00')).toBe('₹0');
  });

  it('measures each bar against the year total, not the largest source', () => {
    expect(shareOfTotal('21600.00', '43200.00')).toBe(50);
    expect(shareOfTotal('1800.00', '21600.00')).toBeCloseTo(8.33, 2);
    expect(shareOfTotal('5.00', '0.00')).toBe(0);
    expect(shareOfTotal('999.00', '100.00')).toBe(100);
  });

  it('never prints 0% for a cost that is actually being paid', () => {
    expect(formatShare(49.4)).toBe('49%');
    expect(formatShare(0.4)).toBe('<1%');
    expect(formatShare(0)).toBe('0%');
  });
});
