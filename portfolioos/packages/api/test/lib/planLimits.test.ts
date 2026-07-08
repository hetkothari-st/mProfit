import { describe, it, expect } from 'vitest';
import { assertPortfolioLimit } from '../../src/lib/planLimits.js';
import { ForbiddenError } from '../../src/lib/errors.js';

describe('assertPortfolioLimit', () => {
  it('allows a FREE user with 0 existing portfolios to create their first', () => {
    expect(() => assertPortfolioLimit(0, 'FREE')).not.toThrow();
  });

  it('blocks a FREE user who already has 1 portfolio (the FREE cap)', () => {
    expect(() => assertPortfolioLimit(1, 'FREE')).toThrow(ForbiddenError);
    try {
      assertPortfolioLimit(1, 'FREE');
    } catch (err) {
      expect((err as ForbiddenError).message).toMatch(/upgrade/i);
    }
  });

  it('allows a PLUS user under their (higher) cap', () => {
    expect(() => assertPortfolioLimit(1, 'PLUS')).not.toThrow();
  });

  it('blocks a PLUS user once they hit the PLUS cap', () => {
    expect(() => assertPortfolioLimit(5, 'PLUS')).toThrow(ForbiddenError);
  });

  it('never blocks PRO_ADVISOR (unlimited)', () => {
    expect(() => assertPortfolioLimit(500, 'PRO_ADVISOR')).not.toThrow();
  });

  it('gates ADMIN role on their own plan too — FREE cap still applies, no automatic bypass', () => {
    expect(() => assertPortfolioLimit(1, 'FREE')).toThrow(ForbiddenError);
    expect(() => assertPortfolioLimit(999, 'PRO_ADVISOR')).not.toThrow();
  });
});
