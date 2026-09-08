/**
 * `mf.pf.redundant-funds` — `REDUNDANT_FUNDS` (`05 §4`, portfolio scope).
 *
 * Two funds in the **same SEBI sub-category** whose disclosed portfolios are
 * mostly the same securities are one bet held twice: the second fund adds a
 * folio, an expense ratio and a line on the statement, and almost no
 * diversification. `04 §2` computes the pairwise overlap; this rule decides
 * when it is large enough to say so.
 *
 * ── THE UNIT TRAP, which this rule exists to get right ────────────────────
 *
 * `MfOverlapPair.overlapPct` is a **`Pct`** — `55.000000` means 55%, because
 * it is summed from `MfPortfolioHolding.weightPct`, which is already percent.
 * `MfRuleConstants.redundantFundsOverlapFloor` is a **fraction** — `0.5`.
 *
 * Comparing them raw is not a subtle error, it is a total one: every real
 * overlap (1..100) is greater than 0.5, so a raw `>=` fires on every pair that
 * shares a single stock, and a raw `<=` never fires at all. That ×100
 * confusion is precisely what the `Ratio`/`Pct` brands exist to make visible.
 *
 * The scaling is done **upwards**, once — the fractional floor is multiplied
 * by 100 into percent — rather than downwards through `pctToRatio`. Both are
 * correct arithmetic, but `pctToRatio` re-serialises at `RATIO_SCALE` (6
 * decimal places), so an overlap of 49.999999% divides to 0.49999999 and
 * rounds back up to exactly 0.500000, which then clears a 0.5 floor. A
 * threshold comparison must not be decided by the wire format's rounding, so
 * the floor moves to the value's units and the value is never re-serialised
 * before it is compared.
 *
 * ── One finding, not one per pair ─────────────────────────────────────────
 *
 * `makeFinding` derives the finding id from `ruleId + schemeCode + code`, and
 * a portfolio-scope finding has `schemeCode: null`. Two findings from this
 * rule would therefore share an id and collide on the natural dedupe key, so
 * the rule emits a single finding for the **worst** pair and carries the count
 * of the others in its evidence. The per-pair detail already lives on
 * `portfolio.overlap.pairs`, which the UI renders beside the finding.
 */

import {
  serializeRatio,
  toDecimal,
  type MfEvidence,
  type MfFinding,
} from '@portfolioos/shared';

import { confidenceFor, makeFinding, type MfAnalysisFacts, type MfRule } from '../types.js';

const RULE_ID = 'mf.pf.redundant-funds';
const RULE_VERSION = '1.0.0';

/**
 * Scheme names run to 60+ characters ("Fixture Asset Management Large Cap
 * Fund - Direct Plan - Growth Option"), and `makeFinding` throws above 120.
 * Clipping deterministically keeps the headline inside the cap without a
 * post-hoc truncation that would hide the number at the end of the sentence.
 */
function clip(name: string, max: number): string {
  return name.length <= max ? name : `${name.slice(0, max - 1)}…`;
}

export const pfRedundantFundsRule: MfRule = {
  id: RULE_ID,
  version: RULE_VERSION,
  scope: 'PORTFOLIO',
  category: 'PORTFOLIO',

  evaluate(facts: MfAnalysisFacts): MfFinding[] {
    // The one scaling site: the fractional floor (0.5) lifted into the percent
    // units `overlapPct` is already in (50). Exact — no re-serialisation.
    const floorPct = toDecimal(facts.constants.redundantFundsOverlapFloor).times(100);

    // `debtPairs` is deliberately excluded. `04 §2` computes it by *issuer*,
    // not by security, so "55% overlap" there means something different from
    // "55% overlap" here. Folding the two together would put two
    // incomparable numbers behind one threshold and one sentence.
    const candidates = facts.portfolio.overlap.pairs.filter(
      (pair) =>
        pair.sameSubCategory && toDecimal(pair.overlapPct).greaterThanOrEqualTo(floorPct),
    );

    // No pairs computed at all is a missing input, not a clean portfolio —
    // and it produces the same silence, which is the correct outcome either
    // way: we cannot claim two funds are redundant without having compared
    // their holdings.
    if (candidates.length === 0) return [];

    const worst = candidates.reduce((a, b) =>
      toDecimal(b.overlapPct).greaterThan(toDecimal(a.overlapPct)) ? b : a,
    );
    const worstPct = toDecimal(worst.overlapPct);

    // Under a restricted family view every aggregate is a floor
    // (`CONTEXT.md §6`): the household may hold pairs we were not shown, so
    // "2 pairs" becomes "at least 2 pairs" and the counterfactual says why.
    const partial = facts.portfolio.scope.partial;
    const countWord = partial ? 'at least ' : '';

    // Bounded by construction rather than truncated afterwards: 26 + 26 for
    // the two clipped names leaves room for the number and the suffix inside
    // `makeFinding`'s 120-character cap.
    const others = candidates.length - 1;
    const headline =
      `${clip(worst.schemeNameA, 26)} and ${clip(worst.schemeNameB, 26)} hold ` +
      `${worstPct.toFixed(0)}% of the same stocks` +
      (others > 0 ? ` (+${countWord}${others} more)` : '');

    const evidence: MfEvidence[] = [
      {
        metric: 'overlap.overlapPct',
        label: `Holdings overlap: ${worst.schemeNameA} vs ${worst.schemeNameB}`,
        // Unit is `pct`, so the value carries the percent magnitude (55 = 55%)
        // exactly as `MfOverlapPair.overlapPct` does. Re-serialising under the
        // `Ratio` brand is a wire-format change, not a unit change — the unit
        // field is what tells the renderer how to read it.
        value: serializeRatio(worstPct),
        unit: 'pct',
      },
      {
        metric: 'constants.redundantFundsOverlapFloor',
        label: 'Overlap at which two same-category funds are called redundant',
        value: serializeRatio(floorPct),
        unit: 'pct',
      },
      {
        metric: 'overlap.pairs.count',
        label: partial
          ? 'Same-category pairs over the threshold (floor — only funds shared with you)'
          : 'Same-category pairs over the threshold',
        value: serializeRatio(candidates.length),
        unit: 'count',
      },
    ];

    const counterfactual =
      `Would clear if the overlap between ${clip(worst.schemeNameA, 40)} and ` +
      `${clip(worst.schemeNameB, 40)} fell below ${floorPct.toDecimalPlaces(1).toString()}% ` +
      `(it is ${worstPct.toFixed(1)}% today), or if the two funds were no longer in the ` +
      'same SEBI sub-category.' +
      (partial
        ? ' This count covers only the funds shared with you, so it is a floor: the ' +
          'household may hold further redundant pairs you cannot see.'
        : '');

    return [
      makeFinding(facts, {
        ruleId: RULE_ID,
        ruleVersion: RULE_VERSION,
        schemeCode: null,
        code: 'REDUNDANT_FUNDS',
        category: 'PORTFOLIO',
        severity: 'WARNING',
        // No return series is involved — this rests on two portfolio
        // disclosures, so it takes the structural-fact confidence.
        confidence: confidenceFor(),
        headline,
        evidence,
        whatWouldChangeThis: counterfactual,
      }),
    ];
  },
};
