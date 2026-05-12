import { Decimal } from 'decimal.js';
import type { AssetClass } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import {
  computePortfolioXirr,
  computeRollingXirr,
  computeUserXirr,
} from './xirr.service.js';
import {
  computePortfolioCapitalGains,
  computeUserCapitalGains,
} from './capitalGains.service.js';
import { historicalValuation, unrealisedReport, incomeReport } from './reports.service.js';
import { getDashboardNetWorth } from './dashboard.service.js';
import { taxHarvestReport } from './tax.service.js';
import { yahooProfile } from '../priceFeeds/yahooClient.js';
import { sectorFor } from '../data/nseSectors.js';

/**
 * Phase 5-Analytics — the snapshot service. Composes the existing per-
 * domain calculators (xirr, capitalGains, reports, dashboard, tax) into
 * one aggregated `AnalyticsSnapshot` payload for the /analytics page.
 *
 * Scope:
 *   - `{ kind: 'portfolio', portfolioId }` — single portfolio.
 *   - `{ kind: 'user', userId }` — cross-portfolio (all portfolios for
 *     the user); fans out per portfolio and merges results.
 *
 * Money discipline: every monetary field on the API boundary is a
 * decimal *string* (§3.2). Frontend rehydrates with `toDecimal()`.
 */

export type AnalyticsScope =
  | { kind: 'portfolio'; portfolioId: string }
  | { kind: 'user'; userId: string };

export type Period = '1M' | '3M' | '6M' | '1Y' | '3Y' | '5Y' | 'All';

export function periodToDays(p: Period): number {
  switch (p) {
    case '1M': return 30;
    case '3M': return 90;
    case '6M': return 180;
    case '1Y': return 365;
    case '3Y': return 1095;
    case '5Y': return 1825;
    case 'All': return 0;
  }
}

const ZERO = new Decimal(0);

function d(v: unknown): Decimal {
  if (v == null) return ZERO;
  if (v instanceof Decimal) return v;
  return new Decimal(String(v));
}

async function portfolioIdsFor(scope: AnalyticsScope): Promise<string[]> {
  if (scope.kind === 'portfolio') return [scope.portfolioId];
  const rows = await prisma.portfolio.findMany({
    where: { userId: scope.userId },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

async function userIdFor(scope: AnalyticsScope): Promise<string> {
  if (scope.kind === 'user') return scope.userId;
  const p = await prisma.portfolio.findUnique({
    where: { id: scope.portfolioId },
    select: { userId: true },
  });
  if (!p) throw new Error('Portfolio not found');
  return p.userId;
}

// ─── KPI block ──────────────────────────────────────────────────────

export interface KpiBlock {
  xirrOverall: number | null;
  xirr1y: number | null;
  xirr3y: number | null;
  xirr5y: number | null;
  totalCost: string;
  currentValue: string;
  unrealisedPnL: string;
  realisedYtd: string;
  incomeYtd: string;
}

function currentFy(date: Date = new Date()): string {
  const year = date.getMonth() >= 3 ? date.getFullYear() : date.getFullYear() - 1;
  return `${year}-${String(year + 1).slice(-2)}`;
}

function fyStartDate(fy: string): Date {
  // "2025-26" → 1 April 2025 UTC.
  const startYear = parseInt(fy.slice(0, 4), 10);
  return new Date(Date.UTC(startYear, 3, 1));
}

export async function getKpis(scope: AnalyticsScope): Promise<KpiBlock> {
  const fy = currentFy();
  if (scope.kind === 'portfolio') {
    const [overall, x1, x3, x5, unrealised, cg, income] = await Promise.all([
      computePortfolioXirr(scope.portfolioId),
      computeRollingXirr(scope.portfolioId, 1),
      computeRollingXirr(scope.portfolioId, 3),
      computeRollingXirr(scope.portfolioId, 5),
      unrealisedReport(scope.portfolioId),
      computePortfolioCapitalGains(scope.portfolioId),
      incomeReport(scope.portfolioId, fy),
    ]);
    const realisedYtd = cg.rows
      .filter((r) => r.financialYear === fy)
      .reduce((a, r) => a.plus(r.gainLoss), ZERO);
    // Add accrued interest from FD/NSC/RD/PO holdings so the KPI matches
    // the income-trend chart (both surface silent interest accrual that the
    // user hasn't logged as INTEREST_RECEIVED transactions).
    const synth = await accruedInterestByMonth(scope, fyStartDate(fy));
    const synthTotal = Array.from(synth.values()).reduce((a, v) => a.plus(v), ZERO);
    return {
      xirrOverall: overall.xirr,
      xirr1y: x1.xirr,
      xirr3y: x3.xirr,
      xirr5y: x5.xirr,
      totalCost: unrealised.totalCost,
      currentValue: unrealised.totalValue,
      unrealisedPnL: unrealised.unrealisedPnL,
      realisedYtd: realisedYtd.toFixed(4),
      incomeYtd: new Decimal(income.total).plus(synthTotal).toFixed(4),
    };
  }

  // user scope: aggregate across portfolios. Overall XIRR uses cross-portfolio
  // solver; rolling windows fall back to weighted-average since they are
  // window-bounded and re-solving per portfolio is expensive.
  const pids = await portfolioIdsFor(scope);
  const userXirr = await computeUserXirr(scope.userId);

  // For rolling: solve per portfolio inside the date window, then take a
  // simple invested-weighted mean. Acceptable proxy for the consolidated view.
  async function weightedRolling(years: 1 | 3 | 5): Promise<number | null> {
    let weightedSum = ZERO;
    let weightTotal = ZERO;
    for (const pid of pids) {
      const r = await computeRollingXirr(pid, years);
      if (r.xirr == null) continue;
      const w = new Decimal(r.totalInvested);
      if (w.lte(0)) continue;
      weightedSum = weightedSum.plus(new Decimal(r.xirr).times(w));
      weightTotal = weightTotal.plus(w);
    }
    if (weightTotal.isZero()) return null;
    return weightedSum.dividedBy(weightTotal).toNumber();
  }

  const [x1, x3, x5, cg, ...unrealisedAndIncome] = await Promise.all([
    weightedRolling(1),
    weightedRolling(3),
    weightedRolling(5),
    computeUserCapitalGains(scope.userId),
    ...pids.flatMap((pid) => [unrealisedReport(pid), incomeReport(pid, fy)] as const),
  ]);
  // Split the unrealised + income arrays back out.
  const unrealisedRes: Array<{ totalCost: string; totalValue: string; unrealisedPnL: string }> = [];
  const incomeRes: Array<{ total: string }> = [];
  for (let i = 0; i < pids.length; i++) {
    unrealisedRes.push(unrealisedAndIncome[i * 2] as { totalCost: string; totalValue: string; unrealisedPnL: string });
    incomeRes.push(unrealisedAndIncome[i * 2 + 1] as { total: string });
  }
  const totalCost = unrealisedRes.reduce((a, u) => a.plus(u.totalCost), ZERO);
  const totalValue = unrealisedRes.reduce((a, u) => a.plus(u.totalValue), ZERO);
  const unrealisedPnL = totalValue.minus(totalCost);
  const realisedYtd = cg.rows
    .filter((r) => r.financialYear === fy)
    .reduce((a, r) => a.plus(r.gainLoss), ZERO);
  const incomeYtd = incomeRes.reduce((a, i) => a.plus(i.total), ZERO);

  // Same synthetic-interest merge as the portfolio scope so cross-portfolio
  // KPIs match per-portfolio + income-trend chart.
  const synth = await accruedInterestByMonth(scope, fyStartDate(fy));
  const synthTotal = Array.from(synth.values()).reduce((a, v) => a.plus(v), ZERO);

  return {
    xirrOverall: userXirr.xirr,
    xirr1y: x1,
    xirr3y: x3,
    xirr5y: x5,
    totalCost: totalCost.toFixed(4),
    currentValue: totalValue.toFixed(4),
    unrealisedPnL: unrealisedPnL.toFixed(4),
    realisedYtd: realisedYtd.toFixed(4),
    incomeYtd: incomeYtd.plus(synthTotal).toFixed(4),
  };
}

// ─── Allocation by asset class ──────────────────────────────────────

export interface AllocationSlice {
  key: string;
  label: string;
  value: string;
  pct: number;
}

const ASSET_CLASS_LABELS: Record<string, string> = {
  EQUITY: 'Equity', MUTUAL_FUND: 'Mutual Fund', ETF: 'ETF',
  FUTURES: 'Futures', OPTIONS: 'Options',
  BOND: 'Bond', GOVT_BOND: 'Govt Bond', CORPORATE_BOND: 'Corp Bond',
  FIXED_DEPOSIT: 'Fixed Deposit', RECURRING_DEPOSIT: 'Recurring Deposit',
  NPS: 'NPS', PPF: 'PPF', EPF: 'EPF', PMS: 'PMS', AIF: 'AIF',
  REIT: 'REIT', INVIT: 'InvIT',
  GOLD_BOND: 'Gold Bond', GOLD_ETF: 'Gold ETF',
  PHYSICAL_GOLD: 'Physical Gold', PHYSICAL_SILVER: 'Silver',
  ULIP: 'ULIP', INSURANCE: 'Insurance',
  REAL_ESTATE: 'Real Estate', PRIVATE_EQUITY: 'Private Equity',
  CRYPTOCURRENCY: 'Crypto', ART_COLLECTIBLES: 'Art', CASH: 'Cash', OTHER: 'Other',
  NSC: 'NSC', KVP: 'KVP', SCSS: 'SCSS', SSY: 'SSY',
  POST_OFFICE_MIS: 'PO MIS', POST_OFFICE_RD: 'PO RD',
  POST_OFFICE_TD: 'PO TD', POST_OFFICE_SAVINGS: 'PO Savings',
  FOREIGN_EQUITY: 'Foreign Equity', FOREX_PAIR: 'FX Pair',
};

function labelOf(cls: string): string {
  return ASSET_CLASS_LABELS[cls] ?? cls.replace(/_/g, ' ');
}

export async function getAllocationByClass(scope: AnalyticsScope): Promise<AllocationSlice[]> {
  const where: Record<string, unknown> =
    scope.kind === 'portfolio'
      ? { portfolioId: scope.portfolioId }
      : { portfolio: { userId: scope.userId } };
  const holdings = await prisma.holdingProjection.findMany({ where });
  const byClass = new Map<string, Decimal>();
  for (const h of holdings) {
    const v = h.currentValue ? d(h.currentValue) : d(h.totalCost);
    byClass.set(h.assetClass, (byClass.get(h.assetClass) ?? ZERO).plus(v));
  }
  const total = Array.from(byClass.values()).reduce((a, v) => a.plus(v), ZERO);
  return Array.from(byClass.entries())
    .map(([k, v]) => ({
      key: k,
      label: labelOf(k),
      value: v.toFixed(4),
      pct: total.gt(0) ? v.dividedBy(total).times(100).toNumber() : 0,
    }))
    .sort((a, b) => b.pct - a.pct);
}

// ─── Allocation treemap (by individual holding) ─────────────────────

export interface TreemapNode {
  assetClass: string;
  assetName: string;
  value: string;
  pct: number;
}

// Asset classes whose user-entered assetName is opaque on its own ("borivali"
// for an NSC, "south flat" for a real-estate holding). Prefixing or suffixing
// the asset-class label disambiguates the treemap and concentration list.
const OPAQUE_NAME_CLASSES = new Set([
  'FIXED_DEPOSIT', 'RECURRING_DEPOSIT', 'NSC', 'KVP', 'SCSS', 'SSY',
  'POST_OFFICE_MIS', 'POST_OFFICE_RD', 'POST_OFFICE_TD', 'POST_OFFICE_SAVINGS',
  'PPF', 'EPF', 'NPS', 'INSURANCE', 'ULIP', 'REAL_ESTATE',
  'PHYSICAL_GOLD', 'PHYSICAL_SILVER', 'GOLD_BOND', 'CASH', 'OTHER',
]);

function displayName(assetClass: string, assetName: string | null): string {
  const cls = labelOf(assetClass);
  if (!assetName || !assetName.trim()) return cls;
  if (OPAQUE_NAME_CLASSES.has(assetClass)) {
    return `${cls} · ${assetName}`;
  }
  return assetName;
}

export async function getAllocationTreemap(scope: AnalyticsScope): Promise<TreemapNode[]> {
  const where: Record<string, unknown> =
    scope.kind === 'portfolio'
      ? { portfolioId: scope.portfolioId }
      : { portfolio: { userId: scope.userId } };
  const holdings = await prisma.holdingProjection.findMany({ where });
  const total = holdings.reduce(
    (a, h) => a.plus(h.currentValue ? d(h.currentValue) : d(h.totalCost)),
    ZERO,
  );
  return holdings
    .map((h) => {
      const v = h.currentValue ? d(h.currentValue) : d(h.totalCost);
      return {
        assetClass: h.assetClass,
        assetName: displayName(h.assetClass, h.assetName),
        value: v.toFixed(4),
        pct: total.gt(0) ? v.dividedBy(total).times(100).toNumber() : 0,
      };
    })
    .filter((n) => new Decimal(n.value).gt(0))
    .sort((a, b) => b.pct - a.pct);
}

// ─── Top winners / losers ───────────────────────────────────────────

export interface HoldingRankRow {
  assetName: string;
  assetClass: string;
  totalCost: string;
  currentValue: string;
  pnl: string;
  pnlPct: number;
}

export async function getTopWinnersLosers(
  scope: AnalyticsScope,
  n = 10,
): Promise<{ winners: HoldingRankRow[]; losers: HoldingRankRow[] }> {
  const where: Record<string, unknown> =
    scope.kind === 'portfolio'
      ? { portfolioId: scope.portfolioId }
      : { portfolio: { userId: scope.userId } };
  const holdings = await prisma.holdingProjection.findMany({ where });
  const rows: HoldingRankRow[] = holdings
    .filter((h) => h.currentValue != null) // ignore holdings without live price
    .map((h) => {
      const cost = d(h.totalCost);
      const value = d(h.currentValue);
      const pnl = value.minus(cost);
      const pct = cost.gt(0) ? pnl.dividedBy(cost).times(100).toNumber() : 0;
      return {
        assetName: displayName(h.assetClass, h.assetName),
        assetClass: h.assetClass,
        totalCost: cost.toFixed(4),
        currentValue: value.toFixed(4),
        pnl: pnl.toFixed(4),
        pnlPct: pct,
      };
    });
  const sorted = [...rows].sort((a, b) => b.pnlPct - a.pnlPct);
  return {
    winners: sorted.slice(0, n).filter((r) => r.pnlPct > 0),
    losers: sorted.slice(-n).reverse().filter((r) => r.pnlPct < 0),
  };
}

// ─── Concentration risk ─────────────────────────────────────────────

export interface ConcentrationRow {
  assetName: string;
  assetClass: string;
  value: string;
  pct: number;
  cumulativePct: number;
}

export async function getConcentrationRisk(
  scope: AnalyticsScope,
  topN = 10,
): Promise<ConcentrationRow[]> {
  const treemap = await getAllocationTreemap(scope);
  const top = treemap.slice(0, topN);
  let cumulative = 0;
  return top.map((t) => {
    cumulative += t.pct;
    return {
      assetName: t.assetName,
      assetClass: t.assetClass,
      value: t.value,
      pct: t.pct,
      cumulativePct: cumulative,
    };
  });
}

// ─── Sector allocation (stocks only) ────────────────────────────────

export interface SectorSlice {
  sector: string;
  value: string;
  pct: number;
}

export async function getSectorAllocation(scope: AnalyticsScope): Promise<SectorSlice[]> {
  // HoldingProjection has no direct relation to StockMaster — fetch holdings
  // first, then resolve sectors in one batched query.
  const where: Record<string, unknown> =
    scope.kind === 'portfolio'
      ? { portfolioId: scope.portfolioId, stockId: { not: null } }
      : { portfolio: { userId: scope.userId }, stockId: { not: null } };
  const holdings = await prisma.holdingProjection.findMany({ where });
  const stockIds = Array.from(
    new Set(holdings.map((h) => h.stockId).filter((id): id is string => !!id)),
  );
  let stocks = await prisma.stockMaster.findMany({
    where: { id: { in: stockIds } },
    select: { id: true, symbol: true, exchange: true, sector: true },
  });

  // Lazy backfill: StockMaster.sector is null for every stock created by
  // contract-note / CAS imports because no path ever populated it.
  //
  // First pass: consult the bundled NSE sector map. This works for every
  // common large/mid-cap Indian listing, requires no network, and survives
  // when Yahoo's quoteSummary refuses to talk to us.
  //
  // Second pass: Yahoo profile lookup for anything the static map doesn't
  // cover. Failure to fetch is silent — the holding stays Unclassified for
  // this request and we'll try again next time.
  const missing = stocks.filter((s) => !s.sector);
  if (missing.length > 0) {
    const stillMissing: typeof missing = [];
    for (const s of missing) {
      const localSector = sectorFor(s.symbol);
      if (localSector) {
        await prisma.stockMaster.update({
          where: { id: s.id },
          data: { sector: localSector },
        });
      } else {
        stillMissing.push(s);
      }
    }
    if (stillMissing.length > 0) {
      await Promise.all(
        stillMissing.map(async (s) => {
          const yahooSymbol = s.exchange === 'BSE' ? `${s.symbol}.BO` : `${s.symbol}.NS`;
          const profile = await yahooProfile(yahooSymbol);
          if (profile?.sector) {
            await prisma.stockMaster.update({
              where: { id: s.id },
              data: { sector: profile.sector, industry: profile.industry ?? undefined },
            });
          }
        }),
      );
    }
    // Re-read so this request reflects the backfill we just persisted.
    stocks = await prisma.stockMaster.findMany({
      where: { id: { in: stockIds } },
      select: { id: true, symbol: true, exchange: true, sector: true },
    });
  }

  const sectorByStockId = new Map(stocks.map((s) => [s.id, s.sector || 'Unclassified']));

  const bySector = new Map<string, Decimal>();
  for (const h of holdings) {
    const sector = (h.stockId && sectorByStockId.get(h.stockId)) || 'Unclassified';
    const v = h.currentValue ? d(h.currentValue) : d(h.totalCost);
    bySector.set(sector, (bySector.get(sector) ?? ZERO).plus(v));
  }
  const total = Array.from(bySector.values()).reduce((a, v) => a.plus(v), ZERO);
  return Array.from(bySector.entries())
    .map(([sector, v]) => ({
      sector,
      value: v.toFixed(4),
      pct: total.gt(0) ? v.dividedBy(total).times(100).toNumber() : 0,
    }))
    .sort((a, b) => b.pct - a.pct);
}

// ─── Capital gains by FY (STCG / LTCG / Intraday) ───────────────────

export interface CgByFyRow {
  fy: string;
  intraday: string;
  stcg: string;
  ltcg: string;
  total: string;
}

export async function getCgByFy(scope: AnalyticsScope): Promise<CgByFyRow[]> {
  const cg = scope.kind === 'portfolio'
    ? await computePortfolioCapitalGains(scope.portfolioId)
    : await computeUserCapitalGains(scope.userId);
  const agg = new Map<string, { intraday: Decimal; stcg: Decimal; ltcg: Decimal }>();
  for (const r of cg.rows) {
    const cur = agg.get(r.financialYear) ?? { intraday: ZERO, stcg: ZERO, ltcg: ZERO };
    if (r.capitalGainType === 'INTRADAY') cur.intraday = cur.intraday.plus(r.gainLoss);
    else if (r.capitalGainType === 'SHORT_TERM') cur.stcg = cur.stcg.plus(r.gainLoss);
    else if (r.capitalGainType === 'LONG_TERM') cur.ltcg = cur.ltcg.plus(r.gainLoss);
    agg.set(r.financialYear, cur);
  }
  return Array.from(agg.entries())
    .map(([fy, v]) => ({
      fy,
      intraday: v.intraday.toFixed(4),
      stcg: v.stcg.toFixed(4),
      ltcg: v.ltcg.toFixed(4),
      total: v.intraday.plus(v.stcg).plus(v.ltcg).toFixed(4),
    }))
    .sort((a, b) => a.fy.localeCompare(b.fy));
}

// ─── Income trend (dividends + interest by month) ───────────────────

export interface IncomeMonthRow {
  month: string; // 'YYYY-MM'
  dividend: string;
  interest: string;
  maturity: string;
  total: string;
}

// Asset classes whose income accrues silently (no per-payment tx is logged).
// We synthesise a monthly interest stream from HoldingProjection so the
// income chart isn't permanently empty for users who hold FDs / NSC / KVP /
// SCSS / RD / SSY without recording explicit INTEREST_RECEIVED rows. The
// allocation is a linear monthly run-rate (totalAccrued / monthsHeld) rather
// than the true compounded curve — the chart conveys "you're earning income"
// without claiming bank-statement accuracy.
const ACCRUING_INCOME_CLASSES = new Set([
  'FIXED_DEPOSIT', 'RECURRING_DEPOSIT',
  'NSC', 'KVP', 'POST_OFFICE_TD', 'SSY', 'POST_OFFICE_RD',
  'SCSS', 'POST_OFFICE_MIS', 'POST_OFFICE_SAVINGS',
]);

function monthsBetween(a: Date, b: Date): number {
  // Inclusive month count, floored at 1 so a same-month deposit still
  // contributes a per-month run-rate instead of dividing by zero.
  const months =
    (b.getUTCFullYear() - a.getUTCFullYear()) * 12 +
    (b.getUTCMonth() - a.getUTCMonth()) + 1;
  return Math.max(1, months);
}

async function accruedInterestByMonth(
  scope: AnalyticsScope,
  windowFrom: Date,
): Promise<Map<string, Decimal>> {
  const where: Record<string, unknown> = {
    assetClass: { in: Array.from(ACCRUING_INCOME_CLASSES) },
    ...(scope.kind === 'portfolio'
      ? { portfolioId: scope.portfolioId }
      : { portfolio: { userId: scope.userId } }),
  };
  const holdings = await prisma.holdingProjection.findMany({
    where,
    select: { portfolioId: true, assetKey: true, currentValue: true, totalCost: true },
  });
  if (holdings.length === 0) return new Map();

  // Earliest deposit per (portfolio, assetKey) — anchors the per-month run-rate.
  const portfolioIds = Array.from(new Set(holdings.map((h) => h.portfolioId)));
  const firstTxs = await prisma.transaction.groupBy({
    by: ['portfolioId', 'assetKey'],
    where: { portfolioId: { in: portfolioIds } },
    _min: { tradeDate: true },
  });
  const firstTxMap = new Map<string, Date>();
  for (const row of firstTxs) {
    if (row._min.tradeDate) {
      firstTxMap.set(`${row.portfolioId}|${row.assetKey}`, row._min.tradeDate);
    }
  }

  const today = new Date();
  const todayMonth = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  const byMonth = new Map<string, Decimal>();

  for (const h of holdings) {
    if (h.currentValue == null) continue;
    const accrued = d(h.currentValue).minus(d(h.totalCost));
    if (accrued.lte(0)) continue;
    const start = firstTxMap.get(`${h.portfolioId}|${h.assetKey}`);
    if (!start) continue;

    const perMonth = accrued.dividedBy(monthsBetween(start, today));
    const distStart = start < windowFrom ? windowFrom : start;
    const cursor = new Date(Date.UTC(distStart.getUTCFullYear(), distStart.getUTCMonth(), 1));
    while (cursor <= todayMonth) {
      const key = cursor.toISOString().slice(0, 7);
      byMonth.set(key, (byMonth.get(key) ?? ZERO).plus(perMonth));
      cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    }
  }
  return byMonth;
}

export async function getIncomeTrend(
  scope: AnalyticsScope,
  periodDays: number,
): Promise<IncomeMonthRow[]> {
  const from = periodDays > 0 ? new Date(Date.now() - periodDays * 86_400_000) : new Date(0);
  const where: Record<string, unknown> = {
    transactionType: { in: ['DIVIDEND_PAYOUT', 'INTEREST_RECEIVED', 'MATURITY'] },
    tradeDate: { gte: from },
    ...(scope.kind === 'portfolio'
      ? { portfolioId: scope.portfolioId }
      : { portfolio: { userId: scope.userId } }),
  };
  const txs = await prisma.transaction.findMany({
    where,
    orderBy: { tradeDate: 'asc' },
    select: { tradeDate: true, transactionType: true, netAmount: true },
  });
  const agg = new Map<string, { dividend: Decimal; interest: Decimal; maturity: Decimal }>();
  for (const t of txs) {
    const month = t.tradeDate.toISOString().slice(0, 7);
    const cur = agg.get(month) ?? { dividend: ZERO, interest: ZERO, maturity: ZERO };
    const amt = d(t.netAmount);
    if (t.transactionType === 'DIVIDEND_PAYOUT') cur.dividend = cur.dividend.plus(amt);
    else if (t.transactionType === 'INTEREST_RECEIVED') cur.interest = cur.interest.plus(amt);
    else if (t.transactionType === 'MATURITY') cur.maturity = cur.maturity.plus(amt);
    agg.set(month, cur);
  }

  // Merge in synthetic accrued interest from FD/NSC/RD/PO holdings so the
  // chart isn't empty for portfolios where the user hasn't logged explicit
  // INTEREST_RECEIVED transactions. Real INTEREST_RECEIVED rows still take
  // precedence within their month — we add the synthetic stream alongside.
  const synthetic = await accruedInterestByMonth(scope, from);
  for (const [month, val] of synthetic) {
    const cur = agg.get(month) ?? { dividend: ZERO, interest: ZERO, maturity: ZERO };
    cur.interest = cur.interest.plus(val);
    agg.set(month, cur);
  }

  return Array.from(agg.entries())
    .map(([month, v]) => ({
      month,
      dividend: v.dividend.toFixed(4),
      interest: v.interest.toFixed(4),
      maturity: v.maturity.toFixed(4),
      total: v.dividend.plus(v.interest).plus(v.maturity).toFixed(4),
    }))
    .sort((a, b) => a.month.localeCompare(b.month));
}

// ─── Portfolio value line ──────────────────────────────────────────

export interface ValuationPoint {
  date: string;
  cost: string;
  value: string;
}

export async function getPortfolioValueLine(
  scope: AnalyticsScope,
  periodDays: number,
): Promise<ValuationPoint[]> {
  const pids = await portfolioIdsFor(scope);
  const series = await Promise.all(
    pids.map((pid) => historicalValuation(pid, 'MONTHLY').then((r) => r.points)),
  );
  // Merge by date
  const merged = new Map<string, { cost: Decimal; value: Decimal }>();
  for (const points of series) {
    for (const p of points) {
      const key = p.date.toISOString().slice(0, 10);
      const cur = merged.get(key) ?? { cost: ZERO, value: ZERO };
      cur.cost = cur.cost.plus(p.cost);
      cur.value = cur.value.plus(p.value);
      merged.set(key, cur);
    }
  }
  const cutoff = periodDays > 0
    ? new Date(Date.now() - periodDays * 86_400_000).toISOString().slice(0, 10)
    : '0000-00-00';
  return Array.from(merged.entries())
    .filter(([date]) => date >= cutoff)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, v]) => ({
      date,
      cost: v.cost.toFixed(4),
      value: v.value.toFixed(4),
    }));
}

// ─── Per-asset-class XIRR ──────────────────────────────────────────

export interface AssetClassXirrRow {
  assetClass: string;
  label: string;
  xirr: number | null;
  invested: string;
  currentValue: string;
}

export async function getAssetClassXirr(scope: AnalyticsScope): Promise<AssetClassXirrRow[]> {
  const pids = await portfolioIdsFor(scope);
  // Distinct asset classes present in transactions across scope
  const distinct = await prisma.transaction.findMany({
    where: { portfolioId: { in: pids } },
    select: { assetClass: true },
    distinct: ['assetClass'],
  });
  const classes = distinct.map((d) => d.assetClass as AssetClass);

  // Per class, sum XIRR across portfolios using weighted-average proxy
  const rows: AssetClassXirrRow[] = [];
  for (const cls of classes) {
    let invested = ZERO;
    let terminal = ZERO;
    let weightedSum = ZERO;
    let weightTotal = ZERO;
    for (const pid of pids) {
      const r = await computePortfolioXirr(pid, { assetClass: cls });
      const inv = new Decimal(r.totalInvested);
      const term = new Decimal(r.terminalValue);
      invested = invested.plus(inv);
      terminal = terminal.plus(term);
      if (r.xirr != null && inv.gt(0)) {
        weightedSum = weightedSum.plus(new Decimal(r.xirr).times(inv));
        weightTotal = weightTotal.plus(inv);
      }
    }
    if (invested.isZero() && terminal.isZero()) continue;
    rows.push({
      assetClass: cls,
      label: labelOf(cls),
      xirr: weightTotal.gt(0) ? weightedSum.dividedBy(weightTotal).toNumber() : null,
      invested: invested.toFixed(4),
      currentValue: terminal.toFixed(4),
    });
  }
  rows.sort((a, b) => new Decimal(b.currentValue).minus(a.currentValue).toNumber());
  return rows;
}

// ─── Tax harvest summary ───────────────────────────────────────────

export interface TaxHarvestSummary {
  unrealisedLoss: string;
  stcgLossAvailable: string;
  ltcgLossAvailable: string;
  realisedStcgInFy: string;
  realisedLtcgInFy: string;
  candidates: Array<{
    portfolioName: string;
    assetName: string;
    assetClass: string;
    unrealisedPnL: string;
    classification: string;
  }>;
}

export async function getTaxHarvestSummary(scope: AnalyticsScope): Promise<TaxHarvestSummary> {
  const userId = await userIdFor(scope);
  const fy = currentFy();
  const r = await taxHarvestReport(userId, fy);
  // Filter to portfolio scope if needed
  const filtered = scope.kind === 'portfolio'
    ? r.rows.filter((row) => row.portfolioId === scope.portfolioId)
    : r.rows;
  return {
    unrealisedLoss: r.totals.unrealisedLoss,
    stcgLossAvailable: r.totals.stcgLossAvailable,
    ltcgLossAvailable: r.totals.ltcgLossAvailable,
    realisedStcgInFy: r.totals.realisedStcgInFy,
    realisedLtcgInFy: r.totals.realisedLtcgInFy,
    candidates: filtered
      .filter((row) => new Decimal(row.unrealisedPnL).lt(0))
      .slice(0, 20)
      .map((row) => ({
        portfolioName: row.portfolioName,
        assetName: row.assetName,
        assetClass: row.assetClass,
        unrealisedPnL: row.unrealisedPnL,
        classification: row.classification,
      })),
  };
}

// ─── Liabilities vs assets ─────────────────────────────────────────

export interface LiabilitiesVsAssets {
  assets: string;
  liabilities: string;
  netWorth: string;
}

export async function getLiabilitiesVsAssets(scope: AnalyticsScope): Promise<LiabilitiesVsAssets> {
  const userId = await userIdFor(scope);
  const nw = await getDashboardNetWorth(
    userId,
    scope.kind === 'portfolio' ? scope.portfolioId : undefined,
  );
  return {
    assets: nw.totalNetWorth,
    liabilities: nw.totalLiabilities,
    netWorth: nw.netWorthAfterLiabilities,
  };
}

// ─── Realised vs unrealised P&L ────────────────────────────────────

export interface RealisedVsUnrealised {
  realised: string;
  unrealised: string;
}

export async function getRealisedVsUnrealised(scope: AnalyticsScope): Promise<RealisedVsUnrealised> {
  const fy = currentFy();
  const cg = scope.kind === 'portfolio'
    ? await computePortfolioCapitalGains(scope.portfolioId)
    : await computeUserCapitalGains(scope.userId);
  const realised = cg.rows
    .filter((r) => r.financialYear === fy)
    .reduce((a, r) => a.plus(r.gainLoss), ZERO);

  const where: Record<string, unknown> =
    scope.kind === 'portfolio'
      ? { portfolioId: scope.portfolioId }
      : { portfolio: { userId: scope.userId } };
  const holdings = await prisma.holdingProjection.findMany({ where });
  let unrealised = ZERO;
  for (const h of holdings) {
    if (h.currentValue == null) continue;
    unrealised = unrealised.plus(d(h.currentValue).minus(d(h.totalCost)));
  }
  return {
    realised: realised.toFixed(4),
    unrealised: unrealised.toFixed(4),
  };
}

// ─── Cashflow waterfall ────────────────────────────────────────────

export interface CashflowMonth {
  month: string;
  inflow: string;
  outflow: string;
  net: string;
}

export async function getCashflowWaterfall(
  scope: AnalyticsScope,
  periodDays: number,
): Promise<CashflowMonth[]> {
  const from = periodDays > 0 ? new Date(Date.now() - periodDays * 86_400_000) : new Date(0);
  const where: Record<string, unknown> = {
    tradeDate: { gte: from },
    ...(scope.kind === 'portfolio'
      ? { portfolioId: scope.portfolioId }
      : { portfolio: { userId: scope.userId } }),
  };
  const txs = await prisma.transaction.findMany({
    where,
    select: { tradeDate: true, transactionType: true, netAmount: true },
    orderBy: { tradeDate: 'asc' },
  });

  const inflowTypes = new Set([
    'SELL', 'SWITCH_OUT', 'REDEMPTION', 'MATURITY',
    'DIVIDEND_PAYOUT', 'INTEREST_RECEIVED', 'WITHDRAWAL',
  ]);
  const outflowTypes = new Set([
    'BUY', 'SIP', 'SWITCH_IN', 'RIGHTS_ISSUE',
    'DIVIDEND_REINVEST', 'DEPOSIT', 'OPENING_BALANCE',
  ]);

  const agg = new Map<string, { inflow: Decimal; outflow: Decimal }>();
  for (const t of txs) {
    const month = t.tradeDate.toISOString().slice(0, 7);
    const cur = agg.get(month) ?? { inflow: ZERO, outflow: ZERO };
    const amt = d(t.netAmount);
    if (inflowTypes.has(t.transactionType)) cur.inflow = cur.inflow.plus(amt);
    else if (outflowTypes.has(t.transactionType)) cur.outflow = cur.outflow.plus(amt);
    agg.set(month, cur);
  }
  return Array.from(agg.entries())
    .map(([month, v]) => ({
      month,
      inflow: v.inflow.toFixed(4),
      outflow: v.outflow.toFixed(4),
      net: v.inflow.minus(v.outflow).toFixed(4),
    }))
    .sort((a, b) => a.month.localeCompare(b.month));
}

// ─── Cost basis vs market value drift ─────────────────────────────

export interface CostValueDriftPoint {
  date: string;
  cost: string;
  value: string;
  driftPct: number;
}

export async function getCostValueDrift(
  scope: AnalyticsScope,
  periodDays: number,
): Promise<CostValueDriftPoint[]> {
  const points = await getPortfolioValueLine(scope, periodDays);
  return points.map((p) => {
    const cost = new Decimal(p.cost);
    const value = new Decimal(p.value);
    const drift = cost.gt(0) ? value.minus(cost).dividedBy(cost).times(100).toNumber() : 0;
    return { date: p.date, cost: p.cost, value: p.value, driftPct: drift };
  });
}

// ─── Aggregated snapshot ──────────────────────────────────────────

export interface AnalyticsSnapshot {
  scope: { kind: 'portfolio' | 'user'; id: string };
  period: Period;
  generatedAt: string;
  kpis: KpiBlock;
  allocationByClass: AllocationSlice[];
  allocationTreemap: TreemapNode[];
  topWinnersLosers: { winners: HoldingRankRow[]; losers: HoldingRankRow[] };
  concentrationRisk: ConcentrationRow[];
  sectorAllocation: SectorSlice[];
  cgByFy: CgByFyRow[];
  incomeTrend: IncomeMonthRow[];
  portfolioValueLine: ValuationPoint[];
  costValueDrift: CostValueDriftPoint[];
  cashflowWaterfall: CashflowMonth[];
  assetClassXirr: AssetClassXirrRow[];
  taxHarvest: TaxHarvestSummary;
  liabilitiesVsAssets: LiabilitiesVsAssets;
  realisedVsUnrealised: RealisedVsUnrealised;
}

export async function getAnalyticsSnapshot(
  scope: AnalyticsScope,
  period: Period,
): Promise<AnalyticsSnapshot> {
  const periodDays = periodToDays(period);
  const [
    kpis,
    allocationByClass,
    allocationTreemap,
    topWinnersLosers,
    concentrationRisk,
    sectorAllocation,
    cgByFy,
    incomeTrend,
    portfolioValueLine,
    costValueDrift,
    cashflowWaterfall,
    assetClassXirr,
    taxHarvest,
    liabilitiesVsAssets,
    realisedVsUnrealised,
  ] = await Promise.all([
    getKpis(scope),
    getAllocationByClass(scope),
    getAllocationTreemap(scope),
    getTopWinnersLosers(scope, 10),
    getConcentrationRisk(scope, 10),
    getSectorAllocation(scope),
    getCgByFy(scope),
    getIncomeTrend(scope, periodDays),
    getPortfolioValueLine(scope, periodDays),
    getCostValueDrift(scope, periodDays),
    getCashflowWaterfall(scope, periodDays),
    getAssetClassXirr(scope),
    getTaxHarvestSummary(scope),
    getLiabilitiesVsAssets(scope),
    getRealisedVsUnrealised(scope),
  ]);
  return {
    scope: {
      kind: scope.kind,
      id: scope.kind === 'portfolio' ? scope.portfolioId : scope.userId,
    },
    period,
    generatedAt: new Date().toISOString(),
    kpis,
    allocationByClass,
    allocationTreemap,
    topWinnersLosers,
    concentrationRisk,
    sectorAllocation,
    cgByFy,
    incomeTrend,
    portfolioValueLine,
    costValueDrift,
    cashflowWaterfall,
    assetClassXirr,
    taxHarvest,
    liabilitiesVsAssets,
    realisedVsUnrealised,
  };
}

