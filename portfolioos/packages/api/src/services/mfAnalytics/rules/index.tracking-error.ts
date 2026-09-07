/**
 * `HIGH_TRACKING_ERROR` — an index fund is not tracking its index as closely
 * as its peers do.
 *
 * `05 §4`: "INDEX model, `trackingErrorAnn` percentile < 0.25", severity
 * WARNING.
 *
 * ---------------------------------------------------------------------------
 * Why the INDEX guard is load-bearing, not defensive
 * ---------------------------------------------------------------------------
 *
 * Tracking error is a **model-scoped** input: `MODEL_SCOPED_METRICS` in
 * `mfScoring` lists it under INDEX only, and `mfScoreMath.directionFor`
 * *throws* when asked for the direction of a metric outside its model. That is
 * correct behaviour there — a scoring model naming an input it does not own is
 * a bug — and it means `mfPeerRank` never produces a `trackingErrorAnn`
 * percentile for an active-equity universe.
 *
 * There is a second, non-mechanical reason the guard matters. For an actively
 * managed fund a large tracking error is not a defect at all: it is the
 * measure of how much active risk the manager is taking, and a fund with *no*
 * tracking error is the one with a problem (`CLOSET_INDEX` covers that case).
 * Firing this rule on an active fund would invert its meaning.
 *
 * The guard is on `score.modelKey`, not on the sub-category name, because the
 * model key is what `mfPeerRank` actually keyed the percentile by. Guarding on
 * anything else risks reading a percentile that was ranked under a different
 * direction convention.
 *
 * ---------------------------------------------------------------------------
 * Direction
 * ---------------------------------------------------------------------------
 *
 * `MfPeerPercentiles.percentiles` are already direction-adjusted: "higher
 * always meaning better". For tracking error, better means smaller, so a
 * percentile of 0.10 is a fund in the worst decile — a *large* tracking error.
 * The comparison below is therefore `< 0.25`, exactly as `05 §4` writes it,
 * and it must not be flipped by anyone who reads the raw metric and expects
 * "high number = high percentile".
 */

import { Decimal } from 'decimal.js';
import { serializeRatio, toDecimal } from '@portfolioos/shared';
import type { MfEvidence, MfFinding, MfHorizonYears } from '@portfolioos/shared';
import {
  MF_HORIZON_KEYS,
  confidenceFor,
  makeFinding,
  type MfAnalysisFacts,
  type MfHorizonKey,
  type MfRule,
} from '../types.js';

const RULE_ID = 'mf.index.tracking-error';
const RULE_VERSION = '1.0.0';

const METRIC = 'trackingErrorAnn';

const ONE = new Decimal(1);

/**
 * The **longest** horizon that has both a tracking-error percentile and a
 * tracking-error value.
 *
 * Longest rather than shortest because tracking error is a persistence claim:
 * a single bad year can come from one index reconstitution, while a poor
 * five-year figure is the fund's process. `confidenceFor` then rewards the
 * longer series, which is the same ordering.
 */
function longestHorizonWithPercentile(
  facts: MfAnalysisFacts,
  schemeCode: string,
): { key: MfHorizonKey; years: MfHorizonYears } | null {
  for (let i = MF_HORIZON_KEYS.length - 1; i >= 0; i -= 1) {
    const key = MF_HORIZON_KEYS[i]!;
    const fund = facts.funds[schemeCode];
    const peer = fund?.peer[key];
    const metrics = fund?.metrics[key];
    if (!peer || !metrics) continue;
    if (metrics.status !== 'OK') continue;
    if (peer.percentiles[METRIC] === undefined) continue;
    if (metrics.riskAdjusted.trackingErrorAnn === null) continue;
    // `${MfHorizonYears}` and MfHorizonKey are the same five strings, so this
    // parse is total over the key space.
    return { key, years: Number.parseInt(key, 10) as MfHorizonYears };
  }
  return null;
}

export const indexTrackingErrorRule: MfRule = {
  id: RULE_ID,
  version: RULE_VERSION,
  scope: 'FUND',
  category: 'INDEX',

  evaluate(facts: MfAnalysisFacts, schemeCode?: string): MfFinding[] {
    if (!schemeCode) return [];
    const fund = facts.funds[schemeCode];
    if (!fund) return [];

    // Unscored funds have no model, so there is nothing to guard on and
    // nothing to compare against. Silence, not a default.
    const score = fund.score;
    if (!score || score.modelKey !== 'INDEX') return [];

    const horizon = longestHorizonWithPercentile(facts, schemeCode);
    if (horizon === null) return [];

    const peer = fund.peer[horizon.key]!;
    const metrics = fund.metrics[horizon.key]!;
    const percentile = peer.percentiles[METRIC]!;
    const value = metrics.riskAdjusted.trackingErrorAnn!;

    const ceiling = facts.constants.highTrackingErrorPercentileCeiling;
    if (!toDecimal(percentile).lessThan(ceiling)) return [];

    const median = peer.medians[METRIC] ?? null;

    const evidence: MfEvidence[] = [
      {
        metric: 'riskAdjusted.trackingErrorAnn',
        label: 'Annualised tracking error against the scheme’s index',
        horizonYears: horizon.years,
        value,
        categoryMedian: median,
        percentile,
        unit: 'ratio',
      },
      {
        metric: 'peer.universeSize',
        label: `Index schemes compared against (${peer.universeKey})`,
        horizonYears: horizon.years,
        value: serializeRatio(peer.universeSize),
        unit: 'count',
      },
    ];

    /** Share of peers this fund tracks *worse* than, as a whole percent. */
    const worseThanPct = ONE.minus(toDecimal(percentile)).times(100).toFixed(0);
    const ceilingPct = new Decimal(ceiling).times(100).toFixed(0);

    return [
      makeFinding(facts, {
        ruleId: RULE_ID,
        ruleVersion: RULE_VERSION,
        schemeCode,
        code: 'HIGH_TRACKING_ERROR',
        category: 'INDEX',
        severity: 'WARNING',
        // Tracking error is a benchmark-relative metric by construction. If
        // the horizon had no benchmark the metric would be null and we would
        // not be here, so the benchmark is available by the time we reach it.
        confidence: confidenceFor({ horizonYears: horizon.years }),
        headline:
          `Tracks its index worse than ${worseThanPct}% of peer index funds over ${horizon.years}y`,
        evidence,
        whatWouldChangeThis:
          `Clears when the ${horizon.years}-year tracking error moves above the ` +
          `${ceilingPct}th percentile of index funds in ${peer.universeKey}` +
          (median !== null ? ` — the category median is ${toDecimal(median).times(100).toFixed(2)}%.` : '.'),
      }),
    ];
  },
};

export default indexTrackingErrorRule;
