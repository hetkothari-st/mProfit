/**
 * The MF findings rule registry.
 *
 * This array is the whole extension point, exactly as
 * `services/advisor/rules/index.ts` is for the advice engine: adding rule #34
 * means writing one file that exports an `MfRule` and appending it here. The
 * orchestrator sorts and persists whatever comes back; it never knows what any
 * individual rule does.
 *
 * Three test suites iterate this same array, so a new rule inherits their
 * guarantees without anyone remembering to wire anything up:
 *
 *  - `test/invariants/mf-rules-pure.test.ts` — the rule module imports nothing
 *    that can query, so `evaluate` really is a pure function of its facts.
 *  - the Task 5.2/5.3 coverage test — every registered rule has a test file.
 *  - the counterfactual assertion — every finding a rule emits carries a
 *    non-empty `whatWouldChangeThis` (`05 §3`).
 *
 * ---------------------------------------------------------------------------
 * FILE NAMING CONVENTION — follow this exactly; the suites above depend on it
 * ---------------------------------------------------------------------------
 *
 *   One file per rule, at `rules/<area>.<name>.ts`, exporting a single `MfRule`.
 *
 *   - `<area>` is the segment after `mf.` in the rule id, and `<name>` is the
 *     rest of it with dashes preserved. So the rule id maps to the filename by
 *     dropping the `mf.` prefix:
 *
 *         mf.cost.regular-plan          -> rules/cost.regular-plan.ts
 *         mf.perf.persistent-under…     -> rules/perf.persistent-underperformance.ts
 *         mf.pf.redundant-funds         -> rules/pf.redundant-funds.ts
 *
 *   - The exported const is the rule id in lowerCamelCase with a `Rule`
 *     suffix: `costRegularPlanRule`, `perfPersistentUnderperformanceRule`.
 *   - Its test lives at `test/services/mfAnalytics/rules/<same basename>.test.ts`.
 *   - `registry.ts` and `types.ts` are not rules and are exempt; every other
 *     `.ts` file directly under `rules/` is expected to be one.
 *
 * The convention is mechanical on purpose. A rule id is what a finding is
 * stamped with and what a verdict cites as a reason, so "which file produced
 * this finding I am looking at in the database?" has to be answerable without
 * grepping — the derivation above is the answer.
 *
 * ---------------------------------------------------------------------------
 *
 * Order in the array is documentation, not behaviour. The engine evaluates
 * FUND rules per fund and PORTFOLIO rules once, and findings are ordered by
 * severity downstream; nothing reads this array's order. It reads in `05 §4`'s
 * catalogue order so the file and the doc can be diffed side by side.
 */

import type { MfRule } from '../types.js';

import { perfPersistentUnderperformanceRule } from './perf.persistent-underperformance.js';
import { perfTopQuartileConsistencyRule } from './perf.top-quartile-consistency.js';
import { perfRecentReversalRule } from './perf.recent-reversal.js';
import { riskHighDownCaptureRule } from './risk.high-down-capture.js';
import { riskDeepDrawdownRule } from './risk.deep-drawdown.js';
import { riskVolatilityMismatchRule } from './risk.volatility-mismatch.js';
import { costHighTerRule } from './cost.high-ter.js';
import { costRegularPlanRule } from './cost.regular-plan.js';
import { portfolioConcentrationRule } from './portfolio.concentration.js';
import { portfolioStyleDriftRule } from './portfolio.style-drift.js';
import { portfolioClosetIndexRule } from './portfolio.closet-index.js';
import { portfolioAumCapacityRule } from './portfolio.aum-capacity.js';
import { peopleManagerChangeRule } from './people.manager-change.js';
import { peopleAmcActionRule } from './people.amc-action.js';
import { debtCreditQualityRule } from './debt.credit-quality.js';
import { debtIssuerConcentrationRule } from './debt.issuer-concentration.js';
import { debtDurationMismatchRule } from './debt.duration-mismatch.js';
import { indexTrackingErrorRule } from './index.tracking-error.js';
import { dataInsufficientHistoryRule } from './data.insufficient-history.js';
import { dataStaleHoldingsRule } from './data.stale-holdings.js';
import { userTimingGapRule } from './user.timing-gap.js';
import { userExitLoadWindowRule } from './user.exit-load-window.js';
import { userLtcgApproachingRule } from './user.ltcg-approaching.js';
import { taxHarvestRule } from './tax.harvest.js';
import { pfRedundantFundsRule } from './pf.redundant-funds.js';
import { pfTooManyFundsRule } from './pf.too-many-funds.js';
import { pfSingleStockRule } from './pf.single-stock.js';
import { pfAllocationDriftRule } from './pf.allocation-drift.js';
import { pfCostRule } from './pf.cost.js';
import { pfDirectSavingsRule } from './pf.direct-savings.js';
import { pfGoalMismatchRule } from './pf.goal-mismatch.js';
import { pfLtcgHeadroomRule } from './pf.ltcg-headroom.js';
import { pfNoEmergencyLiquidityRule } from './pf.no-emergency-liquidity.js';

/**
 * Every registered rule: 24 FUND scope + 9 PORTFOLIO scope = 33, the full
 * `05 §4` catalogue.
 *
 * Listed in the doc's catalogue order so this file and the table can be diffed
 * side by side. Order is documentation only — the engine evaluates FUND rules
 * per fund and PORTFOLIO rules once, and findings are sorted by severity
 * downstream; nothing reads this array's order.
 *
 * Several rules are correctly SILENT in production today because an upstream
 * input is not yet computed, rather than because they are broken. They are
 * registered anyway: a registered rule that emits nothing is recorded in
 * `ruleVersionsSnapshot` as having run and found nothing, which is evidence.
 * An unregistered rule is invisible, and "why was X not flagged?" becomes
 * unanswerable — the exact property `05` exists to guarantee.
 */
export const MF_RULES: MfRule[] = [
  // ---- FUND scope (24), in `05 §4` catalogue order ------------------------
  perfPersistentUnderperformanceRule,
  perfTopQuartileConsistencyRule,
  perfRecentReversalRule,
  riskHighDownCaptureRule,
  riskDeepDrawdownRule,
  riskVolatilityMismatchRule,
  costHighTerRule,
  costRegularPlanRule,
  portfolioConcentrationRule,
  portfolioStyleDriftRule,
  portfolioClosetIndexRule,
  portfolioAumCapacityRule,
  peopleManagerChangeRule,
  peopleAmcActionRule,
  debtCreditQualityRule,
  debtIssuerConcentrationRule,
  debtDurationMismatchRule,
  indexTrackingErrorRule,
  dataInsufficientHistoryRule,
  dataStaleHoldingsRule,
  userTimingGapRule,
  userExitLoadWindowRule,
  userLtcgApproachingRule,
  taxHarvestRule,

  // ---- PORTFOLIO scope (9), in `05 §4` catalogue order --------------------
  pfRedundantFundsRule,
  pfTooManyFundsRule,
  pfSingleStockRule,
  pfAllocationDriftRule,
  pfCostRule,
  pfDirectSavingsRule,
  pfGoalMismatchRule,
  pfLtcgHeadroomRule,
  pfNoEmergencyLiquidityRule,
];

/**
 * The rules for one evaluation scope.
 *
 * The orchestrator calls this twice — once with `'FUND'`, once per fund, and
 * once with `'PORTFOLIO'` — rather than filtering inline, so that "which rules
 * apply here?" has exactly one answer and `ruleVersionsSnapshot` can be built
 * from the same list that was actually run.
 *
 * Returns a fresh array so a caller cannot mutate the registry by sorting the
 * result in place.
 */
export function getRules(scope: MfRule['scope']): MfRule[] {
  return MF_RULES.filter((rule) => rule.scope === scope);
}

/**
 * Duplicate rule ids would make `ruleVersionsSnapshot` ambiguous — two entries
 * with the same `ruleId`, one of which is silently the other's shadow — and
 * would break the verdict table's reason lookup. Checked at module load rather
 * than in a test so the failure lands where the mistake was made.
 */
const seen = new Set<string>();
for (const rule of MF_RULES) {
  if (seen.has(rule.id)) {
    throw new Error(
      `Duplicate MF rule id "${rule.id}" in rules/registry.ts. Rule ids are ` +
        'stamped onto findings and cited by verdicts; two rules cannot share one.',
    );
  }
  seen.add(rule.id);
}
