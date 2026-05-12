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
import { logger } from '../lib/logger.js';
import { ForbiddenError, NotFoundError } from '../lib/errors.js';
import { fetchHistorical, buildYahooSymbol } from '../priceFeeds/yahoo.service.js';

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

  // Aggregate current value per portfolio in one query
  const portfolioIds = rows.map((p) => p.id);
  const holdingValues = portfolioIds.length > 0
    ? await prisma.holdingProjection.findMany({
        where: { portfolioId: { in: portfolioIds } },
        select: { portfolioId: true, currentValue: true, totalCost: true },
      })
    : [];

  const valueByPortfolio = new Map<string, Decimal>();
  for (const h of holdingValues) {
    const prev = valueByPortfolio.get(h.portfolioId) ?? new Decimal(0);
    // Use currentValue if available, else fall back to cost (FDs, bonds, gold, etc.)
    const effective = h.currentValue !== null ? toDecimal(h.currentValue) : toDecimal(h.totalCost);
    valueByPortfolio.set(h.portfolioId, prev.plus(effective));
  }

  return rows.map((p) => ({
    ...toPortfolioDTO(p),
    holdingCount: p._count.holdingProjections,
    transactionCount: p._count.transactions,
    currentValue: serializeMoney(valueByPortfolio.get(p.id) ?? new Decimal(0)),
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
  const [rows, holdingCount] = await Promise.all([
    prisma.holdingProjection.findMany({
      where: { portfolioId: id },
      select: {
        totalCost: true,
        currentValue: true,
        unrealisedPnL: true,
        quantity: true,
        stockId: true,
      },
    }),
    prisma.holdingProjection.count({ where: { portfolioId: id } }),
  ]);

  const holdings = rows.filter((h) => h.stockId);

  const totalInvestment = rows.reduce((s, h) => s.plus(toDecimal(h.totalCost)), new Decimal(0));
  // For assets without a live price (FD, Gold, Bonds, EPF, PPF…) use totalCost
  // as current value — they're worth at least what was invested until repriced.
  const currentValue = rows.reduce((s, h) => {
    const cv = h.currentValue !== null ? toDecimal(h.currentValue) : toDecimal(h.totalCost);
    return s.plus(cv);
  }, new Decimal(0));
  const unrealisedPnL = currentValue.minus(totalInvestment);
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
  // groupBy + _sum skips NULL currentValue rows — so we fetch all rows and
  // sum in JS using totalCost as fallback for unpriced assets.
  const rows = await prisma.holdingProjection.findMany({
    where: { portfolioId: id },
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

export async function getHistoricalValuation(
  userId: string,
  id: string,
  days = 365,
) {
  await ensureOwnership(userId, id);

  const todayStr = new Date().toISOString().slice(0, 10);
  const allTransactions = await prisma.transaction.findMany({
    where: { portfolioId: id },
    orderBy: { tradeDate: 'asc' },
    select: { tradeDate: true, assetKey: true, stockId: true, transactionType: true, quantity: true, netAmount: true },
  });
  if (allTransactions.length === 0) return [] as Array<{ date: string; value: Money; invested: Money }>;

  const firstTxDate = allTransactions[0]!.tradeDate.toISOString().slice(0, 10);
  const windowStart = days === 0
    ? firstTxDate
    : new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10);
  const rangeStart = windowStart < firstTxDate ? firstTxDate : windowStart;

  // Unique stocks held in this portfolio
  const stockIds = [...new Set(allTransactions.map((t) => t.stockId).filter((s): s is string => !!s))];

  // Backfill Yahoo historical prices for stocks that lack data in the window
  if (stockIds.length > 0) {
    const fromDate = new Date(rangeStart);
    const existingCount = await prisma.stockPrice.count({
      where: { stockId: { in: stockIds }, date: { gte: fromDate } },
    });
    // If we have fewer rows than (stocks × days × 0.5), assume we need a backfill
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
                  update: { open: b.open.toString(), high: b.high.toString(), low: b.low.toString(), close: b.close.toString() },
                  create: { stockId: s.id, date: b.date, open: b.open.toString(), high: b.high.toString(), low: b.low.toString(), close: b.close.toString() },
                }),
              ),
            );
          } catch (err) {
            logger.warn({ err, symbol: s.symbol }, '[portfolio] historical backfill failed');
          }
        }),
      );
    }
  }

  // Load prices from DB
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
    pricesByStock.get(p.stockId)!.push({ d: p.date.toISOString().slice(0, 10), close: toDecimal(p.close) });
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

  // Must mirror BUY_TYPES / SELL_TYPES in holdingsProjection.ts so historical
  // replay produces the same per-asset state as the live projection. Notably
  // DEPOSIT (FDs, EPF, insurance, salary slips) is a buy; MATURITY/REDEMPTION/
  // WITHDRAWAL close out positions. Anything else (DIVIDEND_PAYOUT,
  // INTEREST_RECEIVED, SPLIT) is handled below or ignored for valuation.
  const BUY_TYPES = new Set([
    'BUY','SIP','SWITCH_IN','BONUS','OPENING_BALANCE','DIVIDEND_REINVEST',
    'MERGER_IN','DEMERGER_IN','RIGHTS_ISSUE','DEPOSIT',
  ]);
  const SELL_TYPES = new Set([
    'SELL','SWITCH_OUT','MERGER_OUT','DEMERGER_OUT','REDEMPTION','MATURITY','WITHDRAWAL',
  ]);

  type HoldingState = { qty: Decimal; cost: Decimal; stockId: string | null };

  function applyTx(state: Map<string, HoldingState>, tx: typeof allTransactions[number]): void {
    const d = tx.tradeDate.toISOString().slice(0, 10);
    const key = tx.assetKey ?? `_${tx.stockId ?? d}`;
    const qty = toDecimal(tx.quantity);
    const net = toDecimal(tx.netAmount);
    const h = state.get(key) ?? { qty: new Decimal(0), cost: new Decimal(0), stockId: tx.stockId };

    if (BUY_TYPES.has(tx.transactionType)) {
      if (tx.transactionType === 'BONUS') {
        h.qty = h.qty.plus(qty);
      } else {
        h.qty = h.qty.plus(qty);
        h.cost = h.cost.plus(net);
        invested = invested.plus(net);
      }
    } else if (SELL_TYPES.has(tx.transactionType)) {
      if (h.qty.isZero()) {
        // Position already closed; matched cost basis already removed. Ignore.
        state.set(key, h);
        return;
      }
      const sellQty = Decimal.min(qty, h.qty);
      const avgCost = h.cost.dividedBy(h.qty);
      const costSold = avgCost.times(sellQty);
      h.qty = h.qty.minus(sellQty);
      h.cost = h.cost.minus(costSold);
      if (h.qty.isZero() || h.qty.isNegative()) {
        h.qty = new Decimal(0);
        h.cost = new Decimal(0);
      }
    } else if (tx.transactionType === 'SPLIT') {
      // SPLIT rows carry post-split delta-quantity; cost unchanged.
      h.qty = h.qty.plus(qty);
    }
    // DIVIDEND_PAYOUT / INTEREST_RECEIVED don't affect qty/cost.

    state.set(key, h);
  }

  // Apply all transactions up to windowStart to get the starting state
  const state = new Map<string, HoldingState>();
  let invested = new Decimal(0);
  const byDate = new Map<string, typeof allTransactions>();
  for (const tx of allTransactions) {
    const d = tx.tradeDate.toISOString().slice(0, 10);
    if (!byDate.has(d)) byDate.set(d, []);
    byDate.get(d)!.push(tx);
  }

  // Apply transactions STRICTLY before window start as the opening baseline.
  // Transactions on rangeStart itself get applied below in the per-day loop;
  // applying them here too would double-count (invested 2×, state inflated).
  for (const [d, txns] of [...byDate.entries()].sort()) {
    if (d >= rangeStart) break;
    for (const tx of txns) applyTx(state, tx);
  }

  // Generate daily samples from rangeStart to today
  function portfolioValueOn(dateStr: string): Decimal {
    let v = new Decimal(0);
    for (const h of state.values()) {
      // Skip truly closed positions (both qty and cost zero). For non-tradable
      // assets (FDs, insurance, real estate) qty may be 0 with cost > 0, or
      // qty equals principal — either way `cost` carries the invested value
      // and `priceOnOrBefore` will return null since stockId is null.
      if (h.qty.lte(0) && h.cost.lte(0)) continue;
      const price = h.stockId && h.qty.gt(0) ? priceOnOrBefore(h.stockId, dateStr) : null;
      v = v.plus(price ? h.qty.times(price) : h.cost);
    }
    return v;
  }

  const points: Array<{ date: string; value: Money; invested: Money }> = [];
  const cursor = new Date(rangeStart + 'T00:00:00Z');
  const end = new Date(todayStr + 'T00:00:00Z');

  while (cursor <= end) {
    const d = cursor.toISOString().slice(0, 10);

    // Apply any transactions on this date
    for (const tx of byDate.get(d) ?? []) applyTx(state, tx);

    const value = portfolioValueOn(d);
    // Only emit if we have a meaningful value (skip zero-value pre-investment days)
    if (value.greaterThan(0) || invested.greaterThan(0)) {
      points.push({
        date: d,
        value: serializeMoney(value) as Money,
        invested: serializeMoney(invested) as Money,
      });
    }

    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  // Overlay today's point with live HoldingProjection market value (most
  // accurate snapshot — picks up intraday price moves the historical
  // StockPrice table hasn't seen yet). Critically, do NOT replace `invested`
  // from HoldingProjection.totalCost: that field is the cost basis of
  // remaining holdings (drops on every SELL), while `invested` here means
  // cumulative gross outflow. Conflating them caused the chart to "drop to
  // zero" after the last sell. Reuse the prior cumulative `invested` instead.
  if (points.length > 0) {
    const projections = await prisma.holdingProjection.findMany({
      where: { portfolioId: id },
      select: { currentValue: true, totalCost: true },
    });
    const liveValue = projections.reduce(
      (s, h) => s.plus(toDecimal(h.currentValue ?? h.totalCost)),
      new Decimal(0),
    );
    const last = points[points.length - 1]!;
    if (last.date === todayStr) {
      // Keep last.invested (cumulative); refresh only value.
      points[points.length - 1] = {
        date: todayStr,
        value: serializeMoney(liveValue) as Money,
        invested: last.invested,
      };
    } else if (liveValue.greaterThan(0)) {
      // Append today using the carried-forward cumulative `invested`.
      points.push({
        date: todayStr,
        value: serializeMoney(liveValue) as Money,
        invested: last.invested,
      });
    }
  }

  return points;
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
