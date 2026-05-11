/**
 * NSE F&O live-quote service.
 *
 * Endpoint: https://www.nseindia.com/api/quote-derivative?symbol=<UNDERLYING>
 *   Returns every active futures + option contract for that underlying with
 *   live LTP, OI, volume. One call per underlying covers all of a user's open
 *   positions on that symbol — drastically cheaper than per-contract lookups.
 *
 * Session-cookie pattern matches `nseLive.service` / `nseOptionChain.service`.
 * Per-underlying in-process cache (5s during market hours) collapses repeated
 * polls. 429 → 30-min circuit breaker on the symbol.
 *
 * Used by `derivativePosition.service.refreshLiveFoPrices` to populate
 * `mtmPrice` + `unrealizedPnl` without waiting for EOD bhavcopy.
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
    bodyTimeout: 8_000,
    headersTimeout: 6_000,
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

const CACHE_MS = 5 * 1000;
const CIRCUIT_TRIP_MS = 30 * 60 * 1000;

interface UnderlyingSnapshot {
  underlying: string;
  underlyingValue: number;
  /** Map keyed by assetKey "fno:UNDER:TYPE:STRIKE:YYYY-MM-DD" → last-traded price */
  byAssetKey: Map<string, number>;
  fetchedAt: number;
}

const cache = new Map<string, UnderlyingSnapshot>();
const inflight = new Map<string, Promise<UnderlyingSnapshot | null>>();
const circuitOpen = new Map<string, number>();

interface NseQuoteDerivativeResponse {
  underlyingValue?: number;
  stocks?: Array<{
    metadata?: {
      instrumentType?: string; // 'Index Futures' | 'Stock Futures' | 'Index Options' | 'Stock Options'
      expiryDate?: string;     // 'DD-MMM-YYYY'
      optionType?: string;     // 'Call' | 'Put' | '-'
      strikePrice?: number;
      lastPrice?: number;
      closePrice?: number;
      prevClose?: number;
      identifier?: string;
    };
    /** Some NSE deployments tuck the live trade in a sub-object instead of metadata. */
    marketDeptOrderBook?: {
      tradeInfo?: {
        lastPrice?: number;
        closePrice?: number;
      };
    };
  }>;
}

function pickLtp(s: NonNullable<NseQuoteDerivativeResponse['stocks']>[number]): number | null {
  const md = s.metadata;
  const order = s.marketDeptOrderBook?.tradeInfo;
  const candidates = [
    md?.lastPrice,
    order?.lastPrice,
    md?.closePrice,
    order?.closePrice,
    md?.prevClose,
  ];
  for (const c of candidates) {
    if (typeof c === 'number' && Number.isFinite(c) && c > 0) return c;
  }
  return null;
}

const MONTH_TO_NUM: Record<string, string> = {
  JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06',
  JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12',
};

/** "28-Apr-2026" → "2026-04-28" (matches assetKey expiry format). */
function normalizeExpiry(raw: string | undefined): string | null {
  if (!raw) return null;
  const m = raw.match(/^(\d{2})-([A-Za-z]{3})-(\d{4})$/);
  if (!m) return null;
  const dd = m[1]!;
  const mon = MONTH_TO_NUM[m[2]!.toUpperCase()];
  const yyyy = m[3]!;
  if (!mon) return null;
  return `${yyyy}-${mon}-${dd}`;
}

/**
 * Mirror the precedence in services/assetKey.computeAssetKey:
 *   FUT  → "fno:<UND>:FUT:000000:<YYYY-MM-DD>"
 *   OPT  → "fno:<UND>:<CE|PE>:<strike padded 6>:<YYYY-MM-DD>"
 * Drift here = silent miss against DerivativePosition.assetKey.
 */
function buildAssetKey(
  underlying: string,
  instrumentType: string | undefined,
  expiry: string,
  optionType: string | undefined,
  strike: number | undefined,
): string | null {
  if (!instrumentType) return null;
  const u = underlying.toUpperCase();
  const isFut = instrumentType.toLowerCase().includes('futures');
  const isOpt = instrumentType.toLowerCase().includes('options');
  if (isFut) {
    return `fno:${u}:FUT:000000:${expiry}`;
  }
  if (isOpt) {
    if (!optionType || strike === undefined || strike === null) return null;
    const t = optionType.toLowerCase().startsWith('c') ? 'CE' : 'PE';
    const intPart = String(strike).split('.')[0]!.replace(/\D/g, '');
    const padded = (intPart || '0').padStart(6, '0');
    return `fno:${u}:${t}:${padded}:${expiry}`;
  }
  return null;
}

async function fetchUnderlyingSnapshot(underlying: string): Promise<UnderlyingSnapshot | null> {
  const tripUntil = circuitOpen.get(underlying);
  if (tripUntil && Date.now() < tripUntil) {
    logger.debug({ underlying }, '[nseLiveFo] circuit open');
    return null;
  }

  const cookies = await getSession();
  const url = `${NSE_HOME}/api/quote-derivative?symbol=${encodeURIComponent(underlying)}`;
  const res = await request(url, {
    method: 'GET',
    headers: {
      'user-agent': BROWSER_UA,
      accept: 'application/json,*/*',
      'accept-language': 'en-US,en;q=0.9',
      referer: NSE_HOME,
      cookie: cookies,
    },
    bodyTimeout: 8_000,
    headersTimeout: 6_000,
  });

  if (res.statusCode === 429) {
    circuitOpen.set(underlying, Date.now() + CIRCUIT_TRIP_MS);
    await res.body.dump();
    logger.warn({ underlying }, '[nseLiveFo] 429 — circuit tripped 30min');
    return null;
  }
  if (res.statusCode === 401 || res.statusCode === 403) {
    session = null;
    await res.body.dump();
    logger.warn({ underlying, statusCode: res.statusCode }, '[nseLiveFo] auth/forbidden — session reset');
    return null;
  }
  if (res.statusCode !== 200) {
    await res.body.dump();
    logger.warn({ underlying, statusCode: res.statusCode }, '[nseLiveFo] unexpected status');
    return null;
  }

  const json = (await res.body.json()) as NseQuoteDerivativeResponse;
  const stocks = json.stocks ?? [];
  const byAssetKey = new Map<string, number>();

  for (const s of stocks) {
    const md = s.metadata;
    if (!md) continue;
    const expiry = normalizeExpiry(md.expiryDate);
    if (!expiry) continue;
    const key = buildAssetKey(underlying, md.instrumentType, expiry, md.optionType, md.strikePrice);
    if (!key) continue;
    const ltp = pickLtp(s);
    if (ltp == null) continue;
    // First non-zero wins; NSE often returns multiple rows for the same
    // contract (different segments), only one of which has a real LTP.
    const existing = byAssetKey.get(key);
    if (existing === undefined || (existing === 0 && ltp > 0)) {
      byAssetKey.set(key, ltp);
    }
  }

  if (byAssetKey.size === 0 && stocks.length > 0) {
    // Diagnostic: parsed nothing despite NSE returning rows. Dump the first
    // few raw metadata blocks so we can see exactly what the upstream
    // shape is on this account / region.
    logger.warn(
      {
        underlying,
        stocksTotal: stocks.length,
        sampleMetadata: stocks.slice(0, 2).map((s) => s.metadata),
      },
      '[nseLiveFo] zero contracts parsed — shape mismatch',
    );
  }

  logger.debug(
    {
      underlying,
      underlyingValue: json.underlyingValue ?? 0,
      stocksTotal: stocks.length,
      contractsParsed: byAssetKey.size,
      sample: Array.from(byAssetKey.entries()).slice(0, 3),
    },
    '[nseLiveFo] fetched',
  );

  return {
    underlying,
    underlyingValue: json.underlyingValue ?? 0,
    byAssetKey,
    fetchedAt: Date.now(),
  };
}

async function getUnderlyingSnapshot(underlying: string): Promise<UnderlyingSnapshot | null> {
  const key = underlying.toUpperCase();
  const cached = cache.get(key);
  if (cached && Date.now() - cached.fetchedAt < CACHE_MS) return cached;
  const inFlight = inflight.get(key);
  if (inFlight) return inFlight;

  const promise = (async () => {
    try {
      const snap = await fetchUnderlyingSnapshot(key);
      if (snap) cache.set(key, snap);
      return snap;
    } catch (err) {
      logger.debug({ err, underlying: key }, '[nseLiveFo] fetch failed');
      return null;
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, promise);
  return promise;
}

/**
 * Live LTP for a single F&O assetKey. One NSE call covers every contract
 * on the same underlying — group your calls by underlying to amortize.
 */
export async function getLiveFoPrice(assetKey: string): Promise<number | null> {
  if (!assetKey.startsWith('fno:')) return null;
  const parts = assetKey.split(':');
  if (parts.length < 5) return null;
  const underlying = parts[1]!;
  const snap = await getUnderlyingSnapshot(underlying);
  if (!snap) return null;
  return snap.byAssetKey.get(assetKey) ?? null;
}

/**
 * Batch helper: pre-warm the cache for every distinct underlying in the
 * supplied assetKeys, then resolve each key from cache. One NSE round-trip
 * per underlying instead of per-contract.
 */
export async function getLiveFoPricesBatch(assetKeys: string[]): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  const underlyings = new Set<string>();
  for (const k of assetKeys) {
    if (!k.startsWith('fno:')) continue;
    const u = k.split(':')[1];
    if (u) underlyings.add(u);
  }
  // Sequential to respect NSE rate limits; per-underlying inflight dedup
  // means concurrent callers still collapse onto one fetch.
  for (const u of underlyings) {
    await getUnderlyingSnapshot(u);
  }
  for (const k of assetKeys) {
    const ltp = await getLiveFoPrice(k);
    if (ltp != null) result.set(k, ltp);
  }
  return result;
}
