import { Router } from 'express';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { PLAN_TIER_ORDER, planPriceFor } from '@portfolioos/shared';
import { authenticate } from '../middleware/authenticate.js';
import { asyncHandler } from '../middleware/validate.js';
import { ok } from '../lib/response.js';
import { env } from '../config/env.js';
import { BadRequestError, ForbiddenError, UnauthorizedError } from '../lib/errors.js';
import { prisma } from '../lib/prisma.js';
import { toAuthUser } from '../services/auth.service.js';
import {
  assertValidSignature,
  createOrder,
  fetchOrderNotes,
  isRazorpayConfigured,
} from '../services/billing/razorpay.service.js';

export const billingRouter = Router();
billingRouter.use(authenticate);

const checkoutIntentSchema = z.object({
  tier: z.enum(PLAN_TIER_ORDER),
  billingCycle: z.enum(['MONTHLY', 'ANNUAL']).default('MONTHLY'),
});

// Creates a real Razorpay order once RAZORPAY_KEY_ID/SECRET are configured.
// Falls back to a placeholder response otherwise, so worktrees/CI without
// test keys don't crash — the frontend already handles this shape.
billingRouter.post(
  '/checkout-intent',
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) throw new UnauthorizedError();
    const { tier, billingCycle } = checkoutIntentSchema.parse(req.body);

    if (!isRazorpayConfigured()) {
      ok(res, {
        status: 'not_implemented' as const,
        tier,
        billingCycle,
        message: 'Payments are coming soon. No checkout session was created.',
      });
      return;
    }

    const price = planPriceFor(tier, billingCycle);
    if (!price) {
      throw new BadRequestError(`${tier} has no ${billingCycle.toLowerCase()} price`);
    }

    const order = await createOrder({
      amountPaise: price.amountPaise,
      receipt: `plan_${tier}_${req.user.id}_${Date.now()}`,
      notes: { userId: req.user.id, tier, billingCycle },
    });

    ok(res, {
      status: 'order_created' as const,
      orderId: order.orderId,
      amount: order.amount,
      currency: order.currency,
      keyId: env.RAZORPAY_KEY_ID, // public — safe to hand to the frontend
      tier,
      billingCycle,
    });
  }),
);

const verifyPaymentSchema = z.object({
  razorpayOrderId: z.string().min(1),
  razorpayPaymentId: z.string().min(1),
  razorpaySignature: z.string().min(1),
});

const CYCLE_DAYS: Record<'MONTHLY' | 'ANNUAL', number> = { MONTHLY: 30, ANNUAL: 365 };

// Verifies the Razorpay checkout signature, re-fetches the order from
// Razorpay to read back the trusted tier/billingCycle/userId (never
// trusts client-supplied plan data at this step — see razorpay.service.ts),
// then upgrades the caller's plan. Rejects if the order belongs to a
// different user, e.g. someone replaying a captured order/payment pair.
billingRouter.post(
  '/verify-payment',
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) throw new UnauthorizedError();
    const { razorpayOrderId, razorpayPaymentId, razorpaySignature } = verifyPaymentSchema.parse(
      req.body,
    );

    assertValidSignature({ razorpayOrderId, razorpayPaymentId, razorpaySignature });

    const notes = await fetchOrderNotes(razorpayOrderId);
    if (notes.userId !== req.user.id) {
      throw new ForbiddenError('This order does not belong to you');
    }
    const tier = notes.tier as (typeof PLAN_TIER_ORDER)[number];
    const billingCycle = notes.billingCycle as 'MONTHLY' | 'ANNUAL';
    if (!PLAN_TIER_ORDER.includes(tier) || !CYCLE_DAYS[billingCycle]) {
      throw new BadRequestError('Order has invalid plan metadata');
    }

    const planExpiresAt = new Date(Date.now() + CYCLE_DAYS[billingCycle] * 86_400_000);
    const updated = await prisma.user.update({
      where: { id: req.user.id },
      data: { plan: tier, planExpiresAt },
    });

    ok(res, { user: toAuthUser(updated) });
  }),
);
