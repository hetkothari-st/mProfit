import { describe, it, expect } from 'vitest';
import { PLAN_PRICING, planPriceFor, formatPaiseAsRupees } from './pricing.js';

describe('planPriceFor', () => {
  it('returns the monthly price for PLUS', () => {
    expect(planPriceFor('PLUS', 'MONTHLY')).toEqual({ cycle: 'MONTHLY', amountPaise: 49_900 });
  });

  it('returns the annual price for PLUS', () => {
    expect(planPriceFor('PLUS', 'ANNUAL')).toEqual({ cycle: 'ANNUAL', amountPaise: 499_900 });
  });

  it('returns null for a cycle a tier does not offer', () => {
    expect(planPriceFor('FAMILY', 'ANNUAL')).toBeNull();
  });

  it('returns null for FREE (never charged)', () => {
    expect(planPriceFor('FREE', 'MONTHLY')).toBeNull();
  });

  it('every priced tier has at least a MONTHLY option', () => {
    for (const tier of Object.keys(PLAN_PRICING) as (keyof typeof PLAN_PRICING)[]) {
      expect(planPriceFor(tier, 'MONTHLY')).not.toBeNull();
    }
  });
});

describe('formatPaiseAsRupees', () => {
  it('formats paise as whole rupees with Indian grouping', () => {
    expect(formatPaiseAsRupees(49_900)).toBe('₹499');
    expect(formatPaiseAsRupees(499_900)).toBe('₹4,999');
  });
});
