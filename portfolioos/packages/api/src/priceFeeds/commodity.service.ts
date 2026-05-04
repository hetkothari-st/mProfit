import { Decimal } from 'decimal.js';
import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';
import { yahooQuoteRaw } from './yahooClient.js';
import type { CommodityType } from '@prisma/client';

/**
 * Gold/Silver spot pricing strategy.
 * Primary: IBJA (India Bullion and Jewellers Association) rates — the canonical
 * India spot source but they publish via a website, not JSON. So we use a
 * pragmatic proxy: yahoo-finance `GOLDBEES.NS` (SBI Gold ETF) / `SILVERBEES.NS`
 * as INR-denominated market proxies, plus `GC=F` / `SI=F` futures for USD spot.
 */

const PROXIES: Record<CommodityType, { yahooInr: string; yahooUsd: string }> = {
  GOLD: { yahooInr: 'GOLDBEES.NS', yahooUsd: 'GC=F' },
  SILVER: { yahooInr: 'SILVERBEES.NS', yahooUsd: 'SI=F' },
  PLATINUM: { yahooInr: 'PL=F', yahooUsd: 'PL=F' },
};

// In-memory cache for live price endpoint — prevents hammering external APIs on every frontend poll.
// TTL: 60s. Primary: gold-api.com (no key) + exchangerate-api.com. Fallback: Yahoo ETF proxy.
interface LiveCache {
  GOLD: Decimal | null;
  SILVER: Decimal | null;
  fetchedAt: Date;
}
let liveCache: LiveCache | null = null;
const LIVE_CACHE_TTL_MS = 60_000;
const TROY_OZ_TO_GRAMS = 31.1035;

async function fetchGoldApiInr(): Promise<{ GOLD: Decimal | null; SILVER: Decimal | null }> {
  try {
    const [goldRes, silverRes, fxRes] = await Promise.all([
      fetch('https://api.gold-api.com/price/XAU', { signal: AbortSignal.timeout(5000) }),
      fetch('https://api.gold-api.com/price/XAG', { signal: AbortSignal.timeout(5000) }),
      fetch('https://api.exchangerate-api.com/v4/latest/USD', { signal: AbortSignal.timeout(5000) }),
    ]);
    const [goldData, silverData, fxData] = await Promise.all([
      goldRes.json() as Promise<{ price?: number }>,
      silverRes.json() as Promise<{ price?: number }>,
      fxRes.json() as Promise<{ rates?: Record<string, number> }>,
    ]);
    const usdInr = fxData?.rates?.INR;
    if (!usdInr) return { GOLD: null, SILVER: null };

    const goldInr = goldData?.price
      ? new Decimal(goldData.price).div(TROY_OZ_TO_GRAMS).times(usdInr)
      : null;
    const silverInr = silverData?.price
      ? new Decimal(silverData.price).div(TROY_OZ_TO_GRAMS).times(usdInr)
      : null;

    return { GOLD: goldInr, SILVER: silverInr };
  } catch (err) {
    logger.warn({ err }, '[commodity] gold-api fetch failed, will try Yahoo fallback');
    return { GOLD: null, SILVER: null };
  }
}

export async function fetchLivePrices(): Promise<{ GOLD: Decimal | null; SILVER: Decimal | null; fetchedAt: Date }> {
  const now = new Date();
  if (liveCache && now.getTime() - liveCache.fetchedAt.getTime() < LIVE_CACHE_TTL_MS) {
    return liveCache;
  }

  // Primary: gold-api.com (free, no key, returns real-time USD spot)
  let { GOLD, SILVER } = await fetchGoldApiInr();

  // Fallback: Yahoo ETF proxy (GOLDBEES.NS / SILVERBEES.NS)
  if (!GOLD || !SILVER) {
    const arr = await yahooQuoteRaw([PROXIES.GOLD.yahooInr, PROXIES.SILVER.yahooInr]);
    const bySymbol = new Map<string, any>();
    for (const q of arr) if (q?.symbol) bySymbol.set(q.symbol, q);
    const goldQ = bySymbol.get(PROXIES.GOLD.yahooInr);
    const silverQ = bySymbol.get(PROXIES.SILVER.yahooInr);
    if (!GOLD && goldQ && typeof goldQ.regularMarketPrice === 'number')
      GOLD = new Decimal(goldQ.regularMarketPrice);
    if (!SILVER && silverQ && typeof silverQ.regularMarketPrice === 'number')
      SILVER = new Decimal(silverQ.regularMarketPrice);
  }

  liveCache = { GOLD, SILVER, fetchedAt: now };
  return liveCache;
}

export async function fetchCommoditySpotInr(
  commodity: CommodityType,
): Promise<Decimal | null> {
  const sym = PROXIES[commodity].yahooInr;
  const arr = await yahooQuoteRaw([sym]);
  const q = arr[0];
  if (q && typeof q.regularMarketPrice === 'number') {
    return new Decimal(q.regularMarketPrice);
  }
  return null;
}

export interface CommoditySyncResult {
  commodity: CommodityType;
  // Spot price is a per-gram rupee value — keep it in the Money dimension
  // (string, §3.2) so aggregators that sum commodity-weighted holdings stay
  // exact. Callers rehydrate via toDecimal.
  price: string | null;
  stored: boolean;
}

export async function syncCommodityPrice(
  commodity: CommodityType,
): Promise<CommoditySyncResult> {
  const price = await fetchCommoditySpotInr(commodity);
  if (!price) return { commodity, price: null, stored: false };

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  await prisma.commodityPrice.upsert({
    where: {
      commodity_date_unit: {
        commodity,
        date: today,
        unit: 'PROXY_ETF',
      },
    },
    update: { price },
    create: {
      commodity,
      date: today,
      price,
      unit: 'PROXY_ETF',
      source: 'YAHOO_ETF_PROXY',
    },
  });

  return { commodity, price: price.toFixed(4), stored: true };
}

export async function syncAllCommodities(): Promise<CommoditySyncResult[]> {
  const commodities: CommodityType[] = ['GOLD', 'SILVER', 'PLATINUM'];
  const symbols = commodities.map((c) => PROXIES[c].yahooInr);
  const arr = await yahooQuoteRaw(symbols);
  const bySym = new Map<string, any>();
  for (const q of arr) if (q?.symbol) bySym.set(q.symbol, q);

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const out: CommoditySyncResult[] = [];

  for (const c of commodities) {
    const q = bySym.get(PROXIES[c].yahooInr);
    if (!q || typeof q.regularMarketPrice !== 'number') {
      out.push({ commodity: c, price: null, stored: false });
      continue;
    }
    const price = new Decimal(q.regularMarketPrice);
    await prisma.commodityPrice.upsert({
      where: { commodity_date_unit: { commodity: c, date: today, unit: 'PROXY_ETF' } },
      update: { price },
      create: { commodity: c, date: today, price, unit: 'PROXY_ETF', source: 'YAHOO_ETF_PROXY' },
    });
    out.push({ commodity: c, price: price.toFixed(4), stored: true });
  }
  logger.info({ out }, '[commodity] all commodities synced');
  return out;
}

export async function getLatestCommodityPrice(
  commodity: CommodityType,
): Promise<Decimal | null> {
  const row = await prisma.commodityPrice.findFirst({
    where: { commodity },
    orderBy: { date: 'desc' },
  });
  return row ? new Decimal(row.price.toString()) : null;
}
