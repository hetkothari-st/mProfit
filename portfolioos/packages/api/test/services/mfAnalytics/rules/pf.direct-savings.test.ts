/**
 * `mf.pf.direct-savings` — `DIRECT_PLAN_SAVINGS`.
 *
 * Beyond the boundary, two things are pinned:
 *
 *  1. **`weightedTerPct` and `annualCostInr` are `| null`.** Null means no
 *     held fund disclosed a TER, and must never be read as zero — a portfolio
 *     described as costing ₹0 a year is the exact failure the DTO's null was
 *     introduced to prevent.
 *  2. **The saving is itself a floor** whenever any held fund has no disclosed
 *     TER, because a regular plan with an unknown expense ratio contributes
 *     nothing to the sum.
 */

import { describe, it, expect } from 'vitest';
import { serializeMoney, serializePct } from '@portfolioos/shared';

import { pfDirectSavingsRule } from '../../../../src/services/mfAnalytics/rules/pf.direct-savings.js';
import { MF_HEADLINE_MAX_CHARS } from '../../../../src/services/mfAnalytics/types.js';
import {
  makeCostSummary,
  makePartialScope,
  makePortfolioFacts,
  type PortfolioFactsOptions,
} from './_portfolio.fixture.js';

/** One regular plan with a priced direct sibling, saving `inr` a year. */
function byFundSaving(inr: string) {
  return [
    {
      schemeCode: 'PF_A',
      terPct: serializePct('1.750000'),
      directSiblingSchemeCode: 'PF_A_DIR',
      directSiblingTerPct: serializePct('0.620000'),
      annualSavingsInr: serializeMoney(inr),
    },
  ];
}

function factsWithCost(
  cost: Parameters<typeof makeCostSummary>[0],
  extra: PortfolioFactsOptions = {},
) {
  return makePortfolioFacts({
    ...extra,
    portfolio: { cost: makeCostSummary(cost), ...(extra.portfolio ?? {}) },
  });
}

describe('mf.pf.direct-savings', () => {
  it('is a portfolio-scope rule in the COST category', () => {
    expect(pfDirectSavingsRule.id).toBe('mf.pf.direct-savings');
    expect(pfDirectSavingsRule.scope).toBe('PORTFOLIO');
    expect(pfDirectSavingsRule.category).toBe('COST');
  });

  it('fires when the annual saving clears the threshold', () => {
    const facts = factsWithCost({
      directPlanSavingsInr: serializeMoney('12500'),
      byFund: byFundSaving('12500'),
    });

    const findings = pfDirectSavingsRule.evaluate(facts);

    expect(findings).toHaveLength(1);
    const finding = findings[0]!;
    expect(finding.code).toBe('DIRECT_PLAN_SAVINGS');
    expect(finding.severity).toBe('WARNING');
    expect(finding.category).toBe('COST');
    expect(finding.schemeCode).toBeNull();
    // Indian digit grouping, whole rupees.
    expect(finding.headline).toContain('₹12,500');
    expect(finding.headline).not.toContain('at least');
    expect(finding.headline.length).toBeLessThanOrEqual(MF_HEADLINE_MAX_CHARS);
  });

  it('does not fire one notch below the threshold', () => {
    // The trigger is "> ₹2,000", so ₹2,000 exactly is clean.
    const facts = factsWithCost({
      directPlanSavingsInr: serializeMoney('2000'),
      byFund: byFundSaving('2000'),
    });

    expect(pfDirectSavingsRule.evaluate(facts)).toEqual([]);
  });

  it('reads the threshold from facts.constants', () => {
    const facts = factsWithCost(
      { directPlanSavingsInr: serializeMoney('12500'), byFund: byFundSaving('12500') },
      { constants: { directPlanSavingsInr: '20000' } },
    );

    expect(pfDirectSavingsRule.evaluate(facts)).toEqual([]);
  });

  it('stays silent when the book holds no funds', () => {
    const facts = makePortfolioFacts({
      portfolio: {
        funds: [],
        cost: makeCostSummary({ directPlanSavingsInr: serializeMoney('12500'), byFund: [] }),
      },
    });

    expect(pfDirectSavingsRule.evaluate(facts)).toEqual([]);
  });

  it('never reads a null TER as zero cost', () => {
    const facts = factsWithCost({
      directPlanSavingsInr: serializeMoney('12500'),
      byFund: byFundSaving('12500'),
      weightedTerPct: null,
      annualCostInr: null,
    });

    const finding = pfDirectSavingsRule.evaluate(facts)[0]!;

    expect(finding.evidence.some((e) => e.metric === 'cost.weightedTerPct')).toBe(false);
    expect(finding.evidence.some((e) => e.metric === 'cost.annualCostInr')).toBe(false);
    // And nothing anywhere claims the portfolio is free.
    expect(finding.headline).not.toContain('₹0');
  });

  it('calls the saving a floor when a held fund discloses no TER', () => {
    const facts = factsWithCost({
      directPlanSavingsInr: serializeMoney('12500'),
      byFund: [
        ...byFundSaving('12500'),
        {
          schemeCode: 'PF_B',
          terPct: null,
          directSiblingSchemeCode: null,
          directSiblingTerPct: null,
          annualSavingsInr: null,
        },
      ],
    });

    const finding = pfDirectSavingsRule.evaluate(facts)[0]!;

    expect(finding.headline).toContain('at least ₹12,500');
    expect(finding.whatWouldChangeThis).toContain('floor');
    expect(finding.evidence.some((e) => e.metric === 'cost.byFund.withoutTer.count')).toBe(true);
  });

  it('names the threshold in whatWouldChangeThis', () => {
    const finding = pfDirectSavingsRule.evaluate(
      factsWithCost({
        directPlanSavingsInr: serializeMoney('12500'),
        byFund: byFundSaving('12500'),
      }),
    )[0]!;

    expect(finding.whatWouldChangeThis.length).toBeGreaterThan(0);
    expect(finding.whatWouldChangeThis).toContain('₹2,000');
  });

  it('calls the saving a floor under a partial family scope', () => {
    const facts = factsWithCost(
      { directPlanSavingsInr: serializeMoney('12500'), byFund: byFundSaving('12500') },
      { portfolio: { scope: makePartialScope() } },
    );

    const finding = pfDirectSavingsRule.evaluate(facts)[0]!;

    expect(finding.headline).toContain('at least');
    expect(finding.whatWouldChangeThis).toContain('floor');
    expect(finding.evidence.some((e) => e.label.includes('floor'))).toBe(true);
  });
});
