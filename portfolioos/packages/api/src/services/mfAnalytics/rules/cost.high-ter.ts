/**
 * `HIGH_TER` (`05 §4`, fund scope, row 7).
 *
 * Fires when `terPercentile < highTerPercentileCeiling` (default 0.25).
 *
 * DIRECTION. `terPct` and `terPercentile` are both LOWER_IS_BETTER in
 * `mfScoreMath.METRIC_DIRECTION`, so the stored percentile is already
 * normalised to "higher = better = cheaper" (`03 §1`). A percentile of 0.25
 * therefore means **costlier than 75% of the category**, which is exactly what
 * `05 §4`'s parenthetical says. It is NOT re-inverted here; the number in the
 * facts is already the number the threshold is written against.
 *
 * WHY NOTICE, NOT WARNING. Cost is the one predictor of future relative return
 * that is actually knowable in advance, which argues for severity — but a high
 * TER inside a category is a smaller effect than the regular-versus-direct
 * plan gap sitting next to it (`REGULAR_PLAN_COST`, WARNING), and if both fire
 * on the same fund the bigger, more actionable number should be the one that
 * sorts first.
 *
 * UNITS. `terPct` / `terCategoryMedianPct` are branded `Pct` (percent units:
 * `0.62` is 0.62% a year), while `MfEvidence.value` is branded `Ratio`. The
 * brands exist to make a stray x100 a compile error, and the evidence row
 * carries `unit: 'pct'` to say which one this is; the rebrand below via
 * `serializeRatio(toDecimal(...))` preserves the number exactly and changes
 * nothing but the type.
 */

import {
  serializeRatio,
  toDecimal,
  type MfEvidence,
  type MfFinding,
  type Pct,
} from '@portfolioos/shared';
import { confidenceFor, makeFinding, type MfAnalysisFacts, type MfRule } from '../types.js';

const RULE_ID = 'mf.cost.high-ter';
const RULE_VERSION = '1.0.0';
const CODE = 'HIGH_TER';

/** A percent-unit value carried on an evidence row. See the UNITS note above. */
function asEvidenceValue(value: Pct) {
  return serializeRatio(toDecimal(value));
}

export const costHighTerRule: MfRule = {
  id: RULE_ID,
  version: RULE_VERSION,
  scope: 'FUND',
  category: 'COST',

  evaluate(facts: MfAnalysisFacts, schemeCode?: string): MfFinding[] {
    if (schemeCode === undefined) return [];
    const fund = facts.funds[schemeCode];
    if (fund === undefined) return [];

    const profile = fund.profile;
    if (profile === null || profile.status === 'QUARANTINED') return [];

    const percentile = profile.terPercentile;
    const percentileStatus = profile.fieldStatus['terPercentile'];
    // No rank means no comparison. A TER on its own says nothing without the
    // category beside it — 0.9% is dear for a large-cap index fund and cheap
    // for a small-cap active one.
    if (percentile === null || (percentileStatus !== undefined && percentileStatus !== 'OK')) {
      return [];
    }

    const ceiling = toDecimal(facts.constants.highTerPercentileCeiling);
    const percentileDec = toDecimal(percentile);
    if (!percentileDec.lessThan(ceiling)) return [];

    const terStatus = profile.fieldStatus['terPct'];
    const ter = terStatus !== undefined && terStatus !== 'OK' ? null : profile.terPct;
    const medianStatus = profile.fieldStatus['terCategoryMedianPct'];
    const median =
      medianStatus !== undefined && medianStatus !== 'OK' ? null : profile.terCategoryMedianPct;

    const evidence: MfEvidence[] = [
      {
        metric: 'terPercentile',
        label: 'Expense-ratio percentile in category (higher = cheaper)',
        value: percentile,
        percentile,
        unit: 'ratio',
      },
    ];
    if (ter !== null) {
      evidence.push({
        metric: 'terPct',
        label: 'Total expense ratio',
        value: asEvidenceValue(ter),
        categoryMedian: median === null ? null : asEvidenceValue(median),
        unit: 'pct',
      });
    }

    // "Costlier than N% of the category" is the complement of the normalised
    // percentile, computed once rather than left to the reader.
    const costlierThan = toDecimal(1).minus(percentileDec).times(100).toFixed(0);
    const ceilingComplement = toDecimal(1).minus(ceiling).times(100).toFixed(0);

    const headline =
      ter === null
        ? `Expense ratio is costlier than ${costlierThan}% of the category`
        : median === null
          ? `TER of ${toDecimal(ter).toFixed(2)}% is costlier than ${costlierThan}% of the category`
          : `TER of ${toDecimal(ter).toFixed(2)}% is costlier than ${costlierThan}% of the ` +
            `category (median ${toDecimal(median).toFixed(2)}%)`;

    const counterfactual =
      median === null
        ? `Would clear once the TER leaves the category's costliest ${ceilingComplement}% ` +
          `(expense-ratio percentile at or above ${ceiling.toFixed(2)}).`
        : `Would clear at a TER at or below the category median ` +
          `${toDecimal(median).toFixed(2)}% — the fund is currently in the costliest ` +
          `${ceilingComplement}% (percentile below ${ceiling.toFixed(2)}).`;

    return [
      makeFinding(facts, {
        ruleId: RULE_ID,
        ruleVersion: RULE_VERSION,
        schemeCode,
        code: CODE,
        category: 'COST',
        severity: 'NOTICE',
        // A structural fact with no return series behind it: `confidenceFor`
        // with no horizon, which is `CONFIDENCE_NO_HORIZON` (0.6).
        confidence: confidenceFor(),
        headline,
        evidence,
        whatWouldChangeThis: counterfactual,
      }),
    ];
  },
};
