import type { Request, Response } from 'express';
import { z } from 'zod';
import { PortfolioType } from '@prisma/client';
import type { PlanTierValue } from '@portfolioos/shared';
import {
  createPortfolio,
  deletePortfolio,
  getAssetAllocation,
  getCashFlows,
  getHistoricalValuation,
  getPortfolio,
  getPortfolioHoldings,
  getPortfolioSummary,
  listPortfoliosForScope,
  updatePortfolio,
} from '../services/portfolio.service.js';
import { created, noContent, ok } from '../lib/response.js';
import { UnauthorizedError } from '../lib/errors.js';
import { parseFamilyId } from '../lib/familyHeader.js';
import { assertPortfolioLimit } from '../lib/planLimits.js';
import { prisma } from '../lib/prisma.js';

const createSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  type: z.nativeEnum(PortfolioType).optional(),
  currency: z.string().length(3).default('INR'),
  clientId: z.string().cuid().optional(),
  isDefault: z.boolean().optional(),
  onboarding: z.boolean().optional(),
});

const updateSchema = createSchema.partial();

function userId(req: Request): string {
  if (!req.user) throw new UnauthorizedError();
  return req.user.id;
}

export async function list(req: Request, res: Response) {
  ok(res, await listPortfoliosForScope(userId(req), parseFamilyId(req)));
}

export async function detail(req: Request, res: Response) {
  ok(res, await getPortfolio(userId(req), req.params.id!));
}

export async function create(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  const data = createSchema.parse(req.body);
  // Onboarding re-entry short-circuits to the existing portfolio (see
  // createPortfolio's `onboarding` handling) rather than inserting a new
  // row, so it must not be blocked by a plan cap that's only relevant to
  // an actual insert.
  if (!data.onboarding) {
    const existingCount = await prisma.portfolio.count({ where: { userId: req.user.id } });
    assertPortfolioLimit(existingCount, req.user.plan as PlanTierValue);
  }
  created(res, await createPortfolio(userId(req), data));
}

export async function update(req: Request, res: Response) {
  const data = updateSchema.parse(req.body);
  ok(res, await updatePortfolio(userId(req), req.params.id!, data));
}

export async function remove(req: Request, res: Response) {
  await deletePortfolio(userId(req), req.params.id!);
  noContent(res);
}

export async function summary(req: Request, res: Response) {
  ok(res, await getPortfolioSummary(userId(req), req.params.id!));
}

export async function holdings(req: Request, res: Response) {
  ok(res, await getPortfolioHoldings(userId(req), req.params.id!));
}

export async function allocation(req: Request, res: Response) {
  ok(res, await getAssetAllocation(userId(req), req.params.id!));
}

export async function historicalValuation(req: Request, res: Response) {
  const days = req.query.days !== undefined ? Number(req.query.days) : 365;
  ok(res, await getHistoricalValuation(userId(req), req.params.id!, isNaN(days) ? 365 : days));
}

export async function cashFlows(req: Request, res: Response) {
  ok(res, await getCashFlows(userId(req), req.params.id!));
}
