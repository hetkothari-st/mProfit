/**
 * Portfolio groups (family / household-style aggregation).
 *
 * A PortfolioGroup is a user-owned bucket that bundles N of that same user's
 * Portfolios into a single read view (e.g. "Het" + "Nehal" → "Kotharis").
 * Writes (transactions, holdings) still target individual portfolios; the
 * group only aggregates reads.
 *
 * Cross-currency members are rejected at write time: aggregation assumes a
 * single currency. Mixed-currency support would need fx and is out of scope.
 */

import { Prisma, type PortfolioGroup as PrismaGroup, type Portfolio } from '@prisma/client';
import {
  Decimal,
  toDecimal,
  serializeMoney,
  serializeQuantity,
  type Money,
  type Quantity,
} from '@portfolioos/shared';
import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';
import { ForbiddenError, NotFoundError, BadRequestError } from '../lib/errors.js';
import { fetchHistorical } from '../priceFeeds/yahoo.service.js';

function toGroupDTO(g: PrismaGroup) {
  return {
    id: g.id,
    userId: g.userId,
    name: g.name,
    description: g.description,
    createdAt: g.createdAt.toISOString(),
  };
}

async function ensureGroupOwnership(userId: string, groupId: string): Promise<PrismaGroup> {
  const g = await prisma.portfolioGroup.findUnique({ where: { id: groupId } });
  if (!g) throw new NotFoundError('Portfolio group not found');
  if (g.userId !== userId) throw new ForbiddenError();
  return g;
}

async function ensurePortfoliosOwned(userId: string, portfolioIds: string[]): Promise<Portfolio[]> {
  if (portfolioIds.length === 0) return [];
  const found = await prisma.portfolio.findMany({
    where: { id: { in: portfolioIds }, userId },
  });
  if (found.length !== portfolioIds.length) {
    throw new ForbiddenError('One or more portfolios not owned by user');
  }
  return found;
}

function assertSingleCurrency(portfolios: Portfolio[]): string {
  if (portfolios.length === 0) return 'INR';
  const set = new Set(portfolios.map((p) => p.currency));
  if (set.size > 1) {
    throw new BadRequestError(
      `Group members must share a currency; got ${[...set].join(', ')}`,
    );
  }
  return portfolios[0]!.currency;
}

async function loadMemberPortfolioIds(groupId: string): Promise<string[]> {
  const rows = await prisma.portfolioGroupMember.findMany({
    where: { groupId },
    select: { portfolioId: true },
  });
  return rows.map((r) => r.portfolioId);
}

// ─── CRUD ────────────────────────────────────────────────────────────────

export async function listGroups(userId: string) {
  const groups = await prisma.portfolioGroup.findMany({
    where: { userId },
    orderBy: { createdAt: 'asc' },
    include: {
      members: {
        include: {
          portfolio: {
            select: { id: true, name: true, currency: true, type: true },
          },
        },
      },
    },
  });

  // Batch holding values per portfolio across all groups
  const allPortfolioIds = [
    ...new Set(groups.flatMap((g) => g.members.map((m) => m.portfolioId))),
  ];
  const holdings = allPortfolioIds.length
    ? await prisma.holdingProjection.findMany({
        where: { portfolioId: { in: allPortfolioIds } },
        select: { portfolioId: true, currentValue: true, totalCost: true },
      })
    : [];

  const valByPortfolio = new Map<string, { value: Decimal; cost: Decimal; count: number }>();
  for (const h of holdings) {
    const entry = valByPortfolio.get(h.portfolioId) ?? {
      value: new Decimal(0),
      cost: new Decimal(0),
      count: 0,
    };
    const eff = h.currentValue !== null ? toDecimal(h.currentValue) : toDecimal(h.totalCost);
    entry.value = entry.value.plus(eff);
    entry.cost = entry.cost.plus(toDecimal(h.totalCost));
    entry.count += 1;
    valByPortfolio.set(h.portfolioId, entry);
  }

  return groups.map((g) => {
    let groupValue = new Decimal(0);
    let groupCost = new Decimal(0);
    let groupCount = 0;
    const members = g.members.map((m) => {
      const v = valByPortfolio.get(m.portfolioId) ?? {
        value: new Decimal(0),
        cost: new Decimal(0),
        count: 0,
      };
      groupValue = groupValue.plus(v.value);
      groupCost = groupCost.plus(v.cost);
      groupCount += v.count;
      return {
        id: m.portfolio.id,
        name: m.portfolio.name,
        currency: m.portfolio.currency,
        type: m.portfolio.type,
        holdingCount: v.count,
        currentValue: serializeMoney(v.value),
      };
    });

    const currency = members.length > 0 ? members[0]!.currency : 'INR';

    return {
      ...toGroupDTO(g),
      members,
      currency,
      currentValue: serializeMoney(groupValue),
      totalCost: serializeMoney(groupCost),
      holdingCount: groupCount,
    };
  });
}

export async function getGroup(userId: string, groupId: string) {
  const g = await ensureGroupOwnership(userId, groupId);
  return toGroupDTO(g);
}

export async function createGroup(
  userId: string,
  input: { name: string; description?: string; memberIds?: string[] },
) {
  if (!input.name.trim()) throw new BadRequestError('Group name is required');
  const memberIds = input.memberIds ?? [];
  const portfolios = await ensurePortfoliosOwned(userId, memberIds);
  assertSingleCurrency(portfolios);

  return prisma.$transaction(async (tx) => {
    const group = await tx.portfolioGroup.create({
      data: {
        userId,
        name: input.name.trim(),
        description: input.description ?? null,
      },
    });
    if (memberIds.length > 0) {
      await tx.portfolioGroupMember.createMany({
        data: memberIds.map((portfolioId) => ({ groupId: group.id, portfolioId })),
      });
    }
    return toGroupDTO(group);
  });
}

export async function updateGroup(
  userId: string,
  groupId: string,
  patch: { name?: string; description?: string | null; memberIds?: string[] },
) {
  await ensureGroupOwnership(userId, groupId);

  let portfolios: Portfolio[] | null = null;
  if (patch.memberIds) {
    portfolios = await ensurePortfoliosOwned(userId, patch.memberIds);
    assertSingleCurrency(portfolios);
  }

  return prisma.$transaction(async (tx) => {
    const data: Prisma.PortfolioGroupUpdateInput = {};
    if (patch.name !== undefined) data.name = patch.name.trim();
    if (patch.description !== undefined) data.description = patch.description;
    const updated = await tx.portfolioGroup.update({ where: { id: groupId }, data });

    if (patch.memberIds) {
      await tx.portfolioGroupMember.deleteMany({ where: { groupId } });
      if (patch.memberIds.length > 0) {
        await tx.portfolioGroupMember.createMany({
          data: patch.memberIds.map((portfolioId) => ({ groupId, portfolioId })),
        });
      }
    }
    return toGroupDTO(updated);
  });
}

export async function deleteGroup(userId: string, groupId: string): Promise<void> {
  await ensureGroupOwnership(userId, groupId);
  await prisma.portfolioGroup.delete({ where: { id: groupId } });
}

export async function setGroupMembers(
  userId: string,
  groupId: string,
  memberIds: string[],
) {
  await ensureGroupOwnership(userId, groupId);
  const portfolios = await ensurePortfoliosOwned(userId, memberIds);
  assertSingleCurrency(portfolios);
  await prisma.$transaction(async (tx) => {
    await tx.portfolioGroupMember.deleteMany({ where: { groupId } });
    if (memberIds.length > 0) {
      await tx.portfolioGroupMember.createMany({
        data: memberIds.map((portfolioId) => ({ groupId, portfolioId })),
      });
    }
  });
}

// ─── Aggregated reads ────────────────────────────────────────────────────

export async function getGroupSummary(userId: string, groupId: string) {
  await ensureGroupOwnership(userId, groupId);
  const portfolioIds = await loadMemberPortfolioIds(groupId);
  if (portfolioIds.length === 0) {
    return {
      id: groupId,
      totalInvestment: serializeMoney(new Decimal(0)),
      currentValue: serializeMoney(new Decimal(0)),
      unrealisedPnL: serializeMoney(new Decimal(0)),
      unrealisedPnLPct: 0,
      todaysChange: serializeMoney(new Decimal(0)),
      todaysChangePct: 0,
      xirr: null as number | null,
      holdingCount: 0,
    };
  }

  const [rows, holdingCount] = await Promise.all([
    prisma.holdingProjection.findMany({
      where: { portfolioId: { in: portfolioIds } },
      select: {
        totalCost: true,
        currentValue: true,
        unrealisedPnL: true,
        quantity: true,
        stockId: true,
      },
    }),
    prisma.holdingProjection.count({ where: { portfolioId: { in: portfolioIds } } }),
  ]);

  const totalInvestment = rows.reduce(
    (s, h) => s.plus(toDecimal(h.totalCost)),
    new Decimal(0),
  );
  const currentValue = rows.reduce((s, h) => {
    const cv = h.currentValue !== null ? toDecimal(h.currentValue) : toDecimal(h.totalCost);
    return s.plus(cv);
  }, new Decimal(0));
  const unrealisedPnL = currentValue.minus(totalInvestment);
  const unrealisedPnLPct = totalInvestment.greaterThan(0)
    ? unrealisedPnL.dividedBy(totalInvestment).times(100).toNumber()
    : 0;

  // Today's change — sum across stock holdings using two most-recent prices
  let todaysChange = new Decimal(0);
  const stockHoldings = rows.filter((h) => h.stockId);
  const stockIds = stockHoldings.map((h) => h.stockId!).filter(Boolean);
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
    for (const h of stockHoldings) {
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
    id: groupId,
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

export async function getGroupHoldings(userId: string, groupId: string) {
  await ensureGroupOwnership(userId, groupId);
  const portfolioIds = await loadMemberPortfolioIds(groupId);
  if (portfolioIds.length === 0) return [];

  const holdings = await prisma.holdingProjection.findMany({
    where: { portfolioId: { in: portfolioIds } },
    orderBy: { computedAt: 'desc' },
  });

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

  // Merge by assetKey across portfolios — same stock held in two member
  // portfolios collapses into one row with summed qty/cost.
  interface AggRow {
    assetKey: string;
    assetClass: string;
    assetName: string;
    symbol: string | null;
    isin: string | null;
    quantity: Decimal;
    totalCost: Decimal;
    currentPrice: Decimal | null;
    currentValue: Decimal;
    hasCurrentValue: boolean;
  }
  const byKey = new Map<string, AggRow>();
  for (const h of holdings) {
    const stock = h.stockId ? stockById.get(h.stockId) ?? null : null;
    const fund = h.fundId ? fundById.get(h.fundId) ?? null : null;
    const assetName = stock?.name ?? fund?.schemeName ?? h.assetName ?? 'Unknown';
    const symbol = stock?.symbol ?? fund?.schemeCode ?? null;
    const isin = h.isin ?? stock?.isin ?? fund?.isin ?? null;

    const existing = byKey.get(h.assetKey);
    const qty = toDecimal(h.quantity);
    const cost = toDecimal(h.totalCost);
    const cv = h.currentValue !== null ? toDecimal(h.currentValue) : null;
    const cp = h.currentPrice !== null ? toDecimal(h.currentPrice) : null;

    if (!existing) {
      byKey.set(h.assetKey, {
        assetKey: h.assetKey,
        assetClass: h.assetClass,
        assetName,
        symbol,
        isin,
        quantity: qty,
        totalCost: cost,
        currentPrice: cp,
        currentValue: cv ?? cost,
        hasCurrentValue: cv !== null,
      });
    } else {
      existing.quantity = existing.quantity.plus(qty);
      existing.totalCost = existing.totalCost.plus(cost);
      existing.currentValue = existing.currentValue.plus(cv ?? cost);
      existing.hasCurrentValue = existing.hasCurrentValue && cv !== null;
      // currentPrice is per-unit — keep most recent (last-seen) value; for
      // mixed-source holdings caller can ignore.
      if (cp) existing.currentPrice = cp;
    }
  }

  return [...byKey.values()].map((r) => {
    const avgCost = r.quantity.greaterThan(0)
      ? r.totalCost.dividedBy(r.quantity)
      : new Decimal(0);
    const unrealisedPnL = r.hasCurrentValue ? r.currentValue.minus(r.totalCost) : null;
    const unrealisedPnLPct =
      unrealisedPnL !== null && r.totalCost.greaterThan(0)
        ? unrealisedPnL.dividedBy(r.totalCost).times(100).toNumber()
        : null;

    return {
      id: r.assetKey,
      assetClass: r.assetClass,
      assetName: r.assetName,
      symbol: r.symbol,
      isin: r.isin,
      quantity: serializeQuantity(r.quantity) as Quantity,
      avgCostPrice: serializeMoney(avgCost) as Money,
      totalCost: serializeMoney(r.totalCost) as Money,
      currentPrice: r.currentPrice ? (serializeMoney(r.currentPrice) as Money) : null,
      currentValue: r.hasCurrentValue ? (serializeMoney(r.currentValue) as Money) : null,
      unrealisedPnL: unrealisedPnL ? (serializeMoney(unrealisedPnL) as Money) : null,
      unrealisedPnLPct,
      xirr: null as number | null,
      holdingPeriodDays: null as number | null,
    };
  });
}

export async function getGroupAllocation(userId: string, groupId: string) {
  await ensureGroupOwnership(userId, groupId);
  const portfolioIds = await loadMemberPortfolioIds(groupId);
  if (portfolioIds.length === 0) return [];

  const rows = await prisma.holdingProjection.findMany({
    where: { portfolioId: { in: portfolioIds } },
    select: { assetClass: true, currentValue: true, totalCost: true },
  });
  const byClass = new Map<string, { value: Decimal; count: number }>();
  for (const h of rows) {
    const val = h.currentValue !== null ? toDecimal(h.currentValue) : toDecimal(h.totalCost);
    const entry = byClass.get(h.assetClass) ?? { value: new Decimal(0), count: 0 };
    entry.value = entry.value.plus(val);
    entry.count++;
    byClass.set(h.assetClass, entry);
  }
  const total = [...byClass.values()].reduce((s, e) => s.plus(e.value), new Decimal(0));
  return [...byClass.entries()].map(([assetClass, entry]) => ({
    assetClass,
    value: serializeMoney(entry.value) as Money,
    percent: total.greaterThan(0) ? entry.value.dividedBy(total).times(100).toNumber() : 0,
    holdingCount: entry.count,
  }));
}

export async function getGroupCashFlows(userId: string, groupId: string) {
  await ensureGroupOwnership(userId, groupId);
  const portfolioIds = await loadMemberPortfolioIds(groupId);
  if (portfolioIds.length === 0) return [];
  const flows = await prisma.cashFlow.findMany({
    where: { portfolioId: { in: portfolioIds } },
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

export async function getGroupHistoricalValuation(
  userId: string,
  groupId: string,
  days = 365,
) {
  await ensureGroupOwnership(userId, groupId);
  const portfolioIds = await loadMemberPortfolioIds(groupId);
  if (portfolioIds.length === 0) return [];

  const todayStr = new Date().toISOString().slice(0, 10);
  const allTransactions = await prisma.transaction.findMany({
    where: { portfolioId: { in: portfolioIds } },
    orderBy: { tradeDate: 'asc' },
    select: {
      tradeDate: true,
      assetKey: true,
      stockId: true,
      transactionType: true,
      quantity: true,
      netAmount: true,
      portfolioId: true,
    },
  });
  if (allTransactions.length === 0)
    return [] as Array<{ date: string; value: Money; invested: Money }>;

  const firstTxDate = allTransactions[0]!.tradeDate.toISOString().slice(0, 10);
  const windowStart =
    days === 0
      ? firstTxDate
      : new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10);
  const rangeStart = windowStart < firstTxDate ? firstTxDate : windowStart;

  const stockIds = [
    ...new Set(allTransactions.map((t) => t.stockId).filter((s): s is string => !!s)),
  ];

  if (stockIds.length > 0) {
    const fromDate = new Date(rangeStart);
    const existingCount = await prisma.stockPrice.count({
      where: { stockId: { in: stockIds }, date: { gte: fromDate } },
    });
    const minExpected = stockIds.length * days * 0.4;
    if (existingCount < minExpected) {
      const stocks = await prisma.stockMaster.findMany({
        where: { id: { in: stockIds } },
        select: { id: true, symbol: true, exchange: true },
      });
      await Promise.allSettled(
        stocks.map(async (s) => {
          try {
            const bars = await fetchHistorical(s.symbol, s.exchange, fromDate);
            if (bars.length === 0) return;
            await prisma.$transaction(
              bars.map((b) =>
                prisma.stockPrice.upsert({
                  where: { stockId_date: { stockId: s.id, date: b.date } },
                  update: {
                    open: b.open.toString(),
                    high: b.high.toString(),
                    low: b.low.toString(),
                    close: b.close.toString(),
                  },
                  create: {
                    stockId: s.id,
                    date: b.date,
                    open: b.open.toString(),
                    high: b.high.toString(),
                    low: b.low.toString(),
                    close: b.close.toString(),
                  },
                }),
              ),
            );
          } catch (err) {
            logger.warn({ err, symbol: s.symbol }, '[group] historical backfill failed');
          }
        }),
      );
    }
  }

  const allPrices = stockIds.length
    ? await prisma.stockPrice.findMany({
        where: { stockId: { in: stockIds } },
        select: { stockId: true, date: true, close: true },
        orderBy: [{ stockId: 'asc' }, { date: 'asc' }],
      })
    : [];
  const pricesByStock = new Map<string, Array<{ d: string; close: Decimal }>>();
  for (const p of allPrices) {
    if (!pricesByStock.has(p.stockId)) pricesByStock.set(p.stockId, []);
    pricesByStock.get(p.stockId)!.push({
      d: p.date.toISOString().slice(0, 10),
      close: toDecimal(p.close),
    });
  }
  function priceOnOrBefore(stockId: string, dateStr: string): Decimal | null {
    const arr = pricesByStock.get(stockId);
    if (!arr) return null;
    let best: Decimal | null = null;
    for (const p of arr) {
      if (p.d <= dateStr) best = p.close;
      else break;
    }
    return best;
  }

  const BUY_TYPES = new Set([
    'BUY',
    'SIP',
    'SWITCH_IN',
    'BONUS',
    'OPENING_BALANCE',
    'DIVIDEND_REINVEST',
    'MERGER_IN',
    'DEMERGER_IN',
    'RIGHTS_ISSUE',
  ]);

  // State keyed by (portfolioId, assetKey) — same asset in two member
  // portfolios is tracked separately so cost basis stays per-portfolio
  // (matches FIFO behavior elsewhere).
  const state = new Map<string, { qty: Decimal; cost: Decimal; stockId: string | null }>();
  let invested = new Decimal(0);
  const byDate = new Map<string, typeof allTransactions>();
  for (const tx of allTransactions) {
    const d = tx.tradeDate.toISOString().slice(0, 10);
    if (!byDate.has(d)) byDate.set(d, []);
    byDate.get(d)!.push(tx);
  }

  for (const [d, txns] of [...byDate.entries()].sort()) {
    if (d > rangeStart) break;
    for (const tx of txns) {
      const key = `${tx.portfolioId}|${tx.assetKey ?? `_${tx.stockId ?? d}`}`;
      const qty = toDecimal(tx.quantity);
      const net = toDecimal(tx.netAmount);
      const h = state.get(key) ?? {
        qty: new Decimal(0),
        cost: new Decimal(0),
        stockId: tx.stockId,
      };
      if (BUY_TYPES.has(tx.transactionType)) {
        h.qty = h.qty.plus(qty);
        h.cost = h.cost.plus(net);
        invested = invested.plus(net);
      } else {
        const prev = h.qty;
        h.qty = Decimal.max(new Decimal(0), h.qty.minus(qty));
        if (prev.greaterThan(0)) h.cost = h.cost.times(h.qty.dividedBy(prev));
      }
      state.set(key, h);
    }
  }

  function valueOn(dateStr: string): Decimal {
    let v = new Decimal(0);
    for (const h of state.values()) {
      if (h.qty.lte(0)) continue;
      const price = h.stockId ? priceOnOrBefore(h.stockId, dateStr) : null;
      v = v.plus(price ? h.qty.times(price) : h.cost);
    }
    return v;
  }

  const points: Array<{ date: string; value: Money; invested: Money }> = [];
  const cursor = new Date(rangeStart + 'T00:00:00Z');
  const end = new Date(todayStr + 'T00:00:00Z');
  while (cursor <= end) {
    const d = cursor.toISOString().slice(0, 10);
    for (const tx of byDate.get(d) ?? []) {
      const key = `${tx.portfolioId}|${tx.assetKey ?? `_${tx.stockId ?? d}`}`;
      const qty = toDecimal(tx.quantity);
      const net = toDecimal(tx.netAmount);
      const h = state.get(key) ?? {
        qty: new Decimal(0),
        cost: new Decimal(0),
        stockId: tx.stockId,
      };
      if (BUY_TYPES.has(tx.transactionType)) {
        h.qty = h.qty.plus(qty);
        h.cost = h.cost.plus(net);
        invested = invested.plus(net);
      } else {
        const prev = h.qty;
        h.qty = Decimal.max(new Decimal(0), h.qty.minus(qty));
        if (prev.greaterThan(0)) h.cost = h.cost.times(h.qty.dividedBy(prev));
      }
      state.set(key, h);
    }
    const value = valueOn(d);
    if (value.greaterThan(0) || invested.greaterThan(0)) {
      points.push({
        date: d,
        value: serializeMoney(value) as Money,
        invested: serializeMoney(invested) as Money,
      });
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  // Replace today with live HoldingProjection sum for accuracy
  const projections = await prisma.holdingProjection.findMany({
    where: { portfolioId: { in: portfolioIds } },
    select: { currentValue: true, totalCost: true },
  });
  const liveValue = projections.reduce(
    (s, h) => s.plus(toDecimal(h.currentValue ?? h.totalCost)),
    new Decimal(0),
  );
  const liveCost = projections.reduce(
    (s, h) => s.plus(toDecimal(h.totalCost)),
    new Decimal(0),
  );
  if (points.length > 0 && points[points.length - 1]!.date === todayStr) {
    points[points.length - 1] = {
      date: todayStr,
      value: serializeMoney(liveValue) as Money,
      invested: serializeMoney(liveCost) as Money,
    };
  } else if (liveValue.greaterThan(0)) {
    points.push({
      date: todayStr,
      value: serializeMoney(liveValue) as Money,
      invested: serializeMoney(liveCost) as Money,
    });
  }

  return points;
}
