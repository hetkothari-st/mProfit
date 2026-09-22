import type { PlanTier } from '@prisma/client';

/**
 * The plan a user is actually entitled to right now.
 *
 * Checkout stores `planExpiresAt`; a paid plan past it is FREE. Every place
 * that turns the stored plan into access (the access-token claim, the /me
 * payload, the AI quota) goes through this, so a lapsed subscription stops
 * unlocking features instead of lasting forever. A null expiry means the plan
 * was granted without a billing cycle (e.g. the admin QA switch) and stands.
 */
export function effectivePlan(
  user: { plan: PlanTier; planExpiresAt: Date | null },
  now: Date = new Date(),
): PlanTier {
  if (user.plan !== 'FREE' && user.planExpiresAt && user.planExpiresAt <= now) return 'FREE';
  return user.plan;
}
