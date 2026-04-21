import { Prisma } from '@prisma/client';
import type { Portfolio } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { ForbiddenError, NotFoundError } from '../lib/errors.js';

function toPortfolioDTO(p: Portfolio) {
  return {
    id: p.id,
    userId: p.userId,
    clientId: p.clientId,
    name: p.name,
    description: p.description,
    type: p.type,
    currency: p.currency,
    isDefault: p.isDefault,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}

export async function listPortfolios(userId: string) {
  const rows = await prisma.portfolio.findMany({
    where: { userId },
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    include: {
      _count: { select: { holdings: true, transactions: true } },
    },
  });
  return rows.map((p) => ({
    ...toPortfolioDTO(p),
    holdingCount: p._count.holdings,
    transactionCount: p._count.transactions,
  }));
}

export async function getPortfolio(userId: string, id: string) {
  const p = await prisma.portfolio.findUnique({ where: { id } });
  if (!p) throw new NotFoundError('Portfolio not found');
  if (p.userId !== userId) throw new ForbiddenError();
  return toPortfolioDTO(p);
}

async function ensureOwnership(userId: string, id: string) {
  const p = await prisma.portfolio.findUnique({ where: { id } });
  if (!p) throw new NotFoundError('Portfolio not found');
  if (p.userId !== userId) throw new ForbiddenError();
  return p;
}

export async function createPortfolio(
  userId: string,
  input: {
    name: string;
    description?: string;
    type?: Portfolio['type'];
    currency?: string;
    clientId?: string;
    isDefault?: boolean;
  },
) {
  if (input.clientId) {
    const client = await prisma.client.findUnique({ where: { id: input.clientId } });
    if (!client || client.advisorId !== userId) throw new ForbiddenError('Invalid client');
  }

  return prisma.$transaction(async (tx) => {
    if (input.isDefault) {
      await tx.portfolio.updateMany({
        where: { userId, isDefault: true },
        data: { isDefault: false },
      });
    }
    const created = await tx.portfolio.create({
      data: {
        userId,
        name: input.name,
        description: input.description,
        type: input.type ?? 'INVESTMENT',
        currency: input.currency ?? 'INR',
        clientId: input.clientId,
        isDefault: input.isDefault ?? false,
      },
    });
    return toPortfolioDTO(created);
  });
}

export async function updatePortfolio(
  userId: string,
  id: string,
  patch: Prisma.PortfolioUpdateInput & { isDefault?: boolean },
) {
  await ensureOwnership(userId, id);
  return prisma.$transaction(async (tx) => {
    if (patch.isDefault === true) {
      await tx.portfolio.updateMany({
        where: { userId, isDefault: true, NOT: { id } },
        data: { isDefault: false },
      });
    }
    const updated = await tx.portfolio.update({
      where: { id },
      data: patch,
    });
    return toPortfolioDTO(updated);
  });
}

export async function deletePortfolio(userId: string, id: string): Promise<void> {
  await ensureOwnership(userId, id);
  await prisma.portfolio.delete({ where: { id } });
}

export async function getPortfolioSummary(userId: string, id: string) {
  await ensureOwnership(userId, id);
  const [agg, holdingCount, holdings] = await Promise.all([
    prisma.holding.aggregate({
      where: { portfolioId: id },
      _sum: {
        totalCost: true,
        currentValue: true,
        unrealisedPnL: true,
      },
    }),
    prisma.holding.count({ where: { portfolioId: id } }),
    prisma.holding.findMany({
      where: { portfolioId: id, stockId: { not: null } },
      select: { quantity: true, currentValue: true, stockId: true },
    }),
  ]);

  const totalInvestment = Number(agg._sum.totalCost ?? 0);
  const currentValue = Number(agg._sum.currentValue ?? 0);
  const unrealisedPnL = Number(agg._sum.unrealisedPnL ?? 0);
  const unrealisedPnLPct = totalInvestment > 0 ? (unrealisedPnL / totalInvestment) * 100 : 0;

  let todaysChange = 0;
  const stockIds = holdings.map((h) => h.stockId!).filter(Boolean);
  if (stockIds.length > 0) {
    const prices = await prisma.stockPrice.findMany({
      where: { stockId: { in: stockIds } },
      orderBy: [{ stockId: 'asc' }, { date: 'desc' }],
    });
    const byStock = new Map<string, { latestClose: number; prevClose: number | null }>();
    for (const p of prices) {
      const existing = byStock.get(p.stockId);
      if (!existing) {
        byStock.set(p.stockId, { latestClose: Number(p.close), prevClose: null });
      } else if (existing.prevClose === null) {
        existing.prevClose = Number(p.close);
      }
    }
    for (const h of holdings) {
      if (!h.stockId) continue;
      const pair = byStock.get(h.stockId);
      if (!pair || pair.prevClose === null) continue;
      const delta = pair.latestClose - pair.prevClose;
      todaysChange += delta * Number(h.quantity);
    }
  }

  const todaysChangePct =
    currentValue - todaysChange > 0 ? (todaysChange / (currentValue - todaysChange)) * 100 : 0;

  return {
    id,
    totalInvestment,
    currentValue,
    unrealisedPnL,
    unrealisedPnLPct,
    todaysChange,
    todaysChangePct,
    xirr: null as number | null,
    holdingCount,
  };
}

export async function getPortfolioHoldings(userId: string, id: string) {
  await ensureOwnership(userId, id);
  const holdings = await prisma.holding.findMany({
    where: { portfolioId: id },
    include: {
      stock: { select: { symbol: true, name: true, isin: true } },
      fund: { select: { schemeCode: true, schemeName: true, isin: true } },
    },
    orderBy: { updatedAt: 'desc' },
  });

  return holdings.map((h) => {
    const assetName = h.stock?.name ?? h.fund?.schemeName ?? h.assetName ?? 'Unknown';
    const symbol = h.stock?.symbol ?? h.fund?.schemeCode ?? null;
    const isin = h.isin ?? h.stock?.isin ?? h.fund?.isin ?? null;
    const quantity = Number(h.quantity);
    const avgCostPrice = Number(h.avgCostPrice);
    const totalCost = Number(h.totalCost);
    const currentPrice = h.currentPrice !== null ? Number(h.currentPrice) : null;
    const currentValue = h.currentValue !== null ? Number(h.currentValue) : null;
    const unrealisedPnL = h.unrealisedPnL !== null ? Number(h.unrealisedPnL) : null;
    const unrealisedPnLPct =
      unrealisedPnL !== null && totalCost > 0 ? (unrealisedPnL / totalCost) * 100 : null;

    return {
      id: h.id,
      assetClass: h.assetClass,
      assetName,
      symbol,
      isin,
      quantity,
      avgCostPrice,
      totalCost,
      currentPrice,
      currentValue,
      unrealisedPnL,
      unrealisedPnLPct,
      xirr: null as number | null,
      holdingPeriodDays: null as number | null,
    };
  });
}

export async function getAssetAllocation(userId: string, id: string) {
  await ensureOwnership(userId, id);
  const groups = await prisma.holding.groupBy({
    by: ['assetClass'],
    where: { portfolioId: id },
    _sum: { currentValue: true },
    _count: { _all: true },
  });
  const total = groups.reduce((acc, g) => acc + Number(g._sum.currentValue ?? 0), 0);
  return groups.map((g) => {
    const value = Number(g._sum.currentValue ?? 0);
    return {
      assetClass: g.assetClass,
      value,
      percent: total > 0 ? (value / total) * 100 : 0,
      holdingCount: g._count._all,
    };
  });
}

export async function getHistoricalValuation(userId: string, id: string) {
  await ensureOwnership(userId, id);
  return [] as Array<{ date: string; value: number; invested: number }>;
}

export async function getCashFlows(userId: string, id: string) {
  await ensureOwnership(userId, id);
  const flows = await prisma.cashFlow.findMany({
    where: { portfolioId: id },
    orderBy: { date: 'asc' },
  });
  return flows.map((f) => ({
    id: f.id,
    date: f.date.toISOString().slice(0, 10),
    type: f.type,
    amount: Number(f.amount),
    description: f.description,
  }));
}
