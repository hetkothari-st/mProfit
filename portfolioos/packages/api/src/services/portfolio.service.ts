import { Prisma } from '@prisma/client';
import type { Portfolio } from '@prisma/client';
import {
  Decimal,
  toDecimal,
  serializeMoney,
  serializeQuantity,
  type Money,
  type Quantity,
} from '@portfolioos/shared';
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
      _count: { select: { holdingProjections: true, transactions: true } },
    },
  });
  return rows.map((p) => ({
    ...toPortfolioDTO(p),
    holdingCount: p._count.holdingProjections,
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
    prisma.holdingProjection.aggregate({
      where: { portfolioId: id },
      _sum: {
        totalCost: true,
        currentValue: true,
        unrealisedPnL: true,
      },
    }),
    prisma.holdingProjection.count({ where: { portfolioId: id } }),
    prisma.holdingProjection.findMany({
      where: { portfolioId: id, stockId: { not: null } },
      select: { quantity: true, currentValue: true, stockId: true },
    }),
  ]);

  const totalInvestment = toDecimal(agg._sum.totalCost ?? 0);
  const currentValue = toDecimal(agg._sum.currentValue ?? 0);
  const unrealisedPnL = toDecimal(agg._sum.unrealisedPnL ?? 0);
  // Pct is dimensionless; float is fine once the numerator/denominator are
  // already exact Decimals.
  const unrealisedPnLPct = totalInvestment.greaterThan(0)
    ? unrealisedPnL.dividedBy(totalInvestment).times(100).toNumber()
    : 0;

  let todaysChange = new Decimal(0);
  const stockIds = holdings.map((h) => h.stockId!).filter(Boolean);
  if (stockIds.length > 0) {
    const prices = await prisma.stockPrice.findMany({
      where: { stockId: { in: stockIds } },
      orderBy: [{ stockId: 'asc' }, { date: 'desc' }],
    });
    const byStock = new Map<string, { latestClose: Decimal; prevClose: Decimal | null }>();
    for (const p of prices) {
      const existing = byStock.get(p.stockId);
      if (!existing) {
        byStock.set(p.stockId, { latestClose: toDecimal(p.close), prevClose: null });
      } else if (existing.prevClose === null) {
        existing.prevClose = toDecimal(p.close);
      }
    }
    for (const h of holdings) {
      if (!h.stockId) continue;
      const pair = byStock.get(h.stockId);
      if (!pair || pair.prevClose === null) continue;
      const delta = pair.latestClose.minus(pair.prevClose);
      todaysChange = todaysChange.plus(delta.times(toDecimal(h.quantity)));
    }
  }

  const priorValue = currentValue.minus(todaysChange);
  const todaysChangePct = priorValue.greaterThan(0)
    ? todaysChange.dividedBy(priorValue).times(100).toNumber()
    : 0;

  return {
    id,
    totalInvestment: serializeMoney(totalInvestment),
    currentValue: serializeMoney(currentValue),
    unrealisedPnL: serializeMoney(unrealisedPnL),
    unrealisedPnLPct,
    todaysChange: serializeMoney(todaysChange),
    todaysChangePct,
    xirr: null as number | null,
    holdingCount,
  };
}

export async function getPortfolioHoldings(userId: string, id: string) {
  await ensureOwnership(userId, id);
  const holdings = await prisma.holdingProjection.findMany({
    where: { portfolioId: id },
    orderBy: { computedAt: 'desc' },
  });

  // HoldingProjection stores assetName/isin directly — we still need stock
  // symbol / fund schemeCode for display, so batch-fetch those in one round-
  // trip instead of 1+N joins.
  const stockIds = [...new Set(holdings.map((h) => h.stockId).filter((s): s is string => !!s))];
  const fundIds = [...new Set(holdings.map((h) => h.fundId).filter((f): f is string => !!f))];
  const [stocks, funds] = await Promise.all([
    stockIds.length
      ? prisma.stockMaster.findMany({
          where: { id: { in: stockIds } },
          select: { id: true, symbol: true, name: true, isin: true },
        })
      : Promise.resolve([] as Array<{ id: string; symbol: string; name: string; isin: string | null }>),
    fundIds.length
      ? prisma.mutualFundMaster.findMany({
          where: { id: { in: fundIds } },
          select: { id: true, schemeCode: true, schemeName: true, isin: true },
        })
      : Promise.resolve([] as Array<{ id: string; schemeCode: string; schemeName: string; isin: string | null }>),
  ]);
  const stockById = new Map(stocks.map((s) => [s.id, s]));
  const fundById = new Map(funds.map((f) => [f.id, f]));

  return holdings.map((h) => {
    const stock = h.stockId ? stockById.get(h.stockId) ?? null : null;
    const fund = h.fundId ? fundById.get(h.fundId) ?? null : null;
    const assetName = stock?.name ?? fund?.schemeName ?? h.assetName ?? 'Unknown';
    const symbol = stock?.symbol ?? fund?.schemeCode ?? null;
    const isin = h.isin ?? stock?.isin ?? fund?.isin ?? null;
    const totalCost = toDecimal(h.totalCost);
    const unrealisedPnL = h.unrealisedPnL !== null ? toDecimal(h.unrealisedPnL) : null;
    const unrealisedPnLPct =
      unrealisedPnL !== null && totalCost.greaterThan(0)
        ? unrealisedPnL.dividedBy(totalCost).times(100).toNumber()
        : null;

    return {
      id: h.id,
      assetClass: h.assetClass,
      assetName,
      symbol,
      isin,
      quantity: serializeQuantity(h.quantity) as Quantity,
      avgCostPrice: serializeMoney(h.avgCostPrice) as Money,
      totalCost: serializeMoney(totalCost) as Money,
      currentPrice: h.currentPrice !== null ? (serializeMoney(h.currentPrice) as Money) : null,
      currentValue: h.currentValue !== null ? (serializeMoney(h.currentValue) as Money) : null,
      unrealisedPnL: unrealisedPnL !== null ? (serializeMoney(unrealisedPnL) as Money) : null,
      unrealisedPnLPct,
      xirr: null as number | null,
      holdingPeriodDays: null as number | null,
    };
  });
}

export async function getAssetAllocation(userId: string, id: string) {
  await ensureOwnership(userId, id);
  const groups = await prisma.holdingProjection.groupBy({
    by: ['assetClass'],
    where: { portfolioId: id },
    _sum: { currentValue: true },
    _count: { _all: true },
  });
  const total = groups.reduce(
    (acc, g) => acc.plus(toDecimal(g._sum.currentValue ?? 0)),
    new Decimal(0),
  );
  return groups.map((g) => {
    const value = toDecimal(g._sum.currentValue ?? 0);
    return {
      assetClass: g.assetClass,
      value: serializeMoney(value) as Money,
      percent: total.greaterThan(0) ? value.dividedBy(total).times(100).toNumber() : 0,
      holdingCount: g._count._all,
    };
  });
}

export async function getHistoricalValuation(userId: string, id: string) {
  await ensureOwnership(userId, id);
  return [] as Array<{ date: string; value: Money; invested: Money }>;
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
    amount: serializeMoney(f.amount) as Money,
    description: f.description,
  }));
}
