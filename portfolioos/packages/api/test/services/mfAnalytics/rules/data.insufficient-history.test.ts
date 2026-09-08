/**
 * `mf.data.insufficient-history` — why this scheme has no rating.
 *
 * The load-bearing test is the `CATEGORY_TOO_SMALL` one. That status has
 * nothing to do with history: the fund may have fifteen years of NAV and still
 * be unrated because there are not ten rated peers to rank it against. Reusing
 * `05 §4`'s single "needs 36 months of NAV history" template there produces a
 * sentence that is simply false, and tells the user to wait for something that
 * has already happened.
 */

import { describe, it, expect } from 'vitest';
import type { MfSchemeScoreDto } from '@portfolioos/shared';
import { dataInsufficientHistoryRule } from '../../../../src/services/mfAnalytics/rules/data.insufficient-history.js';
import { factsForFund, makeScore } from './_facts.fixture.js';

function evaluate(score: MfSchemeScoreDto | null) {
  const { facts, schemeCode } = factsForFund({ score });
  return dataInsufficientHistoryRule.evaluate(facts, schemeCode);
}

describe('mf.data.insufficient-history', () => {
  it('fires when the scheme is short of NAV history', () => {
    const found = evaluate(
      makeScore({
        ratingStatus: 'INSUFFICIENT_HISTORY',
        composite: null,
        rating: null,
        historyMonths: 18,
        ratedFrom: '2027-08-01',
      }),
    );

    expect(found).toHaveLength(1);
    expect(found[0]!.code).toBe('INSUFFICIENT_HISTORY');
    expect(found[0]!.severity).toBe('INFO');
    expect(found[0]!.category).toBe('DATA');
    expect(found[0]!.headline).toContain('18');
  });

  it('does not fire for a RATED scheme', () => {
    // The only silent case. Everything else is a fact about our coverage that
    // belongs beside the numbers we did produce.
    expect(evaluate(makeScore())).toEqual([]);
  });

  it('names the 36-month requirement and the ratable-from date', () => {
    const counterfactual = evaluate(
      makeScore({
        ratingStatus: 'INSUFFICIENT_HISTORY',
        composite: null,
        rating: null,
        historyMonths: 30,
        ratedFrom: '2026-08-01',
      }),
    )[0]!.whatWouldChangeThis;

    expect(counterfactual.length).toBeGreaterThan(0);
    expect(counterfactual).toContain('36 months');
    expect(counterfactual).toContain('2026');
  });

  describe('CATEGORY_TOO_SMALL is not INSUFFICIENT_HISTORY', () => {
    const found = evaluate(
      makeScore({
        ratingStatus: 'CATEGORY_TOO_SMALL',
        composite: null,
        rating: null,
        universeSize: 6,
        universeKey: 'Fund of Funds (Overseas)|DIRECT',
        // A fund can be here with a decade of history. `historyMonths` and
        // `ratedFrom` are meaningless on this branch and must not be read.
        historyMonths: 120,
        ratedFrom: null,
      }),
    );

    it('still emits a finding', () => {
      expect(found).toHaveLength(1);
      expect(found[0]!.code).toBe('INSUFFICIENT_HISTORY');
      expect(found[0]!.severity).toBe('INFO');
    });

    it('does not claim the fund is short of history', () => {
      const text = `${found[0]!.headline} ${found[0]!.whatWouldChangeThis}`;
      expect(text).not.toContain('36 months');
      expect(text).not.toContain('NAV history');
    });

    it('names the peer-group size as the actual constraint', () => {
      expect(found[0]!.headline).toContain('6');
      expect(found[0]!.whatWouldChangeThis).toContain('10 schemes');
      expect(found[0]!.whatWouldChangeThis).toContain('Fund of Funds (Overseas)|DIRECT');
    });
  });

  it('distinguishes NOT_APPLICABLE from both of the above', () => {
    const found = evaluate(
      makeScore({
        ratingStatus: 'NOT_APPLICABLE',
        composite: null,
        rating: null,
        historyMonths: null,
        ratedFrom: null,
      }),
    );

    expect(found).toHaveLength(1);
    expect(found[0]!.headline).toContain('no scoring model');
    expect(found[0]!.whatWouldChangeThis).not.toContain('36 months');
  });

  it('distinguishes "never scored" from every rating status', () => {
    // No score row at all says nothing about the fund and everything about our
    // pipeline, so it gets its own copy.
    const found = evaluate(null);
    expect(found).toHaveLength(1);
    expect(found[0]!.headline).toContain('scoring run');
    expect(found[0]!.whatWouldChangeThis.length).toBeGreaterThan(0);
  });
});
