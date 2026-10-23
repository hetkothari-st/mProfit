import { describe, it, expect } from 'vitest';
import { mergeAllocationBreakdown } from '../../src/services/analytics/dashboard.service.js';

// Family-view net-worth ring. The web Pie draws `numericValue`; the merge
// summed `value` but left `numericValue` at the first member's figure, so a
// two-member household with ₹1L + ₹3L of equity drew a ₹1L slice.
describe('mergeAllocationBreakdown (family dashboard ring)', () => {
  const slice = (key: string, value: string, category = 'FINANCIAL') => ({
    key,
    label: key === 'VEHICLE' ? 'Vehicles' : key,
    value,
    numericValue: Number(value),
    percent: 100,
    category,
  });

  it('carries the merged total into numericValue, not the first member’s', () => {
    const merged = mergeAllocationBreakdown([
      slice('EQUITY', '100000.0000'),
      slice('EQUITY', '300000.0000'),
      slice('VEHICLE', '100000.0000', 'VEHICLE'),
    ]);
    const equity = merged.find((s) => s.key === 'EQUITY')!;
    expect(equity.value).toBe('400000.0000');
    expect(equity.numericValue).toBe(400000);
    expect(equity.percent).toBe(80);
    expect(merged[0]!.key).toBe('EQUITY');
  });

  it('keeps a rental-property slice apart from a REAL_ESTATE asset-class slice', () => {
    const merged = mergeAllocationBreakdown([
      { ...slice('REAL_ESTATE', '500000.0000'), label: 'Real Estate' },
      { ...slice('REAL_ESTATE', '200000.0000', 'REAL_ESTATE'), label: 'Real Estate' },
    ]);
    expect(merged).toHaveLength(2);
    expect(merged.map((s) => s.category).sort()).toEqual(['FINANCIAL', 'REAL_ESTATE']);
  });
});
