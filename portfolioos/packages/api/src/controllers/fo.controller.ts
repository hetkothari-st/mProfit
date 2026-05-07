import type { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { ok, noContent } from '../lib/response.js';
import { UnauthorizedError, NotFoundError, ForbiddenError, BadRequestError } from '../lib/errors.js';
import { computePortfolioFoPnl, computeUserFoPnl } from '../services/foPnl.service.js';
import { buildSchedule43Report } from '../services/reports/schedule43.report.js';
import {
  recomputeAllDerivativePositions,
  refreshLiveDerivativePositionPrices,
} from '../services/derivativePosition.service.js';
import { syncFnoBroker } from '../services/foBrokerSync.service.js';
import { getOptionChainSnapshot } from '../priceFeeds/nseOptionChain.service.js';
import { blackScholes, impliedVolatility, timeToExpiryYears, DEFAULT_INDIAN_RISK_FREE_RATE } from '@portfolioos/shared';

async function assertPortfolio(userId: string, portfolioId: string) {
  const p = await prisma.portfolio.findUnique({ where: { id: portfolioId } });
  if (!p) throw new NotFoundError('Portfolio not found');
  if (p.userId !== userId) throw new ForbiddenError();
  return p;
}

export async function listPositions(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  const userId = req.user.id;
  const portfolioId = req.query.portfolioId as string | undefined;
  const status = req.query.status as string | undefined;

  const where: Record<string, unknown> = { userId };
  if (portfolioId) {
    await assertPortfolio(userId, portfolioId);
    where.portfolioId = portfolioId;
  }
  if (status) where.status = status;

  const positions = await prisma.derivativePosition.findMany({
    where,
    orderBy: [{ status: 'asc' }, { expiryDate: 'asc' }],
  });

  return ok(res, positions.map(toPositionDTO));
}

export async function listTrades(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  const userId = req.user.id;
  const portfolioId = req.query.portfolioId as string | undefined;
  const where: Record<string, unknown> = {
    portfolio: { userId },
    assetClass: { in: ['FUTURES', 'OPTIONS'] },
  };
  if (portfolioId) where.portfolioId = portfolioId;
  const txs = await prisma.transaction.findMany({
    where,
    orderBy: { tradeDate: 'desc' },
    take: 500,
  });
  return ok(res, txs.map(toTradeDTO));
}

export async function pnl(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  const userId = req.user.id;
  const portfolioId = req.query.portfolioId as string | undefined;
  const r = portfolioId
    ? await (async () => {
        await assertPortfolio(userId, portfolioId);
        return computePortfolioFoPnl(portfolioId);
      })()
    : await computeUserFoPnl(userId);
  return ok(res, r);
}

export async function summary(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  const userId = req.user.id;
  const portfolioId = req.query.portfolioId as string | undefined;
  const where: Record<string, unknown> = { userId };
  if (portfolioId) {
    await assertPortfolio(userId, portfolioId);
    where.portfolioId = portfolioId;
  }
  const positions = await prisma.derivativePosition.findMany({ where });
  const open = positions.filter((p) => p.status === 'OPEN');
  const totalRealized = positions.reduce((acc, p) => acc + Number(p.realizedPnl), 0);
  const totalUnrealized = open.reduce((acc, p) => acc + Number(p.unrealizedPnl ?? 0), 0);
  const exposureByUnderlying: Record<string, number> = {};
  for (const p of open) {
    const lot = Number(p.lotSize);
    const qty = Number(p.netQuantity);
    const mark = Number(p.mtmPrice ?? p.avgEntryPrice);
    const expo = Math.abs(qty * lot * mark);
    exposureByUnderlying[p.underlying] = (exposureByUnderlying[p.underlying] ?? 0) + expo;
  }
  const expiringSoon = open
    .filter((p) => {
      const days = Math.ceil((p.expiryDate.getTime() - Date.now()) / (24 * 3600 * 1000));
      return days >= 0 && days <= 7;
    })
    .map((p) => ({
      assetKey: p.assetKey,
      underlying: p.underlying,
      expiryDate: p.expiryDate.toISOString().slice(0, 10),
    }));
  return ok(res, {
    openCount: open.length,
    closedCount: positions.length - open.length,
    totalRealizedPnl: totalRealized.toFixed(2),
    totalUnrealizedPnl: totalUnrealized.toFixed(2),
    exposureByUnderlying,
    expiringSoon,
  });
}

export async function optionChain(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  const userId = req.user.id;
  const sym = (req.query.symbol as string | undefined)?.toUpperCase();
  if (!sym) throw new BadRequestError('symbol required');
  const snap = await getOptionChainSnapshot(sym);
  if (!snap) return ok(res, null);
  // Augment each strike with computed Greeks (Newton-Raphson IV) using
  // server-side Black-Scholes for visual consistency with Position panel.
  const T = timeToExpiryYears(new Date(), new Date(snap.expiryDate));
  const augmented = snap.strikes.map((s) => {
    const out = { ...s } as typeof s & { ceGreeks?: unknown; peGreeks?: unknown };
    if (s.ce && s.ce.ltp > 0) {
      const sigma =
        s.ce.iv ??
        impliedVolatility({
          marketPrice: s.ce.ltp,
          spot: snap.underlyingValue,
          strike: s.strike,
          timeToExpiryYears: T,
          riskFreeRate: DEFAULT_INDIAN_RISK_FREE_RATE,
          isCall: true,
        });
      if (sigma) {
        out.ceGreeks = blackScholes({
          spot: snap.underlyingValue,
          strike: s.strike,
          timeToExpiryYears: T,
          riskFreeRate: DEFAULT_INDIAN_RISK_FREE_RATE,
          volatility: sigma,
          isCall: true,
        });
      }
    }
    if (s.pe && s.pe.ltp > 0) {
      const sigma =
        s.pe.iv ??
        impliedVolatility({
          marketPrice: s.pe.ltp,
          spot: snap.underlyingValue,
          strike: s.strike,
          timeToExpiryYears: T,
          riskFreeRate: DEFAULT_INDIAN_RISK_FREE_RATE,
          isCall: false,
        });
      if (sigma) {
        out.peGreeks = blackScholes({
          spot: snap.underlyingValue,
          strike: s.strike,
          timeToExpiryYears: T,
          riskFreeRate: DEFAULT_INDIAN_RISK_FREE_RATE,
          volatility: sigma,
          isCall: false,
        });
      }
    }
    return out;
  });
  return ok(res, { ...snap, strikes: augmented });
}

/**
 * Live MTM refresh for the calling user. Pulls NSE quote-derivative for
 * each underlying represented in the user's OPEN positions, updates
 * `mtmPrice` + `unrealizedPnl`, and returns counts. Frontend polls this
 * every few seconds while the F&O page is visible.
 */
export async function refreshLive(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  const userId = req.user.id;
  const portfolioId = req.query.portfolioId as string | undefined;
  if (portfolioId) await assertPortfolio(userId, portfolioId);
  const r = await refreshLiveDerivativePositionPrices({ userId, portfolioId });
  return ok(res, r);
}

const recomputeSchema = z.object({ portfolioId: z.string().cuid() });
export async function recompute(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  const userId = req.user.id;
  const { portfolioId } = recomputeSchema.parse(req.body);
  await assertPortfolio(userId, portfolioId);
  await recomputeAllDerivativePositions(portfolioId);
  return ok(res, { success: true });
}

const syncBrokerSchema = z.object({
  brokerId: z.enum(['zerodha', 'upstox', 'angel']),
  portfolioId: z.string().cuid(),
});
export async function syncBroker(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  const userId = req.user.id;
  const { brokerId, portfolioId } = syncBrokerSchema.parse(req.body);
  await assertPortfolio(userId, portfolioId);
  const r = await syncFnoBroker({ userId, brokerId, portfolioId });
  return ok(res, r);
}

export async function listMargin(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  const userId = req.user.id;
  const portfolioId = req.query.portfolioId as string | undefined;
  const where: Record<string, unknown> = { userId };
  if (portfolioId) where.portfolioId = portfolioId;
  const rows = await prisma.marginSnapshot.findMany({
    where,
    orderBy: { snapshotDate: 'desc' },
    take: 30,
  });
  return ok(res, rows);
}

export async function listExpiryJobs(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  const userId = req.user.id;
  const status = req.query.status as string | undefined;
  const rows = await prisma.expiryCloseJob.findMany({
    where: {
      portfolio: { userId },
      ...(status ? { status: status as 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED' | 'COMPLETED' } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  return ok(res, rows);
}

const approveSchema = z.object({ id: z.string().cuid() });
export async function approveExpiryJob(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  const userId = req.user.id;
  const { id } = approveSchema.parse({ id: req.params.id });
  const job = await prisma.expiryCloseJob.findUnique({ where: { id } });
  if (!job) throw new NotFoundError('Expiry job not found');
  await assertPortfolio(userId, job.portfolioId);
  const { approveExpiryClose } = await import('../services/foExpiry.service.js');
  await approveExpiryClose(job.id);
  return ok(res, { success: true });
}

export async function rejectExpiryJob(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  const userId = req.user.id;
  const { id } = approveSchema.parse({ id: req.params.id });
  const job = await prisma.expiryCloseJob.findUnique({ where: { id } });
  if (!job) throw new NotFoundError('Expiry job not found');
  await assertPortfolio(userId, job.portfolioId);
  await prisma.expiryCloseJob.update({
    where: { id },
    data: { status: 'REJECTED', reviewedAt: new Date() },
  });
  return ok(res, { success: true });
}

const settingSchema = z.object({
  autoApproveExpiryClose: z.boolean().optional(),
  defaultEquityTaxTreatment: z.enum(['CAPITAL_GAINS', 'BUSINESS_INCOME']).optional(),
});
export async function updateSetting(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  const userId = req.user.id;
  const portfolioId = req.params.portfolioId!;
  await assertPortfolio(userId, portfolioId);
  const body = settingSchema.parse(req.body);
  if (body.defaultEquityTaxTreatment) {
    await prisma.portfolio.update({
      where: { id: portfolioId },
      data: { defaultEquityTaxTreatment: body.defaultEquityTaxTreatment },
    });
  }
  if (body.autoApproveExpiryClose !== undefined) {
    await prisma.portfolioSetting.upsert({
      where: { portfolioId },
      create: { portfolioId, autoApproveExpiryClose: body.autoApproveExpiryClose },
      update: { autoApproveExpiryClose: body.autoApproveExpiryClose },
    });
  }
  return ok(res, { success: true });
}

function toPositionDTO(p: {
  id: string;
  portfolioId: string;
  assetKey: string;
  underlying: string;
  instrumentType: string;
  strikePrice: { toString(): string } | null;
  expiryDate: Date;
  lotSize: number;
  status: string;
  netQuantity: { toString(): string };
  openLots: unknown;
  avgEntryPrice: { toString(): string };
  totalCost: { toString(): string };
  realizedPnl: { toString(): string };
  unrealizedPnl: { toString(): string } | null;
  mtmPrice: { toString(): string } | null;
  closedAt: Date | null;
  closeReason: string | null;
  computedAt: Date;
}) {
  return {
    id: p.id,
    portfolioId: p.portfolioId,
    assetKey: p.assetKey,
    underlying: p.underlying,
    instrumentType: p.instrumentType,
    strikePrice: p.strikePrice?.toString() ?? null,
    expiryDate: p.expiryDate.toISOString().slice(0, 10),
    lotSize: p.lotSize,
    status: p.status,
    netQuantity: p.netQuantity.toString(),
    openLots: p.openLots,
    avgEntryPrice: p.avgEntryPrice.toString(),
    totalCost: p.totalCost.toString(),
    realizedPnl: p.realizedPnl.toString(),
    unrealizedPnl: p.unrealizedPnl?.toString() ?? null,
    mtmPrice: p.mtmPrice?.toString() ?? null,
    closedAt: p.closedAt?.toISOString() ?? null,
    closeReason: p.closeReason,
    computedAt: p.computedAt.toISOString(),
  };
}

function toTradeDTO(t: {
  id: string;
  portfolioId: string;
  assetClass: string;
  transactionType: string;
  assetName: string | null;
  tradeDate: Date;
  quantity: { toString(): string };
  price: { toString(): string };
  netAmount: { toString(): string };
  strikePrice: { toString(): string } | null;
  expiryDate: Date | null;
  optionType: string | null;
  lotSize: number | null;
  broker: string | null;
  exchange: string | null;
  orderNo: string | null;
  tradeNo: string | null;
}) {
  return {
    id: t.id,
    portfolioId: t.portfolioId,
    assetClass: t.assetClass,
    transactionType: t.transactionType,
    assetName: t.assetName,
    tradeDate: t.tradeDate.toISOString().slice(0, 10),
    quantity: t.quantity.toString(),
    price: t.price.toString(),
    netAmount: t.netAmount.toString(),
    strikePrice: t.strikePrice?.toString() ?? null,
    expiryDate: t.expiryDate?.toISOString().slice(0, 10) ?? null,
    optionType: t.optionType,
    lotSize: t.lotSize,
    broker: t.broker,
    exchange: t.exchange,
    orderNo: t.orderNo,
    tradeNo: t.tradeNo,
  };
}

export async function schedule43(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  const userId = req.user.id;
  const fy = (req.query.fy as string) ?? deriveCurrentFy();
  const portfolioId = req.query.portfolioId as string | undefined;
  if (portfolioId) await assertPortfolio(userId, portfolioId);
  const report = await buildSchedule43Report(userId, fy, portfolioId);
  return ok(res, report);
}

function deriveCurrentFy(): string {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1;
  const start = m >= 4 ? y : y - 1;
  return `${start}-${String(start + 1).slice(2)}`;
}

// Side-effect import-only stub to keep referenced response helper visible.
void noContent;
