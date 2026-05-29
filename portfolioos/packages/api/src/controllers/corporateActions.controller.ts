import type { Request, Response } from 'express';
import type { CorporateActionType } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { ok } from '../lib/response.js';
import { ForbiddenError, NotFoundError } from '../lib/errors.js';
import {
  getCorporateActionsReport,
  type CorporateActionFilters,
  type CorporateActionStatus,
} from '../services/corporateActionsReport.service.js';
import { applyCorporateActionsForUser } from '../services/corporateActionApply.service.js';
import { loadNseCorporateActions } from '../priceFeeds/corporateActions.service.js';

const VALID_TYPES = new Set<CorporateActionType>([
  'DIVIDEND', 'BONUS', 'SPLIT', 'MERGER', 'DEMERGER', 'RIGHTS', 'BUYBACK',
]);
const VALID_STATUS = new Set<CorporateActionStatus>(['APPLIED', 'UPCOMING', 'PENDING', 'NEEDS_ACTION']);

async function parseFilters(req: Request): Promise<CorporateActionFilters> {
  const filters: CorporateActionFilters = {};
  const portfolioId = (req.query.portfolioId as string | undefined)?.trim();
  if (portfolioId && portfolioId !== 'all' && portfolioId !== 'ALL') {
    const p = await prisma.portfolio.findUnique({ where: { id: portfolioId } });
    if (!p) throw new NotFoundError('Portfolio not found');
    if (p.userId !== req.user!.id) throw new ForbiddenError();
    filters.portfolioId = portfolioId;
  }
  const type = (req.query.type as string | undefined)?.trim() as CorporateActionType | undefined;
  if (type && VALID_TYPES.has(type)) filters.type = type;
  const status = (req.query.status as string | undefined)?.trim() as CorporateActionStatus | undefined;
  if (status && VALID_STATUS.has(status)) filters.status = status;
  return filters;
}

/** GET /api/corporate-actions — enriched report for the user's holdings. */
export async function listCorporateActions(req: Request, res: Response): Promise<void> {
  const filters = await parseFilters(req);
  const report = await getCorporateActionsReport(req.user!.id, filters);
  ok(res, report);
}

/** POST /api/corporate-actions/sync — fetch latest NSE corporate actions. */
export async function syncCorporateActions(_req: Request, res: Response): Promise<void> {
  const result = await loadNseCorporateActions();
  ok(res, result);
}

/** POST /api/corporate-actions/apply — fold appliable actions into the user's holdings. */
export async function applyCorporateActions(req: Request, res: Response): Promise<void> {
  const applied = await applyCorporateActionsForUser(req.user!.id);
  ok(res, { applied });
}
