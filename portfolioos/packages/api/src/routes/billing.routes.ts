import { Router } from 'express';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { PLAN_TIER_ORDER } from '@portfolioos/shared';
import { authenticate } from '../middleware/authenticate.js';
import { asyncHandler } from '../middleware/validate.js';
import { ok } from '../lib/response.js';
import { UnauthorizedError } from '../lib/errors.js';

export const billingRouter = Router();
billingRouter.use(authenticate);

const checkoutIntentSchema = z.object({
  tier: z.enum(PLAN_TIER_ORDER),
  billingCycle: z.enum(['MONTHLY', 'ANNUAL']).optional(),
});

// TODO: wire to Razorpay checkout — see payments task. This task builds
// gating + pricing display only; no real payment processing (signature
// verification, webhooks) lives here. Returns a placeholder response so
// the pricing page CTA has somewhere to POST to today.
billingRouter.post(
  '/checkout-intent',
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) throw new UnauthorizedError();
    const { tier, billingCycle } = checkoutIntentSchema.parse(req.body);
    ok(res, {
      status: 'not_implemented' as const,
      tier,
      billingCycle: billingCycle ?? 'MONTHLY',
      message: 'Payments are coming soon. No checkout session was created.',
    });
  }),
);
