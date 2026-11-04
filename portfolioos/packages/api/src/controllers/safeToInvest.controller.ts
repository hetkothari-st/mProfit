import type { Request, Response } from 'express';
import { z } from 'zod';
import { Decimal } from 'decimal.js';
import { ok } from '../lib/response.js';
import { UnauthorizedError } from '../lib/errors.js';
import { isoMonth, positiveMoneyString } from '../lib/zodMoney.js';
import {
  getSummary,
  listCredits,
  savePlan,
  setCreditDecision,
  setMonthInflow,
  updatePlan,
} from '../services/safeToInvest/safeToInvest.service.js';

/** Money for a Decimal(14,2) column: non-negative, under ₹1 lakh crore, at most 2 dp. */
const amount = positiveMoneyString
  .refine((v) => new Decimal(v).lessThan('1000000000000'), 'Amount is too large')
  .refine((v) => new Decimal(v).decimalPlaces() <= 2, 'Use at most 2 decimal places');

const planSchema = z
  .object({
    // Share of a good month's surplus to top up with: 0 to 1.
    topUpShare: z
      .string()
      .regex(/^(0(\.\d{1,4})?|1(\.0{1,4})?)$/, 'Expected a share between 0 and 1')
      .optional(),
    bufferOverride: amount.nullable().optional(),
  })
  .refine((v) => v.topUpShare !== undefined || v.bufferOverride !== undefined, 'Nothing to change');

const monthSchema = z.object({ inflow: amount.nullable() });
const decisionSchema = z.object({ include: z.boolean().nullable() });

function userId(req: Request): string {
  if (!req.user) throw new UnauthorizedError();
  return req.user.id;
}

export async function summaryHandler(req: Request, res: Response) {
  return ok(res, await getSummary(userId(req)));
}

export async function planHandler(req: Request, res: Response) {
  const uid = userId(req);
  await updatePlan(uid, planSchema.parse(req.body));
  return ok(res, await getSummary(uid));
}

export async function saveHandler(req: Request, res: Response) {
  const uid = userId(req);
  await savePlan(uid);
  return ok(res, await getSummary(uid));
}

export async function monthHandler(req: Request, res: Response) {
  const uid = userId(req);
  const month = isoMonth.parse(req.params['month']);
  await setMonthInflow(uid, month, monthSchema.parse(req.body).inflow);
  return ok(res, await getSummary(uid));
}

export async function creditsHandler(req: Request, res: Response) {
  return ok(res, await listCredits(userId(req), isoMonth.parse(req.params['month'])));
}

export async function decisionHandler(req: Request, res: Response) {
  const uid = userId(req);
  await setCreditDecision(uid, z.string().min(1).max(64).parse(req.params['id']), decisionSchema.parse(req.body).include);
  return ok(res, await getSummary(uid));
}
