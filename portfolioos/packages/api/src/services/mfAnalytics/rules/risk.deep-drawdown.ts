/**
 * `DEEP_DRAWDOWN` (`05 §4`, fund scope, row 5).
 *
 * ---------------------------------------------------------------------------
 * SIGN CONVENTION — read this before changing anything below
 * ---------------------------------------------------------------------------
 * `MfRiskMetrics.maxDrawdown` is stored **negative**: `-0.30` is a 30%
 * peak-to-trough fall (`mfAnalytics.types.ts`). The peer ranker, by contrast,
 * ranks it as a **magnitude** — `RANKED_METRICS` marks it `magnitude: true`,
 * so `peer.medians['maxDrawdown']` is a POSITIVE fraction (`0.20` = a 20%
 * fall) and its direction is LOWER_IS_BETTER.
 *
 * Two different sign conventions for the same quantity, one field apart. Every
 * comparison in this rule is therefore done on **magnitudes**: the fund's
 * drawdown is negated before it is compared to anything. Comparing the signed
 * value against the magnitude median would invert the rule silently — it would
 * fire on the funds that fell least — and no test that only checked "it fired"
 * would catch it. That is why the negation happens once, here, with a name.
 *
 * ---------------------------------------------------------------------------
 * WHAT `05 §4` SAYS AND WHAT THE FACTS CARRY
 * ---------------------------------------------------------------------------
 * The doc's trigger is "`maxDrawdown` worse than category p25 by > 5 pp".
 * `MfPeerPercentiles` carries, per metric, the fund's **percentile** and the
 * category **median** — there is no p25 *value* anywhere in the facts, and
 * inventing one (interpolating from a median we do have) would manufacture the
 * exact number the finding is built on.
 *
 * So the trigger is expressed with the two things the facts do carry, and both
 * halves of the doc's sentence survive:
 *
 *   1. the fund is at or beyond the category's 25th-percentile cut — i.e. its
 *      normalised (higher = better) drawdown percentile is below 0.25. This is
 *      the "worse than category p25" half, stated as a rank rather than as a
 *      value we cannot compute; and
 *   2. its drawdown magnitude exceeds the category median by more than
 *      `deepDrawdownWorseThanCategoryP25Pp` percentage points. This is the
 *      "by > 5 pp" half, measured from the median — the only category level
 *      available.
 *
 * Because the p25 magnitude is necessarily larger than the median magnitude,
 * term 2 alone would be looser than the doc; term 1 is what restores the
 * intent. Noted here rather than in a commit message because a future reader
 * comparing this file to `05 §4` will otherwise think it is simply wrong.
 */

import { toDecimal, type MfEvidence, type MfFinding, type Ratio } from '@portfolioos/shared';
import {
  MF_HORIZON_KEYS,
  confidenceFor,
  makeFinding,
  type MfAnalysisFacts,
  type MfHorizonKey,
  type MfRule,
} from '../types.js';

const RULE_ID = 'mf.risk.deep-drawdown';
const RULE_VERSION = '1.0.0';
const CODE = 'DEEP_DRAWDOWN';

/** `05 §4`'s "category p25" half, expressed as the rank we can actually read. */
const CATEGORY_BOTTOM_QUARTILE = '0.25';

const HORIZON_YEARS = {
  '1': 1,
  '3': 3,
  '5': 5,
  '7': 7,
  '10': 10,
} as const satisfies Record<MfHorizonKey, 1 | 3 | 5 | 7 | 10>;

function pctLabel(value: Ratio, dp = 1): string {
  return toDecimal(value).times(100).toFixed(dp);
}

export const riskDeepDrawdownRule: MfRule = {
  id: RULE_ID,
  version: RULE_VERSION,
  scope: 'FUND',
  category: 'RISK',

  evaluate(facts: MfAnalysisFacts, schemeCode?: string): MfFinding[] {
    if (schemeCode === undefined) return [];
    const fund = facts.funds[schemeCode];
    if (fund === undefined) return [];

    // Longest horizon carrying the drawdown, its rank and the category median.
    // All three are required: without the median there is no "by 5pp", and
    // without the rank there is no "worse than p25".
    let key: MfHorizonKey | null = null;
    for (const candidate of [...MF_HORIZON_KEYS].reverse()) {
      const row = fund.metrics[candidate];
      if (row === null || row.status === 'QUARANTINED') continue;
      const status = row.fieldStatus['risk.maxDrawdown'];
      if (row.risk.maxDrawdown === null || (status !== undefined && status !== 'OK')) continue;
      const peerRow = fund.peer[candidate];
      if (peerRow === null) continue;
      if (peerRow.percentiles['maxDrawdown'] === undefined) continue;
      if (peerRow.medians['maxDrawdown'] === undefined) continue;
      key = candidate;
      break;
    }
    if (key === null) return [];

    const row = fund.metrics[key];
    const peer = fund.peer[key];
    if (row === null || peer === null) return [];
    const signedDrawdown = row.risk.maxDrawdown;
    const percentile = peer.percentiles['maxDrawdown'];
    const medianMagnitude = peer.medians['maxDrawdown'];
    if (signedDrawdown === null || percentile === undefined || medianMagnitude === undefined) {
      return [];
    }

    const { constants } = facts;

    // THE negation. Everything downstream is a magnitude.
    const fundMagnitude = toDecimal(signedDrawdown).abs();
    const medianMagnitudeDec = toDecimal(medianMagnitude).abs();

    // `…Pp` constants are PERCENTAGE POINTS (`mfAnalytics.constants.ts` units
    // convention) while drawdowns are fractions, so the threshold is scaled
    // down rather than the metrics scaled up — one division instead of two
    // multiplications, and the evidence keeps its native units.
    const gapThreshold = toDecimal(constants.deepDrawdownWorseThanCategoryP25Pp).dividedBy(100);
    const gap = fundMagnitude.minus(medianMagnitudeDec);

    if (!toDecimal(percentile).lessThan(toDecimal(CATEGORY_BOTTOM_QUARTILE))) return [];
    if (!gap.greaterThan(gapThreshold)) return [];

    const years = HORIZON_YEARS[key];

    const evidence: MfEvidence[] = [
      {
        metric: 'risk.maxDrawdown',
        label: 'Worst peak-to-trough fall',
        horizonYears: years,
        // Cited with its stored sign, so the evidence row and the database
        // column agree; only the comparison above works in magnitudes.
        value: signedDrawdown,
        categoryMedian: medianMagnitude,
        percentile,
        unit: 'ratio',
      },
    ];

    return [
      makeFinding(facts, {
        ruleId: RULE_ID,
        ruleVersion: RULE_VERSION,
        schemeCode,
        code: CODE,
        category: 'RISK',
        severity: 'NOTICE',
        // Drawdown is computed from the fund's own NAV series; no benchmark is
        // involved, so a missing benchmark does not cap this claim.
        confidence: confidenceFor({ horizonYears: years }),
        headline:
          `Fell ${fundMagnitude.times(100).toFixed(1)}% peak-to-trough against a category ` +
          `median of ${pctLabel(medianMagnitude)}%`,
        evidence,
        whatWouldChangeThis:
          `Would clear if the worst fall came within ` +
          `${toDecimal(constants.deepDrawdownWorseThanCategoryP25Pp).toFixed(0)} percentage ` +
          `points of the category median ${pctLabel(medianMagnitude)}% ` +
          `(currently ${gap.times(100).toFixed(1)}pp beyond it), or it left the worst quartile.`,
      }),
    ];
  },
};
