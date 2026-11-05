import type { Request, Response } from 'express';
import { z } from 'zod';
import { CPI_SECTORS, hasFeature, isCpiStateCode, type PlanTierValue } from '@everypaisa/shared';
import { ok } from '../lib/response.js';
import { ForbiddenError, UnauthorizedError } from '../lib/errors.js';
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
import { importSourceCandidates, listSourceCandidates } from '../services/personalInflation/inflationSources.js';
import { applySuggestedGoalRates, listGoalImpacts } from '../services/personalInflation/inflationGoals.js';
import {
  answerStepChange,
  giveSpendingConsent,
  withdrawSpendingConsent,
} from '../services/personalInflation/spendingConsent.js';
import { syncSpending } from '../services/spending/spendingSync.js';
import { runAsUser } from '../lib/requestContext.js';

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
  isFixed: z.boolean().optional(),
  countAnyway: z.boolean().optional(),
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

const consentSchema = z.object({ version: z.string().min(1).max(40), agree: z.literal(true) });
const stepAnswerSchema = z.object({ realRise: z.boolean() });

/** Agree to bank spending being read; the first read starts in the background. */
export async function giveConsentHandler(req: Request, res: Response) {
  const uid = userId(req);
  await giveSpendingConsent(uid, consentSchema.parse(req.body).version, req);
  void runAsUser(uid, () => syncSpending(uid)).catch((err) => logger.error({ err }, 'spending.first_sync_failed'));
  return ok(res, await getSummary(uid));
}

/** Turn it off and delete what was derived from bank spending. */
export async function withdrawConsentHandler(req: Request, res: Response) {
  const uid = userId(req);
  await withdrawSpendingConsent(uid, req);
  return ok(res, await getSummary(uid));
}

export async function stepChangeHandler(req: Request, res: Response) {
  const uid = userId(req);
  await answerStepChange(uid, req.params['seriesId']!, stepAnswerSchema.parse(req.body).realRise);
  return ok(res, await getSummary(uid));
}

const importSchema = z.object({
  sourceRefs: z.array(z.string().regex(/^(loan|insurance|property):[\w-]{1,64}$/)).min(1).max(50),
});
const applyGoalsSchema = z.object({ goalIds: z.array(z.string().min(1).max(64)).min(1).max(50) });

/** Goals are a paid feature; this page reads and re-plans them only for plans that include it. */
function canUseGoals(req: Request): boolean {
  return !!req.user && hasFeature(req.user.plan as PlanTierValue, 'GOAL_PROJECTIONS');
}

export async function sourcesHandler(req: Request, res: Response) {
  return ok(res, await listSourceCandidates(userId(req)));
}

export async function importSourcesHandler(req: Request, res: Response) {
  const uid = userId(req);
  await importSourceCandidates(uid, importSchema.parse(req.body).sourceRefs);
  return ok(res, await getSummary(uid));
}

export async function goalsHandler(req: Request, res: Response) {
  const uid = userId(req);
  if (!canUseGoals(req)) return ok(res, { available: false, goals: [] });
  return ok(res, { available: true, goals: await listGoalImpacts(uid, await getSummary(uid)) });
}

export async function applyGoalsHandler(req: Request, res: Response) {
  const uid = userId(req);
  if (!canUseGoals(req)) throw new ForbiddenError('Goals are not included in your plan');
  const { goalIds } = applyGoalsSchema.parse(req.body);
  const summary = await getSummary(uid);
  await applySuggestedGoalRates(uid, summary, goalIds);
  return ok(res, { available: true, goals: await listGoalImpacts(uid, summary) });
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
