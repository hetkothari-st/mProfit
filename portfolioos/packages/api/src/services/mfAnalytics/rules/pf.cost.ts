/**
 * `mf.pf.cost` — `PORTFOLIO_COST_HIGH` (`05 §4`, portfolio scope).
 *
 * Fires when the book's weighted cost **rank** against its categories is below
 * `portfolioCostPercentileCeiling` — i.e. the portfolio is dearer than most
 * comparable funds. The direction follows `03 §1`'s table, which the fund-scope
 * `HIGH_TER` rule shares: on cost, a *higher* percentile is better (cheaper),
 * so "below 0.3" means "in the most expensive 30%".
 *
 * ── On the input this rule depends on ─────────────────────────────────────
 *
 * `costCategoryPercentile` is a weighted mean of each fund's `terPercentile`
 * (`04 §4`). That input did not exist when this rule was written: `terPct`
 * was absent from `mfPeerRank`'s ranked metrics, so no `terPercentile` was
 * ever written and the weighted mean was always `null`, making the rule
 * permanently silent.
 *
 * That was a defect, not a design decision — `03 §1`'s direction table lists
 * TER, so the ranker was always meant to produce it, and the same hole left
 * the COST pillar null in all six scoring models (35% of an INDEX score).
 * The horizon-0 structural ranks in `mfPeerRank.service.ts` now populate it,
 * so this rule fires.
 *
 * It still yields `null` for a fund whose AMC publishes no TER, and the rule
 * is correctly silent then — a missing fee is not a cheap one.
 *
 * The tempting substitute is `weightedTerPct`, which is populated. It must not
 * be used: it is a **level**, not a **rank**. A 0.9% weighted TER is expensive
 * for a large-cap index book and cheap for a small-cap active one, and there
 * is no category-free number of basis points above which a portfolio is dear.
 * Firing on a level would produce a finding whose threshold means something
 * different for every user who sees it, and `whatWouldChangeThis` could not
 * name a figure the user could act against. Silence is the correct answer to
 * a rank we do not have; a plausible-looking finding from the wrong input is
 * not.
 */

import { serializeRatio, toDecimal, type MfEvidence, type MfFinding } from '@portfolioos/shared';

import { confidenceFor, makeFinding, type MfAnalysisFacts, type MfRule } from '../types.js';

const RULE_ID = 'mf.pf.cost';
const RULE_VERSION = '1.0.0';

export const pfCostRule: MfRule = {
  id: RULE_ID,
  version: RULE_VERSION,
  scope: 'PORTFOLIO',
  category: 'COST',

  evaluate(facts: MfAnalysisFacts): MfFinding[] {
    const { cost } = facts.portfolio;
    const ceiling = facts.constants.portfolioCostPercentileCeiling;

    // Null = no fund in the book has a cost rank. Not "cheapest possible".
    if (cost.costCategoryPercentile === null) return [];

    const percentile = toDecimal(cost.costCategoryPercentile);
    if (!percentile.lessThan(ceiling)) return [];

    // Percentile → "costlier than N% of the category", which is the sentence
    // a reader can check. 0.18 means dearer than 82% of comparable funds.
    const costlierThan = toDecimal(1).minus(percentile).times(100);

    const headline =
      `Your funds cost more than ${costlierThan.toFixed(0)}% of comparable ` +
      'schemes in their own categories';

    const evidence: MfEvidence[] = [
      {
        metric: 'cost.costCategoryPercentile',
        label: 'Weighted cost percentile against each fund’s category (higher = cheaper)',
        value: serializeRatio(percentile),
        unit: 'ratio',
      },
      {
        metric: 'constants.portfolioCostPercentileCeiling',
        label: 'Cost percentile below which a portfolio is called expensive',
        value: serializeRatio(ceiling),
        unit: 'ratio',
      },
    ];

    // Cited only where known. `weightedTerPct` is `| null`, and null means no
    // held fund disclosed a TER — never that the portfolio is free. It is
    // context for the rank, never a substitute for it.
    if (cost.weightedTerPct !== null) {
      evidence.push({
        metric: 'cost.weightedTerPct',
        label: 'Weighted expense ratio across funds that disclose one',
        value: serializeRatio(toDecimal(cost.weightedTerPct)),
        unit: 'pct',
      });
    }
    if (cost.annualCostInr !== null) {
      evidence.push({
        metric: 'cost.annualCostInr',
        label: 'Annual cost at current value, over the funds that disclose a TER',
        value: serializeRatio(toDecimal(cost.annualCostInr)),
        unit: 'inr',
      });
    }

    const partial = facts.portfolio.scope.partial;
    const counterfactual =
      `Would clear once the weighted cost percentile reaches ${ceiling} — it is ` +
      `${percentile.toFixed(2)} today, which puts the book among the most expensive ` +
      `${toDecimal(1).minus(ceiling).times(100).toFixed(0)}% of its categories. ` +
      'Moving any regular plan to ' +
      'its direct equivalent, or to a cheaper fund in the same SEBI sub-category, raises it.' +
      (partial
        ? ' The weighting covers only the holdings shared with you, so this rank describes ' +
          'that subset rather than the household book.'
        : '');

    return [
      makeFinding(facts, {
        ruleId: RULE_ID,
        ruleVersion: RULE_VERSION,
        schemeCode: null,
        code: 'PORTFOLIO_COST_HIGH',
        category: 'COST',
        severity: 'NOTICE',
        confidence: confidenceFor(),
        headline,
        evidence,
        whatWouldChangeThis: counterfactual,
      }),
    ];
  },
};
