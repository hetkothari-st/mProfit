import { describe, expect, it } from 'vitest';
import { summariseHoldings } from './holdingsSummary';

describe('summariseHoldings', () => {
  it('carries unpriced holdings at cost instead of showing a −100% loss', () => {
    const s = summariseHoldings([
      { totalCost: '31000', currentValue: null },
      { totalCost: '47000', currentValue: null },
    ]);
    expect(s.value.toString()).toBe('78000');
    expect(s.pnl).toBeNull();
    expect(s.pnlPct).toBeNull();
    expect(s.unpricedCount).toBe(2);
  });

  it('computes P&L over priced holdings only', () => {
    const s = summariseHoldings([
      { totalCost: '1000', currentValue: '1200' },
      { totalCost: '500', currentValue: null },
    ]);
    expect(s.value.toString()).toBe('1700');
    expect(s.cost.toString()).toBe('1500');
    expect(s.pnl?.toString()).toBe('200');
    expect(s.pnlPct).toBe(20);
    expect(s.unpricedCount).toBe(1);
  });
});
