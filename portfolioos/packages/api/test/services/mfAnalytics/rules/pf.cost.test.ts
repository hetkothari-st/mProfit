/**
 * `mf.pf.cost` — `PORTFOLIO_COST_HIGH`.
 *
 * Two things are pinned here that matter more than the boundary:
 *
 *  1. **Silence when the rank is missing.** `costCategoryPercentile` is null
 *     in production today (`terPct` is not among `mfPeerRank`'s ranked
 *     metrics, so no `terPercentile` is written to weight), and the rule must
 *     emit nothing rather than treat null as "cheapest possible".
 *  2. **`weightedTerPct` is not a substitute.** It is a *level*; the trigger
 *     is a *rank*. A 0.9% weighted TER is expensive for an index book and
 *     cheap for a small-cap active one, so firing on it would give the same
 *     threshold a different meaning for every user who saw it.
 */

import { describe, it, expect } from 'vitest';
import { serializeMoney, serializePct, serializeRatio } from '@portfolioos/shared';

import { pfCostRule } from '../../../../src/services/mfAnalytics/rules/pf.cost.js';
import { MF_HEADLINE_MAX_CHARS } from '../../../../src/services/mfAnalytics/types.js';
import {
  makeCostSummary,
  makePartialScope,
  makePortfolioFacts,
  type PortfolioFactsOptions,
} from './_portfolio.fixture.js';

function factsWithCost(
  cost: Parameters<typeof makeCostSummary>[0],
  extra: PortfolioFactsOptions = {},
) {
  return makePortfolioFacts({
    ...extra,
    portfolio: { cost: makeCostSummary(cost), ...(extra.portfolio ?? {}) },
  });
}

describe('mf.pf.cost', () => {
  it('is a portfolio-scope rule in the COST category', () => {
    expect(pfCostRule.id).toBe('mf.pf.cost');
    expect(pfCostRule.scope).toBe('PORTFOLIO');
    expect(pfCostRule.category).toBe('COST');
  });

  it('is silent when the cost percentile is unknown', () => {
    // The production case today. Null is "we have no rank", not "cheapest".
    expect(pfCostRule.evaluate(factsWithCost({ costCategoryPercentile: null }))).toEqual([]);
  });

  it('does not substitute the weighted TER level for the missing rank', () => {
    const facts = factsWithCost({
      costCategoryPercentile: null,
      // An eye-watering expense ratio, and still not a rank.
      weightedTerPct: serializePct('2.250000'),
      annualCostInr: serializeMoney('31500'),
    });

    expect(pfCostRule.evaluate(facts)).toEqual([]);
  });

  it('fires when the portfolio ranks among the most expensive in its categories', () => {
    const facts = factsWithCost({ costCategoryPercentile: serializeRatio('0.180000') });

    const findings = pfCostRule.evaluate(facts);

    expect(findings).toHaveLength(1);
    const finding = findings[0]!;
    expect(finding.code).toBe('PORTFOLIO_COST_HIGH');
    expect(finding.severity).toBe('NOTICE');
    expect(finding.category).toBe('COST');
    expect(finding.schemeCode).toBeNull();
    // 0.18 → dearer than 82% of comparable schemes.
    expect(finding.headline).toContain('82%');
    expect(finding.headline.length).toBeLessThanOrEqual(MF_HEADLINE_MAX_CHARS);
  });

  it('does not fire one notch below the ceiling', () => {
    // The trigger is "< 0.3", so 0.3 itself is clean.
    const facts = factsWithCost({ costCategoryPercentile: serializeRatio('0.300000') });

    expect(pfCostRule.evaluate(facts)).toEqual([]);
  });

  it('reads the ceiling from facts.constants', () => {
    const facts = factsWithCost(
      { costCategoryPercentile: serializeRatio('0.180000') },
      { constants: { portfolioCostPercentileCeiling: 0.1 } },
    );

    expect(pfCostRule.evaluate(facts)).toEqual([]);
  });

  it('cites the TER only where it is known, and never as zero', () => {
    const facts = factsWithCost({
      costCategoryPercentile: serializeRatio('0.180000'),
      // No held fund disclosed a TER. Null must not become ₹0 of annual cost.
      weightedTerPct: null,
      annualCostInr: null,
    });

    const finding = pfCostRule.evaluate(facts)[0]!;

    expect(finding.evidence.some((e) => e.metric === 'cost.weightedTerPct')).toBe(false);
    expect(finding.evidence.some((e) => e.metric === 'cost.annualCostInr')).toBe(false);
    // The rank itself is still cited — that is what the finding rests on.
    expect(finding.evidence.some((e) => e.metric === 'cost.costCategoryPercentile')).toBe(true);
  });

  it('names the threshold in whatWouldChangeThis', () => {
    const finding = pfCostRule.evaluate(
      factsWithCost({ costCategoryPercentile: serializeRatio('0.180000') }),
    )[0]!;

    expect(finding.whatWouldChangeThis.length).toBeGreaterThan(0);
    expect(finding.whatWouldChangeThis).toContain('0.3');
    expect(finding.whatWouldChangeThis).toContain('0.18');
  });

  it('says the rank covers only shared holdings under a partial family scope', () => {
    const facts = factsWithCost(
      { costCategoryPercentile: serializeRatio('0.180000') },
      { portfolio: { scope: makePartialScope() } },
    );

    const finding = pfCostRule.evaluate(facts)[0]!;

    expect(finding.whatWouldChangeThis).toContain('shared with you');
  });
});
