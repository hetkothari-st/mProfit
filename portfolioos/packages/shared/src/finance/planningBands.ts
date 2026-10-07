/**
 * Planning bands that more than one engine has to agree on.
 *
 * These were previously defined in `packages/api/src/services/advisor/
 * constants.ts` and `healthScoreMath.ts` and then *restated* in the MF
 * analytics constants, on the reasoning that `shared` must not depend on
 * `api`. That reasoning is right and the conclusion was wrong: the fix for a
 * value two packages need is to move it down into `shared`, not to keep two
 * copies and a comment asking future readers to update both.
 *
 * The failure mode is specific and user-visible. A portfolio 6 points off its
 * model allocation would be flagged as drifted on `/advisor` and not on the MF
 * analytics page, or the reverse, and neither page could explain the other.
 * "Two surfaces, one number" is the whole point.
 */

/**
 * Allocation drift worth acting on, in **percentage points**.
 *
 * Tighter and the user is nagged by market noise — an equity allocation moves
 * a couple of points on its own in any given quarter. Looser and real drift
 * sits uncorrected long enough to change the portfolio's risk profile.
 *
 * Consumed by the advisor `REBALANCE` rule and the MF analytics
 * `ALLOCATION_DRIFT` rule (`04-PORTFOLIO-ANALYSIS.md §3`, which explicitly
 * requires the two to share a tolerance).
 */
export const REBALANCE_BAND_PP = 5;

/**
 * Months of expenses an emergency fund should cover. The target, not the
 * alarm threshold.
 *
 * Drives `healthScoreMath.emergencyFundScore` (score = monthsCovered / 6 x 100,
 * capped at 100) and the advisor's `CASH_DEPLOYMENT` rule, which will not
 * suggest deploying idle cash that is still inside this buffer.
 */
export const EMERGENCY_FUND_MONTHS = 6;

/**
 * Below this many months of covered expenses, having no liquid or overnight
 * fund is a genuine gap rather than a preference — the MF analytics
 * `NO_LIQUID_BUFFER` finding.
 *
 * Expressed in **months covered**, deliberately, and not as a cut-off on the
 * 0–100 health sub-score. The sub-score is a derived, capped, rescaled number;
 * stating the threshold as "score below 50" encodes "under three months" in a
 * form nobody can check by reading it, and silently changes meaning if the
 * score's formula is ever rescaled. Half the target buffer is the actual
 * decision being made, so that is what is written down.
 */
export const LIQUID_BUFFER_ALARM_MONTHS = EMERGENCY_FUND_MONTHS / 2;
