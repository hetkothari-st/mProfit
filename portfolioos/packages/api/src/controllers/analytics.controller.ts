import type { Request, Response } from 'express';
import { prisma } from '../lib/prisma.js';
import { ok } from '../lib/response.js';
import { BadRequestError, ForbiddenError, NotFoundError } from '../lib/errors.js';
import {
  getAnalyticsSnapshot,
  getPortfolioValueLine,
  periodToDays,
  type AnalyticsScope,
  type Period,
} from '../services/analytics.service.js';
import { computeRiskMetrics, monthlyFromDaily } from '../services/analytics.risk.js';
import { getBenchmarkSeries, getNiftyMonthlyCloses } from '../services/analytics.benchmark.js';
import {
  getOrGenerateInsights,
  getLatestInsight,
} from '../services/analytics.insights.js';
import { checkBudget } from '../ingestion/llm/budget.js';

const VALID_PERIODS: Period[] = ['1M', '3M', '6M', '1Y', '3Y', '5Y', 'All'];

function parsePeriod(req: Request, fallback: Period = '1Y'): Period {
  const raw = req.query.period as string | undefined;
  if (!raw) return fallback;
  if ((VALID_PERIODS as string[]).includes(raw)) return raw as Period;
  throw new BadRequestError(`Invalid period "${raw}". Use one of: ${VALID_PERIODS.join(', ')}`);
}

/**
 * Resolve scope from query params: explicit `portfolioId` → portfolio
 * scope (ownership verified); absent → user-level cross-portfolio scope.
 */
async function resolveScope(req: Request): Promise<AnalyticsScope> {
  const userId = req.user!.id;
  const portfolioId = (req.query.portfolioId as string | undefined)?.trim();
  if (!portfolioId || portfolioId === 'all' || portfolioId === 'ALL') {
    return { kind: 'user', userId };
  }
  const p = await prisma.portfolio.findUnique({ where: { id: portfolioId } });
  if (!p) throw new NotFoundError('Portfolio not found');
  if (p.userId !== userId) throw new ForbiddenError();
  return { kind: 'portfolio', portfolioId };
}

// ─── Handlers ─────────────────────────────────────────────────────

export async function getSnapshot(req: Request, res: Response): Promise<void> {
  const scope = await resolveScope(req);
  const period = parsePeriod(req);
  const data = await getAnalyticsSnapshot(scope, period);
  ok(res, data);
}

export async function getBenchmark(req: Request, res: Response): Promise<void> {
  // Benchmark is global (NIFTY/Sensex) — no scope needed. Auth still required.
  const period = parsePeriod(req);
  const series = await getBenchmarkSeries(periodToDays(period));
  ok(res, { period, series });
}

export async function getRisk(req: Request, res: Response): Promise<void> {
  const scope = await resolveScope(req);
  const period = parsePeriod(req);
  const days = periodToDays(period);
  const [valueLine, niftyMonthly] = await Promise.all([
    getPortfolioValueLine(scope, days),
    getNiftyMonthlyCloses(days),
  ]);
  // valueLine is already month-end (historicalValuation emits MONTHLY).
  const portfolioMonthly = monthlyFromDaily(
    // Risk metrics are statistical estimates, not accounting — Number is
    // intentional here (mirrors xirr.service.ts solver-boundary cast).
    // eslint-disable-next-line portfolioos/no-money-coercion -- statistical computation, see analytics.risk.ts
    valueLine.map((p) => ({ date: p.date, value: Number(p.value) })),
  );
  const benchmarkMonthly = niftyMonthly.map((p) => ({ date: p.date.slice(0, 7), value: p.close }));
  const metrics = computeRiskMetrics(portfolioMonthly, benchmarkMonthly);
  ok(res, metrics);
}

export async function getInsightsLatest(req: Request, res: Response): Promise<void> {
  const scope = await resolveScope(req);
  const result = await getLatestInsight(scope);
  ok(res, result);
}

export async function generateInsights(req: Request, res: Response): Promise<void> {
  const scope = await resolveScope(req);
  const rawPeriod =
    (req.body?.period as string | undefined) ??
    (req.query.period as string | undefined) ??
    '1Y';
  if (!(VALID_PERIODS as string[]).includes(rawPeriod)) {
    throw new BadRequestError(`Invalid period "${rawPeriod}". Use one of: ${VALID_PERIODS.join(', ')}`);
  }
  const period = rawPeriod as Period;
  const force = req.body?.force === true || req.query.force === 'true';
  const result = await getOrGenerateInsights(scope, period, force);
  ok(res, result);
}

export async function getInsightsSpend(req: Request, res: Response): Promise<void> {
  const userId = req.user!.id;
  const budget = await checkBudget(userId);
  ok(res, {
    monthToDate: budget.spent.toFixed(4),
    warnInr: budget.warn.toFixed(4),
    capInr: budget.cap.toFixed(4),
    status: budget.status,
  });
}
