import type { Request, Response } from 'express';
import { computeHealthScore } from '../services/healthScore.service.js';
import { getNetWorthHistory, type NetWorthHistoryPeriod } from '../services/netWorthHistory.service.js';
import { runNetWorthSnapshotForUser } from '../jobs/netWorthSnapshotJob.js';
import { ok } from '../lib/response.js';
import { UnauthorizedError, BadRequestError } from '../lib/errors.js';
import { serializeMoney } from '@everypaisa/shared';

export async function getHealthScore(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  const force = req.query['force'] === 'true';
  const data = await computeHealthScore(req.user.id, { force });
  return ok(res, data);
}

const VALID_PERIODS: NetWorthHistoryPeriod[] = ['1M', '3M', '6M', '1Y', 'ALL'];

export async function getNetWorthHistoryHandler(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  const period = (req.query['period'] as string | undefined) ?? '1Y';
  if (!VALID_PERIODS.includes(period as NetWorthHistoryPeriod)) {
    throw new BadRequestError(`Invalid period. Must be one of: ${VALID_PERIODS.join(', ')}`);
  }
  const data = await getNetWorthHistory(req.user.id, period as NetWorthHistoryPeriod);
  return ok(res, data);
}

// Manual trigger — same pattern as insurance.controller.ts's
// triggerRenewalAlertsHandler: scoped to the calling user only, no
// admin/role gate (there is no admin UserRole in this codebase; this
// repo's existing manual-trigger endpoints are all self-service).
export async function triggerNetWorthSnapshotHandler(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  const snapshot = await runNetWorthSnapshotForUser(req.user.id);
  return ok(res, {
    asOf: snapshot.asOf.toISOString().slice(0, 10),
    totalNetWorth: serializeMoney(snapshot.totalNetWorth),
    totalLiabilities: serializeMoney(snapshot.totalLiabilities),
    netWorthAfterLiabilities: serializeMoney(snapshot.netWorthAfterLiabilities),
  });
}
