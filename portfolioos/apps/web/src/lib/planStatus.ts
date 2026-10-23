import { formatDateIST, planRank, type PlanTierValue } from '@everypaisa/shared';

export const PLAN_LABEL: Record<PlanTierValue, string> = {
  FREE: 'Free',
  PLUS: 'Plus',
  FAMILY: 'Family',
  PRO_ADVISOR: 'Pro/Advisor',
};

/**
 * What a pricing card offers someone currently on `current`.
 *
 * Every tier includes the ones below it, so while a paid plan is active the
 * lower tiers are not for sale — buying one used to replace the higher plan.
 * The current paid plan can be renewed early (the server adds the cycle to
 * the current end date).
 */
export type TierAction = 'current' | 'renew' | 'included' | 'upgrade';

export function tierAction(current: PlanTierValue, tier: PlanTierValue): TierAction {
  if (tier === current) return current === 'FREE' ? 'current' : 'renew';
  if (planRank(tier) < planRank(current)) return 'included';
  return 'upgrade';
}

/**
 * "Your Plus plan is active until 12/11/2026", or null on Free. `plan` is the
 * effective plan from /me (a lapsed plan already reads FREE). A paid plan with
 * no end date was granted outside billing and simply stands.
 */
export function planActiveLine(
  user: { plan: PlanTierValue; planExpiresAt?: string | null } | null | undefined,
): string | null {
  if (!user || user.plan === 'FREE') return null;
  const label = PLAN_LABEL[user.plan];
  return user.planExpiresAt
    ? `Your ${label} plan is active until ${formatDateIST(user.planExpiresAt)}`
    : `Your ${label} plan is active, with no end date`;
}
