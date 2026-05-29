import { request } from 'undici';
import { Decimal } from 'decimal.js';
import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';

const COINGECKO_BASE = 'https://api.coingecko.com/api/v3';

const DEFAULT_COINS: { coinGeckoId: string; symbol: string; name: string }[] = [
  { coinGeckoId: 'bitcoin', symbol: 'BTC', name: 'Bitcoin' },
  { coinGeckoId: 'ethereum', symbol: 'ETH', name: 'Ethereum' },
  { coinGeckoId: 'solana', symbol: 'SOL', name: 'Solana' },
  { coinGeckoId: 'cardano', symbol: 'ADA', name: 'Cardano' },
  { coinGeckoId: 'ripple', symbol: 'XRP', name: 'XRP' },
  { coinGeckoId: 'dogecoin', symbol: 'DOGE', name: 'Dogecoin' },
  { coinGeckoId: 'polkadot', symbol: 'DOT', name: 'Polkadot' },
  { coinGeckoId: 'matic-network', symbol: 'MATIC', name: 'Polygon' },
  { coinGeckoId: 'chainlink', symbol: 'LINK', name: 'Chainlink' },
  { coinGeckoId: 'avalanche-2', symbol: 'AVAX', name: 'Avalanche' },
  { coinGeckoId: 'binancecoin', symbol: 'BNB', name: 'BNB' },
  { coinGeckoId: 'tether', symbol: 'USDT', name: 'Tether' },
  { coinGeckoId: 'usd-coin', symbol: 'USDC', name: 'USD Coin' },
];

export async function ensureCryptoSeed(): Promise<void> {
  for (const c of DEFAULT_COINS) {
    await prisma.cryptoMaster.upsert({
      where: { coinGeckoId: c.coinGeckoId },
      update: { symbol: c.symbol, name: c.name, isActive: true },
      create: { coinGeckoId: c.coinGeckoId, symbol: c.symbol, name: c.name },
    });
  }
}

export interface CoinGeckoPrice {
  [coinId: string]: { inr?: number; usd?: number };
}

export async function fetchCoinGeckoPrices(coinIds: string[]): Promise<CoinGeckoPrice> {
  if (coinIds.length === 0) return {};
  const url = `${COINGECKO_BASE}/simple/price?ids=${coinIds.join(',')}&vs_currencies=inr,usd`;
  try {
    const res = await request(url, {
      method: 'GET',
      headers: {
        accept: 'application/json',
        'user-agent': 'PortfolioOS/0.2',
      },
    });
    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw new Error(`CoinGecko fetch failed: ${res.statusCode}`);
    }
    return (await res.body.json()) as CoinGeckoPrice;
  } catch (err) {
    logger.warn({ err }, '[crypto] CoinGecko fetch failed');
    return {};
  }
}

export interface CryptoSyncResult {
  updated: number;
  skipped: number;
}

export async function syncCryptoPrices(): Promise<CryptoSyncResult> {
  await ensureCryptoSeed();
  const coins = await prisma.cryptoMaster.findMany({ where: { isActive: true } });
  if (coins.length === 0) return { updated: 0, skipped: 0 };

  const prices = await fetchCoinGeckoPrices(coins.map((c) => c.coinGeckoId));
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  let updated = 0;
  let skipped = 0;

  for (const coin of coins) {
    const p = prices[coin.coinGeckoId];
    if (!p?.inr) {
      skipped++;
      continue;
    }
    await prisma.cryptoPrice.upsert({
      where: { cryptoId_date: { cryptoId: coin.id, date: today } },
      update: {
        priceInr: new Decimal(p.inr),
        priceUsd: p.usd != null ? new Decimal(p.usd) : null,
      },
      create: {
        cryptoId: coin.id,
        date: today,
        priceInr: new Decimal(p.inr),
        priceUsd: p.usd != null ? new Decimal(p.usd) : null,
      },
    });
    updated++;
  }

  logger.info({ updated, skipped }, '[crypto] CoinGecko sync complete');
  return { updated, skipped };
}

/**
 * Backfill daily historical INR prices for a coin via CoinGecko's
 * `market_chart` endpoint, storing one row per UTC date into `CryptoPrice`.
 *
 * `syncCryptoPrices` only ever writes today's price forward, so any chart
 * that needs a past valuation (e.g. the analytics drift line) has no data
 * before the day the daily sync first ran. This fills that gap on demand.
 *
 * CoinGecko returns hourly points for short ranges and daily for >90 days;
 * we collapse to the last observation per UTC day so both shapes persist as
 * clean daily rows. Returns the number of rows upserted (0 on any failure —
 * callers must tolerate missing history).
 */
export async function backfillCryptoHistory(
  coinGeckoId: string,
  fromDate: Date,
): Promise<number> {
  const coin = await prisma.cryptoMaster.upsert({
    where: { coinGeckoId },
    update: {},
    create: { coinGeckoId, symbol: coinGeckoId.toUpperCase(), name: coinGeckoId },
  });

  const days = Math.max(1, Math.ceil((Date.now() - fromDate.getTime()) / 86_400_000));
  const url = `${COINGECKO_BASE}/coins/${encodeURIComponent(coinGeckoId)}/market_chart?vs_currency=inr&days=${days}`;
  let prices: [number, number][] = [];
  try {
    const res = await request(url, {
      method: 'GET',
      headers: { accept: 'application/json', 'user-agent': 'PortfolioOS/0.2' },
    });
    if (res.statusCode < 200 || res.statusCode >= 300) {
      logger.warn({ coinGeckoId, status: res.statusCode }, '[crypto] history fetch non-2xx');
      return 0;
    }
    const json = (await res.body.json()) as { prices?: [number, number][] };
    prices = json.prices ?? [];
  } catch (err) {
    logger.warn({ err, coinGeckoId }, '[crypto] history fetch failed');
    return 0;
  }
  if (prices.length === 0) return 0;

  // Collapse to last price per UTC date.
  const byDate = new Map<string, { date: Date; price: number }>();
  for (const [ms, price] of prices) {
    if (price == null) continue;
    const d = new Date(ms);
    d.setUTCHours(0, 0, 0, 0);
    byDate.set(d.toISOString().slice(0, 10), { date: d, price });
  }

  let upserted = 0;
  for (const { date, price } of byDate.values()) {
    await prisma.cryptoPrice.upsert({
      where: { cryptoId_date: { cryptoId: coin.id, date } },
      update: { priceInr: new Decimal(price) },
      create: { cryptoId: coin.id, date, priceInr: new Decimal(price) },
    });
    upserted++;
  }
  logger.info({ coinGeckoId, upserted }, '[crypto] history backfilled');
  return upserted;
}

/**
 * Price of a coin at (or just before) a date, for historical valuation.
 * Resolves CryptoMaster by its CoinGecko slug (stored in Transaction.isin).
 */
export async function getCryptoPriceAt(
  coinGeckoId: string,
  date: Date,
): Promise<Decimal | null> {
  const coin = await prisma.cryptoMaster.findUnique({ where: { coinGeckoId } });
  if (!coin) return null;
  const row = await prisma.cryptoPrice.findFirst({
    where: { cryptoId: coin.id, date: { lte: date } },
    orderBy: { date: 'desc' },
  });
  return row ? new Decimal(row.priceInr.toString()) : null;
}

export async function getLatestCryptoPrice(cryptoId: string): Promise<Decimal | null> {
  const row = await prisma.cryptoPrice.findFirst({
    where: { cryptoId },
    orderBy: { date: 'desc' },
  });
  return row ? new Decimal(row.priceInr.toString()) : null;
}

/**
 * Crypto holdings store the CoinGecko ID in the Transaction/HoldingProjection
 * `isin` field (CryptoMaster has no relational FK on Transaction). Resolve the
 * internal CryptoMaster.id from that slug, then read the latest INR price.
 */
export async function getLatestCryptoPriceByCoinGeckoId(coinGeckoId: string): Promise<Decimal | null> {
  const coin = await prisma.cryptoMaster.findUnique({ where: { coinGeckoId } });
  if (!coin) return null;
  return getLatestCryptoPrice(coin.id);
}

export interface LiveCryptoPriceRow {
  coinGeckoId: string;
  symbol: string;
  name: string;
  priceInr: string | null;
  priceUsd: string | null;
  change24h: number | null;
}

// Short-lived in-memory cache so multiple concurrent browser polls share a
// single CoinGecko call. CoinGecko's free tier rate-limits, and a 10 s TTL
// lets us advertise "live" updates without burning the quota when several
// tabs / users hit the endpoint at once.
const LIVE_TTL_MS = 10_000;
let liveCache: { at: number; rows: LiveCryptoPriceRow[] } | null = null;
let liveInflight: Promise<LiveCryptoPriceRow[]> | null = null;

/**
 * Fetch live INR + USD + 24h change for every active coin. Used by the
 * /api/assets/crypto/live endpoint to power the Crypto page's live overlay.
 * Falls back to the last DB row when CoinGecko rate-limits. Coalesces
 * concurrent callers behind a 10 s cache + single-flight promise.
 */
export async function fetchLiveCryptoPrices(): Promise<LiveCryptoPriceRow[]> {
  if (liveCache && Date.now() - liveCache.at < LIVE_TTL_MS) {
    return liveCache.rows;
  }
  if (liveInflight) return liveInflight;
  liveInflight = (async () => {
    try {
      const rows = await fetchLiveCryptoPricesUncached();
      liveCache = { at: Date.now(), rows };
      return rows;
    } finally {
      liveInflight = null;
    }
  })();
  return liveInflight;
}

async function fetchLiveCryptoPricesUncached(): Promise<LiveCryptoPriceRow[]> {
  await ensureCryptoSeed();
  const coins = await prisma.cryptoMaster.findMany({ where: { isActive: true } });
  if (coins.length === 0) return [];

  const ids = coins.map((c) => c.coinGeckoId).join(',');
  const url = `${COINGECKO_BASE}/simple/price?ids=${ids}&vs_currencies=inr,usd&include_24hr_change=true`;
  let live: Record<string, { inr?: number; usd?: number; inr_24h_change?: number }> = {};
  try {
    const res = await request(url, {
      method: 'GET',
      headers: { accept: 'application/json', 'user-agent': 'PortfolioOS/0.2' },
    });
    if (res.statusCode >= 200 && res.statusCode < 300) {
      live = (await res.body.json()) as typeof live;
    }
  } catch (err) {
    logger.warn({ err }, '[crypto] live fetch failed, using DB cache');
  }

  // Batch-load the latest cached price per coin so the fallback path doesn't
  // issue one query per coin (N+1) when CoinGecko returns nothing.
  const needsCacheLookup = coins.some((c) => {
    const l = live[c.coinGeckoId];
    return l?.inr == null || l?.usd == null;
  });
  const cachedByCoinId = new Map<string, { priceInr: string | null; priceUsd: string | null }>();
  if (needsCacheLookup) {
    const cached = await prisma.cryptoPrice.findMany({
      where: { cryptoId: { in: coins.map((c) => c.id) } },
      orderBy: { date: 'desc' },
    });
    for (const row of cached) {
      if (cachedByCoinId.has(row.cryptoId)) continue;
      cachedByCoinId.set(row.cryptoId, {
        priceInr: row.priceInr?.toString() ?? null,
        priceUsd: row.priceUsd?.toString() ?? null,
      });
    }
  }

  const rows: LiveCryptoPriceRow[] = [];
  for (const coin of coins) {
    const l = live[coin.coinGeckoId];
    let priceInr: string | null = null;
    let priceUsd: string | null = null;
    if (l?.inr != null) priceInr = new Decimal(l.inr).toFixed(4);
    if (l?.usd != null) priceUsd = new Decimal(l.usd).toFixed(4);

    if (!priceInr || !priceUsd) {
      const cached = cachedByCoinId.get(coin.id);
      if (!priceInr && cached?.priceInr) priceInr = cached.priceInr;
      if (!priceUsd && cached?.priceUsd) priceUsd = cached.priceUsd;
    }

    rows.push({
      coinGeckoId: coin.coinGeckoId,
      symbol: coin.symbol,
      name: coin.name,
      priceInr,
      priceUsd,
      change24h: l?.inr_24h_change != null ? Number(l.inr_24h_change.toFixed(2)) : null,
    });
  }
  return rows;
}

export async function searchCrypto(query: string, limit = 10) {
  const q = query.trim();
  if (!q) return [];
  return prisma.cryptoMaster.findMany({
    where: {
      isActive: true,
      OR: [
        { coinGeckoId: { contains: q, mode: 'insensitive' } },
        { symbol: { contains: q, mode: 'insensitive' } },
        { name: { contains: q, mode: 'insensitive' } },
      ],
    },
    take: limit,
  });
}
