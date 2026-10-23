import { describe, it, expect } from 'vitest';
import { compactRupeeTick, maskedValue, HIDDEN_VALUE } from './chartPrivacy';

describe('chart privacy helpers', () => {
  it('formats compact rupee ticks when values are shown', () => {
    expect(compactRupeeTick(25_000_000, false)).toBe('₹2.5Cr');
    expect(compactRupeeTick(450_000, false)).toBe('₹4.5L');
    expect(compactRupeeTick(12_000, false)).toBe('₹12K');
    expect(compactRupeeTick(800, false)).toBe('₹800');
  });

  it('masks every tick and tooltip value when Hide values is on', () => {
    for (const v of [25_000_000, 450_000, 12_000, 800]) expect(compactRupeeTick(v, true)).toBe(HIDDEN_VALUE);
    expect(maskedValue('₹1,00,000.00', true)).toBe(HIDDEN_VALUE);
    expect(maskedValue('₹1,00,000.00', false)).toBe('₹1,00,000.00');
  });
});
