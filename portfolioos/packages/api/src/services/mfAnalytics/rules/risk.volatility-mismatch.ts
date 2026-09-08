/**
 * `RISK_PROFILE_MISMATCH` (`05 §4`, fund scope, row 6).
 *
 * ---------------------------------------------------------------------------
 * "USER RISK PROFILE <= MODERATE" — THERE IS NO MODERATE
 * ---------------------------------------------------------------------------
 * `05 §4` phrases the second half of this trigger as "user risk profile <=
 * MODERATE". This codebase has no MODERATE. `RISK_CATEGORIES` in
 * `services/riskProfileMath.ts` is
 *
 *     CONSERVATIVE | BALANCED | GROWTH | AGGRESSIVE
 *
 * and BALANCED is the band MODERATE describes — the middle of a four-point
 * scale, the profile of someone who accepts market risk but not a mandate that
 * is deliberately at the top of its category's volatility range. So MODERATE
 * resolves to BALANCED, and "<= MODERATE" fires for **CONSERVATIVE and
 * BALANCED only**. GROWTH and AGGRESSIVE do not fire: for them, a fund in the
 * category's riskiest quartile is the thing they asked for.
 *
 * Inventing a fifth category to match the doc's wording would put a value in
 * the database that no questionnaire can produce and no other surface can
 * render, and `RiskProfileFacts`' own comment in `types.ts` says to resolve it
 * here instead. This is that resolution.
 *
 * ---------------------------------------------------------------------------
 * PERCENTILE DIRECTION — the constant and the metric point opposite ways
 * ---------------------------------------------------------------------------
 * `stdDevAnn` is LOWER_IS_BETTER in `mfScoreMath.METRIC_DIRECTION`, so the
 * stored percentile is normalised "higher = better = calmer" (`03 §1`).
 * `riskProfileMismatchVolatilityPercentileFloor` is, uniquely among the
 * percentile constants, expressed in the OPPOSITE orientation — its comment in
 * `mfAnalytics.constants.ts` says so explicitly: "(here HIGHER = riskier)".
 *
 * So this rule converts once, with a name: `riskiness = 1 - stored`, and fires
 * when `riskiness > 0.75` (equivalently, stored < 0.25). `HIGH_TER` and
 * `HIGH_DOWN_CAPTURE` do NOT convert, because their constants are written in
 * the stored orientation. Each constant is read in the orientation its own
 * comment declares; there is no single global flip.
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

const RULE_ID = 'mf.risk.volatility-mismatch';
const RULE_VERSION = '1.0.0';
const CODE = 'RISK_PROFILE_MISMATCH';

/**
 * The profiles `05 §4`'s "<= MODERATE" covers, as plain strings.
 *
 * Deliberately not typed against `RiskCategoryValue`: a rule may only import
 * `../types.js`, `../constants.js`, `@portfolioos/shared` and `decimal.js`
 * (`test/invariants/mf-rules-pure.test.ts`), and `facts.userProfile
 * .riskProfile.category` is already that type at the call site, so the
 * comparison is checked where it matters.
 */
const MISMATCH_PROFILES: ReadonlySet<string> = new Set(['CONSERVATIVE', 'BALANCED']);

/** The profiles for which this fund's volatility is the point, not a problem. */
const TOLERANT_PROFILES = 'GROWTH or AGGRESSIVE';

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

export const riskVolatilityMismatchRule: MfRule = {
  id: RULE_ID,
  version: RULE_VERSION,
  scope: 'FUND',
  category: 'RISK',

  evaluate(facts: MfAnalysisFacts, schemeCode?: string): MfFinding[] {
    if (schemeCode === undefined) return [];
    const fund = facts.funds[schemeCode];
    if (fund === undefined) return [];

    // No assessment on file is not "assume conservative". A mismatch finding
    // needs a profile to mismatch against; without one there is no claim.
    const profile = facts.userProfile.riskProfile;
    if (profile === null) return [];
    if (!MISMATCH_PROFILES.has(profile.category)) return [];

    let key: MfHorizonKey | null = null;
    for (const candidate of [...MF_HORIZON_KEYS].reverse()) {
      const row = fund.metrics[candidate];
      if (row === null || row.status === 'QUARANTINED') continue;
      const status = row.fieldStatus['risk.stdDevAnn'];
      if (row.risk.stdDevAnn === null || (status !== undefined && status !== 'OK')) continue;
      const peerRow = fund.peer[candidate];
      if (peerRow === null || peerRow.percentiles['stdDevAnn'] === undefined) continue;
      key = candidate;
      break;
    }
    if (key === null) return [];

    const row = fund.metrics[key];
    const peer = fund.peer[key];
    if (row === null || peer === null) return [];
    const stdDev = row.risk.stdDevAnn;
    const storedPercentile = peer.percentiles['stdDevAnn'];
    if (stdDev === null || storedPercentile === undefined) return [];

    // The one conversion. See the header.
    const riskiness = toDecimal(1).minus(toDecimal(storedPercentile));
    const floor = toDecimal(facts.constants.riskProfileMismatchVolatilityPercentileFloor);
    if (!riskiness.greaterThan(floor)) return [];

    const years = HORIZON_YEARS[key];
    const median = peer.medians['stdDevAnn'] ?? null;

    const evidence: MfEvidence[] = [
      {
        metric: 'risk.stdDevAnn',
        label: 'Annualised volatility',
        horizonYears: years,
        value: stdDev,
        categoryMedian: median,
        // Cited in the layer's own orientation (higher = calmer), so the
        // evidence row means the same thing here as on every other surface.
        percentile: storedPercentile,
        unit: 'ratio',
      },
    ];

    const medianClause =
      median === null ? '' : ` to the category median ${pctLabel(median)}%`;

    return [
      makeFinding(facts, {
        ruleId: RULE_ID,
        ruleVersion: RULE_VERSION,
        schemeCode,
        code: CODE,
        category: 'RISK',
        severity: 'WARNING',
        confidence: confidenceFor({ horizonYears: years }),
        headline:
          `Among the category's most volatile funds (${pctLabel(stdDev)}% a year) for a ` +
          `${profile.category} risk profile`,
        evidence,
        whatWouldChangeThis:
          `Would clear if your risk profile were ${TOLERANT_PROFILES}, or if the fund's ` +
          `volatility fell${medianClause} — out of the category's riskiest ` +
          `${toDecimal(1).minus(floor).times(100).toFixed(0)}%.`,
      }),
    ];
  },
};
