/**
 * `PERSISTENT_UNDERPERFORMANCE` (`05 §4`, fund scope, row 1).
 *
 * Fires when a fund has beaten its benchmark in fewer than
 * `persistentUnderperformanceRollingBeatPctFloor` of its rolling windows AND
 * its blended PERFORMANCE pillar percentile is below
 * `persistentUnderperformancePillarPercentileCeiling`.
 *
 * WHY BOTH TERMS. Either one alone is a well-known false positive. A fund can
 * trail its benchmark in most windows and still be one of the best funds in a
 * category the benchmark beats wholesale (every active large-cap fund in a
 * strong index year), which is a fact about the category, not about the
 * manager. Conversely a bottom-quartile percentile over one blend can be a
 * single bad year. Requiring both means the fund is losing to the index across
 * a cycle *and* to the people running the same mandate — which is the only
 * version of "underperformance" that survives being argued with.
 *
 * `rollingBeatBenchPct` is defined per metrics-row horizon as
 * `1 - pctBelowBenchmark` over the 3-year rolling distribution inside that
 * horizon (`mfMetrics.service.ts`). `persistentUnderperformanceHorizonYears`
 * selects which row we read, which is exactly what its comment in
 * `mfAnalytics.constants.ts` says it does ("which rolling window is tested").
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

const RULE_ID = 'mf.perf.persistent-underperformance';
const RULE_VERSION = '1.0.0';
const CODE = 'PERSISTENT_UNDERPERFORMANCE';

/**
 * `03 §4`: the pillar whose blended percentile this rule reads. Named here
 * rather than inlined so the string that has to match `MfSchemeScoreDto
 * .pillars`' key appears once.
 */
const PERFORMANCE_PILLAR = 'PERFORMANCE';

/**
 * Horizon key -> its numeric year count, for `confidenceFor`. A literal map
 * rather than `Number(key)`: money-shaped coercion is banned by lint (§3.2)
 * and a total map is checked by the compiler, which a cast is not.
 */
const HORIZON_YEARS = {
  '1': 1,
  '3': 3,
  '5': 5,
  '7': 7,
  '10': 10,
} as const satisfies Record<MfHorizonKey, 1 | 3 | 5 | 7 | 10>;

/** A ratio rendered as a percentage for a headline. Display only, never math. */
function pctLabel(value: Ratio, dp = 1): string {
  return toDecimal(value).times(100).toFixed(dp);
}

/** A plain number threshold rendered as a percentage. */
function thresholdPctLabel(value: number, dp = 0): string {
  return toDecimal(value).times(100).toFixed(dp);
}

export const perfPersistentUnderperformanceRule: MfRule = {
  id: RULE_ID,
  version: RULE_VERSION,
  scope: 'FUND',
  category: 'PERFORMANCE',

  evaluate(facts: MfAnalysisFacts, schemeCode?: string): MfFinding[] {
    if (schemeCode === undefined) return [];
    const fund = facts.funds[schemeCode];
    if (fund === undefined) return [];

    const { constants } = facts;

    // The configured horizon must be one this layer actually reports. A
    // constant set to 4 is a calibration mistake, and silently falling back to
    // 3 would hide it; no row, no finding.
    const horizonKey = `${constants.persistentUnderperformanceHorizonYears}` as MfHorizonKey;
    if (!MF_HORIZON_KEYS.includes(horizonKey)) return [];

    const metrics = fund.metrics[horizonKey];
    if (metrics === null) return [];
    // A quarantined row is known-bad data (`02 §1`); it must not become advice.
    if (metrics.status === 'QUARANTINED') return [];

    const beat = metrics.consistency.rollingBeatBenchPct;
    const beatStatus = metrics.fieldStatus['consistency.rollingBeatBenchPct'];
    // A non-OK status means the number is unavailable, including
    // NOT_APPLICABLE (undefined by construction) — never "a small number".
    if (beat === null || (beatStatus !== undefined && beatStatus !== 'OK')) return [];

    // The PERFORMANCE pillar is null when no input in it was OK; the weight is
    // then redistributed and there is no percentile to compare (`03 §4`).
    const pillar = fund.score?.pillars[PERFORMANCE_PILLAR]?.score ?? null;
    if (pillar === null) return [];

    const beatDec = toDecimal(beat);
    const pillarDec = toDecimal(pillar);
    const beatFloor = toDecimal(constants.persistentUnderperformanceRollingBeatPctFloor);
    const pillarCeiling = toDecimal(constants.persistentUnderperformancePillarPercentileCeiling);

    if (!beatDec.lessThan(beatFloor)) return [];
    if (!pillarDec.lessThan(pillarCeiling)) return [];

    const years = HORIZON_YEARS[horizonKey];

    const evidence: MfEvidence[] = [
      {
        metric: 'consistency.rollingBeatBenchPct',
        label: `Rolling ${years}-year windows beaten`,
        horizonYears: years,
        value: beat,
        unit: 'ratio',
      },
      {
        metric: 'score.pillars.PERFORMANCE',
        label: 'Performance pillar percentile',
        value: pillar,
        percentile: pillar,
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
        severity: 'WARNING',
        // `rollingBeatBenchPct` is benchmark-relative by construction, so a
        // non-null value proves the benchmark was there.
        confidence: confidenceFor({ horizonYears: years, benchmarkAvailable: true }),
        headline:
          `Beat its benchmark in ${pctLabel(beat)}% of rolling ${years}-year windows; ` +
          `performance percentile ${pctLabel(pillar, 0)}%`,
        evidence,
        whatWouldChangeThis:
          `Would clear if the fund beat its benchmark in more than ` +
          `${thresholdPctLabel(constants.persistentUnderperformanceRollingBeatPctFloor)}% of ` +
          `rolling ${years}-year windows (currently ${pctLabel(beat)}%).`,
      }),
    ];
  },
};
