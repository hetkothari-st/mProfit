import { describe, it, expect } from 'vitest';
import { derivativePositionValue } from '../../src/services/derivativePosition.service.js';

describe('derivativePositionValue', () => {
  it('values a long in units with no lot-size factor', () => {
    // 75 units (1 lot of 75) bought at 100, marked at 110.
    const v = derivativePositionValue({ netQuantity: '75', totalCost: '7500', avgEntryPrice: '100', mtmPrice: '110' });
    expect(v!.toString()).toBe('8250');
  });

  it('keeps value minus cost equal to the unrealised P&L for a short', () => {
    // Short 75 units sold at 100, marked at 90: +750 unrealised.
    const v = derivativePositionValue({ netQuantity: '-75', totalCost: '7500', avgEntryPrice: '100', mtmPrice: '90' });
    expect(v!.minus(7500).toString()).toBe('750');
  });

  it('has no value without a mark', () => {
    expect(derivativePositionValue({ netQuantity: '75', totalCost: '7500', avgEntryPrice: '100', mtmPrice: null })).toBeNull();
  });
});
