/**
 * `DURATION_MISMATCH` — the fund is running duration outside the band its SEBI
 * sub-category mandates.
 *
 * `05 §4`: "`modifiedDuration` outside SEBI band", severity WARNING. The band
 * comes from `SEBI_SUBCATEGORY_MAP[...].durationBand` — **regulation, not
 * calibration** — which is why `MfRuleConstants` deliberately has no field for
 * it (see the note at the foot of `mfAnalytics.constants.ts`): a test fixture
 * must not be able to move a statutory band.
 *
 * ===========================================================================
 * TRAP 1 — Dynamic Bond Fund must never fire
 * ===========================================================================
 *
 * `'Dynamic Bond Fund'` carries `durationBand: { minYears: null, maxYears:
 * null }`. That is not missing data. SEBI's mandate for the category *is*
 * "investment across duration": choosing the duration is the manager's job and
 * the reason the fund exists. A finding saying a dynamic bond fund's duration
 * is unusual would be flagging the product's entire purpose as a defect.
 *
 * Handled structurally rather than by name: a band with neither a floor nor a
 * ceiling constrains nothing, so there is nothing to be outside of and the
 * rule returns early. That also covers `Gilt Fund with 10 year constant
 * duration`, whose band is `{ min: null, max: null, exactYears: 10 }` — see
 * TRAP 3.
 *
 * ===========================================================================
 * TRAP 2 — Macaulay vs modified duration
 * ===========================================================================
 *
 * SEBI defines these bands on **Macaulay** duration. `MfCurrentProfile
 * .modifiedDuration` is **modified** duration. They are related by
 *
 *     modified = macaulay / (1 + y/n)
 *
 * so for any positive yield **modified < macaulay, always**. Comparing a
 * modified duration straight against a Macaulay band is therefore biased in
 * one direction and one direction only: it makes funds look *shorter* than
 * they are.
 *
 * The consequences are asymmetric, and the rule exploits that:
 *
 *   - **Above the ceiling is safe.** If modified > maxMacaulay then
 *     macaulay > modified > maxMacaulay, so a genuine breach is certain. The
 *     bias can only ever *hide* an above-band breach, never invent one.
 *   - **Below the floor is not.** A fund with a Macaulay duration comfortably
 *     inside a 1-3 year band can show a modified duration below 1 purely
 *     because of the conversion. Firing on that would flag compliant funds.
 *
 * So:
 *
 *   1. Where `ytmPct` is on file, convert properly —
 *      `macaulay = modified x (1 + ytm)` — and test both sides of the band.
 *      Annual compounding (n = 1) is the convention Indian debt factsheets
 *      quote YTM in, and it is also the forgiving choice for the test that can
 *      go wrong: a larger `n` gives a smaller per-period rate and so a smaller
 *      `1 + y/n`, i.e. a *smaller* implied Macaulay duration. Taking n = 1
 *      gives the largest implied Macaulay, which makes a below-floor breach
 *      harder to claim — exactly the direction of caution the bias demands.
 *   2. Where `ytmPct` is missing, we cannot convert. Only the above-ceiling
 *      test runs, because it is the only one the bias cannot corrupt. The
 *      rule stays silent on a possible below-band breach rather than assert
 *      one it cannot distinguish from an artefact of the units.
 *
 * ===========================================================================
 * TRAP 3 — `exactYears` has no tolerance
 * ===========================================================================
 *
 * `Gilt Fund with 10 year constant duration` mandates a *point*, not a range.
 * Testing a point needs a tolerance, and no tolerance constant exists in
 * `MfRuleConstants` (`05 §4` names none). Inventing one would be inventing the
 * number that decides whether a real fund is flagged. The rule therefore does
 * not fire on `exactYears`-only bands and this is recorded as an open
 * ambiguity in `05 §4` rather than papered over.
 *
 * ===========================================================================
 * `durationIsApproximated`
 * ===========================================================================
 *
 * When the duration was weighted from holding maturities rather than disclosed
 * by the AMC, it is an estimate of an estimate. The finding still stands — an
 * approximated duration two years past the ceiling is not two years past by
 * accident — but the confidence must say so, so the `confidenceFor` ceiling is
 * applied (0.6 -> 0.5). That is the same mechanism `05 §4` uses for a missing
 * benchmark, and for the same reason: a finding is only as trustworthy as its
 * weakest input.
 */

import { Decimal } from 'decimal.js';
import { serializeRatio, specFor, toDecimal } from '@portfolioos/shared';
import type {
  MfEvidence,
  MfFinding,
  Ratio,
  SebiSubCategory,
} from '@portfolioos/shared';
import { confidenceFor, makeFinding, type MfAnalysisFacts, type MfRule } from '../types.js';

const RULE_ID = 'mf.debt.duration-mismatch';
const RULE_VERSION = '1.0.0';

const ONE = new Decimal(1);
const HUNDRED = new Decimal(100);

interface Band {
  minYears: number | null;
  maxYears: number | null;
}

function bandFor(sub: SebiSubCategory | 'UNMAPPED'): Band | null {
  if (sub === 'UNMAPPED') return null;
  const band = specFor(sub)?.durationBand;
  if (!band) return null;
  // Both ends null: unconstrained (Dynamic Bond), or a point mandate with no
  // tolerance (Gilt 10y). Neither is testable here. See TRAPs 1 and 3.
  if (band.minYears === null && band.maxYears === null) return null;
  return { minYears: band.minYears, maxYears: band.maxYears };
}

/** Round-trip a Decimal into the branded `Ratio` the evidence slot needs. */
function ratio(d: Decimal): Ratio {
  return serializeRatio(d);
}

export const debtDurationMismatchRule: MfRule = {
  id: RULE_ID,
  version: RULE_VERSION,
  scope: 'FUND',
  category: 'DEBT',

  evaluate(facts: MfAnalysisFacts, schemeCode?: string): MfFinding[] {
    if (!schemeCode) return [];
    const fund = facts.funds[schemeCode];
    const profile = fund?.profile;
    if (!fund || !profile) return [];

    const band = bandFor(fund.meta.sebiSubCategory);
    if (band === null) return [];

    // Null means the disclosure did not give us a duration — never 0 years.
    if (profile.modifiedDuration === null) return [];
    const modified = toDecimal(profile.modifiedDuration);
    if (!modified.isFinite() || modified.isNegative()) return [];

    // TRAP 2. `ytmPct` is a percent (7.2 = 7.2%), so it is scaled here.
    const ytm = profile.ytmPct === null ? null : toDecimal(profile.ytmPct).dividedBy(HUNDRED);
    const converted = ytm !== null && ytm.greaterThan(-1);
    const macaulay = converted ? modified.times(ONE.plus(ytm!)) : modified;

    let direction: 'above' | 'below' | null = null;
    let boundary: number | null = null;

    if (band.maxYears !== null && macaulay.greaterThan(band.maxYears)) {
      // Safe with or without the conversion: modified is a lower bound on
      // Macaulay, so exceeding the ceiling in modified terms exceeds it in
      // Macaulay terms too.
      direction = 'above';
      boundary = band.maxYears;
    } else if (converted && band.minYears !== null && macaulay.lessThan(band.minYears)) {
      // Only reachable when we actually converted. Without a YTM the
      // below-band comparison is indistinguishable from the units bias, and
      // the rule declines to guess.
      direction = 'below';
      boundary = band.minYears;
    }

    if (direction === null || boundary === null) return [];

    const evidence: MfEvidence[] = [
      {
        metric: 'modifiedDuration',
        label: profile.durationIsApproximated
          ? 'Modified duration (estimated from holding maturities, not disclosed)'
          : 'Modified duration (disclosed)',
        value: profile.modifiedDuration,
        unit: 'ratio',
      },
      {
        metric: 'durationBand',
        label: converted
          ? `SEBI Macaulay-duration band for ${fund.meta.sebiSubCategory} (${band.minYears ?? 'no floor'} to ${band.maxYears ?? 'no ceiling'} years); duration converted at the disclosed YTM`
          : `SEBI Macaulay-duration band for ${fund.meta.sebiSubCategory} (${band.minYears ?? 'no floor'} to ${band.maxYears ?? 'no ceiling'} years); no YTM on file, so only the ceiling was tested`,
        value: ratio(new Decimal(boundary)),
        unit: 'ratio',
      },
    ];

    if (converted) {
      evidence.push({
        metric: 'macaulayDurationImplied',
        label: 'Macaulay duration implied by the disclosed YTM',
        value: ratio(macaulay),
        unit: 'ratio',
      });
      evidence.push({
        metric: 'ytmPct',
        label: 'Portfolio yield to maturity',
        value: ratio(toDecimal(profile.ytmPct)),
        unit: 'pct',
      });
    }

    const clearance =
      direction === 'above'
        ? `Clears when duration comes back to ${boundary} years or less`
        : `Clears when duration rises back to ${boundary} years or more`;

    return [
      makeFinding(facts, {
        ruleId: RULE_ID,
        ruleVersion: RULE_VERSION,
        schemeCode,
        code: 'DURATION_MISMATCH',
        category: 'DEBT',
        severity: 'WARNING',
        // No return series behind this, so the "no horizon" band (0.6). An
        // approximated duration takes the weak-input ceiling down to 0.5.
        confidence: confidenceFor({ benchmarkAvailable: !profile.durationIsApproximated }),
        headline:
          direction === 'above'
            ? `Duration of ${macaulay.toFixed(2)} years is above this category’s ${boundary}-year SEBI ceiling`
            : `Duration of ${macaulay.toFixed(2)} years is below this category’s ${boundary}-year SEBI floor`,
        evidence,
        whatWouldChangeThis:
          `${clearance}, as measured on Macaulay duration in the AMC’s monthly disclosure` +
          (profile.durationIsApproximated
            ? '. The duration here is estimated from holding maturities rather than disclosed by the AMC, so a disclosed figure could also clear it.'
            : '.'),
      }),
    ];
  },
};

export default debtDurationMismatchRule;
