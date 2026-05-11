import { Decimal } from 'decimal.js';
import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';
import { yahooHistorical } from '../priceFeeds/yahooClient.js';

/**
 * Benchmark price series for NIFTY 50 + Sensex, rebased to 100 at period
 * start so it overlays cleanly on the portfolio value chart.
 *
 * Storage strategy: synthetic `StockMaster` rows with symbols `^NSEI` /
 * `^BSESN`. Their `id` values are kept in `AppSetting` so the rest of
 * the code doesn't have to know the symbols. Daily closes land in
 * `StockPrice` and are reused across users.
 *
 * Refresh strategy: lazy. On every request, top up missing prices from
 * the last persisted date through today; for cold start, fetch back to
 * the user-requested period start. yahooHistorical is rate-limited
 * upstream so this is safe.
 */

interface BenchmarkSymbol {
  symbol: string;
  name: string;
  exchange: 'NSE' | 'BSE';
}

const NIFTY: BenchmarkSymbol = { symbol: '^NSEI', name: 'NIFTY 50', exchange: 'NSE' };
const SENSEX: BenchmarkSymbol = { symbol: '^BSESN', name: 'BSE SENSEX', exchange: 'BSE' };

const APPSETTING_NIFTY_KEY = 'analytics.nifty50_stock_id';
const APPSETTING_SENSEX_KEY = 'analytics.sensex_stock_id';

async function ensureSyntheticStock(
  meta: BenchmarkSymbol,
  appSettingKey: string,
): Promise<string> {
  const setting = await prisma.appSetting.findUnique({ where: { key: appSettingKey } });
  if (setting && typeof setting.value === 'string') {
    // Verify it still exists; if not, recreate.
    const existing = await prisma.stockMaster.findUnique({ where: { id: setting.value } });
    if (existing) return existing.id;
  }
  // Upsert by symbol (unique constraint).
  const row = await prisma.stockMaster.upsert({
    where: { symbol: meta.symbol },
    update: { name: meta.name, isActive: true },
    create: {
      symbol: meta.symbol,
      name: meta.name,
      exchange: meta.exchange,
      isActive: true,
    },
  });
  await prisma.appSetting.upsert({
    where: { key: appSettingKey },
    create: { key: appSettingKey, value: row.id },
    update: { value: row.id },
  });
  return row.id;
}

async function refreshSeries(
  stockId: string,
  symbol: string,
  fromDate: Date,
): Promise<void> {
  // Pull only rows we don't already have; fetch a small margin earlier
  // than the existing latest so partial days get re-confirmed.
  const latest = await prisma.stockPrice.findFirst({
    where: { stockId },
    orderBy: { date: 'desc' },
    select: { date: true },
  });
  const fetchFrom = latest
    ? new Date(Math.min(latest.date.getTime() + 86_400_000, fromDate.getTime()))
    : fromDate;
  const today = new Date();
  if (fetchFrom > today) return;
  const rows = await yahooHistorical(symbol, fetchFrom, today, '1d');
  if (rows.length === 0) return;

  // Bulk upsert. Prisma has no native upsertMany on (compound unique), so
  // we batch createMany with skipDuplicates and let it ignore conflicts.
  interface YahooBar {
    date: Date;
    open?: number;
    high?: number;
    low?: number;
    close?: number;
    volume?: number;
  }
  const bars = rows as YahooBar[];
  await prisma.stockPrice.createMany({
    data: bars
      .filter((r) => r.close != null)
      .map((r) => ({
        stockId,
        date: r.date,
        open: new Decimal(r.open ?? r.close!).toFixed(4),
        high: new Decimal(r.high ?? r.close!).toFixed(4),
        low: new Decimal(r.low ?? r.close!).toFixed(4),
        close: new Decimal(r.close!).toFixed(4),
        volume: r.volume != null ? BigInt(Math.round(r.volume)) : null,
      })),
    skipDuplicates: true,
  });
  logger.info({ stockId, symbol, count: rows.length }, 'analytics.benchmark.refreshed');
}

export interface BenchmarkSeries {
  /** ISO date 'YYYY-MM-DD'. */
  date: string;
  /** Rebased index value (100 at period start). Null if no data for date. */
  niftyIdx: number | null;
  sensexIdx: number | null;
}

/**
 * Fetch (and refresh) benchmark series for the requested period.
 * Returns one row per snapshot date present in the underlying StockPrice
 * table (one per trading day), rebased to 100 at the first observation.
 */
export async function getBenchmarkSeries(periodDays: number): Promise<BenchmarkSeries[]> {
  const niftyId = await ensureSyntheticStock(NIFTY, APPSETTING_NIFTY_KEY);
  const sensexId = await ensureSyntheticStock(SENSEX, APPSETTING_SENSEX_KEY);

  const from = periodDays > 0
    ? new Date(Date.now() - periodDays * 86_400_000)
    : new Date('2018-01-01T00:00:00Z');

  // Refresh first (cheap if already up to date) then read.
  await Promise.all([
    refreshSeries(niftyId, NIFTY.symbol, from),
    refreshSeries(sensexId, SENSEX.symbol, from),
  ]);

  const [niftyRows, sensexRows] = await Promise.all([
    prisma.stockPrice.findMany({
      where: { stockId: niftyId, date: { gte: from } },
      orderBy: { date: 'asc' },
      select: { date: true, close: true },
    }),
    prisma.stockPrice.findMany({
      where: { stockId: sensexId, date: { gte: from } },
      orderBy: { date: 'asc' },
      select: { date: true, close: true },
    }),
  ]);

  // Merge by date.
  const merged = new Map<string, { nifty: Decimal | null; sensex: Decimal | null }>();
  for (const r of niftyRows) {
    const key = r.date.toISOString().slice(0, 10);
    const cur = merged.get(key) ?? { nifty: null, sensex: null };
    cur.nifty = new Decimal(r.close.toString());
    merged.set(key, cur);
  }
  for (const r of sensexRows) {
    const key = r.date.toISOString().slice(0, 10);
    const cur = merged.get(key) ?? { nifty: null, sensex: null };
    cur.sensex = new Decimal(r.close.toString());
    merged.set(key, cur);
  }

  const sorted = Array.from(merged.entries()).sort(([a], [b]) => a.localeCompare(b));
  if (sorted.length === 0) return [];

  // Rebase to 100 at the first non-null observation for each series.
  let niftyBase: Decimal | null = null;
  let sensexBase: Decimal | null = null;
  for (const [, v] of sorted) {
    if (v.nifty && niftyBase == null) niftyBase = v.nifty;
    if (v.sensex && sensexBase == null) sensexBase = v.sensex;
    if (niftyBase && sensexBase) break;
  }

  return sorted.map(([date, v]) => ({
    date,
    niftyIdx: v.nifty && niftyBase ? v.nifty.dividedBy(niftyBase).times(100).toNumber() : null,
    sensexIdx: v.sensex && sensexBase ? v.sensex.dividedBy(sensexBase).times(100).toNumber() : null,
  }));
}

/**
 * Per-period monthly close series for risk computation. Returns end-of-
 * month values (or last available trading day in each month).
 */
export async function getNiftyMonthlyCloses(periodDays: number): Promise<Array<{ date: string; close: number }>> {
  const niftyId = await ensureSyntheticStock(NIFTY, APPSETTING_NIFTY_KEY);
  const from = periodDays > 0
    ? new Date(Date.now() - periodDays * 86_400_000)
    : new Date('2018-01-01T00:00:00Z');
  await refreshSeries(niftyId, NIFTY.symbol, from);
  const rows = await prisma.stockPrice.findMany({
    where: { stockId: niftyId, date: { gte: from } },
    orderBy: { date: 'asc' },
    select: { date: true, close: true },
  });
  const lastByMonth = new Map<string, { date: Date; close: number }>();
  for (const r of rows) {
    const key = r.date.toISOString().slice(0, 7);
    const cur = lastByMonth.get(key);
    if (!cur || r.date > cur.date) {
      // Float conversion for statistical (risk metric) consumption — see
      // analytics.risk.ts module-level note on the boundary.
      // eslint-disable-next-line portfolioos/no-money-coercion -- statistical computation
      lastByMonth.set(key, { date: r.date, close: Number(r.close.toString()) });
    }
  }
  return Array.from(lastByMonth.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, v]) => ({ date: v.date.toISOString().slice(0, 10), close: v.close }));
}
