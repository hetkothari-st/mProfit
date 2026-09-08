/**
 * `CONSISTENT_OUTPERFORMER` (`05 §4`, fund scope, row 2).
 *
 * The one INFO finding in the performance family, and the only rule in this
 * batch that says something good. It exists because a findings engine that
 * only ever reports problems trains its reader to discount it: if every fund
 * comes back with a list of complaints, the complaints stop carrying
 * information. A fund that has genuinely been consistent should be told so, in
 * the same evidenced form and with the same "what would change this".
 *
 * Trigger (`05 §4`): `quartileConsistency >= 0.8` over at least
 * `consistentOutperformerMinYears` of history, AND `rollingBeatBenchPct(3y)
 * >= consistentOutperformerRollingBeatPctFloor`.
 *
 * TWO NAMING CAVEATS, both deliberate and both visible to the reader:
 *
 *  1. The rule is *called* top-quartile consistency, but `quartileConsistency`
 *     as computed in `mfPeerRank.service.ts` is the share of calendar years
 *     spent in quartile 1 **or 2** — the top *half*. The headline therefore
 *     says "top half of its category", because claiming top-quartile from a
 *     top-half measurement would be a number the evidence does not support.
 *  2. `05 §4` writes the second term as "(3y)". That is the metrics-row
 *     horizon, matching `persistentUnderperformanceHorizonYears`'s meaning in
 *     `mfAnalytics.constants.ts`. There is no tunable constant for this rule's
 *     rolling horizon, so it is fixed at the 3-year row here.
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

const RULE_ID = 'mf.perf.top-quartile-consistency';
const RULE_VERSION = '1.0.0';
const CODE = 'CONSISTENT_OUTPERFORMER';

/** `05 §4` fixes the benchmark-beat term at the 3-year metrics row. */
const ROLLING_BEAT_HORIZON_KEY: MfHorizonKey = '3';

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

function thresholdPctLabel(value: number, dp = 0): string {
  return toDecimal(value).times(100).toFixed(dp);
}

export const perfTopQuartileConsistencyRule: MfRule = {
  id: RULE_ID,
  version: RULE_VERSION,
  scope: 'FUND',
  category: 'PERFORMANCE',

  evaluate(facts: MfAnalysisFacts, schemeCode?: string): MfFinding[] {
    if (schemeCode === undefined) return [];
    const fund = facts.funds[schemeCode];
    if (fund === undefined) return [];

    const { constants } = facts;
    const minYears = toDecimal(constants.consistentOutperformerMinYears);

    // Longest qualifying horizon first: a 10-year record of consistency is a
    // stronger claim than a 5-year one, and `confidenceFor` prices that in.
    let consistencyKey: MfHorizonKey | null = null;
    for (const key of [...MF_HORIZON_KEYS].reverse()) {
      if (toDecimal(HORIZON_YEARS[key]).lessThan(minYears)) continue;
      const row = fund.metrics[key];
      if (row === null || row.status === 'QUARANTINED') continue;
      const value = row.consistency.quartileConsistency;
      const status = row.fieldStatus['consistency.quartileConsistency'];
      if (value === null || (status !== undefined && status !== 'OK')) continue;
      consistencyKey = key;
      break;
    }
    if (consistencyKey === null) return [];

    const consistencyRow = fund.metrics[consistencyKey];
    // Narrowing only — the loop above already proved this row is present.
    if (consistencyRow === null) return [];
    const consistency = consistencyRow.consistency.quartileConsistency;
    if (consistency === null) return [];

    const beatRow = fund.metrics[ROLLING_BEAT_HORIZON_KEY];
    if (beatRow === null || beatRow.status === 'QUARANTINED') return [];
    const beat = beatRow.consistency.rollingBeatBenchPct;
    const beatStatus = beatRow.fieldStatus['consistency.rollingBeatBenchPct'];
    if (beat === null || (beatStatus !== undefined && beatStatus !== 'OK')) return [];

    const consistencyFloor = toDecimal(constants.consistentOutperformerQuartileConsistencyFloor);
    const beatFloor = toDecimal(constants.consistentOutperformerRollingBeatPctFloor);

    if (toDecimal(consistency).lessThan(consistencyFloor)) return [];
    if (toDecimal(beat).lessThan(beatFloor)) return [];

    const years = HORIZON_YEARS[consistencyKey];
    const beatYears = HORIZON_YEARS[ROLLING_BEAT_HORIZON_KEY];

    const evidence: MfEvidence[] = [
      {
        metric: 'consistency.quartileConsistency',
        label: 'Calendar years in the category top half',
        horizonYears: years,
        value: consistency,
        unit: 'ratio',
      },
      {
        metric: 'consistency.rollingBeatBenchPct',
        label: `Rolling ${beatYears}-year windows beaten`,
        horizonYears: beatYears,
        value: beat,
        unit: 'ratio',
      },
    ];

    return [
      makeFinding(facts, {
        ruleId: RULE_ID,
        ruleVersion: RULE_VERSION,
        schemeCode,
        code: CODE,
        category: 'PERFORMANCE',
        severity: 'INFO',
        confidence: confidenceFor({ horizonYears: years, benchmarkAvailable: true }),
        headline:
          `Top half of its category in ${pctLabel(consistency)}% of years and ahead of its ` +
          `benchmark in ${pctLabel(beat)}% of rolling ${beatYears}y windows`,
        evidence,
        whatWouldChangeThis:
          `Would lose this if category consistency fell below ` +
          `${thresholdPctLabel(constants.consistentOutperformerQuartileConsistencyFloor)}% ` +
          `(currently ${pctLabel(consistency)}%) or the benchmark-beat rate fell below ` +
          `${thresholdPctLabel(constants.consistentOutperformerRollingBeatPctFloor)}%.`,
      }),
    ];
  },
};
