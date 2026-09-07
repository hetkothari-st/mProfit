/**
 * `mf.pf.too-many-funds` — `FUND_SPRAWL`.
 *
 * Two independent triggers, so the suite exercises each in isolation as well
 * as together, and asserts that the headline says **which one** fired. A
 * single sentence covering both would send the effective-count case's holder
 * counting their funds and finding nothing wrong.
 */

import { describe, it, expect } from 'vitest';
import { serializeRatio } from '@portfolioos/shared';

import { pfTooManyFundsRule } from '../../../../src/services/mfAnalytics/rules/pf.too-many-funds.js';
import { MF_HEADLINE_MAX_CHARS } from '../../../../src/services/mfAnalytics/types.js';
import {
  makeHeldFunds,
  makePartialScope,
  makePortfolioFacts,
  makeTotals,
  type PortfolioFactsOptions,
} from './_portfolio.fixture.js';

function factsWithCounts(
  counts: { fundCount: number; equityFundCount: number; effectiveFundCount: string },
  extra: PortfolioFactsOptions = {},
) {
  return makePortfolioFacts({
    ...extra,
    portfolio: {
      funds: makeHeldFunds(Math.max(counts.fundCount, 1)),
      totals: makeTotals({
        fundCount: counts.fundCount,
        equityFundCount: counts.equityFundCount,
        effectiveFundCount: serializeRatio(counts.effectiveFundCount),
      }),
      ...(extra.portfolio ?? {}),
    },
  });
}

describe('mf.pf.too-many-funds', () => {
  it('is a portfolio-scope rule in the PORTFOLIO category', () => {
    expect(pfTooManyFundsRule.id).toBe('mf.pf.too-many-funds');
    expect(pfTooManyFundsRule.scope).toBe('PORTFOLIO');
    expect(pfTooManyFundsRule.category).toBe('PORTFOLIO');
  });

  it('fires on the equity fund count alone, and says so', () => {
    // 11 funds, all distinct bets: only the count trigger applies.
    const facts = factsWithCounts({
      fundCount: 11,
      equityFundCount: 11,
      effectiveFundCount: '10.500000',
    });

    const findings = pfTooManyFundsRule.evaluate(facts);

    expect(findings).toHaveLength(1);
    const finding = findings[0]!;
    expect(finding.code).toBe('FUND_SPRAWL');
    expect(finding.severity).toBe('NOTICE');
    expect(finding.category).toBe('PORTFOLIO');
    expect(finding.schemeCode).toBeNull();
    expect(finding.headline).toContain('11 equity funds');
    // The other trigger did not fire, so the headline must not claim it did.
    expect(finding.headline).not.toContain('effective');
    expect(finding.headline.length).toBeLessThanOrEqual(MF_HEADLINE_MAX_CHARS);
  });

  it('does not fire one notch below the equity fund count', () => {
    // The trigger is "> 10", so 10 itself is clean.
    const facts = factsWithCounts({
      fundCount: 10,
      equityFundCount: 10,
      effectiveFundCount: '9.400000',
    });

    expect(pfTooManyFundsRule.evaluate(facts)).toEqual([]);
  });

  it('fires on the effective fund count alone, and says so', () => {
    // Six funds, but the money is in two of them.
    const facts = factsWithCounts({
      fundCount: 6,
      equityFundCount: 6,
      effectiveFundCount: '2.500000',
    });

    const findings = pfTooManyFundsRule.evaluate(facts);

    expect(findings).toHaveLength(1);
    expect(findings[0]!.headline).toContain('effective');
    expect(findings[0]!.headline).toContain('2.5');
    expect(findings[0]!.headline.length).toBeLessThanOrEqual(MF_HEADLINE_MAX_CHARS);
  });

  it('does not fire when the effective count sits exactly on the floor', () => {
    // Floor is 0.5 x 6 = 3.0, and the trigger is strictly below it.
    const facts = factsWithCounts({
      fundCount: 6,
      equityFundCount: 6,
      effectiveFundCount: '3.000000',
    });

    expect(pfTooManyFundsRule.evaluate(facts)).toEqual([]);
  });

  it('names both triggers when both fire, in one finding', () => {
    const facts = factsWithCounts({
      fundCount: 14,
      equityFundCount: 14,
      effectiveFundCount: '4.000000',
    });

    const findings = pfTooManyFundsRule.evaluate(facts);

    expect(findings).toHaveLength(1);
    expect(findings[0]!.headline).toContain('14 equity funds');
    expect(findings[0]!.headline).toContain('distinct bets');
    expect(findings[0]!.whatWouldChangeThis).toContain('effective fund count');
    expect(findings[0]!.headline.length).toBeLessThanOrEqual(MF_HEADLINE_MAX_CHARS);
  });

  it('reads both thresholds from facts.constants', () => {
    const facts = factsWithCounts(
      { fundCount: 11, equityFundCount: 11, effectiveFundCount: '4.000000' },
      { constants: { fundSprawlEquityFundCount: 20, fundSprawlEffectiveFundRatioFloor: 0.2 } },
    );

    expect(pfTooManyFundsRule.evaluate(facts)).toEqual([]);
  });

  it('stays silent on an empty book', () => {
    // `effectiveFundCount` over zero funds is not a number this rule can
    // reason about, and an empty portfolio has no sprawl to report.
    const facts = factsWithCounts({
      fundCount: 0,
      equityFundCount: 0,
      effectiveFundCount: '0.000000',
    });

    expect(pfTooManyFundsRule.evaluate(facts)).toEqual([]);
  });

  it('names the thresholds in whatWouldChangeThis', () => {
    const facts = factsWithCounts({
      fundCount: 12,
      equityFundCount: 12,
      effectiveFundCount: '11.000000',
    });

    const finding = pfTooManyFundsRule.evaluate(facts)[0]!;

    expect(finding.whatWouldChangeThis.length).toBeGreaterThan(0);
    expect(finding.whatWouldChangeThis).toContain('10 or fewer equity funds');
  });

  it('calls the counts a floor under a partial family scope', () => {
    const facts = factsWithCounts(
      { fundCount: 12, equityFundCount: 12, effectiveFundCount: '11.000000' },
      { portfolio: { scope: makePartialScope() } },
    );

    const finding = pfTooManyFundsRule.evaluate(facts)[0]!;

    // "You hold 12 equity funds" and "you hold at least 12" are different
    // claims, and only the second is true under a restricted view.
    expect(finding.headline).toContain('at least 12 equity funds');
    expect(finding.whatWouldChangeThis).toContain('floor');
    expect(finding.evidence.some((e) => e.label.includes('floor'))).toBe(true);
  });
});
