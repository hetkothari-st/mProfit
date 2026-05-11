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
  etfNavs: Record<string, Decimal>;
  fetchedAt: Date;
}
let liveCache: LiveCache | null = null;
const LIVE_CACHE_TTL_MS = 60_000;
const TROY_OZ_TO_GRAMS = 31.1035;

// NSE gold ETF symbols — each unit trades at NAV ≈ (1/100 g) × gold price.
// Listed here so the form can auto-fill the *unit* NAV instead of misusing
// the per-gram spot. Add new ETFs as they become commonly held.
const GOLD_ETFS = [
  'GOLDBEES.NS', 'GOLDIETF.NS', 'AXISGOLD.NS', 'HDFCGOLD.NS',
  'KOTAKGOLD.NS', 'SETFGOLD.NS', 'LICMFGOLD.NS', 'QGOLDHALF.NS',
];
const SILVER_ETFS = [
  'SILVERBEES.NS', 'SILVERIETF.NS',
];

async function fetchGoldApiInr(): Promise<{ GOLD: Decimal | null; SILVER: Decimal | null }> {
  // CoinGecko public API — major platform, global CDN, no auth, no Yahoo dependency.
  // PAXG (Paxos Gold) = 1 troy oz of physical gold. Price tracks XAU very closely.
  try {
    const res = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=pax-gold&vs_currencies=inr',
      { signal: AbortSignal.timeout(8000) },
    );
    if (!res.ok) throw new Error(`CoinGecko HTTP ${res.status}`);
    const data = await res.json() as Record<string, { inr?: number }>;
    const paxgInr = data['pax-gold']?.inr;

    if (paxgInr) {
      logger.info({ paxgInr }, '[commodity] gold price from CoinGecko PAXG');
      return {
        GOLD: new Decimal(paxgInr).div(TROY_OZ_TO_GRAMS),
        SILVER: null, // silver fetched separately via Yahoo when rate limit clears
      };
    }
  } catch (err) {
    logger.warn({ err }, '[commodity] CoinGecko gold fetch failed');
  }
  return { GOLD: null, SILVER: null };
}

/**
 * Batch-fetch silver spot + gold/silver ETF NAVs in one Yahoo call so each
 * asset type can display the right number (per-gram for physical / SGB, per-
 * unit NAV for ETFs). Silver spot uses SI=F (USD/oz) × USD/INR to avoid the
 * SILVERBEES.NS rate-limit issue that was leaving the field blank.
 */
async function fetchYahooBundle(): Promise<{
  silverInrPerGram: Decimal | null;
  goldInrPerGramFallback: Decimal | null;
  etfNavs: Record<string, Decimal>;
}> {
  const symbols = ['SI=F', 'GC=F', 'INR=X', ...GOLD_ETFS, ...SILVER_ETFS];
  const arr = await yahooQuoteRaw(symbols);
  const bySym = new Map<string, any>();
  for (const q of arr) if (q?.symbol) bySym.set(q.symbol, q);

  const fxQ = bySym.get('INR=X');
  const usdInr = fxQ && typeof fxQ.regularMarketPrice === 'number'
    ? new Decimal(fxQ.regularMarketPrice) : null;

  const siQ = bySym.get('SI=F');
  let silverInrPerGram: Decimal | null = null;
  if (siQ && typeof siQ.regularMarketPrice === 'number' && usdInr) {
    silverInrPerGram = new Decimal(siQ.regularMarketPrice).times(usdInr).div(TROY_OZ_TO_GRAMS);
  }

  const gcQ = bySym.get('GC=F');
  let goldInrPerGramFallback: Decimal | null = null;
  if (gcQ && typeof gcQ.regularMarketPrice === 'number' && usdInr) {
    goldInrPerGramFallback = new Decimal(gcQ.regularMarketPrice).times(usdInr).div(TROY_OZ_TO_GRAMS);
  }

  const etfNavs: Record<string, Decimal> = {};
  for (const sym of [...GOLD_ETFS, ...SILVER_ETFS]) {
    const q = bySym.get(sym);
    if (q && typeof q.regularMarketPrice === 'number') {
      // Store keyed by ticker (strip `.NS`) so the frontend can match on the
      // user-typed asset name without worrying about the exchange suffix.
      const ticker = sym.replace(/\.NS$/, '');
      etfNavs[ticker] = new Decimal(q.regularMarketPrice);
    }
  }
  return { silverInrPerGram, goldInrPerGramFallback, etfNavs };
}

export async function fetchLivePrices(): Promise<{
  GOLD: Decimal | null;
  SILVER: Decimal | null;
  etfNavs: Record<string, Decimal>;
  fetchedAt: Date;
}> {
  const now = new Date();
  if (liveCache && now.getTime() - liveCache.fetchedAt.getTime() < LIVE_CACHE_TTL_MS) {
    return liveCache;
  }

  // Primary: CoinGecko PAXG for gold per-gram INR (rock-solid, no key).
  let { GOLD, SILVER } = await fetchGoldApiInr();

  // Yahoo bundle: silver via SI=F + USD/INR, gold fallback via GC=F, ETF NAVs.
  const yahoo = await fetchYahooBundle();
  if (!GOLD) GOLD = yahoo.goldInrPerGramFallback;
  if (!SILVER) SILVER = yahoo.silverInrPerGram;

  liveCache = { GOLD, SILVER, etfNavs: yahoo.etfNavs, fetchedAt: now };
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
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const out: CommoditySyncResult[] = [];

  // Primary: metals.live (cloud-friendly, no auth)
  const { GOLD: liveGold, SILVER: liveSilver } = await fetchGoldApiInr();

  if (liveGold) {
    await prisma.commodityPrice.upsert({
      where: { commodity_date_unit: { commodity: 'GOLD', date: today, unit: 'PROXY_ETF' } },
      update: { price: liveGold },
      create: { commodity: 'GOLD', date: today, price: liveGold, unit: 'PROXY_ETF', source: 'METALS_LIVE' },
    });
    out.push({ commodity: 'GOLD', price: liveGold.toFixed(4), stored: true });
  } else {
    out.push({ commodity: 'GOLD', price: null, stored: false });
  }

  if (liveSilver) {
    await prisma.commodityPrice.upsert({
      where: { commodity_date_unit: { commodity: 'SILVER', date: today, unit: 'PROXY_ETF' } },
      update: { price: liveSilver },
      create: { commodity: 'SILVER', date: today, price: liveSilver, unit: 'PROXY_ETF', source: 'METALS_LIVE' },
    });
    out.push({ commodity: 'SILVER', price: liveSilver.toFixed(4), stored: true });
  } else {
    out.push({ commodity: 'SILVER', price: null, stored: false });
  }

  // Platinum: Yahoo only (not on metals.live)
  const platArr = await yahooQuoteRaw([PROXIES.PLATINUM.yahooInr]);
  const platQ = platArr[0];
  if (platQ && typeof platQ.regularMarketPrice === 'number') {
    const price = new Decimal(platQ.regularMarketPrice);
    await prisma.commodityPrice.upsert({
      where: { commodity_date_unit: { commodity: 'PLATINUM', date: today, unit: 'PROXY_ETF' } },
      update: { price },
      create: { commodity: 'PLATINUM', date: today, price, unit: 'PROXY_ETF', source: 'YAHOO_ETF_PROXY' },
    });
    out.push({ commodity: 'PLATINUM', price: price.toFixed(4), stored: true });
  } else {
    out.push({ commodity: 'PLATINUM', price: null, stored: false });
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
