import { prisma, runInTransaction } from '../../lib/prisma.js';
import { logger } from '../../lib/logger.js';
import { fetchHistorical } from '../../priceFeeds/yahoo.service.js';
import { backfillCryptoHistory } from '../../priceFeeds/crypto.service.js';
import { backfillMfNavHistory } from '../../priceFeeds/amfi.service.js';

/**
 * On-demand historical price backfill for the analytics historical-valuation
 * path (portfolio value line + cost/value drift).
 *
 * The daily price crons only ever write *today's* price forward, so any
 * snapshot before the cron first ran has no price and the valuation falls
 * back to cost — which makes the drift chart read a flat 0% until the most
 * recent point. This pulls real historical series (Yahoo for stocks, mfapi.in
 * for MF NAVs, CoinGecko for crypto) so past snapshots get real values.
 *
 * Each holding is gated on existing in-window coverage so a warm cache skips
 * the external call; only genuinely missing series are fetched. All failures
 * are swallowed (logged) — a missing feed must never break the chart.
 */

/**
 * This runs inside analytics requests, so it must never make a request pay for the same slow provider call
 * twice. Per asset (and per process):
 *  - one attempt covers ATTEMPT_TTL_MS whether it found data or not. Before this, an asset the provider
 *    knew nothing about (delisted, renamed, throttled) was fetched again on EVERY dashboard load, and a
 *    recently listed one re-downloaded its short history every time;
 *  - concurrent requests share the attempt in flight;
 *  - a request waits at most WAIT_CAP_MS for it. The fetch carries on in the background, so the data is
 *    there for the next load, and this one values the asset at cost (as it already does without prices).
 */
const ATTEMPT_TTL_MS = 6 * 3_600_000;
const WAIT_CAP_MS = 5_000;
const lastAttempt = new Map<string, number>();
const inFlight = new Map<string, Promise<void>>();

function attemptOnce(key: string, run: () => Promise<void>): Promise<void> {
  const last = lastAttempt.get(key);
  if (last !== undefined && Date.now() - last < ATTEMPT_TTL_MS) return Promise.resolve();
  let p = inFlight.get(key);
  if (!p) {
    p = run()
      .finally(() => {
        // Stamped on failure too: a provider that is down is not asked again for every request.
        lastAttempt.set(key, Date.now());
        inFlight.delete(key);
        if (lastAttempt.size > 20_000) {
          const cutoff = Date.now() - ATTEMPT_TTL_MS;
          for (const [k, t] of lastAttempt) if (t < cutoff) lastAttempt.delete(k);
        }
      });
    // The background run must never become an unhandled rejection; the caller below reports failures.
    p.catch(() => undefined);
    inFlight.set(key, p);
  }
  const attempt = p;
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, WAIT_CAP_MS);
    timer.unref();
    attempt.then(
      () => {
        clearTimeout(timer);
        resolve();
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

/** Test hook: forget every attempt. */
export function resetBackfillAttempts(): void {
  lastAttempt.clear();
  inFlight.clear();
}

/** Approx trading days (stocks/MF skip weekends ≈ 5/7 of calendar days). */
function tradingDaysSince(fromDate: Date): number {
  const calDays = Math.max(1, Math.ceil((Date.now() - fromDate.getTime()) / 86_400_000));
  return Math.floor(calDays * (5 / 7));
}

async function backfillStock(stockId: string, fromDate: Date): Promise<void> {
  const have = await prisma.stockPrice.count({ where: { stockId, date: { gte: fromDate } } });
  // 40% of expected trading days is enough to value every monthly snapshot.
  if (have >= tradingDaysSince(fromDate) * 0.4) return;
  const s = await prisma.stockMaster.findUnique({
    where: { id: stockId },
    select: { symbol: true, exchange: true },
  });
  if (!s) return;
  const bars = await fetchHistorical(s.symbol, s.exchange, fromDate);
  if (bars.length === 0) return;
  await runInTransaction(async (tx) => {
    for (const b of bars) {
      await tx.stockPrice.upsert({
        where: { stockId_date: { stockId, date: b.date } },
        update: {
          open: b.open.toString(),
          high: b.high.toString(),
          low: b.low.toString(),
          close: b.close.toString(),
        },
        create: {
          stockId,
          date: b.date,
          open: b.open.toString(),
          high: b.high.toString(),
          low: b.low.toString(),
          close: b.close.toString(),
        },
      });
    }
  });
  logger.info({ stockId, symbol: s.symbol, bars: bars.length }, '[analytics.backfill] stock history');
}

async function backfillFund(fundId: string, fromDate: Date): Promise<void> {
  const have = await prisma.mFNav.count({ where: { fundId, date: { gte: fromDate } } });
  if (have >= tradingDaysSince(fromDate) * 0.4) return;
  const fund = await prisma.mutualFundMaster.findUnique({
    where: { id: fundId },
    select: { schemeCode: true },
  });
  if (!fund?.schemeCode) return;
  await backfillMfNavHistory(fundId, fund.schemeCode, fromDate);
}

async function backfillCrypto(coinGeckoId: string, fromDate: Date): Promise<void> {
  const coin = await prisma.cryptoMaster.findUnique({
    where: { coinGeckoId },
    select: { id: true },
  });
  if (coin) {
    const calDays = Math.max(1, Math.ceil((Date.now() - fromDate.getTime()) / 86_400_000));
    const have = await prisma.cryptoPrice.count({
      where: { cryptoId: coin.id, date: { gte: fromDate } },
    });
    // Crypto trades 7 days/week; gate at 60% of calendar days.
    if (have >= calDays * 0.6) return;
  }
  await backfillCryptoHistory(coinGeckoId, fromDate);
}

/**
 * Ensure historical prices exist for every priced holding in a portfolio over
 * the window `[fromDate, now]`. Best-effort and idempotent.
 */
export async function ensureHistoricalPricesForPortfolio(
  portfolioId: string,
  fromDate: Date,
): Promise<void> {
  // One row per distinct asset (SQL GROUP BY) instead of one per transaction.
  const txs = await prisma.transaction.groupBy({
    by: ['assetClass', 'stockId', 'fundId', 'isin'],
    where: { portfolioId },
  });
  if (txs.length === 0) return;

  const stockIds = new Set<string>();
  const fundIds = new Set<string>();
  const cryptoSlugs = new Set<string>();
  for (const t of txs) {
    if (t.stockId) stockIds.add(t.stockId);
    else if (t.fundId) fundIds.add(t.fundId);
    else if (t.assetClass === 'CRYPTOCURRENCY' && t.isin) cryptoSlugs.add(t.isin);
  }

  // The window start is part of the key: a short-period request must not stop a longer one fetching more.
  const win = fromDate.toISOString().slice(0, 10);
  const tasks: Promise<void>[] = [];
  for (const id of stockIds) tasks.push(attemptOnce(`s:${id}:${win}`, () => backfillStock(id, fromDate)));
  for (const id of fundIds) tasks.push(attemptOnce(`f:${id}:${win}`, () => backfillFund(id, fromDate)));
  for (const slug of cryptoSlugs) tasks.push(attemptOnce(`c:${slug}:${win}`, () => backfillCrypto(slug, fromDate)));

  const results = await Promise.allSettled(tasks);
  for (const r of results) {
    if (r.status === 'rejected') {
      logger.warn({ err: r.reason, portfolioId }, '[analytics.backfill] holding backfill failed');
    }
  }
}
