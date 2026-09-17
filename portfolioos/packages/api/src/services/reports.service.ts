import { Decimal } from 'decimal.js';
import type { AssetClass } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { investmentIncome } from './investmentIncome.service.js';
import {
  computePortfolioCapitalGains,
  computeUserCapitalGains,
  type CapitalGainRow,
} from './capitalGains.service.js';
import {
  computePortfolioXirr,
  computeRollingXirr,
  computeUserRollingXirr,
  computeUserXirr,
} from './xirr.service.js';
import { priceAt } from './holdingsAsOf.service.js';
import { replayTransactions } from './holdingsProjection.js';
import { grandfatheredCost } from './specialReports.service.js';
import { listedEquityLtcgExemptionFor } from '@everypaisa/shared';
import { computeCapitalGainsTax } from './taxComputation.js';

async function listUserPortfolioIds(userId: string): Promise<string[]> {
  const ps = await prisma.portfolio.findMany({ where: { userId }, select: { id: true } });
  return ps.map((p) => p.id);
}

// ─── Capital gains reports ─────────────────────────────────────────

export interface CapitalGainsFilter {
  financialYear?: string; // e.g. '2024-25'
  type?: 'INTRADAY' | 'SHORT_TERM' | 'LONG_TERM';
}

function filterRows(rows: CapitalGainRow[], filter: CapitalGainsFilter): CapitalGainRow[] {
  return rows.filter((r) => {
    if (filter.financialYear && r.financialYear !== filter.financialYear) return false;
    if (filter.type && r.capitalGainType !== filter.type) return false;
    return true;
  });
}

export async function intradayReport(portfolioId: string, fy?: string) {
  const { rows } = await computePortfolioCapitalGains(portfolioId);
  const filtered = filterRows(rows, { financialYear: fy, type: 'INTRADAY' });
  const totalGain = filtered.reduce(
    (acc, r) => acc.plus(r.gainLoss),
    new Decimal(0),
  );
  return { rows: filtered, totalGain: totalGain.toString(), count: filtered.length };
}

export async function stcgReport(portfolioId: string, fy?: string) {
  const { rows } = await computePortfolioCapitalGains(portfolioId);
  const filtered = filterRows(rows, { financialYear: fy, type: 'SHORT_TERM' });
  const totalGain = filtered.reduce((acc, r) => acc.plus(r.gainLoss), new Decimal(0));
  const taxable = filtered.reduce((acc, r) => acc.plus(r.taxableGain), new Decimal(0));
  return {
    rows: filtered,
    totalGain: totalGain.toString(),
    taxable: taxable.toString(),
    count: filtered.length,
  };
}

export async function ltcgReport(portfolioId: string, fy?: string) {
  const { rows } = await computePortfolioCapitalGains(portfolioId);
  const filtered = filterRows(rows, { financialYear: fy, type: 'LONG_TERM' });
  const totalGain = filtered.reduce((acc, r) => acc.plus(r.gainLoss), new Decimal(0));
  const taxable = filtered.reduce((acc, r) => acc.plus(r.taxableGain), new Decimal(0));
  return {
    rows: filtered,
    totalGain: totalGain.toString(),
    taxable: taxable.toString(),
    count: filtered.length,
  };
}

/**
 * Schedule 112A — long-term gains on 112A assets. Each row's gain is at the
 * grandfathered cost the engine applied; totals get each FY's own exemption
 * and transfer-date rates (taxComputation), so multi-year views are right too.
 */
function schedule112AFromRows(rows: CapitalGainRow[], fy?: string) {
  const filtered = rows.filter(
    (r) => (!fy || r.financialYear === fy) && r.capitalGainType === 'LONG_TERM' && r.isEquityOriented,
  );
  const adjusted = filtered.map((r) => {
    const costOfAcquisition = grandfatheredCost(r) ?? r.buyAmount;
    return { ...r, costOfAcquisition, gainLoss: r.sellAmount.minus(costOfAcquisition) };
  });
  const perFy = [...new Set(filtered.map((r) => r.financialYear))].map((y) => computeCapitalGainsTax(filtered, y));
  const sum = (pick: (t: (typeof perFy)[number]) => Decimal) =>
    perFy.reduce((acc, t) => acc.plus(pick(t)), new Decimal(0));
  return {
    rows: adjusted,
    totalGain: sum((t) => t.s112A.gain).toString(),
    exemptionLimit: perFy
      .reduce((acc, t) => acc.plus(listedEquityLtcgExemptionFor(t.financialYear)), new Decimal(0))
      .toString(),
    taxable: sum((t) => t.s112A.taxable).toString(),
    count: adjusted.length,
  };
}

/**
 * Schedule 112A — LTCG from equity/equity MFs. Applies Section 112A ₹1L
 * threshold; amount above is taxed at 10% (12.5% post-Jul-2024).
 */
export async function schedule112AReport(portfolioId: string, fy?: string) {
  const { rows } = await computePortfolioCapitalGains(portfolioId);
  return schedule112AFromRows(rows, fy);
}

// ─── Income report (dividends + interest) ───────────────────────────

export async function incomeReport(portfolioId: string, fy?: string) {
  return investmentIncome({ id: portfolioId }, fy);
}

// ─── Unrealised P&L (current holdings snapshot) ─────────────────────

export async function unrealisedReport(portfolioId: string) {
  const holdings = await prisma.holdingProjection.findMany({
    where: { portfolioId },
    orderBy: { computedAt: 'desc' },
  });

  let totalCost = new Decimal(0);
  let totalValue = new Decimal(0);
  const rows = holdings.map((h) => {
    const cost = new Decimal(h.totalCost.toString());
    // Unpriced holdings are carried at cost (as on the dashboard), not at 0.
    const value = h.currentValue ? new Decimal(h.currentValue.toString()) : new Decimal(h.totalCost.toString());
    totalCost = totalCost.plus(cost);
    totalValue = totalValue.plus(value);
    const pnl = value.minus(cost);
    const pct = cost.isZero() ? '0' : pnl.dividedBy(cost).times(100).toFixed(2);
    return {
      id: h.id,
      assetClass: h.assetClass,
      assetName: h.assetName,
      isin: h.isin,
      quantity: h.quantity.toString(),
      avgCostPrice: h.avgCostPrice.toString(),
      currentPrice: h.currentPrice?.toString() ?? null,
      totalCost: cost.toString(),
      currentValue: value.toString(),
      unrealisedPnL: pnl.toString(),
      pctReturn: pct,
    };
  });
  const totalPnl = totalValue.minus(totalCost);
  return {
    rows,
    totalCost: totalCost.toString(),
    totalValue: totalValue.toString(),
    unrealisedPnL: totalPnl.toString(),
    count: rows.length,
  };
}

// ─── Historical valuation (transaction-date snapshots) ─────────────

export interface HistoricalValuationPoint {
  date: Date;
  cost: string;
  value: string;
  holdings: number;
  /**
   * Per-holding quantity and snapshot price. Only present when requested with
   * `{ positions: true }`; used to derive per-asset-class returns without
   * re-running the valuation.
   */
  positions?: HistoricalPosition[];
  /**
   * Holdings whose quantity changed by a corporate action (split, bonus,
   * merger, demerger) since the previous snapshot. A period return computed
   * across one of these would read the share-count change as a price move.
   */
  corporateActionKeys?: string[];
}

export interface HistoricalPosition {
  key: string;
  assetClass: AssetClass;
  quantity: string;
  /** Historical price at the snapshot, or null when no price feed covers it. */
  price: string | null;
}

const CORPORATE_ACTION_TYPES = new Set([
  'SPLIT', 'BONUS', 'MERGER_IN', 'MERGER_OUT', 'DEMERGER_IN', 'DEMERGER_OUT',
]);

export async function historicalValuation(
  portfolioId: string,
  granularity: 'MONTHLY' | 'QUARTERLY' = 'MONTHLY',
  opts: { positions?: boolean } = {},
): Promise<{ points: HistoricalValuationPoint[] }> {
  const txs = await prisma.transaction.findMany({
    where: { portfolioId },
    orderBy: { tradeDate: 'asc' },
  });
  if (txs.length === 0) return { points: [] };

  const start = txs[0]!.tradeDate;
  const end = new Date();

  const snapshotDates: Date[] = [];
  const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
  const step = granularity === 'MONTHLY' ? 1 : 3;
  while (cursor <= end) {
    // End of cursor month
    const snap = new Date(
      Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + step, 0),
    );
    snapshotDates.push(snap);
    cursor.setUTCMonth(cursor.getUTCMonth() + step);
  }

  // Each snapshot replays every holding (keyed by its own assetKey) through
  // the projection's replay, so cost is INR and splits, bonuses and exits match
  // the live holdings. Value = quantity × stored price on that date, else cost.
  const byAsset = new Map<string, typeof txs>();
  for (const t of txs) {
    const key = t.assetKey ?? `name:${t.assetName ?? ''}`;
    const list = byAsset.get(key);
    if (list) list.push(t);
    else byAsset.set(key, [t]);
  }

  const points: HistoricalValuationPoint[] = [];

  // Tracked across snapshots so a corporate action is attributed to the period
  // it happened in, not to every snapshot after it.
  let previousSnap: Date | null = null;
  for (const snap of snapshotDates) {
    const endOfSnap = new Date(snap.getTime() + 86_400_000 - 1);
    const positions: HistoricalPosition[] = [];
    const corporateActionKeys = new Set<string>();
    let totalCost = new Decimal(0);
    let totalValue = new Decimal(0);
    let holdingCount = 0;
    for (const [key, list] of byAsset.entries()) {
      const upTo = list.filter((t) => t.tradeDate.getTime() <= endOfSnap.getTime());
      if (upTo.length === 0) continue;
      const agg = replayTransactions(upTo);
      // Closed positions drop out; cost-only holdings (FDs, property) stay.
      if (agg.quantity.lessThanOrEqualTo(0) && agg.totalCost.lessThanOrEqualTo(0)) continue;
      holdingCount++;
      totalCost = totalCost.plus(agg.totalCost);
      const foreign = upTo.some((t) => {
        const c = (t as typeof t & { currency?: string | null }).currency;
        return !!c && c !== 'INR';
      });
      const meta = {
        assetClass: upTo[0]!.assetClass,
        stockId: upTo.find((t) => t.stockId)?.stockId ?? null,
        fundId: upTo.find((t) => t.fundId)?.fundId ?? null,
        isin: upTo.find((t) => t.isin)?.isin ?? null,
      };
      const price = !foreign && agg.quantity.greaterThan(0) ? await priceAt(meta, endOfSnap) : null;
      totalValue = totalValue.plus(price ? agg.quantity.times(price) : agg.totalCost);

      if (opts.positions && agg.quantity.greaterThan(0)) {
        positions.push({
          key,
          assetClass: meta.assetClass,
          quantity: agg.quantity.toString(),
          price: price ? price.toString() : null,
        });
        // A split or bonus in this period changes the share count, which a
        // period return would otherwise read as a price move.
        const hadAction = upTo.some(
          (t) =>
            CORPORATE_ACTION_TYPES.has(t.transactionType) &&
            (previousSnap === null || t.tradeDate > previousSnap),
        );
        if (hadAction) corporateActionKeys.add(key);
      }
    }
    points.push({
      date: snap,
      cost: totalCost.toString(),
      value: totalValue.toString(),
      holdings: holdingCount,
      ...(opts.positions && { positions, corporateActionKeys: [...corporateActionKeys] }),
    });
    previousSnap = snap;
  }

  return { points };
}

// ─── Portfolio summary ─────────────────────────────────────────────

export async function portfolioSummary(portfolioId: string) {
  const portfolio = await prisma.portfolio.findUnique({ where: { id: portfolioId } });
  if (!portfolio) throw new Error('Portfolio not found');

  const unrealised = await unrealisedReport(portfolioId);
  const { summaryByFy } = await computePortfolioCapitalGains(portfolioId);
  const xirr1y = await computeRollingXirr(portfolioId, 1);
  const xirr3y = await computeRollingXirr(portfolioId, 3);
  const xirr5y = await computeRollingXirr(portfolioId, 5);
  const xirrOverall = await computePortfolioXirr(portfolioId);

  const [txCount, holdingCount] = await Promise.all([
    prisma.transaction.count({ where: { portfolioId } }),
    prisma.holdingProjection.count({ where: { portfolioId } }),
  ]);

  return {
    portfolio: {
      id: portfolio.id,
      name: portfolio.name,
      currency: portfolio.currency,
    },
    counts: { transactions: txCount, holdings: holdingCount },
    unrealised: {
      totalCost: unrealised.totalCost,
      totalValue: unrealised.totalValue,
      unrealisedPnL: unrealised.unrealisedPnL,
    },
    capitalGainsByFy: Object.fromEntries(
      Object.entries(summaryByFy).map(([fy, v]) => [
        fy,
        {
          intraday: v.intraday.toString(),
          stcg: v.stcg.toString(),
          ltcg: v.ltcg.toString(),
          taxable: v.taxable.toString(),
        },
      ]),
    ),
    xirr: {
      overall: xirrOverall.reliable ? xirrOverall.xirr : null,
      oneYear: xirr1y.reliable ? xirr1y.xirr : null,
      threeYear: xirr3y.reliable ? xirr3y.xirr : null,
      fiveYear: xirr5y.reliable ? xirr5y.xirr : null,
    },
  };
}

// ─── User-scoped (all-portfolios) reports ─────────────────────────────
//
// Aggregate the per-portfolio reports across every portfolio owned by
// the user. Controllers route `portfolioId=all` requests here so the
// page can show a combined view instead of forcing a single-portfolio
// pick (which often shows zeros when the default is an empty book).

export async function userIntradayReport(userId: string, fy?: string) {
  const { rows } = await computeUserCapitalGains(userId);
  const filtered = filterRows(rows, { financialYear: fy, type: 'INTRADAY' });
  const totalGain = filtered.reduce((s, r) => s.plus(r.gainLoss), new Decimal(0));
  return { rows: filtered, totalGain: totalGain.toString(), count: filtered.length };
}

export async function userStcgReport(userId: string, fy?: string) {
  const { rows } = await computeUserCapitalGains(userId);
  const filtered = filterRows(rows, { financialYear: fy, type: 'SHORT_TERM' });
  const totalGain = filtered.reduce((s, r) => s.plus(r.gainLoss), new Decimal(0));
  const taxable = filtered.reduce((s, r) => s.plus(r.taxableGain), new Decimal(0));
  return {
    rows: filtered,
    totalGain: totalGain.toString(),
    taxable: taxable.toString(),
    count: filtered.length,
  };
}

export async function userLtcgReport(userId: string, fy?: string) {
  const { rows } = await computeUserCapitalGains(userId);
  const filtered = filterRows(rows, { financialYear: fy, type: 'LONG_TERM' });
  const totalGain = filtered.reduce((s, r) => s.plus(r.gainLoss), new Decimal(0));
  const taxable = filtered.reduce((s, r) => s.plus(r.taxableGain), new Decimal(0));
  return {
    rows: filtered,
    totalGain: totalGain.toString(),
    taxable: taxable.toString(),
    count: filtered.length,
  };
}

export async function userSchedule112AReport(userId: string, fy?: string) {
  const { rows } = await computeUserCapitalGains(userId);
  return schedule112AFromRows(rows, fy);
}

export async function userIncomeReport(userId: string, fy?: string) {
  return investmentIncome({ userId }, fy);
}

export async function userUnrealisedReport(userId: string) {
  const holdings = await prisma.holdingProjection.findMany({
    where: { portfolio: { userId } },
    orderBy: { computedAt: 'desc' },
  });
  let totalCost = new Decimal(0);
  let totalValue = new Decimal(0);
  const rows = holdings.map((h) => {
    const cost = new Decimal(h.totalCost.toString());
    // Unpriced holdings are carried at cost (as on the dashboard), not at 0.
    const value = h.currentValue ? new Decimal(h.currentValue.toString()) : new Decimal(h.totalCost.toString());
    totalCost = totalCost.plus(cost);
    totalValue = totalValue.plus(value);
    const pnl = value.minus(cost);
    const pct = cost.isZero() ? '0' : pnl.dividedBy(cost).times(100).toFixed(2);
    return {
      id: h.id,
      assetClass: h.assetClass,
      assetName: h.assetName,
      isin: h.isin,
      quantity: h.quantity.toString(),
      avgCostPrice: h.avgCostPrice.toString(),
      currentPrice: h.currentPrice?.toString() ?? null,
      totalCost: cost.toString(),
      currentValue: value.toString(),
      unrealisedPnL: pnl.toString(),
      pctReturn: pct,
    };
  });
  const totalPnl = totalValue.minus(totalCost);
  return {
    rows,
    totalCost: totalCost.toString(),
    totalValue: totalValue.toString(),
    unrealisedPnL: totalPnl.toString(),
    count: rows.length,
  };
}

export async function userHistoricalValuation(
  userId: string,
  granularity: 'MONTHLY' | 'QUARTERLY' = 'MONTHLY',
): Promise<{ points: HistoricalValuationPoint[] }> {
  const ids = await listUserPortfolioIds(userId);
  if (ids.length === 0) return { points: [] };
  const perPortfolio = await Promise.all(
    ids.map((id) => historicalValuation(id, granularity)),
  );
  // Bucket by month-end (YYYY-MM-DD) and sum cost/value.
  const map = new Map<string, { date: Date; cost: Decimal; value: Decimal; holdings: number }>();
  for (const r of perPortfolio) {
    for (const p of r.points) {
      const key = p.date.toISOString().slice(0, 10);
      const cur = map.get(key);
      const cost = new Decimal(p.cost);
      const value = new Decimal(p.value);
      if (cur) {
        cur.cost = cur.cost.plus(cost);
        cur.value = cur.value.plus(value);
        cur.holdings += p.holdings;
      } else {
        map.set(key, { date: p.date, cost, value, holdings: p.holdings });
      }
    }
  }
  const points = Array.from(map.values())
    .sort((a, b) => a.date.getTime() - b.date.getTime())
    .map((p) => ({
      date: p.date,
      cost: p.cost.toString(),
      value: p.value.toString(),
      holdings: p.holdings,
    }));
  return { points };
}

export async function userSummary(userId: string) {
  const [unrealised, cg, xirrOverall, xirr1y, xirr3y, xirr5y, portfolios] = await Promise.all([
    userUnrealisedReport(userId),
    computeUserCapitalGains(userId),
    computeUserXirr(userId),
    userRollingXirr(userId, 1),
    userRollingXirr(userId, 3),
    userRollingXirr(userId, 5),
    prisma.portfolio.findMany({ where: { userId }, select: { id: true, currency: true } }),
  ]);
  const txCount = await prisma.transaction.count({ where: { portfolio: { userId } } });
  const holdingCount = await prisma.holdingProjection.count({ where: { portfolio: { userId } } });
  const currency = portfolios[0]?.currency ?? 'INR';
  return {
    portfolio: {
      id: 'all',
      name: 'All portfolios',
      currency,
    },
    counts: { transactions: txCount, holdings: holdingCount },
    unrealised: {
      totalCost: unrealised.totalCost,
      totalValue: unrealised.totalValue,
      unrealisedPnL: unrealised.unrealisedPnL,
    },
    capitalGainsByFy: Object.fromEntries(
      Object.entries(cg.summaryByFy).map(([fy, v]) => [
        fy,
        {
          intraday: v.intraday.toString(),
          stcg: v.stcg.toString(),
          ltcg: v.ltcg.toString(),
          taxable: v.taxable.toString(),
        },
      ]),
    ),
    xirr: {
      overall: xirrOverall.reliable ? xirrOverall.xirr : null,
      oneYear: xirr1y.reliable ? xirr1y.xirr : null,
      threeYear: xirr3y.reliable ? xirr3y.xirr : null,
      fiveYear: xirr5y.reliable ? xirr5y.xirr : null,
    },
  };
}

// Rolling user-XIRR solved on all portfolios' pooled cash flows (with the
// holdings' value at the window start), the same figure /xirr shows.
async function userRollingXirr(userId: string, years: 1 | 3 | 5) {
  const r = await computeUserRollingXirr(userId, years);
  return { xirr: r.xirr, reliable: r.reliable };
}
