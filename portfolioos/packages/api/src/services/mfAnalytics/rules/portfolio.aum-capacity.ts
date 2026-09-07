/**
 * `AUM_CAPACITY` (`05 §4`, fund scope, row 12).
 *
 * Fires only for the **Small Cap Fund** sub-category, when AUM exceeds
 * `smallCapAumCapInr` (default ₹20,000 crore). `05 §4` scopes it that way and
 * the scoping is the substance of the rule: size is not a problem in itself,
 * it is a problem where the mandate forces the manager into a shallow end of
 * the market. A ₹40,000 crore large-cap fund can buy Reliance; a ₹40,000 crore
 * small-cap fund cannot take a meaningful position in a ₹3,000 crore company
 * without owning a tenth of it and without moving the price on the way in and
 * again on the way out. The consequence shows up as cash drag, a drift up the
 * cap curve (which `STYLE_DRIFT` catches separately), and a widening gap
 * between the strategy's back-test and what the fund can now execute.
 *
 * NOTICE, not WARNING, and deliberately so. This is a structural constraint on
 * future flexibility, not a measured failure: plenty of large small-cap funds
 * have gone on doing well, and several AMCs manage the constraint by capping
 * inflows — which is a good sign, not a bad one, and which this rule cannot
 * see. It belongs in front of the holder as context, not as an alarm.
 *
 * UNITS. `smallCapAumCapInr` is a **rupee decimal string** ('200000000000' =
 * ₹20,000 crore, i.e. 2e11) and `MfCurrentProfile.aum` is branded `Money`.
 * Both are compared as `Decimal`; at 2e11 a JS number is still exact, but the
 * comparison is one `toDecimal` away either way and a threshold that big is
 * exactly where a missing zero hides.
 */

import {
  formatINR,
  serializeRatio,
  toDecimal,
  type MfEvidence,
  type MfFinding,
} from '@portfolioos/shared';
import { confidenceFor, makeFinding, type MfAnalysisFacts, type MfRule } from '../types.js';

const RULE_ID = 'mf.portfolio.aum-capacity';
const RULE_VERSION = '1.0.0';
const CODE = 'AUM_CAPACITY';

/** `05 §4` scopes this rule to exactly one sub-category. */
const SMALL_CAP = 'Small Cap Fund';

/** One crore, in rupees. Headlines read in crore; the maths stays in rupees. */
const CRORE = '10000000';

function croreLabel(rupees: string): string {
  return `${formatINR(toDecimal(rupees).dividedBy(toDecimal(CRORE)).toFixed(0), {
    fractionDigits: 0,
  })} crore`;
}

export const portfolioAumCapacityRule: MfRule = {
  id: RULE_ID,
  version: RULE_VERSION,
  scope: 'FUND',
  category: 'PORTFOLIO',

  evaluate(facts: MfAnalysisFacts, schemeCode?: string): MfFinding[] {
    if (schemeCode === undefined) return [];
    const fund = facts.funds[schemeCode];
    if (fund === undefined) return [];

    if (fund.meta.sebiSubCategory !== SMALL_CAP) return [];

    const profile = fund.profile;
    if (profile === null || profile.status === 'QUARANTINED') return [];

    const aum = profile.aum;
    const aumStatus = profile.fieldStatus['aum'];
    // An undisclosed AUM is not a small one.
    if (aum === null || (aumStatus !== undefined && aumStatus !== 'OK')) return [];

    const cap = toDecimal(facts.constants.smallCapAumCapInr);
    const aumDec = toDecimal(aum);
    if (!aumDec.greaterThan(cap)) return [];

    const evidence: MfEvidence[] = [
      {
        metric: 'aum',
        label: 'Assets under management',
        // Rebranded from `Money` to `Ratio` for the evidence row, which carries
        // its own `unit: 'inr'`; the digits are unchanged.
        value: serializeRatio(aumDec),
        percentile: profile.aumCategoryPercentile,
        unit: 'inr',
      },
    ];

    return [
      makeFinding(facts, {
        ruleId: RULE_ID,
        ruleVersion: RULE_VERSION,
        schemeCode,
        code: CODE,
        category: 'PORTFOLIO',
        severity: 'NOTICE',
        confidence: confidenceFor(),
        headline:
          `Small-cap AUM of ${croreLabel(aum)} is above the ` +
          `${croreLabel(facts.constants.smallCapAumCapInr)} capacity mark`,
        evidence,
        whatWouldChangeThis:
          `Would clear if AUM fell to ${croreLabel(facts.constants.smallCapAumCapInr)} or below ` +
          `(currently ${croreLabel(aum)}).`,
      }),
    ];
  },
};
