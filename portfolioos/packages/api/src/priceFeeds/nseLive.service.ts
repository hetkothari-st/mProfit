/**
 * NSE India live price service.
 *
 * NSE's quote API requires a session obtained by first hitting the homepage.
 * Session cookies are cached for 25 minutes. On failure falls through to null
 * so callers can use bhavcopy as next fallback.
 */
import { request } from 'undici';
import { Decimal } from 'decimal.js';
import { logger } from '../lib/logger.js';

const NSE_HOME = 'https://www.nseindia.com';
const NSE_QUOTE_API = 'https://www.nseindia.com/api/quote-equity?symbol=';

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

interface Session {
  cookies: string;
  expiresAt: number;
}

let session: Session | null = null;
const SESSION_TTL_MS = 25 * 60 * 1000; // 25 min

async function fetchSession(): Promise<string> {
  try {
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
    const cookies = (Array.isArray(rawCookies) ? rawCookies : [rawCookies])
      .map((c) => c.split(';')[0])
      .filter(Boolean)
      .join('; ');
    logger.debug({ cookieCount: cookies.split(';').length }, '[nseLive] session established');
    return cookies;
  } catch (err) {
    throw new Error(`NSE session fetch failed: ${(err as Error).message}`);
  }
}

async function getSession(): Promise<string> {
  if (session && Date.now() < session.expiresAt) return session.cookies;
  const cookies = await fetchSession();
  session = { cookies, expiresAt: Date.now() + SESSION_TTL_MS };
  return cookies;
}

export async function getNseLivePrice(symbol: string): Promise<Decimal | null> {
  try {
    const cookies = await getSession();
    const url = `${NSE_QUOTE_API}${encodeURIComponent(symbol.toUpperCase())}`;
    const res = await request(url, {
      method: 'GET',
      headers: {
        'user-agent': BROWSER_UA,
        accept: 'application/json, */*',
        'accept-language': 'en-US,en;q=0.9',
        referer: NSE_HOME,
        cookie: cookies,
      },
      bodyTimeout: 15_000,
      headersTimeout: 10_000,
    });
    if (res.statusCode === 401 || res.statusCode === 403) {
      // Session expired — reset so next call re-fetches
      session = null;
      await res.body.dump();
      return null;
    }
    if (res.statusCode !== 200) {
      await res.body.dump();
      return null;
    }
    const json = (await res.body.json()) as Record<string, unknown>;
    // NSE JSON shape: { priceInfo: { lastPrice: number, ... } }
    const priceInfo = json['priceInfo'] as Record<string, unknown> | undefined;
    const last = priceInfo?.['lastPrice'] ?? priceInfo?.['close'];
    if (typeof last !== 'number' || last <= 0) return null;
    return new Decimal(last);
  } catch (err) {
    logger.debug({ err, symbol }, '[nseLive] quote failed');
    return null;
  }
}

/**
 * Fetch live prices for a batch of symbols. Returns a map of symbol → price.
 * Symbols that fail return no entry (caller treats as null).
 * Rate-limited to ~3 req/s to avoid NSE blocks.
 */
export async function getNseLivePricesBatch(
  symbols: string[],
): Promise<Map<string, Decimal>> {
  const map = new Map<string, Decimal>();
  if (symbols.length === 0) return map;
  const DELAY_MS = 350; // ~3 req/s
  for (const sym of symbols) {
    const price = await getNseLivePrice(sym);
    if (price) map.set(sym.toUpperCase(), price);
    await new Promise((r) => setTimeout(r, DELAY_MS));
  }
  return map;
}
