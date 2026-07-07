import { describe, it, expect } from 'vitest';
import { assertPortfolioLimit } from '../../src/lib/planLimits.js';
import { ForbiddenError } from '../../src/lib/errors.js';

describe('assertPortfolioLimit', () => {
  it('allows a FREE user with 0 existing portfolios to create their first', () => {
    expect(() => assertPortfolioLimit(0, 'FREE', 'INVESTOR')).not.toThrow();
  });

  it('blocks a FREE user who already has 1 portfolio (the FREE cap)', () => {
    expect(() => assertPortfolioLimit(1, 'FREE', 'INVESTOR')).toThrow(ForbiddenError);
    try {
      assertPortfolioLimit(1, 'FREE', 'INVESTOR');
    } catch (err) {
      expect((err as ForbiddenError).message).toMatch(/upgrade/i);
    }
  });

  it('allows a PLUS user under their (higher) cap', () => {
    expect(() => assertPortfolioLimit(1, 'PLUS', 'INVESTOR')).not.toThrow();
  });

  it('blocks a PLUS user once they hit the PLUS cap', () => {
    expect(() => assertPortfolioLimit(5, 'PLUS', 'INVESTOR')).toThrow(ForbiddenError);
  });

  it('never blocks PRO_ADVISOR (unlimited)', () => {
    expect(() => assertPortfolioLimit(500, 'PRO_ADVISOR', 'INVESTOR')).not.toThrow();
  });

  it('bypasses the cap entirely for ADMIN role regardless of plan', () => {
    expect(() => assertPortfolioLimit(999, 'FREE', 'ADMIN')).not.toThrow();
  });
});
