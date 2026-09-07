/**
 * `NEGATIVE_TIMING_GAP` — your money-weighted return on this fund is materially
 * below the fund's own time-weighted return over the same period.
 *
 * `05 §4`: "`timingGap < -0.03` over >= 3 years", severity INFO, and — stated
 * explicitly in the catalogue — **"descriptive only, never advisory"**.
 *
 * ---------------------------------------------------------------------------
 * Why the wording is the hard part
 * ---------------------------------------------------------------------------
 *
 * This is the one finding in the catalogue that is *about the user* rather than
 * about the fund, and the obvious phrasing of it is an accusation: "your
 * timing cost you 4% a year". That framing is wrong on three counts and the
 * copy below avoids all three.
 *
 *  1. **It is usually not a decision.** A gap opens whenever contributions are
 *     unevenly distributed across a period — which is what a salary is. A SIP
 *     into a fund that rose early and flattened later produces a negative gap
 *     with nobody having made a single timing call.
 *  2. **It is not actionable.** Nothing the user does today changes when past
 *     money went in. A finding that cannot be acted on and implies fault is
 *     just blame.
 *  3. **It is symmetric and unremarked in the other direction.** We do not
 *     congratulate a positive gap, so treating a negative one as a verdict
 *     would be an asymmetry the data does not support.
 *
 * Hence INFO, hence a headline that states the arithmetic and nothing else,
 * and hence a counterfactual phrased as "what would make this number move"
 * rather than "what you should have done". `MfHeldFundDto.timingGap`'s own doc
 * comment says the same thing: "Reported, never moralised".
 *
 * ---------------------------------------------------------------------------
 * The 3-year floor
 * ---------------------------------------------------------------------------
 *
 * `negativeTimingGapMinYears` exists because over a short window the statistic
 * is dominated by a single lump sum's entry date. Over three years it starts
 * to describe a pattern of contributions. `holdingPeriodDays` is compared
 * against `minYears x 365` — whole days, no leap-year adjustment, because the
 * threshold is a materiality floor and a one-day boundary shift in it changes
 * nothing about the claim.
 */

import { toDecimal } from '@portfolioos/shared';
import type { MfEvidence, MfFinding } from '@portfolioos/shared';
import { confidenceFor, makeFinding, type MfAnalysisFacts, type MfRule } from '../types.js';

const RULE_ID = 'mf.user.timing-gap';
const RULE_VERSION = '1.0.0';

const DAYS_PER_YEAR = 365;

export const userTimingGapRule: MfRule = {
  id: RULE_ID,
  version: RULE_VERSION,
  scope: 'FUND',
  category: 'USER',

  evaluate(facts: MfAnalysisFacts, schemeCode?: string): MfFinding[] {
    if (!schemeCode) return [];
    const held = facts.funds[schemeCode]?.held;
    if (!held) return [];

    // A gap is the difference of two returns. If the XIRR did not converge,
    // or the fund's same-period CAGR is missing, the difference is not a
    // small number — it does not exist. Never fire on a null.
    if (held.userXirrStatus !== 'OK') return [];
    if (held.timingGap === null) return [];
    if (held.userXirr === null || held.fundCagrSamePeriod === null) return [];

    const minDays = facts.constants.negativeTimingGapMinYears * DAYS_PER_YEAR;
    if (held.holdingPeriodDays < minDays) return [];

    const gap = toDecimal(held.timingGap);
    const ceiling = facts.constants.negativeTimingGapCeiling;
    // The ceiling is negative by construction (-0.03). "Below" it means a
    // *larger* shortfall, so the comparison is `lessThan`, not `greaterThan`.
    if (!gap.lessThan(ceiling)) return [];

    const gapPp = gap.abs().times(100);
    const ceilingPp = toDecimal(ceiling).abs().times(100);
    const years = toDecimal(held.holdingPeriodDays).dividedBy(DAYS_PER_YEAR);

    const evidence: MfEvidence[] = [
      {
        metric: 'held.timingGap',
        label: 'Your return minus the fund’s return over the same period',
        value: held.timingGap,
        unit: 'ratio',
      },
      {
        metric: 'held.userXirr',
        label: 'Your money-weighted return (XIRR on your actual cash flows)',
        value: held.userXirr,
        unit: 'ratio',
      },
      {
        metric: 'held.fundCagrSamePeriod',
        label: 'The fund’s own return over the same window',
        value: held.fundCagrSamePeriod,
        unit: 'ratio',
      },
    ];

    return [
      makeFinding(facts, {
        ruleId: RULE_ID,
        ruleVersion: RULE_VERSION,
        schemeCode,
        code: 'NEGATIVE_TIMING_GAP',
        category: 'USER',
        severity: 'INFO',
        // Rests on the user's own cash flows, not on a category return series,
        // so there is no horizon to grade and no benchmark involved.
        confidence: confidenceFor(),
        headline:
          `Your return here is ${gapPp.toFixed(1)} points a year below the fund’s own, over ` +
          `${years.toFixed(1)} years`,
        evidence,
        whatWouldChangeThis:
          `This describes when your money went in, not a decision to correct — a gap opens whenever ` +
          `contributions are spread unevenly across a period, which a SIP does by design. The number ` +
          `moves as future contributions and the fund’s future returns re-weight it, and this note ` +
          `stops appearing once the gap narrows to within ${ceilingPp.toFixed(0)} points a year.`,
      }),
    ];
  },
};

export default userTimingGapRule;
