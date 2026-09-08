/**
 * `RECENT_REVERSAL` (`05 §4`, fund scope, row 3).
 *
 * Fires when the fund's long-run (10-year) category percentile and its
 * most-recent (1-year) category percentile point in opposite directions:
 * 10y >= `recentReversalLongPercentileFloor` with 1y <=
 * `recentReversalShortPercentileCeiling`, **or the reverse**. The doc's "(or
 * vice versa)" is not decorative — both directions are the same phenomenon and
 * both matter, so this rule is symmetric by construction:
 *
 *  - long strong / short weak: the reason someone bought the fund may have
 *    stopped being true, and the ten-year number is doing the persuading.
 *  - long weak / short strong: a hot recent year is the reason someone is
 *    about to buy, and the ten-year number says the streak is the exception.
 *
 * It is NOTICE, never WARNING, and it recommends nothing. One year is not
 * evidence of a regime change; it is evidence that the two numbers disagree,
 * which is worth being told and not worth acting on. Hence the counterfactual
 * `05 §4` gives: watch whether the 3-year figure follows the 1-year.
 *
 * WHICH PERCENTILE. `05 §4` says "percentile" without naming the metric.
 * `MfPeerPercentiles.percentiles` is keyed by metric, and the only one that
 * means "how this fund did" in the plain sense the copy implies is the return
 * rank: `cagr` for annualised horizons, `absolute` at 1 year, where SEBI
 * mandates an absolute figure and `cagr` is therefore null (`02 §9`). We read
 * `cagr` then fall back to `absolute`, so the 1y row resolves to `absolute`
 * and the 10y row to `cagr` without either horizon needing a special case.
 */

import { toDecimal, type MfEvidence, type MfFinding, type MfPeerPercentiles, type Ratio } from '@portfolioos/shared';
import {
  confidenceFor,
  makeFinding,
  type MfAnalysisFacts,
  type MfHorizonKey,
  type MfRule,
} from '../types.js';

const RULE_ID = 'mf.perf.recent-reversal';
const RULE_VERSION = '1.0.0';
const CODE = 'RECENT_REVERSAL';

const LONG_KEY: MfHorizonKey = '10';
const SHORT_KEY: MfHorizonKey = '1';
const LONG_YEARS = 10;
const SHORT_YEARS = 1;

function pctLabel(value: Ratio, dp = 0): string {
  return toDecimal(value).times(100).toFixed(dp);
}

function thresholdPctLabel(value: number, dp = 0): string {
  return toDecimal(value).times(100).toFixed(dp);
}

/**
 * The fund's return percentile within its category for one horizon.
 *
 * `cagr` first, `absolute` second — see the header. Returns null when neither
 * is ranked, which happens whenever the universe was too small to rank
 * (`MIN_UNIVERSE_SIZE`) or the fund lacks that horizon's history. Null means
 * silence, not zero.
 */
function returnPercentile(peer: MfPeerPercentiles | null): Ratio | null {
  if (peer === null) return null;
  return peer.percentiles['cagr'] ?? peer.percentiles['absolute'] ?? null;
}

export const perfRecentReversalRule: MfRule = {
  id: RULE_ID,
  version: RULE_VERSION,
  scope: 'FUND',
  category: 'PERFORMANCE',

  evaluate(facts: MfAnalysisFacts, schemeCode?: string): MfFinding[] {
    if (schemeCode === undefined) return [];
    const fund = facts.funds[schemeCode];
    if (fund === undefined) return [];

    const longPct = returnPercentile(fund.peer[LONG_KEY]);
    const shortPct = returnPercentile(fund.peer[SHORT_KEY]);
    // Both ends are required. A reversal is a statement about two numbers; with
    // one of them missing there is no claim to make.
    if (longPct === null || shortPct === null) return [];

    const { constants } = facts;
    const floor = toDecimal(constants.recentReversalLongPercentileFloor);
    const ceiling = toDecimal(constants.recentReversalShortPercentileCeiling);
    const longDec = toDecimal(longPct);
    const shortDec = toDecimal(shortPct);

    // Percentiles are normalised so higher = better for every metric
    // (`03 §1`), so "strong" is simply a high percentile at either end. No
    // re-inversion here, in either direction.
    const cooling = longDec.greaterThanOrEqualTo(floor) && shortDec.lessThanOrEqualTo(ceiling);
    const heating = shortDec.greaterThanOrEqualTo(floor) && longDec.lessThanOrEqualTo(ceiling);
    if (!cooling && !heating) return [];

    const evidence: MfEvidence[] = [
      {
        metric: 'returns.categoryPercentile',
        label: `${LONG_YEARS}-year category percentile`,
        horizonYears: LONG_YEARS,
        value: longPct,
        percentile: longPct,
        unit: 'ratio',
      },
      {
        metric: 'returns.categoryPercentile',
        label: `${SHORT_YEARS}-year category percentile`,
        horizonYears: SHORT_YEARS,
        value: shortPct,
        percentile: shortPct,
        unit: 'ratio',
      },
    ];

    const headline = cooling
      ? `Ranked ${pctLabel(longPct)}th percentile over ${LONG_YEARS} years but ` +
        `${pctLabel(shortPct)}th over the last year`
      : `Ranked ${pctLabel(shortPct)}th percentile over the last year but ` +
        `${pctLabel(longPct)}th over ${LONG_YEARS} years`;

    return [
      makeFinding(facts, {
        ruleId: RULE_ID,
        ruleVersion: RULE_VERSION,
        schemeCode,
        code: CODE,
        category: 'PERFORMANCE',
        severity: 'NOTICE',
        // Peer percentiles are category-relative, not benchmark-relative, so a
        // missing benchmark does not weaken this particular claim.
        confidence: confidenceFor({ horizonYears: LONG_YEARS }),
        headline,
        evidence,
        whatWouldChangeThis:
          `Would clear once the two percentiles agree — the 1-year above ` +
          `${thresholdPctLabel(constants.recentReversalShortPercentileCeiling)} or the ` +
          `10-year below ${thresholdPctLabel(constants.recentReversalLongPercentileFloor)} ` +
          `(on a 0-100 scale). Watch whether the 3-year figure follows the 1-year.`,
      }),
    ];
  },
};
