/**
 * NSE option-chain fetcher. Reuses the session-cookie pattern from
 * `nseLive.service` because NSE blocks JSON API calls without a recent
 * homepage cookie.
 *
 * Endpoint:
 *   /api/option-chain-indices?symbol=NIFTY    (indices)
 *   /api/option-chain-equities?symbol=RELIANCE (single-stock)
 *
 * Caches per-underlying for 60s in-process (NSE rate-limits aggressively).
 * Per-underlying debouncer collapses concurrent requests for the same
 * underlying onto one in-flight promise. On 429 we trip a 30-min circuit
 * breaker per underlying.
 */

import { request } from 'undici';
import { logger } from '../lib/logger.js';

const NSE_HOME = 'https://www.nseindia.com';
const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

interface Session {
  cookies: string;
  expiresAt: number;
}
let session: Session | null = null;
const SESSION_TTL_MS = 25 * 60 * 1000;

async function fetchSession(): Promise<string> {
  const res = await request(NSE_HOME, {
    method: 'GET',
    headers: {
      'user-agent': BROWSER_UA,
      accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'accept-language': 'en-US,en;q=0.9',
    },
    maxRedirections: 5,
    bodyTimeout: 20_000,
    headersTimeout: 15_000,
  });
  const rawCookies = res.headers['set-cookie'];
  await res.body.dump();
  if (!rawCookies) throw new Error('no cookies from NSE homepage');
  return (Array.isArray(rawCookies) ? rawCookies : [rawCookies])
    .map((c) => c.split(';')[0])
    .filter(Boolean)
    .join('; ');
}

async function getSession(): Promise<string> {
  if (session && Date.now() < session.expiresAt) return session.cookies;
  const cookies = await fetchSession();
  session = { cookies, expiresAt: Date.now() + SESSION_TTL_MS };
  return cookies;
}

export interface OptionChainStrikeRow {
  strike: number;
  ce?: {
    ltp: number;
    bid: number;
    ask: number;
    iv: number | null;
    oi: number;
    volume: number;
    delta?: number | null;
  };
  pe?: {
    ltp: number;
    bid: number;
    ask: number;
    iv: number | null;
    oi: number;
    volume: number;
    delta?: number | null;
  };
}

export interface OptionChainSnapshot {
  underlying: string;
  underlyingValue: number;
  expiryDate: string; // primary expiry shown
  expiryDates: string[];
  fetchedAt: string;
  strikes: OptionChainStrikeRow[];
}

const CACHE_MS = 60 * 1000;
const CIRCUIT_TRIP_MS = 30 * 60 * 1000;
const cache = new Map<string, { value: OptionChainSnapshot; expiresAt: number }>();
const inflight = new Map<string, Promise<OptionChainSnapshot | null>>();
const circuitOpen = new Map<string, number>();

const INDEX_UNDERLYINGS = new Set(['NIFTY', 'BANKNIFTY', 'FINNIFTY', 'MIDCPNIFTY', 'NIFTYNXT50']);

function buildUrl(symbol: string): string {
  const isIndex = INDEX_UNDERLYINGS.has(symbol.toUpperCase());
  return isIndex
    ? `${NSE_HOME}/api/option-chain-indices?symbol=${encodeURIComponent(symbol.toUpperCase())}`
    : `${NSE_HOME}/api/option-chain-equities?symbol=${encodeURIComponent(symbol.toUpperCase())}`;
}

interface NseOcResponse {
  records?: {
    expiryDates?: string[];
    underlyingValue?: number;
    data?: Array<{
      strikePrice: number;
      expiryDate: string;
      CE?: {
        lastPrice: number;
        bidprice: number;
        askPrice: number;
        impliedVolatility: number;
        openInterest: number;
        totalTradedVolume: number;
      };
      PE?: {
        lastPrice: number;
        bidprice: number;
        askPrice: number;
        impliedVolatility: number;
        openInterest: number;
        totalTradedVolume: number;
      };
    }>;
  };
}

async function fetchChain(symbol: string): Promise<OptionChainSnapshot | null> {
  const tripUntil = circuitOpen.get(symbol);
  if (tripUntil && Date.now() < tripUntil) {
    logger.debug({ symbol }, '[nseOptionChain] circuit open');
    return null;
  }
  const cookies = await getSession();
  const url = buildUrl(symbol);
  const res = await request(url, {
    method: 'GET',
    headers: {
      'user-agent': BROWSER_UA,
      accept: 'application/json,*/*',
      'accept-language': 'en-US,en;q=0.9',
      referer: NSE_HOME,
      cookie: cookies,
    },
    bodyTimeout: 15_000,
    headersTimeout: 10_000,
  });
  if (res.statusCode === 429) {
    circuitOpen.set(symbol, Date.now() + CIRCUIT_TRIP_MS);
    await res.body.dump();
    logger.warn({ symbol }, '[nseOptionChain] 429 — circuit tripped 30min');
    return null;
  }
  if (res.statusCode === 401 || res.statusCode === 403) {
    session = null;
    await res.body.dump();
    return null;
  }
  if (res.statusCode !== 200) {
    await res.body.dump();
    return null;
  }
  const json = (await res.body.json()) as NseOcResponse;
  const records = json.records;
  if (!records?.data || records.data.length === 0) return null;

  const expiryDates = records.expiryDates ?? [];
  const primaryExpiry = expiryDates[0] ?? '';
  const strikesMap = new Map<number, OptionChainStrikeRow>();

  for (const row of records.data) {
    if (row.expiryDate !== primaryExpiry) continue;
    const k = row.strikePrice;
    let dst = strikesMap.get(k);
    if (!dst) {
      dst = { strike: k };
      strikesMap.set(k, dst);
    }
    if (row.CE) {
      dst.ce = {
        ltp: row.CE.lastPrice,
        bid: row.CE.bidprice,
        ask: row.CE.askPrice,
        iv: row.CE.impliedVolatility ? row.CE.impliedVolatility / 100 : null,
        oi: row.CE.openInterest,
        volume: row.CE.totalTradedVolume,
      };
    }
    if (row.PE) {
      dst.pe = {
        ltp: row.PE.lastPrice,
        bid: row.PE.bidprice,
        ask: row.PE.askPrice,
        iv: row.PE.impliedVolatility ? row.PE.impliedVolatility / 100 : null,
        oi: row.PE.openInterest,
        volume: row.PE.totalTradedVolume,
      };
    }
  }

  return {
    underlying: symbol.toUpperCase(),
    underlyingValue: records.underlyingValue ?? 0,
    expiryDate: primaryExpiry,
    expiryDates,
    fetchedAt: new Date().toISOString(),
    strikes: Array.from(strikesMap.values()).sort((a, b) => a.strike - b.strike),
  };
}

export async function getOptionChainSnapshot(symbol: string): Promise<OptionChainSnapshot | null> {
  const key = symbol.toUpperCase();
  const cached = cache.get(key);
  if (cached && Date.now() < cached.expiresAt) return cached.value;
  const inFlight = inflight.get(key);
  if (inFlight) return inFlight;
  const promise = (async () => {
    try {
      const snap = await fetchChain(key);
      if (snap) cache.set(key, { value: snap, expiresAt: Date.now() + CACHE_MS });
      return snap;
    } catch (err) {
      logger.debug({ err, symbol: key }, '[nseOptionChain] fetch failed');
      return null;
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, promise);
  return promise;
}
