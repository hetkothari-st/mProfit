/**
 * `mf.pf.single-stock` — `LOOK_THROUGH_CONCENTRATION` (`05 §4`, portfolio
 * scope).
 *
 * A holder of six equity funds usually believes they are diversified. `04 §3`
 * multiplies each fund's weight in the MF book by that stock's weight inside
 * the fund and sums across funds, and the answer is regularly that one name —
 * an HDFC Bank, a Reliance — is 7-8% of everything. That is a single-stock
 * position the user never consciously took, which is the whole reason the
 * look-through is computed.
 *
 * Two floors are respected here rather than papered over:
 *
 *  - `lookThrough.fundsWithoutHoldings` lists funds with no usable portfolio
 *    snapshot. Their stocks are missing from the sum entirely, so the
 *    effective weight is a **lower bound** whenever that array is non-empty.
 *  - Under a restricted family view (`CONTEXT.md §6`) the MF book itself is a
 *    subset, so the same caveat applies for a different reason.
 *
 * Both are said out loud. "Reliance is 5.4% of your equity" and "Reliance is
 * at least 5.4% of the part of your equity we can see" are different claims.
 */

import { serializeRatio, toDecimal, type MfEvidence, type MfFinding } from '@portfolioos/shared';

import { confidenceFor, makeFinding, type MfAnalysisFacts, type MfRule } from '../types.js';

const RULE_ID = 'mf.pf.single-stock';
const RULE_VERSION = '1.0.0';

/** Security names carry suffixes ("Ltd.", "(New)"); keep the headline bounded. */
function clip(name: string, max: number): string {
  return name.length <= max ? name : `${name.slice(0, max - 1)}…`;
}

export const pfSingleStockRule: MfRule = {
  id: RULE_ID,
  version: RULE_VERSION,
  scope: 'PORTFOLIO',
  category: 'PORTFOLIO',

  evaluate(facts: MfAnalysisFacts): MfFinding[] {
    const { lookThrough } = facts.portfolio;
    const ceilingPct = facts.constants.lookThroughSingleStockPct;

    // No look-through at all — no snapshots loaded, or no funds — is a missing
    // input. Silence, not a claim that nothing is concentrated.
    if (lookThrough.topStocks.length === 0) return [];

    const breaches = lookThrough.topStocks.filter((stock) =>
      toDecimal(stock.effectiveWeightPct).greaterThan(ceilingPct),
    );
    if (breaches.length === 0) return [];

    const worst = breaches.reduce((a, b) =>
      toDecimal(b.effectiveWeightPct).greaterThan(toDecimal(a.effectiveWeightPct)) ? b : a,
    );
    const worstPct = toDecimal(worst.effectiveWeightPct);

    // Either gap makes every effective weight a floor, and for the same
    // reason: securities we were not shown are absent from the denominator's
    // numerator, never counted as zero.
    const missingFunds = lookThrough.fundsWithoutHoldings.length;
    const partial = facts.portfolio.scope.partial;
    const isFloor = missingFunds > 0 || partial;
    const atLeast = isFloor ? 'at least ' : '';

    const headline =
      `${clip(worst.securityName, 34)} is ${atLeast}${worstPct.toFixed(1)}% of your fund ` +
      `holdings, above the ${ceilingPct}% mark` +
      (breaches.length > 1 ? ` (+${breaches.length - 1} more)` : '');

    const evidence: MfEvidence[] = [
      {
        metric: 'lookThrough.topStocks.effectiveWeightPct',
        label: isFloor
          ? `${worst.securityName} — effective weight across all funds (floor)`
          : `${worst.securityName} — effective weight across all funds`,
        value: serializeRatio(worstPct),
        unit: 'pct',
      },
      {
        metric: 'constants.lookThroughSingleStockPct',
        label: 'Single-stock weight above which the MF book is called concentrated',
        value: serializeRatio(ceilingPct),
        unit: 'pct',
      },
      {
        metric: 'lookThrough.topStocks.contributors.count',
        label: `Funds contributing to the ${worst.securityName} position`,
        value: serializeRatio(worst.contributors.length),
        unit: 'count',
      },
    ];

    if (missingFunds > 0) {
      evidence.push({
        metric: 'lookThrough.fundsWithoutHoldings.count',
        label: 'Held funds with no usable portfolio disclosure (their stocks are not counted)',
        value: serializeRatio(missingFunds),
        unit: 'count',
      });
    }

    const counterfactual =
      `Would clear if ${clip(worst.securityName, 40)} fell below ${ceilingPct}% of the ` +
      `mutual fund book — it is ${atLeast}${worstPct.toFixed(1)}% today, spread across ` +
      `${worst.contributors.length} fund${worst.contributors.length === 1 ? '' : 's'}.` +
      (missingFunds > 0
        ? ` ${missingFunds} held fund${missingFunds === 1 ? ' has' : 's have'} no usable ` +
          'portfolio disclosure, so this weight is a floor: the true figure can only be higher.'
        : '') +
      (partial
        ? ' It is computed over the holdings shared with you only, which is a second reason ' +
          'to read it as a floor rather than a total.'
        : '');

    return [
      makeFinding(facts, {
        ruleId: RULE_ID,
        ruleVersion: RULE_VERSION,
        schemeCode: null,
        code: 'LOOK_THROUGH_CONCENTRATION',
        category: 'PORTFOLIO',
        severity: 'NOTICE',
        confidence: confidenceFor(),
        headline,
        evidence,
        whatWouldChangeThis: counterfactual,
      }),
    ];
  },
};
