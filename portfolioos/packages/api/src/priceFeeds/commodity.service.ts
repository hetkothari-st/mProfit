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

// In-memory cache for the live price endpoint. Short TTL so user-visible
// ticks feel continuous; stale-while-revalidate keeps every request instant
// even when upstreams are slow — a stale snapshot is returned immediately and
// a background refresh kicks off.
interface LiveCache {
  GOLD: Decimal | null;
  SILVER: Decimal | null;
  etfNavs: Record<string, Decimal>;
  fetchedAt: Date;
}
let liveCache: LiveCache | null = null;
let inflightRefresh: Promise<LiveCache> | null = null;
const LIVE_CACHE_TTL_MS = 15_000;
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

async function fetchUsdInr(): Promise<Decimal | null> {
  // Yahoo INR=X is the fast path; fall back to exchangerate-api, then
  // Frankfurter (ECB data, no key, no rate limits) when prior sources fail.
  try {
    const arr = await yahooQuoteRaw(['INR=X']);
    const q = arr[0];
    if (q && typeof q.regularMarketPrice === 'number' && q.regularMarketPrice > 0) {
      return new Decimal(q.regularMarketPrice);
    }
  } catch (err) {
    logger.warn({ err }, '[commodity] Yahoo INR=X failed');
  }
  try {
    const res = await fetch('https://api.exchangerate-api.com/v4/latest/USD', {
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      const j = await res.json() as { rates?: Record<string, number> };
      const inr = j.rates?.['INR'];
      if (inr && inr > 0) return new Decimal(inr);
    }
  } catch (err) {
    logger.warn({ err }, '[commodity] exchangerate-api failed');
  }
  try {
    const res = await fetch('https://api.frankfurter.app/latest?from=USD&to=INR', {
      signal: AbortSignal.timeout(7000),
    });
    if (res.ok) {
      const j = await res.json() as { rates?: Record<string, number> };
      const inr = j.rates?.['INR'];
      if (inr && inr > 0) {
        logger.info({ inr }, '[commodity] USD/INR from Frankfurter');
        return new Decimal(inr);
      }
    }
  } catch (err) {
    logger.warn({ err }, '[commodity] Frankfurter USD/INR failed');
  }
  return null;
}

async function fetchGoldApiInr(): Promise<{
  GOLD: Decimal | null;
  SILVER: Decimal | null;
  derivedUsdInr: Decimal | null;
}> {
  let GOLD: Decimal | null = null;
  let SILVER: Decimal | null = null;
  let derivedUsdInr: Decimal | null = null;

  // Run CoinGecko (gold + derived FX) and gold-api XAG (silver in USD) in parallel.
  const [cgRes, xagRes] = await Promise.allSettled([
    fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=pax-gold&vs_currencies=inr,usd',
      { signal: AbortSignal.timeout(8000) },
    ),
    fetch('https://api.gold-api.com/price/XAG', { signal: AbortSignal.timeout(5000) }),
  ]);

  // CoinGecko PAXG (1 troy oz physical gold) → INR/gram. Derive USD/INR from
  // the same response so we don't need a separate FX call for silver.
  if (cgRes.status === 'fulfilled' && cgRes.value.ok) {
    try {
      const data = await cgRes.value.json() as Record<string, { inr?: number; usd?: number }>;
      const paxgInr = data['pax-gold']?.inr;
      const paxgUsd = data['pax-gold']?.usd;
      if (paxgInr) {
        GOLD = new Decimal(paxgInr).div(TROY_OZ_TO_GRAMS);
      }
      if (paxgInr && paxgUsd && paxgUsd > 0) {
        derivedUsdInr = new Decimal(paxgInr).div(paxgUsd);
        logger.info({ paxgInr, paxgUsd, derivedUsdInr: derivedUsdInr.toString() }, '[commodity] gold + FX from CoinGecko PAXG');
      }
    } catch (err) {
      logger.warn({ err }, '[commodity] CoinGecko PAXG parse failed');
    }
  } else if (cgRes.status === 'rejected') {
    logger.warn({ err: cgRes.reason }, '[commodity] CoinGecko gold fetch failed');
  }

  // gold-api.com XAG — USD/oz silver spot. Convert to INR/gram via derived FX
  // (preferred) or fall back to fetchUsdInr() if CoinGecko didn't yield one.
  if (xagRes.status === 'fulfilled' && xagRes.value.ok) {
    try {
      const j = await xagRes.value.json() as { price?: number };
      if (j.price && j.price > 0) {
        const fx = derivedUsdInr ?? (await fetchUsdInr());
        if (fx) {
          SILVER = new Decimal(j.price).times(fx).div(TROY_OZ_TO_GRAMS);
          logger.info({ silverUsd: j.price, usdInr: fx.toString() }, '[commodity] silver from gold-api XAG');
        } else {
          logger.warn({ silverUsd: j.price }, '[commodity] silver got USD price but no FX rate');
        }
      }
    } catch (err) {
      logger.warn({ err }, '[commodity] gold-api XAG parse failed');
    }
  } else if (xagRes.status === 'rejected') {
    logger.warn({ err: xagRes.reason }, '[commodity] gold-api XAG fetch failed');
  }

  return { GOLD, SILVER, derivedUsdInr };
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

async function refreshLivePrices(): Promise<LiveCache> {
  // Run both upstream paths in parallel; ETF NAVs only come from Yahoo and silver
  // has a Yahoo fallback, so we always want both regardless of CoinGecko outcome.
  const [primary, yahoo] = await Promise.all([
    fetchGoldApiInr(),
    fetchYahooBundle(),
  ]);
  const GOLD = primary.GOLD ?? yahoo.goldInrPerGramFallback;
  const SILVER = primary.SILVER ?? yahoo.silverInrPerGram;
  const fresh: LiveCache = { GOLD, SILVER, etfNavs: yahoo.etfNavs, fetchedAt: new Date() };
  liveCache = fresh;
  return fresh;
}

export async function fetchLivePrices(): Promise<LiveCache> {
  const now = Date.now();
  // Fresh cache → instant return.
  if (liveCache && now - liveCache.fetchedAt.getTime() < LIVE_CACHE_TTL_MS) {
    return liveCache;
  }
  // Stale-while-revalidate: hand back the stale snapshot, refresh in the background.
  if (liveCache) {
    if (!inflightRefresh) {
      inflightRefresh = refreshLivePrices()
        .catch((err) => {
          logger.warn({ err }, '[commodity] background refresh failed');
          return liveCache!;
        })
        .finally(() => { inflightRefresh = null; });
    }
    return liveCache;
  }
  // Cold start — must wait. Coalesce concurrent callers onto one fetch.
  if (!inflightRefresh) {
    inflightRefresh = refreshLivePrices().finally(() => { inflightRefresh = null; });
  }
  return inflightRefresh;
}

// Warm the cache at module load so the first request after server boot is instant.
// Failures are non-fatal — the next call will retry.
void refreshLivePrices().catch((err) => {
  logger.warn({ err }, '[commodity] warm-up fetch failed');
});

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
