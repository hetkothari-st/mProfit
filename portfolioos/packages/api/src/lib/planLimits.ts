import { PLAN_LIMITS, PLAN_TIER_ORDER, planRank, type PlanTierValue } from '@portfolioos/shared';
import { ForbiddenError } from './errors.js';

/**
 * Throws when creating one more portfolio would exceed the caller's plan
 * cap. Gated purely on `plan` — no ADMIN bypass, so switching plan via
 * the dev-set-plan endpoint on an admin account actually changes the
 * limit. `currentCount` is the count of portfolios the user already owns
 * *before* the one about to be created.
 */
export function assertPortfolioLimit(currentCount: number, plan: PlanTierValue): void {
  const maxPortfolios = PLAN_LIMITS[plan].maxPortfolios;
  if (maxPortfolios === null) return;
  if (currentCount >= maxPortfolios) {
    const suffix = maxPortfolios === 1 ? '' : 's';
    const nextTier = PLAN_TIER_ORDER[planRank(plan) + 1];
    const upgradeHint = nextTier ? ` Upgrade to ${nextTier} for multiple.` : '';
    throw new ForbiddenError(
      `Your ${plan} plan allows ${maxPortfolios} portfolio${suffix}.${upgradeHint}`,
    );
  }
}
