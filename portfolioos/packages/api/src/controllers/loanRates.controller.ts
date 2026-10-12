import type { Request, Response } from 'express';
import { z } from 'zod';
import { MCLR_TENORS, RATE_BASES, RATE_LOAN_TYPES } from '@everypaisa/shared';
import { created, ok } from '../lib/response.js';
import { writeAuditLog } from '../lib/audit.js';
import { listLoanRates } from '../services/loanRates/loanRates.service.js';
import {
  approveSuspect, clearManualRate, listAdminLoanRates, rejectSuspect, runNow, setManualRate,
} from '../services/loanRates/admin.service.js';

const listQuery = z.object({ loanType: z.enum(RATE_LOAN_TYPES).default('HOME') });

/** GET /api/loan-rates?loanType=HOME */
export async function listLoanRatesHandler(req: Request, res: Response): Promise<void> {
  const { loanType } = listQuery.parse(req.query);
  ok(res, await listLoanRates(loanType));
}

const rateString = z.string().trim().regex(/^\d{1,2}(\.\d{1,3})?$/, 'Use a rate like 8.50');
const manualBody = z.object({
  basis: z.enum(RATE_BASES),
  tenor: z.enum(MCLR_TENORS).nullable().optional(),
  minRatePct: rateString,
  maxRatePct: rateString.nullable().optional(),
  effectiveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  note: z.string().trim().min(3).max(500),
});
const clearQuery = z.object({ tenor: z.enum(MCLR_TENORS).optional() });
const runBody = z.object({ sourceId: z.string().min(1).max(64).optional() });

/** The person at the keyboard: under X-Act-As the manager, otherwise the signed-in admin. */
function actorId(req: Request): string {
  return req.actor?.id ?? req.user!.id;
}

/** GET /api/admin/loan-rates */
export async function adminListHandler(_req: Request, res: Response): Promise<void> {
  ok(res, { sources: await listAdminLoanRates() });
}

/** POST /api/admin/loan-rates/:sourceId/manual */
export async function adminSetManualHandler(req: Request, res: Response): Promise<void> {
  const input = manualBody.parse(req.body);
  const sourceId = String(req.params.sourceId);
  const row = await setManualRate(actorId(req), sourceId, input);
  await writeAuditLog({
    userId: actorId(req),
    action: 'loan_rate_manual_set',
    resource: `LoanRateSource:${sourceId}`,
    metadata: { rateId: row.id, basis: row.basis, tenor: row.tenor, minRatePct: row.minRatePct, maxRatePct: row.maxRatePct, effectiveDate: row.effectiveDate, note: input.note },
    req,
  });
  created(res, row);
}

/** DELETE /api/admin/loan-rates/:sourceId/manual?tenor=1Y */
export async function adminClearManualHandler(req: Request, res: Response): Promise<void> {
  const { tenor } = clearQuery.parse(req.query);
  const sourceId = String(req.params.sourceId);
  const cleared = await clearManualRate(sourceId, tenor);
  await writeAuditLog({
    userId: actorId(req),
    action: 'loan_rate_override_cleared',
    resource: `LoanRateSource:${sourceId}`,
    metadata: { tenor: tenor ?? null, cleared },
    req,
  });
  ok(res, { cleared });
}

/** POST /api/admin/loan-rates/readings/:id/approve */
export async function adminApproveHandler(req: Request, res: Response): Promise<void> {
  const row = await approveSuspect(String(req.params.id));
  await writeAuditLog({
    userId: actorId(req),
    action: 'loan_rate_suspect_approved',
    resource: `LoanRate:${row.id}`,
    metadata: { sourceId: row.sourceId, tenor: row.tenor, minRatePct: row.minRatePct, maxRatePct: row.maxRatePct, note: row.note },
    req,
  });
  ok(res, row);
}

/** POST /api/admin/loan-rates/readings/:id/reject */
export async function adminRejectHandler(req: Request, res: Response): Promise<void> {
  const row = await rejectSuspect(String(req.params.id));
  await writeAuditLog({
    userId: actorId(req),
    action: 'loan_rate_suspect_rejected',
    resource: `LoanRate:${row.id}`,
    metadata: { sourceId: row.sourceId, tenor: row.tenor, minRatePct: row.minRatePct, note: row.note },
    req,
  });
  ok(res, row);
}

/** POST /api/admin/loan-rates/run  body { sourceId? } */
export async function adminRunHandler(req: Request, res: Response): Promise<void> {
  const { sourceId } = runBody.parse(req.body ?? {});
  const result = await runNow(sourceId);
  await writeAuditLog({
    userId: actorId(req),
    action: 'loan_rate_run_now',
    resource: `LoanRateSource:${sourceId ?? '*'}`,
    metadata: result.started === 'one' ? { pages: result.result.pages.map((p) => `${p.readerId}:${p.status}`) } : { scope: 'all' },
    req,
  });
  if (result.started === 'all') {
    res.status(202).json({ success: true, data: result });
    return;
  }
  ok(res, result);
}
