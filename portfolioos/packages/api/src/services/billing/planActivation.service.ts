import { Prisma, type PlanTier, type User } from '@prisma/client';
import { planRank } from '@everypaisa/shared';
import { runInTransaction } from '../../lib/prisma.js';
import { effectivePlan } from '../../lib/effectivePlan.js';
import { BadRequestError } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';

const CYCLE_DAYS: Record<'MONTHLY' | 'ANNUAL', number> = { MONTHLY: 30, ANNUAL: 365 };

export interface ActivatePaidPlanInput {
  userId: string;
  razorpayOrderId: string;
  razorpayPaymentId: string;
  tier: PlanTier;
  billingCycle: 'MONTHLY' | 'ANNUAL';
}

type PlanHolder = { plan: PlanTier; planExpiresAt: Date | null };

/**
 * Whether buying `tier` now would be a downgrade: a lower tier while a higher
 * paid plan is still running. Every tier includes the ones below it, so such a
 * purchase buys nothing — and it used to replace the higher plan outright.
 */
export function isDowngradePurchase(user: PlanHolder, tier: PlanTier, now: Date = new Date()): boolean {
  return planRank(tier) < planRank(effectivePlan(user, now));
}

/** Refuse a checkout that would only downgrade the buyer (see isDowngradePurchase). */
export function assertPurchasable(user: PlanHolder, tier: PlanTier, now: Date = new Date()): void {
  if (!isDowngradePurchase(user, tier, now)) return;
  const until = user.planExpiresAt
    ? ` until ${user.planExpiresAt.toISOString().slice(0, 10)}`
    : '';
  throw new BadRequestError(
    `Your ${effectivePlan(user, now)} plan is active${until} and already includes ${tier}. ` +
      'You can buy a lower plan once it ends.',
  );
}

/**
 * When a purchase of `tier` should end.
 *
 * Renewing the plan you already have, before it runs out, adds the cycle to
 * the current end date — paying early must not forfeit the days already paid
 * for. Anything else (an upgrade, a purchase after a lapse, a plan granted
 * with no end date) starts the cycle now.
 */
export function nextPlanExpiry(
  user: PlanHolder,
  tier: PlanTier,
  billingCycle: 'MONTHLY' | 'ANNUAL',
  now: Date = new Date(),
): Date {
  const cycleMs = CYCLE_DAYS[billingCycle] * 86_400_000;
  const renewing = user.plan === tier && user.planExpiresAt !== null && user.planExpiresAt > now;
  const from = renewing ? user.planExpiresAt!.getTime() : now.getTime();
  return new Date(from + cycleMs);
}

/**
 * Turn one verified Razorpay payment into a plan, exactly once.
 *
 * The signature check proves the payment is genuine, not that it is new: the
 * buyer can POST the same signed triple again. Without a record of consumed
 * payments every replay reset `planExpiresAt` to now + cycle, so one purchase
 * renewed forever. `BillingPayment.razorpayPaymentId` is unique; a second use
 * hits P2002 and returns the user untouched (a double-clicked "Pay" lands here
 * too, which is why it isn't an error).
 *
 * The record and the plan change commit together, so a failed update can't
 * leave a payment marked used with no plan behind it.
 */
export async function activatePaidPlan(
  input: ActivatePaidPlanInput,
): Promise<{ user: User; replayed: boolean }> {
  try {
    const user = await runInTransaction(async (tx) => {
      await tx.billingPayment.create({
        data: {
          userId: input.userId,
          razorpayOrderId: input.razorpayOrderId,
          razorpayPaymentId: input.razorpayPaymentId,
          tier: input.tier,
          billingCycle: input.billingCycle,
        },
      });
      const current = await tx.user.findUniqueOrThrow({ where: { id: input.userId } });
      if (isDowngradePurchase(current, input.tier)) {
        // Checkout refuses this, so it only happens if a higher plan started
        // between creating the order and paying it. The payment is recorded
        // (above) so support can refund it; the higher plan stays.
        logger.warn(
          { userId: input.userId, razorpayPaymentId: input.razorpayPaymentId, tier: input.tier, current: current.plan },
          'billing.downgrade_payment_ignored',
        );
        return current;
      }
      const planExpiresAt = nextPlanExpiry(current, input.tier, input.billingCycle);
      return tx.user.update({
        where: { id: input.userId },
        data: { plan: input.tier, planExpiresAt },
      });
    });
    return { user, replayed: false };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      const user = await runInTransaction((tx) =>
        tx.user.findUniqueOrThrow({ where: { id: input.userId } }),
      );
      return { user, replayed: true };
    }
    throw err;
  }
}

export function isBillingCycle(v: unknown): v is 'MONTHLY' | 'ANNUAL' {
  return v === 'MONTHLY' || v === 'ANNUAL';
}
