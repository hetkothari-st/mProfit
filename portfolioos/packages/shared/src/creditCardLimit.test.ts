import { describe, expect, it } from 'vitest';
import { creditLimitLooksHigh } from './creditCardLimit.js';

describe('creditLimitLooksHigh', () => {
  it('asks above ₹25 lakh per card, not at it', () => {
    expect(creditLimitLooksHigh('2500000')).toBe(false);
    expect(creditLimitLooksHigh('25,00,001')).toBe(true);
    expect(creditLimitLooksHigh('₹ 50,00,000')).toBe(true);
  });
  it('leaves ordinary and unreadable input alone', () => {
    expect(creditLimitLooksHigh('300000')).toBe(false);
    expect(creditLimitLooksHigh('')).toBe(false);
    expect(creditLimitLooksHigh('abc')).toBe(false);
  });
});
