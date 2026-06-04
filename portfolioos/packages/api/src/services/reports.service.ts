import { Decimal } from 'decimal.js';
import type { AssetClass, TransactionType } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import {
  computePortfolioCapitalGains,
  computeUserCapitalGains,
  type CapitalGainRow,
  financialYearOf,
} from './capitalGains.service.js';
import {
  computePortfolioXirr,
  computeRollingXirr,
  computeUserXirr,
} from './xirr.service.js';
import { getCryptoPriceAt } from '../priceFeeds/crypto.service.js';
import {
  fetchFmvOn31Jan2018,
  adjustGainForGrandfathering,
} from './specialReports.service.js';

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
 * Schedule 112A — LTCG from equity/equity MFs. Applies Section 112A ₹1L
 * threshold; amount above is taxed at 10% (12.5% post-Jul-2024).
 */
export async function schedule112AReport(portfolioId: string, fy?: string) {
  const { rows } = await computePortfolioCapitalGains(portfolioId);
  const filtered = rows.filter((r) => {
    if (fy && r.financialYear !== fy) return false;
    if (r.capitalGainType !== 'LONG_TERM') return false;
    return (
      r.assetClass === 'EQUITY' ||
      r.assetClass === 'ETF' ||
      r.assetClass === 'MUTUAL_FUND'
    );
  });
  const isins = filtered.map((r) => r.isin).filter((i): i is string => !!i);
  const fmvByIsin = await fetchFmvOn31Jan2018(isins);
  const adjusted = filtered.map((r) => {
    const fmv = r.isin ? fmvByIsin.get(r.isin) ?? null : null;
    const adjGain = adjustGainForGrandfathering(
      r.buyDate,
      r.quantity,
      r.buyAmount,
      r.sellAmount,
      r.gainLoss,
      fmv,
    );
    return { ...r, gainLoss: adjGain };
  });
  const totalGain = adjusted.reduce((acc, r) => acc.plus(r.gainLoss), new Decimal(0));
  const exemptionLimit = new Decimal(100000);
  const taxable = Decimal.max(totalGain.minus(exemptionLimit), new Decimal(0));
  return {
    rows: adjusted,
    totalGain: totalGain.toString(),
    exemptionLimit: exemptionLimit.toString(),
    taxable: taxable.toString(),
    count: adjusted.length,
  };
}

// ─── Income report (dividends + interest) ───────────────────────────

const INCOME_TYPES = new Set<TransactionType>([
  'DIVIDEND_PAYOUT',
  'INTEREST_RECEIVED',
  'MATURITY',
]);

export async function incomeReport(portfolioId: string, fy?: string) {
  const txs = await prisma.transaction.findMany({
    where: { portfolioId, transactionType: { in: Array.from(INCOME_TYPES) } },
    orderBy: { tradeDate: 'asc' },
  });
  const filtered = fy ? txs.filter((t) => financialYearOf(t.tradeDate) === fy) : txs;
  let dividend = new Decimal(0);
  let interest = new Decimal(0);
  let maturity = new Decimal(0);
  for (const t of filtered) {
    const amt = new Decimal(t.netAmount.toString());
    if (t.transactionType === 'DIVIDEND_PAYOUT') dividend = dividend.plus(amt);
    else if (t.transactionType === 'INTEREST_RECEIVED') interest = interest.plus(amt);
    else if (t.transactionType === 'MATURITY') maturity = maturity.plus(amt);
  }
  return {
    rows: filtered.map((t) => ({
      id: t.id,
      date: t.tradeDate,
      type: t.transactionType,
      assetName: t.assetName ?? '',
      amount: t.netAmount.toString(),
      narration: t.narration ?? null,
    })),
    dividend: dividend.toString(),
    interest: interest.toString(),
    maturity: maturity.toString(),
    total: dividend.plus(interest).plus(maturity).toString(),
    count: filtered.length,
  };
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
    const value = h.currentValue ? new Decimal(h.currentValue.toString()) : new Decimal(0);
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
}

export async function historicalValuation(
  portfolioId: string,
  granularity: 'MONTHLY' | 'QUARTERLY' = 'MONTHLY',
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

  // For each snapshot date, compute running quantity + cost per asset key.
  // Value = qty * price at that date from historical feeds; falls back to cost.
  const keyMap = new Map<
    string,
    { assetClass: AssetClass; stockId: string | null; fundId: string | null; isin: string | null }
  >();
  for (const t of txs) {
    const k = valuationKeyOf(t);
    if (!keyMap.has(k)) {
      keyMap.set(k, {
        assetClass: t.assetClass,
        stockId: t.stockId,
        fundId: t.fundId,
        isin: t.isin,
      });
    }
  }

  const points: HistoricalValuationPoint[] = [];

  for (const snap of snapshotDates) {
    // Running totals by key
    const qty = new Map<string, Decimal>();
    const cost = new Map<string, Decimal>();
    for (const t of txs) {
      if (t.tradeDate > snap) break;
      const k = valuationKeyOf(t);
      const q = new Decimal(t.quantity.toString());
      const n = new Decimal(t.netAmount.toString());
      const curQ = qty.get(k) ?? new Decimal(0);
      const curC = cost.get(k) ?? new Decimal(0);
      // Must mirror BUY_TYPES / SELL_TYPES in holdingsProjection.ts. DEPOSIT
      // covers FDs / EPF / insurance / salary imports — without it those
      // holdings never enter `qty`/`cost` and the chart flatlines at zero
      // even when the live projection shows them. BONUS adds qty only.
      if (['BUY', 'SIP', 'SWITCH_IN', 'BONUS', 'MERGER_IN', 'DEMERGER_IN', 'RIGHTS_ISSUE', 'DIVIDEND_REINVEST', 'OPENING_BALANCE', 'DEPOSIT'].includes(t.transactionType)) {
        qty.set(k, curQ.plus(q));
        if (t.transactionType !== 'BONUS') {
          cost.set(k, curC.plus(n));
        }
      } else if (['SELL', 'SWITCH_OUT', 'REDEMPTION', 'MATURITY', 'MERGER_OUT', 'DEMERGER_OUT', 'WITHDRAWAL'].includes(t.transactionType)) {
        if (curQ.greaterThan(0)) {
          const sellQ = Decimal.min(q, curQ);
          const avg = curC.dividedBy(curQ);
          const newQ = curQ.minus(sellQ);
          const newC = curC.minus(avg.times(sellQ));
          qty.set(k, newQ.isNegative() ? new Decimal(0) : newQ);
          cost.set(k, newC.isNegative() ? new Decimal(0) : newC);
        }
      } else if (t.transactionType === 'SPLIT') {
        qty.set(k, curQ.plus(q));
      }
    }

    let totalCost = new Decimal(0);
    let totalValue = new Decimal(0);
    let holdingCount = 0;
    for (const [k, q] of qty) {
      const c = cost.get(k) ?? new Decimal(0);
      // Skip truly closed positions only. Non-tradable holdings (FDs, real
      // estate, insurance) may have qty equal to principal AND no live price
      // feed — the cost basis IS the value at any historical snapshot.
      if (q.lessThanOrEqualTo(0) && c.lessThanOrEqualTo(0)) continue;
      holdingCount++;
      totalCost = totalCost.plus(c);

      const meta = keyMap.get(k)!;
      const price = q.greaterThan(0) ? await priceAt(meta, snap) : null;
      if (price) {
        totalValue = totalValue.plus(q.times(price));
      } else {
        totalValue = totalValue.plus(c); // fallback to cost
      }
    }

    points.push({
      date: snap,
      cost: totalCost.toString(),
      value: totalValue.toString(),
      holdings: holdingCount,
    });
  }

  return { points };
}

/**
 * Stable per-holding key for historical valuation. Stocks/funds key on their
 * master id; crypto (which has neither) keys on its CoinGecko slug stored in
 * `isin`, so distinct coins don't collapse into one bucket.
 */
function valuationKeyOf(t: {
  assetClass: AssetClass;
  stockId: string | null;
  fundId: string | null;
  isin: string | null;
}): string {
  const cryptoSlug = !t.stockId && !t.fundId ? (t.isin ?? '') : '';
  return `${t.assetClass}|${t.stockId ?? ''}|${t.fundId ?? ''}|${cryptoSlug}`;
}

async function priceAt(
  meta: { assetClass: AssetClass; stockId: string | null; fundId: string | null; isin: string | null },
  date: Date,
): Promise<Decimal | null> {
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
      overall: xirrOverall.xirr,
      oneYear: xirr1y.xirr,
      threeYear: xirr3y.xirr,
      fiveYear: xirr5y.xirr,
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
  const filtered = rows.filter((r) => {
    if (fy && r.financialYear !== fy) return false;
    if (r.capitalGainType !== 'LONG_TERM') return false;
    return (
      r.assetClass === 'EQUITY' ||
      r.assetClass === 'ETF' ||
      r.assetClass === 'MUTUAL_FUND'
    );
  });
  const isins = filtered.map((r) => r.isin).filter((i): i is string => !!i);
  const fmvByIsin = await fetchFmvOn31Jan2018(isins);
  const adjusted = filtered.map((r) => {
    const fmv = r.isin ? fmvByIsin.get(r.isin) ?? null : null;
    const adjGain = adjustGainForGrandfathering(
      r.buyDate,
      r.quantity,
      r.buyAmount,
      r.sellAmount,
      r.gainLoss,
      fmv,
    );
    return { ...r, gainLoss: adjGain };
  });
  const totalGain = adjusted.reduce((s, r) => s.plus(r.gainLoss), new Decimal(0));
  const exemptionLimit = new Decimal(100000);
  const taxable = Decimal.max(totalGain.minus(exemptionLimit), new Decimal(0));
  return {
    rows: adjusted,
    totalGain: totalGain.toString(),
    exemptionLimit: exemptionLimit.toString(),
    taxable: taxable.toString(),
    count: adjusted.length,
  };
}

export async function userIncomeReport(userId: string, fy?: string) {
  const txs = await prisma.transaction.findMany({
    where: {
      portfolio: { userId },
      transactionType: { in: Array.from(INCOME_TYPES) },
    },
    orderBy: { tradeDate: 'asc' },
  });
  const filtered = fy ? txs.filter((t) => financialYearOf(t.tradeDate) === fy) : txs;
  let dividend = new Decimal(0);
  let interest = new Decimal(0);
  let maturity = new Decimal(0);
  for (const t of filtered) {
    const amt = new Decimal(t.netAmount.toString());
    if (t.transactionType === 'DIVIDEND_PAYOUT') dividend = dividend.plus(amt);
    else if (t.transactionType === 'INTEREST_RECEIVED') interest = interest.plus(amt);
    else if (t.transactionType === 'MATURITY') maturity = maturity.plus(amt);
  }
  return {
    rows: filtered.map((t) => ({
      id: t.id,
      date: t.tradeDate,
      type: t.transactionType,
      assetName: t.assetName ?? '',
      amount: t.netAmount.toString(),
      narration: t.narration ?? null,
    })),
    dividend: dividend.toString(),
    interest: interest.toString(),
    maturity: maturity.toString(),
    total: dividend.plus(interest).plus(maturity).toString(),
    count: filtered.length,
  };
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
    const value = h.currentValue ? new Decimal(h.currentValue.toString()) : new Decimal(0);
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
      overall: xirrOverall.xirr,
      oneYear: xirr1y.xirr,
      threeYear: xirr3y.xirr,
      fiveYear: xirr5y.xirr,
    },
  };
}

// Rolling user-XIRR — mirrors computeRollingXirr() but at user scope.
async function userRollingXirr(userId: string, years: 1 | 3 | 5) {
  const to = new Date();
  const from = new Date(to);
  from.setUTCFullYear(from.getUTCFullYear() - years);
  const ids = await listUserPortfolioIds(userId);
  if (ids.length === 0) {
    return { xirr: null as number | null };
  }
  const each = await Promise.all(ids.map((id) => computeRollingXirr(id, years)));
  // Re-merge cashflows: each per-portfolio result already has summed terminal
  // value within its window. We use a value-weighted average of the XIRRs by
  // invested capital so a tiny side-portfolio doesn't skew the headline.
  let weightedSum = 0;
  let totalWeight = 0;
  for (const e of each) {
    if (e.xirr == null) continue;
    const w = parseFloat(e.totalInvested);
    if (!isFinite(w) || w <= 0) continue;
    weightedSum += e.xirr * w;
    totalWeight += w;
  }
  const blended = totalWeight > 0 ? weightedSum / totalWeight : null;
  return {
    xirr: blended,
    from,
    to,
  };
}
