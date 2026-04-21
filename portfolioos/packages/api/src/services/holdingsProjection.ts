import { Decimal } from 'decimal.js';
import type { AssetClass, Prisma, Transaction, TransactionType } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { routePriceLookup } from '../priceFeeds/router.service.js';
import { assetKeyFromTransaction } from './assetKey.js';

/**
 * HoldingProjection is the source of truth for portfolio state (§3.1). It is
 * computed from Transaction (and, in the future, CorporateAction) — never
 * mutated directly from outside this file. Every caller that wants to change
 * a portfolio's holdings must edit the underlying Transaction, then call
 * `recomputeForAsset` — this is what prevents the class of silent-drift bugs
 * listed under BUG-002.
 */

const BUY_TYPES = new Set<TransactionType>([
  'BUY',
  'SWITCH_IN',
  'SIP',
  'BONUS',
  'MERGER_IN',
  'DEMERGER_IN',
  'RIGHTS_ISSUE',
  'DIVIDEND_REINVEST',
  'OPENING_BALANCE',
]);

const SELL_TYPES = new Set<TransactionType>([
  'SELL',
  'SWITCH_OUT',
  'MERGER_OUT',
  'DEMERGER_OUT',
  'REDEMPTION',
  'MATURITY',
]);

export interface ProjectionAggregate {
  quantity: Decimal;
  totalCost: Decimal;
  avgCostPrice: Decimal;
  realisedPnL: Decimal;
  sourceTxCount: number;
}

/**
 * Replay a set of transactions under a weighted-average cost model. (The
 * separate FIFO-based CapitalGain computation lives in `capitalGains.service`
 * — this function cares only about the ending holding state, not the lot-by-
 * lot matching used for tax reports.) Returns zero quantity + zero cost once
 * cumulative SELLs have cleared the position.
 */
export function replayTransactions(txs: Transaction[]): ProjectionAggregate {
  let quantity = new Decimal(0);
  let totalCost = new Decimal(0);
  let realisedPnL = new Decimal(0);

  const sorted = [...txs].sort(
    (a, b) => a.tradeDate.getTime() - b.tradeDate.getTime(),
  );

  for (const tx of sorted) {
    const qty = new Decimal(tx.quantity.toString());
    const net = new Decimal(tx.netAmount.toString());

    if (BUY_TYPES.has(tx.transactionType)) {
      if (tx.transactionType === 'BONUS') {
        // Bonus shares land at zero cost — qty goes up, cost stays.
        quantity = quantity.plus(qty);
      } else {
        quantity = quantity.plus(qty);
        totalCost = totalCost.plus(net);
      }
    } else if (SELL_TYPES.has(tx.transactionType)) {
      if (quantity.isZero()) continue;
      const sellQty = Decimal.min(qty, quantity);
      const avgCost = totalCost.dividedBy(quantity);
      const costSold = avgCost.times(sellQty);
      realisedPnL = realisedPnL.plus(net.minus(costSold));
      quantity = quantity.minus(sellQty);
      totalCost = totalCost.minus(costSold);
      if (quantity.isZero() || quantity.isNegative()) {
        quantity = new Decimal(0);
        totalCost = new Decimal(0);
      }
    } else if (tx.transactionType === 'SPLIT') {
      // SPLIT rows carry the *post-split* delta-quantity (e.g. +10 units on a
      // 1:2 split of 10). Cost basis is unchanged; only qty grows.
      quantity = quantity.plus(qty);
    }
  }

  const avgCostPrice = quantity.isZero()
    ? new Decimal(0)
    : totalCost.dividedBy(quantity);

  return {
    quantity,
    totalCost,
    avgCostPrice,
    realisedPnL,
    sourceTxCount: sorted.length,
  };
}

interface AssetScope {
  portfolioId: string;
  assetKey: string;
}

/**
 * Look up the "representative" metadata for an (portfolioId, assetKey) group
 * from its transactions: assetClass / stockId / fundId / isin / assetName.
 * These fields need to move with the projection row so that API responses
 * can render the name and the price router can tell a stock from a bond.
 */
async function loadAssetMetadata(scope: AssetScope): Promise<{
  txs: Transaction[];
  assetClass: AssetClass | null;
  stockId: string | null;
  fundId: string | null;
  isin: string | null;
  assetName: string | null;
}> {
  const txs = await prisma.transaction.findMany({
    where: { portfolioId: scope.portfolioId, assetKey: scope.assetKey },
    orderBy: { tradeDate: 'asc' },
  });
  const first = txs[0] ?? null;
  return {
    txs,
    assetClass: first?.assetClass ?? null,
    stockId: first?.stockId ?? null,
    fundId: first?.fundId ?? null,
    isin: first?.isin ?? null,
    assetName: first?.assetName ?? null,
  };
}

async function currentPriceFor(opts: {
  assetClass: AssetClass;
  stockId: string | null;
  fundId: string | null;
}): Promise<Decimal | null> {
  return routePriceLookup({
    assetClass: opts.assetClass,
    stockId: opts.stockId,
    fundId: opts.fundId,
  });
}

/**
 * Recompute the HoldingProjection row for a single asset. Upserts on
 * (portfolioId, assetKey). If the ending quantity is zero, the row is
 * deleted — that way empty holdings don't clutter dashboard lists.
 */
export async function recomputeForAsset(
  portfolioId: string,
  assetKey: string,
): Promise<void> {
  const meta = await loadAssetMetadata({ portfolioId, assetKey });

  if (meta.txs.length === 0 || !meta.assetClass) {
    await prisma.holdingProjection.deleteMany({
      where: { portfolioId, assetKey },
    });
    return;
  }

  const agg = replayTransactions(meta.txs);

  if (agg.quantity.isZero() || agg.quantity.isNegative()) {
    await prisma.holdingProjection.deleteMany({
      where: { portfolioId, assetKey },
    });
    return;
  }

  const price = await currentPriceFor({
    assetClass: meta.assetClass,
    stockId: meta.stockId,
    fundId: meta.fundId,
  });
  const currentValue = price ? agg.quantity.times(price) : null;
  const unrealisedPnL = currentValue ? currentValue.minus(agg.totalCost) : null;

  const data: Prisma.HoldingProjectionUncheckedCreateInput = {
    portfolioId,
    assetKey,
    assetClass: meta.assetClass,
    stockId: meta.stockId,
    fundId: meta.fundId,
    assetName: meta.assetName,
    isin: meta.isin,
    quantity: agg.quantity.toString(),
    avgCostPrice: agg.avgCostPrice.toString(),
    totalCost: agg.totalCost.toString(),
    currentPrice: price ? price.toString() : null,
    currentValue: currentValue ? currentValue.toString() : null,
    unrealisedPnL: unrealisedPnL ? unrealisedPnL.toString() : null,
    realisedPnL: agg.realisedPnL.toString(),
    sourceTxCount: agg.sourceTxCount,
    computedAt: new Date(),
  };

  await prisma.holdingProjection.upsert({
    where: { portfolioId_assetKey: { portfolioId, assetKey } },
    update: {
      assetClass: data.assetClass,
      stockId: data.stockId,
      fundId: data.fundId,
      assetName: data.assetName,
      isin: data.isin,
      quantity: data.quantity,
      avgCostPrice: data.avgCostPrice,
      totalCost: data.totalCost,
      currentPrice: data.currentPrice,
      currentValue: data.currentValue,
      unrealisedPnL: data.unrealisedPnL,
      realisedPnL: data.realisedPnL,
      sourceTxCount: data.sourceTxCount,
      computedAt: data.computedAt,
    },
    create: data,
  });
}

export async function recomputeForTransaction(tx: Transaction): Promise<void> {
  const key = tx.assetKey ?? assetKeyFromTransaction(tx);
  await recomputeForAsset(tx.portfolioId, key);
}

export async function recomputeForPortfolio(portfolioId: string): Promise<void> {
  const keys = await prisma.transaction.findMany({
    where: { portfolioId },
    select: { assetKey: true },
    distinct: ['assetKey'],
  });
  for (const { assetKey } of keys) {
    if (!assetKey) continue;
    await recomputeForAsset(portfolioId, assetKey);
  }
}

/**
 * One-shot replay across every portfolio. Used for the §4.10 step 5 parity
 * check after the phase 4.5 migration and for any future "blow away, rebuild"
 * operation. Safe to re-run — each asset's row is upserted.
 */
export async function recomputeAllPortfolios(): Promise<{
  portfolios: number;
  assets: number;
}> {
  const portfolios = await prisma.portfolio.findMany({ select: { id: true } });
  let assets = 0;
  for (const p of portfolios) {
    const keys = await prisma.transaction.findMany({
      where: { portfolioId: p.id },
      select: { assetKey: true },
      distinct: ['assetKey'],
    });
    for (const { assetKey } of keys) {
      if (!assetKey) continue;
      await recomputeForAsset(p.id, assetKey);
      assets += 1;
    }
  }
  return { portfolios: portfolios.length, assets };
}

/**
 * Refresh market prices on an existing projection row without replaying FIFO.
 * The scheduler calls this a few times a day — the hot path must not re-sum
 * thousands of transactions just to update a single currentValue.
 */
async function refreshPricesForRows(rows: Array<{
  id: string;
  assetClass: AssetClass;
  stockId: string | null;
  fundId: string | null;
  quantity: Prisma.Decimal;
  totalCost: Prisma.Decimal;
}>): Promise<number> {
  let updated = 0;
  for (const row of rows) {
    const price = await currentPriceFor({
      assetClass: row.assetClass,
      stockId: row.stockId,
      fundId: row.fundId,
    });
    if (!price) continue;
    const qty = new Decimal(row.quantity.toString());
    const totalCost = new Decimal(row.totalCost.toString());
    const currentValue = qty.times(price);
    const pnl = currentValue.minus(totalCost);
    await prisma.holdingProjection.update({
      where: { id: row.id },
      data: {
        currentPrice: price.toString(),
        currentValue: currentValue.toString(),
        unrealisedPnL: pnl.toString(),
        computedAt: new Date(),
      },
    });
    updated += 1;
  }
  return updated;
}

export async function refreshAllProjectionPrices(): Promise<{ updated: number }> {
  const rows = await prisma.holdingProjection.findMany({
    select: {
      id: true,
      assetClass: true,
      stockId: true,
      fundId: true,
      quantity: true,
      totalCost: true,
    },
  });
  return { updated: await refreshPricesForRows(rows) };
}

export async function refreshPortfolioProjectionPrices(
  portfolioId: string,
): Promise<{ updated: number }> {
  const rows = await prisma.holdingProjection.findMany({
    where: { portfolioId },
    select: {
      id: true,
      assetClass: true,
      stockId: true,
      fundId: true,
      quantity: true,
      totalCost: true,
    },
  });
  return { updated: await refreshPricesForRows(rows) };
}
