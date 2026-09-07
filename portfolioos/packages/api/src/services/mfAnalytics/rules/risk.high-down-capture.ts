/**
 * `HIGH_DOWN_CAPTURE` (`05 §4`, fund scope, row 4).
 *
 * Down-capture is the share of the benchmark's *falls* the fund participated
 * in: 1.15 means that in the months the index was down, the fund was down 15%
 * more. It is the single most useful risk number in a retail portfolio,
 * because it is the one that describes what the holder will actually
 * experience in the year they are most likely to sell.
 *
 * Trigger (`05 §4`): `downCapture > highDownCaptureRatioCeiling` AND its
 * category percentile is below `highDownCapturePercentileCeiling`.
 *
 * WHY THE PERCENTILE TERM. Down-capture above 1.10 is normal and unremarkable
 * for an aggressive mandate — a small-cap fund that did not fall harder than a
 * large-cap index would not be doing its job. The percentile is what makes the
 * claim category-relative: the fund falls harder than the index *and* harder
 * than three-quarters of the funds run to the same mandate.
 *
 * `downCapture` is `LOWER_IS_BETTER` in `mfScoreMath.METRIC_DIRECTION`, so the
 * stored percentile is already normalised to "higher = better = fell less"
 * (`03 §1`). `< 0.25` therefore reads directly as "in the worst quartile"; it
 * is NOT re-inverted here.
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

const RULE_ID = 'mf.risk.high-down-capture';
const RULE_VERSION = '1.0.0';
const CODE = 'HIGH_DOWN_CAPTURE';

const HORIZON_YEARS = {
  '1': 1,
  '3': 3,
  '5': 5,
  '7': 7,
  '10': 10,
} as const satisfies Record<MfHorizonKey, 1 | 3 | 5 | 7 | 10>;

function pctLabel(value: Ratio, dp = 0): string {
  return toDecimal(value).times(100).toFixed(dp);
}

export const riskHighDownCaptureRule: MfRule = {
  id: RULE_ID,
  version: RULE_VERSION,
  scope: 'FUND',
  category: 'RISK',

  evaluate(facts: MfAnalysisFacts, schemeCode?: string): MfFinding[] {
    if (schemeCode === undefined) return [];
    const fund = facts.funds[schemeCode];
    if (fund === undefined) return [];

    // Longest horizon that carries BOTH the value and its rank. A capture
    // ratio measured over one year is a single market episode; over ten it is
    // a characteristic. `confidenceFor` prices the difference.
    let key: MfHorizonKey | null = null;
    for (const candidate of [...MF_HORIZON_KEYS].reverse()) {
      const row = fund.metrics[candidate];
      if (row === null || row.status === 'QUARANTINED') continue;
      const value = row.relative.downCapture;
      const status = row.fieldStatus['relative.downCapture'];
      // A non-OK status covers the common case here: no benchmark series, so
      // no capture ratio. Silence is the honest answer (`05 §4` scales
      // confidence for a missing benchmark, but a MISSING METRIC is not a
      // low-confidence metric — it is no metric).
      if (value === null || (status !== undefined && status !== 'OK')) continue;
      if (fund.peer[candidate]?.percentiles['downCapture'] === undefined) continue;
      key = candidate;
      break;
    }
    if (key === null) return [];

    const row = fund.metrics[key];
    const peer = fund.peer[key];
    if (row === null || peer === null) return [];
    const downCapture = row.relative.downCapture;
    const percentile = peer.percentiles['downCapture'];
    if (downCapture === null || percentile === undefined) return [];

    const { constants } = facts;
    const ratioCeiling = toDecimal(constants.highDownCaptureRatioCeiling);
    const percentileCeiling = toDecimal(constants.highDownCapturePercentileCeiling);

    if (!toDecimal(downCapture).greaterThan(ratioCeiling)) return [];
    if (!toDecimal(percentile).lessThan(percentileCeiling)) return [];

    const years = HORIZON_YEARS[key];
    const median = peer.medians['downCapture'] ?? null;

    const evidence: MfEvidence[] = [
      {
        metric: 'relative.downCapture',
        label: 'Down-capture vs benchmark',
        horizonYears: years,
        value: downCapture,
        categoryMedian: median,
        percentile,
        unit: 'ratio',
      },
    ];

    const headline =
      median === null
        ? `Captured ${pctLabel(downCapture)}% of benchmark losses over ${years} years`
        : `Captured ${pctLabel(downCapture)}% of benchmark losses ` +
          `(category median ${pctLabel(median)}%)`;

    return [
      makeFinding(facts, {
        ruleId: RULE_ID,
        ruleVersion: RULE_VERSION,
        schemeCode,
        code: CODE,
        category: 'RISK',
        severity: 'WARNING',
        // A non-null down-capture proves a benchmark series existed for this
        // horizon; there is no way to compute it without one.
        confidence: confidenceFor({ horizonYears: years, benchmarkAvailable: true }),
        headline,
        evidence,
        whatWouldChangeThis:
          `Would clear at down-capture <= ${toDecimal(constants.highDownCaptureRatioCeiling).toFixed(2)} ` +
          `(currently ${toDecimal(downCapture).toFixed(2)}), or if it left the category's worst quartile.`,
      }),
    ];
  },
};
