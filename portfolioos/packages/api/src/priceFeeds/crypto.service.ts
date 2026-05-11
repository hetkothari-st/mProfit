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

/**
 * Fetch live INR + USD + 24h change for every active coin. Used by the
 * /api/assets/crypto/live endpoint to power the Crypto page's live overlay.
 * Falls back to the last DB row when CoinGecko rate-limits.
 */
export async function fetchLiveCryptoPrices(): Promise<LiveCryptoPriceRow[]> {
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
