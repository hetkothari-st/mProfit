import { Prisma, type PlanTier, type User } from '@prisma/client';
import { runInTransaction } from '../../lib/prisma.js';

const CYCLE_DAYS: Record<'MONTHLY' | 'ANNUAL', number> = { MONTHLY: 30, ANNUAL: 365 };

export interface ActivatePaidPlanInput {
  userId: string;
  razorpayOrderId: string;
  razorpayPaymentId: string;
  tier: PlanTier;
  billingCycle: 'MONTHLY' | 'ANNUAL';
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
      const planExpiresAt = new Date(Date.now() + CYCLE_DAYS[input.billingCycle] * 86_400_000);
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
