/**
 * Calibration for the MF analytics findings engine.
 *
 * Most of it is not here. The 38 rule thresholds live in
 * `@portfolioos/shared`'s `mfAnalytics.constants.ts` because the frontend
 * needs the same numbers to render "would clear at a TER <= …" copy and the
 * threshold markers on charts, and a second copy on the client is how the
 * explanation and the finding start disagreeing. They are re-exported below so
 * this file is still the one import an engine module needs.
 *
 * What *is* defined here is the calibration that only the server has any use
 * for: the verdict decision table's cut-offs (`05 §5`) and the engine version
 * stamp. Mirrors `services/advisor/constants.ts`, which does the same thing
 * for the advice engine.
 *
 * Rules never import this file's values directly — they receive
 * `MfRuleConstants` through `MfAnalysisFacts.constants` so a test can move one
 * boundary without touching production calibration (`05 §3`). The verdict
 * table is not a rule and does import them.
 */

import {
  DEFAULT_MF_RULE_CONSTANTS,
  MF_ANALYTICS_DISCLAIMER,
  MIN_RATING_HISTORY_MONTHS,
  MIN_UNIVERSE_SIZE,
  type MfRuleConstants,
} from '@portfolioos/shared';

/**
 * Re-exported so engine modules have one import for calibration, exactly as
 * `services/advisor/constants.ts` re-exports `REBALANCE_BAND_PP` and
 * `EMERGENCY_FUND_MONTHS` from shared.
 */
export {
  DEFAULT_MF_RULE_CONSTANTS,
  MF_ANALYTICS_DISCLAIMER,
  MIN_RATING_HISTORY_MONTHS,
  MIN_UNIVERSE_SIZE,
};
export type { MfRuleConstants };

/**
 * Bumped when engine-wide behaviour changes in a way individual rule versions
 * do not capture — the orchestration order, the verdict table, the facts
 * shape. Stamped on every `MfAnalysisRun`, so a stored run says which engine
 * produced it and not merely which rules.
 */
export const MF_ANALYSIS_ENGINE_VERSION = '1.0.0';

// ---------------------------------------------------------------------------
// Verdict decision table (`05 §5`)
// ---------------------------------------------------------------------------

/**
 * Rows 3 and 4: a rating **at or below** this is weak enough to put a fund in
 * front of the user. 1-5 stars, so this is the bottom two.
 *
 * These three constants are not in `mfAnalytics.constants.ts` deliberately.
 * `MfRuleConstants` is the set of thresholds a *rule* reasons with and that a
 * rule test may override through facts; the verdict table is not a rule, it is
 * the fixed decision procedure applied to whatever the rules produced. Putting
 * its cut-offs in the overridable bag would let a fixture quietly change what
 * `SWITCH_CANDIDATE` means, which is the one conclusion in this layer that is
 * regulated advice.
 */
export const VERDICT_MAX_RATING_FOR_REVIEW = 2;

/**
 * Row 3: a replacement must be **at least** this good before the engine will
 * name it. Deliberately a two-star gap above `VERDICT_MAX_RATING_FOR_REVIEW`:
 * telling someone to move from a 2 to a 3 is churn dressed as advice, and the
 * switch costs (exit load, tax) are real while the improvement is inside the
 * noise of the rating itself.
 */
export const VERDICT_MIN_REPLACEMENT_RATING = 4;

/**
 * Row 3: the switch must pay for itself within this many months.
 *
 * Two years is the horizon over which a retail investor can be expected to
 * still be holding the replacement. Beyond it, the break-even rests on a
 * projection of an edge that has to persist longer than most people's actual
 * holding period, and the recommendation is really a bet on the projection.
 */
export const VERDICT_MAX_BREAK_EVEN_MONTHS = 24;

/**
 * `05 §5`'s `replacementExpectedEdge` — the annual edge, as a fraction, that a
 * named replacement is expected to earn over the fund being replaced. It is
 * the denominator of
 *
 *     breakEvenMonths = (exitLoadInr + taxInr)
 *                     / (replacementExpectedEdge x currentValue / 12)
 *
 * and it is **deliberately `null`.**
 *
 * `05 §5` defines it as the category-median TER difference plus half the
 * composite-score gap mapped to alpha through **the backtest regression
 * coefficient from `06 §3`**. That coefficient is produced by
 * `scripts/mf-backtest.ts` (Task 2.7), which has not been run: there is no
 * measured relationship between a composite gap and forward excess return in
 * this repository yet.
 *
 * The tempting move is to pick a plausible number — 0.5%, say — so the formula
 * runs. That would be inventing the single figure that decides whether the
 * engine tells a real person to sell a real fund, and it would be invisible:
 * `breakEvenMonths` would come out looking computed rather than assumed.
 *
 * Therefore, until Task 2.7 lands and this becomes a measured value:
 *
 *   **No `SWITCH_CANDIDATE` verdict may be justified.** `05 §5` row 3 requires
 *   `switchCost.breakEvenMonths <= 24`, and a null edge makes `breakEvenMonths`
 *   null, which is not `<= 24`. Row 3 therefore cannot match, and the fund
 *   falls through to row 4 (`REVIEW`) — which is the correct, honest outcome:
 *   "this needs your attention" without "and here is what to buy instead".
 *
 * Row 2's `SWITCH_CANDIDATE` (a CRITICAL finding with a replacement available)
 * does not go through break-even at all and is unaffected.
 */
export const REPLACEMENT_EXPECTED_EDGE: null = null;
