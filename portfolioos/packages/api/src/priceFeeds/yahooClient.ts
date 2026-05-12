import yahooFinance from 'yahoo-finance2';
import { logger } from '../lib/logger.js';

yahooFinance.suppressNotices(['yahooSurvey']);

const MIN_GAP_MS = 250;
const CHUNK_SIZE = 40;
const BACKOFF_MS = 5000;
const MAX_RETRIES = 3;

let lastCallAt = 0;
let chain: Promise<void> = Promise.resolve();

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function isRateLimitError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /too many requests|429|rate ?limit/i.test(msg);
}

async function throttled<T>(fn: () => Promise<T>): Promise<T> {
  let resolveSlot: () => void = () => {};
  const mySlot = new Promise<void>((r) => (resolveSlot = r));
  const prev = chain;
  chain = mySlot;
  await prev;

  try {
    const gap = Date.now() - lastCallAt;
    if (gap < MIN_GAP_MS) await sleep(MIN_GAP_MS - gap);
    const out = await fn();
    lastCallAt = Date.now();
    return out;
  } finally {
    resolveSlot();
  }
}

export async function yahooQuoteRaw(symbols: string[]): Promise<any[]> {
  const out: any[] = [];
  for (let i = 0; i < symbols.length; i += CHUNK_SIZE) {
    const chunk = symbols.slice(i, i + CHUNK_SIZE);
    let attempt = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      try {
        const results = await throttled(() => yahooFinance.quote(chunk));
        out.push(...(Array.isArray(results) ? results : [results]));
        break;
      } catch (err) {
        if (isRateLimitError(err) && attempt < MAX_RETRIES) {
          const wait = BACKOFF_MS * Math.pow(2, attempt);
          logger.warn({ attempt, wait, size: chunk.length }, '[yahoo] rate-limited, backing off');
          await sleep(wait);
          attempt++;
          continue;
        }
        logger.warn({ err, chunkStart: i, chunkSize: chunk.length }, '[yahoo] chunk failed, skipping');
        break;
      }
    }
  }
  return out;
}

export async function yahooQuoteOne(symbol: string): Promise<any | null> {
  const arr = await yahooQuoteRaw([symbol]);
  return arr[0] ?? null;
}

export async function yahooSearch(query: string, limit: number): Promise<any[]> {
  try {
    const res = await throttled(() =>
      yahooFinance.search(query, { quotesCount: limit, newsCount: 0 }),
    );
    return res.quotes ?? [];
  } catch (err) {
    logger.warn({ err, query }, '[yahoo] search failed');
    return [];
  }
}

export async function yahooHistorical(
  symbol: string,
  period1: Date,
  period2: Date,
  interval: '1d' | '1wk' | '1mo' = '1d',
): Promise<any[]> {
  try {
    return await throttled(() => yahooFinance.historical(symbol, { period1, period2, interval }));
  } catch (err) {
    logger.warn({ err, symbol }, '[yahoo] historical failed');
    return [];
  }
}

/**
 * Fetch instrument profile (sector / industry / long name). Used to backfill
 * StockMaster.sector once a holding lands in the portfolio so the sector
 * pie can group equity exposure properly. Returns null on any failure —
 * callers must tolerate missing profile data (Yahoo often omits sector for
 * mid/small-cap NSE listings).
 */
export async function yahooProfile(symbol: string): Promise<{
  sector: string | null;
  industry: string | null;
  longName: string | null;
} | null> {
  try {
    const res = await throttled(() =>
      yahooFinance.quoteSummary(symbol, { modules: ['summaryProfile', 'price'] }),
    );
    const profile = (res as any)?.summaryProfile ?? null;
    const price = (res as any)?.price ?? null;
    return {
      sector: profile?.sector ?? null,
      industry: profile?.industry ?? null,
      longName: price?.longName ?? null,
    };
  } catch (err) {
    logger.warn({ err, symbol }, '[yahoo] profile failed');
    return null;
  }
}
