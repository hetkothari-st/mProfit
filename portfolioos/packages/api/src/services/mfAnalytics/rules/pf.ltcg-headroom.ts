/**
 * `mf.pf.ltcg-headroom` — `LTCG_HEADROOM_UNUSED` (`05 §4`, portfolio scope).
 *
 * §112A exempts the first ₹1.25 lakh of long-term capital gains on equity and
 * equity-oriented funds each financial year, and the allowance does not carry
 * forward. Unused headroom on 1 April is gone. Selling and immediately
 * rebuying inside the allowance resets the cost base at no tax cost — the
 * "harvest the exemption" move.
 *
 * ── All three conditions, or nothing ──────────────────────────────────────
 *
 *  1. **Headroom above the threshold.** `ltcgHeadroomMinInr` (₹50,000): below
 *     it the paperwork outweighs the benefit.
 *  2. **LTCG lots actually available to realise.** Headroom is worthless
 *     without long-term lots sitting on a gain. Telling someone to use an
 *     allowance they have no way to use is noise dressed as tax advice, and
 *     the amount they *can* use is `min(headroom, realisable gain)` — which is
 *     what the finding cites.
 *  3. **Near the end of the financial year.** `ltcgHeadroomFyEndWindowDays`
 *     (60 days). The same fact in June is true and useless: there is most of a
 *     year left to act, and a notice that cannot be acted on now trains the
 *     user to ignore the ones that can.
 *
 * ── Time comes from `facts.asOf` ──────────────────────────────────────────
 *
 * The window is measured from `facts.asOf` to 31 March of the analysis's own
 * financial year, never from the clock. A rule that read the wall clock would
 * produce different findings on a replay of a stored `factsSnapshot` than it
 * did on the live run, which is exactly what `05 §8.5`'s byte-identical
 * supersede test exists to catch. The financial year comes from
 * `tax.financialYear` — the FY the `04` tax block was actually computed for —
 * rather than being re-derived, so the headroom and the deadline cannot end up
 * describing different years.
 */

import {
  daysBetween,
  ltcg112aExemptionForFy,
  serializeRatio,
  toDecimal,
  type MfEvidence,
  type MfFinding,
} from '@portfolioos/shared';

import { confidenceFor, makeFinding, type MfAnalysisFacts, type MfRule } from '../types.js';

const RULE_ID = 'mf.pf.ltcg-headroom';
const RULE_VERSION = '1.0.0';

/** Indian FY keys are `YYYY-YY`: "2025-26" runs 1 Apr 2025 to 31 Mar 2026. */
const FY_PATTERN = /^(\d{4})-(\d{2})$/;

/**
 * 31 March of the FY's closing year, as an ISO date, or null if the key is not
 * a well-formed `YYYY-YY` whose halves agree. A malformed year is a missing
 * input, not a licence to guess a deadline.
 */
function fyEndIsoDate(financialYear: string): string | null {
  const match = FY_PATTERN.exec(financialYear);
  if (match === null) return null;
  const startYear = Number.parseInt(match[1]!, 10);
  const endYear = startYear + 1;
  if (String(endYear % 100).padStart(2, '0') !== match[2]) return null;
  return `${endYear}-03-31`;
}

/** ₹1,25,000 — Indian digit grouping, whole rupees. */
function groupIndian(whole: string): string {
  if (whole.length <= 3) return whole;
  const last3 = whole.slice(-3);
  const rest = whole.slice(0, -3);
  return `${rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',')},${last3}`;
}

export const pfLtcgHeadroomRule: MfRule = {
  id: RULE_ID,
  version: RULE_VERSION,
  scope: 'PORTFOLIO',
  category: 'TAX',

  evaluate(facts: MfAnalysisFacts): MfFinding[] {
    const { tax } = facts.portfolio;

    // (1) Headroom above the threshold.
    const headroom = toDecimal(tax.ltcgExemptionHeadroomInr);
    const minHeadroom = toDecimal(facts.constants.ltcgHeadroomMinInr);
    if (!headroom.greaterThan(minHeadroom)) return [];

    // §112A did not exist before FY 2018-19 — `null` there means "this concept
    // did not apply", which is a different answer from a ₹0 allowance and must
    // not be rendered as one.
    const statutoryLimit = ltcg112aExemptionForFy(tax.financialYear);
    if (statutoryLimit === null) return [];

    // (2) Long-term lots actually sitting on a gain.
    const realisable = tax.lots
      .filter((lot) => lot.gainType === 'LTCG')
      .map((lot) => toDecimal(lot.gain))
      .filter((gain) => gain.greaterThan(0));
    if (realisable.length === 0) return [];

    const realisableTotal = realisable.reduce((sum, gain) => sum.plus(gain), toDecimal(0));

    // (3) Inside the FY-end window, measured from `facts.asOf`.
    const fyEnd = fyEndIsoDate(tax.financialYear);
    if (fyEnd === null) return [];
    const windowDays = facts.constants.ltcgHeadroomFyEndWindowDays;
    // Date-only on both sides so both parse as UTC midnight and the difference
    // is an exact whole number of days regardless of the server's timezone.
    const daysToFyEnd = daysBetween(facts.asOf.slice(0, 10), fyEnd);
    if (daysToFyEnd < 0 || daysToFyEnd > windowDays) return [];

    // What can actually be realised tax-free: the allowance is only useful up
    // to the gains that exist to put through it.
    const usable = headroom.lessThan(realisableTotal) ? headroom : realisableTotal;

    const headline =
      `₹${groupIndian(usable.toFixed(0))} of tax-free long-term gain unused with ` +
      `${daysToFyEnd} day${daysToFyEnd === 1 ? '' : 's'} left in FY ${tax.financialYear}`;

    const partial = facts.portfolio.scope.partial;

    const evidence: MfEvidence[] = [
      {
        metric: 'tax.ltcgExemptionHeadroomInr',
        label: `Unused §112A exemption for FY ${tax.financialYear}`,
        value: serializeRatio(headroom),
        unit: 'inr',
      },
      {
        metric: 'constants.ltcgHeadroomMinInr',
        label: 'Unused headroom above which this is worth flagging',
        value: serializeRatio(minHeadroom),
        unit: 'inr',
      },
      {
        metric: 'tax.lots.ltcgGain',
        label: partial
          ? 'Long-term gain available to realise across held lots (floor — shared holdings only)'
          : 'Long-term gain available to realise across held lots',
        value: serializeRatio(realisableTotal),
        unit: 'inr',
      },
      {
        metric: 'tax.lots.ltcgLotCount',
        label: 'Long-term lots sitting on a gain',
        value: serializeRatio(realisable.length),
        unit: 'count',
      },
      {
        metric: 'asOf.daysToFinancialYearEnd',
        label: `Days from this analysis to 31 March ${fyEnd.slice(0, 4)}`,
        value: serializeRatio(daysToFyEnd),
        unit: 'days',
      },
      {
        metric: 'statute.ltcg112aExemptionForFy',
        label: `Statutory §112A annual exemption for FY ${tax.financialYear}`,
        value: serializeRatio(statutoryLimit),
        unit: 'inr',
      },
    ];

    const counterfactual =
      `Would clear once the unused §112A headroom falls to ₹${groupIndian(minHeadroom.toFixed(0))} ` +
      `or below — it is ₹${groupIndian(headroom.toFixed(0))} today — or once 31 March ` +
      `${fyEnd.slice(0, 4)} passes, after which the allowance is gone rather than merely ` +
      `unused. Realising up to ₹${groupIndian(usable.toFixed(0))} of long-term gain before ` +
      'then uses it; the finding only fires inside the last ' +
      `${windowDays} days of the year, when there is still time to act.` +
      (partial
        ? ' The realisable gain is summed over the holdings shared with you only, so it is ' +
          'a floor; the headroom itself is a per-person statutory figure and is not.'
        : '');

    return [
      makeFinding(facts, {
        ruleId: RULE_ID,
        ruleVersion: RULE_VERSION,
        schemeCode: null,
        code: 'LTCG_HEADROOM_UNUSED',
        category: 'TAX',
        severity: 'NOTICE',
        // Statute and lot dates, not a return series.
        confidence: confidenceFor(),
        headline,
        evidence,
        whatWouldChangeThis: counterfactual,
      }),
    ];
  },
};
