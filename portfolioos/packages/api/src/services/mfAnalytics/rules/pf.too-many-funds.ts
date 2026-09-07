/**
 * `mf.pf.too-many-funds` — `FUND_SPRAWL` (`05 §4`, portfolio scope).
 *
 * Two **independent** triggers, either of which fires the finding:
 *
 *  1. **Count.** More than `fundSprawlEquityFundCount` equity funds. Past
 *     roughly ten, an equity book is buying the market at active prices; the
 *     eleventh fund's contribution is administrative, not diversifying.
 *  2. **Effective count.** `effectiveFundCount` (`1 / Σ w²`, `04 §2`) below
 *     `fundSprawlEffectiveFundRatioFloor × fundCount` — many funds, few real
 *     bets. Fifteen funds where two hold 80% of the money is a two-fund
 *     portfolio with thirteen statements attached, and the plain count alone
 *     would never say so.
 *
 * They are genuinely different failures, so the headline names **which one
 * fired**. A single "you hold too many funds" sentence for both would send
 * the second case's holder counting their funds and finding nothing wrong.
 */

import { serializeRatio, toDecimal, type MfEvidence, type MfFinding } from '@portfolioos/shared';

import { confidenceFor, makeFinding, type MfAnalysisFacts, type MfRule } from '../types.js';

const RULE_ID = 'mf.pf.too-many-funds';
const RULE_VERSION = '1.0.0';

export const pfTooManyFundsRule: MfRule = {
  id: RULE_ID,
  version: RULE_VERSION,
  scope: 'PORTFOLIO',
  category: 'PORTFOLIO',

  evaluate(facts: MfAnalysisFacts): MfFinding[] {
    const { totals } = facts.portfolio;
    const { fundSprawlEquityFundCount, fundSprawlEffectiveFundRatioFloor } = facts.constants;

    // An empty book has no sprawl to report, and `effectiveFundCount` over
    // zero funds is not a number this rule can reason about.
    if (totals.fundCount <= 0) return [];

    const countTripped = totals.equityFundCount > fundSprawlEquityFundCount;

    const effective = toDecimal(totals.effectiveFundCount);
    const effectiveFloor = toDecimal(fundSprawlEffectiveFundRatioFloor).times(totals.fundCount);
    const concentrationTripped = effective.lessThan(effectiveFloor);

    if (!countTripped && !concentrationTripped) return [];

    // Under a restricted family view the counts are floors: the household may
    // hold funds this caller was never shown (`CONTEXT.md §6`). "You hold 11
    // equity funds" and "you hold at least 11 equity funds" are different
    // claims, and only the second one is true here.
    const partial = facts.portfolio.scope.partial;
    const atLeast = partial ? 'at least ' : '';

    // Kept short by construction: `makeFinding` throws above 120 characters,
    // and a headline whose number falls off the end is worse than none.
    const headline = countTripped
      ? `${atLeast}${totals.equityFundCount} equity funds, past the ${fundSprawlEquityFundCount} ` +
        'where extra funds stop diversifying' +
        (concentrationTripped ? '; few are distinct bets' : '')
      : `${atLeast}${totals.fundCount} funds but only ${effective.toFixed(1)} effective ones — ` +
        'most of the money sits in a few';

    const evidence: MfEvidence[] = [
      {
        metric: 'totals.equityFundCount',
        label: partial ? 'Equity funds held (floor — shared holdings only)' : 'Equity funds held',
        value: serializeRatio(totals.equityFundCount),
        unit: 'count',
      },
      {
        metric: 'constants.fundSprawlEquityFundCount',
        label: 'Equity funds above which sprawl is flagged',
        value: serializeRatio(fundSprawlEquityFundCount),
        unit: 'count',
      },
      {
        metric: 'totals.effectiveFundCount',
        label: 'Effective fund count (1 / sum of squared weights)',
        value: serializeRatio(effective),
        unit: 'count',
      },
      {
        metric: 'constants.fundSprawlEffectiveFundRatioFloor',
        label: `Effective-count floor (${fundSprawlEffectiveFundRatioFloor} x ${totals.fundCount} funds held)`,
        value: serializeRatio(effectiveFloor),
        unit: 'count',
      },
    ];

    const clears: string[] = [];
    if (countTripped) {
      clears.push(
        `holding ${fundSprawlEquityFundCount} or fewer equity funds (you hold ` +
          `${atLeast}${totals.equityFundCount})`,
      );
    }
    if (concentrationTripped) {
      clears.push(
        `spreading the money so the effective fund count reaches ${effectiveFloor.toFixed(1)} ` +
          `— half of the ${totals.fundCount} funds held — instead of ${effective.toFixed(1)}`,
      );
    }

    const counterfactual =
      `Would clear by ${clears.join(', and by ')}.` +
      (partial
        ? ' These counts cover only the holdings shared with you, so they are a floor: ' +
          'the household may hold more funds than are counted here.'
        : '');

    return [
      makeFinding(facts, {
        ruleId: RULE_ID,
        ruleVersion: RULE_VERSION,
        schemeCode: null,
        code: 'FUND_SPRAWL',
        category: 'PORTFOLIO',
        severity: 'NOTICE',
        // A structural count, not a return series.
        confidence: confidenceFor(),
        headline,
        evidence,
        whatWouldChangeThis: counterfactual,
      }),
    ];
  },
};
