import { Decimal } from 'decimal.js';
import type { AssetClass, Prisma, Transaction, TransactionType } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { routePriceLookup } from '../priceFeeds/router.service.js';
import { assetKeyFromTransaction } from './assetKey.js';
import { resolveMutualFundId, resolveStockMasterId } from './masterData.service.js';

const STOCK_ASSET_CLASSES: ReadonlySet<AssetClass> = new Set<AssetClass>([
  'EQUITY',
  'ETF',
]);

/**
 * F&O lives in `DerivativePosition` — a separate aggregate. WAVG cost
 * across multiple option strikes makes no sense (each contract is a
 * distinct instrument). Equity-style holdings projection skips these
 * outright; the F&O page reads from `DerivativePosition`.
 */
const SKIP_PROJECTION: ReadonlySet<AssetClass> = new Set<AssetClass>(['FUTURES', 'OPTIONS']);

// Post Office schemes where interest accrues (not paid out) — we compute
// compounded current value from principal + stored interestRate.
const PO_COMPOUNDING_CLASSES: ReadonlySet<AssetClass> = new Set<AssetClass>([
  'NSC', 'KVP', 'POST_OFFICE_TD', 'SSY', 'POST_OFFICE_RD',
]);

// Schemes within PO_COMPOUNDING_CLASSES that use quarterly compounding (not annual).
const PO_QUARTERLY_CLASSES: ReadonlySet<AssetClass> = new Set<AssetClass>([
  'POST_OFFICE_TD', 'POST_OFFICE_RD',
]);

// Post Office schemes where interest is paid out — principal stays constant,
// currentValue = totalCost.
const PO_PAYOUT_CLASSES: ReadonlySet<AssetClass> = new Set<AssetClass>([
  'SCSS', 'POST_OFFICE_MIS', 'POST_OFFICE_SAVINGS',
]);

/**
 * For PO compounding schemes: sum principal × (1 + r/100)^years for each
 * DEPOSIT/BUY that carries an interestRate. Caps at maturityDate if passed.
 * Returns null if no interest rates are recorded (will show invested only).
 */
function computePoAccruedValue(txs: Transaction[], assetClass: AssetClass): Decimal | null {
  const today = new Date();
  const deposits = txs.filter(
    (t) =>
      ['DEPOSIT', 'BUY', 'OPENING_BALANCE'].includes(t.transactionType) &&
      t.interestRate != null,
  );
  if (deposits.length === 0) return null;

  // Quarterly-compounding schemes: P × (1 + r/4)^(4t)
  // Annual-compounding schemes: P × (1 + r)^t
  const periodsPerYear = PO_QUARTERLY_CLASSES.has(assetClass) ? 4 : 1;

  let total = new Decimal(0);
  for (const dep of deposits) {
    const principal = new Decimal(dep.price.toString()).times(
      new Decimal(dep.quantity.toString()),
    );
    const annualRate = new Decimal(dep.interestRate!.toString()).div(100);
    const valuationDate = dep.maturityDate && dep.maturityDate < today
      ? dep.maturityDate
      : today;
    const yearsElapsed = new Decimal(
      (valuationDate.getTime() - dep.tradeDate.getTime()) /
      (365.25 * 24 * 60 * 60 * 1000),
    ).toDP(6);
    if (yearsElapsed.lte(0)) {
      total = total.plus(principal);
      continue;
    }
    const periodRate = annualRate.div(periodsPerYear);
    const periods = yearsElapsed.times(periodsPerYear);
    const factor = new Decimal(1).plus(periodRate).pow(periods);
    total = total.plus(principal.times(factor));
  }
  return total.isZero() ? null : total.toDP(4);
}

/**
 * If a projection / transaction landed with no master-data link but carries
 * an ISIN or exact name we can match against StockMaster / MutualFundMaster,
 * resolve it and return the patched ids. Used by the recompute + refresh
 * paths so price lookups stop returning null on legacy rows that were
 * entered without using the asset picker.
 */
async function resolveMasterIds(meta: {
  assetClass: AssetClass;
  stockId: string | null;
  fundId: string | null;
  isin: string | null;
  assetName: string | null;
}): Promise<{ stockId: string | null; fundId: string | null }> {
  if (STOCK_ASSET_CLASSES.has(meta.assetClass) && !meta.stockId) {
    const resolved = await resolveStockMasterId({
      isin: meta.isin,
      symbol: meta.assetName,
      assetName: meta.assetName,
    });
    return { stockId: resolved, fundId: meta.fundId };
  }
  if (meta.assetClass === 'MUTUAL_FUND' && !meta.fundId) {
    const resolved = await resolveMutualFundId({
      isin: meta.isin,
      schemeName: meta.assetName,
    });
    return { stockId: meta.stockId, fundId: resolved };
  }
  return { stockId: meta.stockId, fundId: meta.fundId };
}

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
  'DEPOSIT',
]);

const SELL_TYPES = new Set<TransactionType>([
  'SELL',
  'SWITCH_OUT',
  'MERGER_OUT',
  'DEMERGER_OUT',
  'REDEMPTION',
  'MATURITY',
  'WITHDRAWAL',
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

  // F&O — delegate to the derivative-position aggregate (separate model).
  // Removing any HoldingProjection row that may exist as a stale legacy
  // artefact is harmless here.
  if (SKIP_PROJECTION.has(meta.assetClass)) {
    await prisma.holdingProjection.deleteMany({ where: { portfolioId, assetKey } });
    const { recomputeDerivativePosition } = await import('./derivativePosition.service.js');
    await recomputeDerivativePosition(portfolioId, assetKey);
    return;
  }

  const agg = replayTransactions(meta.txs);

  if (agg.quantity.isZero() || agg.quantity.isNegative()) {
    await prisma.holdingProjection.deleteMany({
      where: { portfolioId, assetKey },
    });
    return;
  }

  const resolved = await resolveMasterIds({
    assetClass: meta.assetClass,
    stockId: meta.stockId,
    fundId: meta.fundId,
    isin: meta.isin,
    assetName: meta.assetName,
  });

  let price: Decimal | null = null;
  let currentValue: Decimal | null = null;

  if (PO_COMPOUNDING_CLASSES.has(meta.assetClass)) {
    // Compute accrued value from stored interest rates; no market price feed.
    currentValue = computePoAccruedValue(meta.txs, meta.assetClass);
  } else if (PO_PAYOUT_CLASSES.has(meta.assetClass)) {
    // Interest paid out — principal unchanged; show invested as current value.
    currentValue = agg.totalCost;
  } else {
    price = await currentPriceFor({
      assetClass: meta.assetClass,
      stockId: resolved.stockId,
      fundId: resolved.fundId,
    });
    currentValue = price ? agg.quantity.times(price) : null;
  }

  const unrealisedPnL = currentValue ? currentValue.minus(agg.totalCost) : null;

  const data: Prisma.HoldingProjectionUncheckedCreateInput = {
    portfolioId,
    assetKey,
    assetClass: meta.assetClass,
    stockId: resolved.stockId,
    fundId: resolved.fundId,
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
  isin: string | null;
  assetName: string | null;
  quantity: Prisma.Decimal;
  totalCost: Prisma.Decimal;
}>): Promise<number> {
  let updated = 0;
  for (const row of rows) {
    // Legacy rows may have null stockId/fundId — try to re-link via
    // ISIN/name before asking the price router. If we succeed, stamp the
    // resolved id back onto the projection so future refreshes skip the
    // lookup and the /holdings endpoint can join to StockMaster for the
    // symbol display on the Stocks page.
    const resolved = await resolveMasterIds({
      assetClass: row.assetClass,
      stockId: row.stockId,
      fundId: row.fundId,
      isin: row.isin,
      assetName: row.assetName,
    });
    const price = await currentPriceFor({
      assetClass: row.assetClass,
      stockId: resolved.stockId,
      fundId: resolved.fundId,
    });
    const patch: Prisma.HoldingProjectionUpdateInput = { computedAt: new Date() };
    let didPatch = false;
    if (resolved.stockId !== row.stockId) {
      patch.stockId = resolved.stockId;
      didPatch = true;
    }
    if (resolved.fundId !== row.fundId) {
      patch.fundId = resolved.fundId;
      didPatch = true;
    }
    if (price) {
      const qty = new Decimal(row.quantity.toString());
      const totalCost = new Decimal(row.totalCost.toString());
      const currentValue = qty.times(price);
      const pnl = currentValue.minus(totalCost);
      patch.currentPrice = price.toString();
      patch.currentValue = currentValue.toString();
      patch.unrealisedPnL = pnl.toString();
      didPatch = true;
    }
    if (!didPatch) continue;
    await prisma.holdingProjection.update({ where: { id: row.id }, data: patch });
    if (price) updated += 1;
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
      isin: true,
      assetName: true,
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
      isin: true,
      assetName: true,
      quantity: true,
      totalCost: true,
    },
  });
  return { updated: await refreshPricesForRows(rows) };
}
