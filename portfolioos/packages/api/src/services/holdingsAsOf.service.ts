import { Prisma, type AssetClass, type HoldingProjection, type Transaction } from '@prisma/client';
import { Decimal } from 'decimal.js';
import { prisma } from '../lib/prisma.js';
import { replayTransactions } from './holdingsProjection.js';
import { computeOpenLots, isCapitalAssetClass, loadFundCategoryMap } from './capitalGains.service.js';
import { getCryptoPriceAt } from '../priceFeeds/crypto.service.js';

export interface PriceMeta {
  assetClass: AssetClass;
  stockId: string | null;
  fundId: string | null;
  isin: string | null;
}

/** Closing price on or before `date` from the stored price history, or null. */
export async function priceAt(meta: PriceMeta, date: Date): Promise<Decimal | null> {
  if (meta.fundId) {
    const row = await prisma.mFNav.findFirst({
      where: { fundId: meta.fundId, date: { lte: date } },
      orderBy: { date: 'desc' },
    });
    return row ? new Decimal(row.nav.toString()) : null;
  }
  if (meta.stockId) {
    const row = await prisma.stockPrice.findFirst({
      where: { stockId: meta.stockId, date: { lte: date } },
      orderBy: { date: 'desc' },
    });
    return row ? new Decimal(row.close.toString()) : null;
  }
  if (meta.assetClass === 'CRYPTOCURRENCY' && meta.isin) {
    return getCryptoPriceAt(meta.isin, date);
  }
  return null;
}

export type HoldingAsOf = HoldingProjection & { portfolio: { name: string } };

const startOfUtcDay = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());

/** True when `asOf` is today or later, so the live projection is the answer. */
export function isCurrent(asOf: Date | undefined | null): boolean {
  return !asOf || startOfUtcDay(asOf) >= startOfUtcDay(new Date());
}

/**
 * Holdings as they stood at the end of `asOf`. For today (or no date) this is
 * the live projection. For a past date the positions are replayed from the
 * transactions traded on or before that date — the same replay the projection
 * uses — and valued at the last stored price on or before it; holdings with
 * no price history for that date are valued at cost.
 */
export async function holdingsAsOf(
  portfolioWhere: Prisma.PortfolioWhereInput,
  asOf?: Date | null,
  extraWhere: { assetClass?: AssetClass | { in: AssetClass[] }; stockId?: string; fundId?: string } = {},
): Promise<HoldingAsOf[]> {
  if (isCurrent(asOf)) {
    return prisma.holdingProjection.findMany({
      where: { portfolio: portfolioWhere, ...extraWhere },
      include: { portfolio: { select: { name: true } } },
    });
  }
  const cutoff = new Date(startOfUtcDay(asOf!) + 86_400_000 - 1);
  const txs = await prisma.transaction.findMany({
    where: { portfolio: portfolioWhere, tradeDate: { lte: cutoff }, ...extraWhere },
    include: { portfolio: { select: { name: true } } },
    orderBy: { tradeDate: 'asc' },
  });
  const groups = new Map<string, Array<Transaction & { portfolio: { name: string } }>>();
  for (const t of txs) {
    const k = `${t.portfolioId}|${t.assetKey ?? `name:${t.assetName ?? ''}`}`;
    const list = groups.get(k);
    if (list) list.push(t);
    else groups.set(k, [t]);
  }

  const out: HoldingAsOf[] = [];
  for (const [key, list] of groups) {
    const agg = replayTransactions(list);
    if (agg.quantity.lessThanOrEqualTo(0) && agg.totalCost.lessThanOrEqualTo(0)) continue;
    const first = list[0]!;
    const meta: PriceMeta = {
      assetClass: first.assetClass,
      stockId: list.find((t) => t.stockId)?.stockId ?? null,
      fundId: list.find((t) => t.fundId)?.fundId ?? null,
      isin: list.find((t) => t.isin)?.isin ?? null,
    };
    // Stored prices are in INR; a foreign-currency holding stays at its INR cost.
    const foreign = list.some((t) => {
      const c = (t as Transaction & { currency?: string | null }).currency;
      return !!c && c !== 'INR';
    });
    const price = !foreign && agg.quantity.greaterThan(0) ? await priceAt(meta, cutoff) : null;
    const value = price ? agg.quantity.times(price) : null;
    out.push({
      id: `asof:${key}`,
      portfolioId: first.portfolioId,
      portfolio: first.portfolio,
      assetKey: first.assetKey ?? `name:${first.assetName ?? ''}`,
      assetClass: first.assetClass,
      stockId: meta.stockId,
      fundId: meta.fundId,
      assetName: list[list.length - 1]!.assetName ?? first.assetName,
      isin: meta.isin,
      quantity: new Prisma.Decimal(agg.quantity),
      avgCostPrice: new Prisma.Decimal(agg.avgCostPrice),
      totalCost: new Prisma.Decimal(agg.totalCost),
      currentPrice: price ? new Prisma.Decimal(price) : null,
      currentValue: value ? new Prisma.Decimal(value) : null,
      unrealisedPnL: value ? new Prisma.Decimal(value.minus(agg.totalCost)) : null,
      realisedPnL: new Prisma.Decimal(agg.realisedPnL),
      priceAsOf: price ? cutoff : null,
      computedAt: cutoff,
      sourceTxCount: agg.sourceTxCount,
    });
  }
  return out;
}

/** Sort holdings by the given string fields, in order (nulls first). */
export function sortHoldings<T extends HoldingProjection>(
  rows: T[],
  keys: Array<'portfolioId' | 'assetClass' | 'assetName'>,
): T[] {
  return rows.sort((a, b) => {
    for (const k of keys) {
      const c = (a[k] ?? '').localeCompare(b[k] ?? '');
      if (c !== 0) return c;
    }
    return 0;
  });
}

/**
 * Acquisition date of each position still held, keyed `portfolioId|assetKey`:
 * the buy date of its oldest open FIFO lot, so a position sold out and bought
 * again later dates from the re-purchase. Assets outside the lot engine
 * (deposits, PF, insurance) date from the first buy since the position was
 * last fully closed. Pass transactions up to the cut-off.
 */
export async function acquisitionDates(txs: Transaction[]): Promise<Map<string, Date>> {
  const out = new Map<string, Date>();
  const keyOf = (t: Transaction) => `${t.portfolioId}|${t.assetKey ?? `name:${t.assetName ?? ''}`}`;
  const groups = new Map<string, Transaction[]>();
  for (const t of [...txs].sort((a, b) => a.tradeDate.getTime() - b.tradeDate.getTime())) {
    const list = groups.get(keyOf(t));
    if (list) list.push(t);
    else groups.set(keyOf(t), [t]);
  }
  const lots = computeOpenLots(txs, await loadFundCategoryMap(txs));
  for (const p of lots) {
    const oldest = p.lots.reduce<Date | null>((min, l) => (!min || l.buyDate < min ? l.buyDate : min), null);
    if (oldest) out.set(`${p.portfolioId}|${p.assetKey}`, oldest);
  }
  for (const [key, list] of groups) {
    if (out.has(key) || isCapitalAssetClass(list[0]!.assetClass)) continue;
    let since: Date | null = null;
    for (let i = 0; i < list.length; i++) {
      const held = replayTransactions(list.slice(0, i + 1)).quantity;
      if (held.lessThanOrEqualTo(0)) since = null;
      else if (!since) since = list[i]!.tradeDate;
    }
    if (since) out.set(key, since);
  }
  return out;
}
