import type { Request, Response } from 'express';
import { z } from 'zod';
import { CPI_SECTORS, isCpiStateCode } from '@everypaisa/shared';
import { ok } from '../lib/response.js';
import { UnauthorizedError } from '../lib/errors.js';
import { decimalInput, isoDate, positiveMoneyString } from '../lib/zodMoney.js';
import { patchOf } from '../lib/zodPatch.js';
import { writeAuditLog } from '../lib/audit.js';
import { isCpiJobRunning, runCpiJob } from '../jobs/cpiJob.js';
import { logger } from '../lib/logger.js';
import {
  createItem,
  deleteItem,
  getSummary,
  updateItem,
  updateProfile,
} from '../services/personalInflation/personalInflation.service.js';

const profileSchema = z.object({
  stateCode: z.number().int().refine(isCpiStateCode, 'Unknown state'),
  sector: z.enum(CPI_SECTORS),
});

const pricePoint = z.object({ asOf: isoDate, amount: positiveMoneyString });

const itemSchema = z.object({
  name: z.string().trim().min(1).max(120),
  divisionCode: z.string().regex(/^\d{2}$/),
  amount: positiveMoneyString,
  frequency: z.enum(['MONTHLY', 'YEARLY']).optional(),
  rateMode: z.enum(['OFFICIAL', 'CUSTOM', 'HISTORY']).optional(),
  // Decimal(6,4) fraction: −99.99% .. +99.99% a year.
  customRate: decimalInput(1).transform(String).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
  pricePoints: z.array(pricePoint).max(30).optional(),
});

function userId(req: Request): string {
  if (!req.user) throw new UnauthorizedError();
  return req.user.id;
}

export async function summaryHandler(req: Request, res: Response) {
  return ok(res, await getSummary(userId(req)));
}

export async function profileHandler(req: Request, res: Response) {
  const uid = userId(req);
  await updateProfile(uid, profileSchema.parse(req.body));
  return ok(res, await getSummary(uid));
}

export async function createItemHandler(req: Request, res: Response) {
  const uid = userId(req);
  await createItem(uid, itemSchema.parse(req.body));
  return ok(res, await getSummary(uid));
}

export async function updateItemHandler(req: Request, res: Response) {
  const uid = userId(req);
  await updateItem(uid, req.params['id']!, patchOf(itemSchema).parse(req.body));
  return ok(res, await getSummary(uid));
}

export async function deleteItemHandler(req: Request, res: Response) {
  const uid = userId(req);
  await deleteItem(uid, req.params['id']!);
  return ok(res, await getSummary(uid));
}

/**
 * ADMIN: start a CPI refresh now. The first run backfills ~800 MoSPI requests
 * (several minutes), so it runs in the background and answers 202.
 */
export async function adminRefreshHandler(req: Request, res: Response): Promise<void> {
  const alreadyRunning = isCpiJobRunning();
  if (!alreadyRunning) {
    void runCpiJob().catch((err: unknown) => logger.error({ err }, '[cpi] admin-triggered refresh failed'));
  }
  await writeAuditLog({
    userId: req.user?.id ?? null,
    action: 'cpi_refresh_run',
    resource: 'CpiObservation:*',
    metadata: { alreadyRunning },
    req,
  });
  res.status(202).json({ success: true, data: { started: !alreadyRunning, alreadyRunning } });
}
