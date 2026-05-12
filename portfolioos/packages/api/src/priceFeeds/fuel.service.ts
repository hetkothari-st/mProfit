/**
 * State-wise fuel + electricity price feed for the Vehicle section.
 *
 * Petrol/diesel: scraped daily from Goodreturns' all-states page
 * (https://www.goodreturns.in/petrol-price.html). One HTTP call returns
 * every state — cheaper than per-state requests and the page layout is
 * stable. Stale-while-revalidate cache mirrors commodity.service.ts so
 * frontend polling never blocks on the scraper.
 *
 * CNG / LPG / electricity: static seed data (changes ~quarterly or less).
 * Refreshing these is a manual job — the seed is shipped with the app and
 * the cron just keeps the petrol/diesel slice fresh. Electricity is a
 * representative residential 0–100 unit slab; CNG/LPG are major-city
 * averages per state.
 *
 * No DB table is added (would require migration gate G2 per CLAUDE.md §16).
 * In-memory cache is sufficient — fuel prices revise at most once per day.
 */

import * as cheerio from 'cheerio';
import { logger } from '../lib/logger.js';
import {
  FUEL_STATES,
  getStateByCode,
  getStateBySlug,
  normaliseLabel,
  type FuelState,
} from './fuelStates.js';

export interface StateFuelPrices {
  stateCode: string;
  stateName: string;
  petrol: string | null;       // ₹ / litre
  diesel: string | null;       // ₹ / litre
  cng: string | null;          // ₹ / kg
  lpg: string | null;          // ₹ / 14.2 kg cylinder (domestic)
  electricity: string | null;  // ₹ / kWh (residential 0–100 unit slab)
  fetchedAt: string;
  petrolDieselSource: 'goodreturns' | 'seed';
}

interface ScrapedRow { petrol: string | null; diesel: string | null }

interface PetrolDieselCache {
  bySlug: Map<string, ScrapedRow>;
  fetchedAt: Date;
}

let liveCache: PetrolDieselCache | null = null;
let inflightRefresh: Promise<PetrolDieselCache> | null = null;
const CACHE_TTL_MS = 6 * 60 * 60_000; // 6 hours — IOCL revises once at 6 AM IST

const GOODRETURNS_PETROL = 'https://www.goodreturns.in/petrol-price.html';
const GOODRETURNS_DIESEL = 'https://www.goodreturns.in/diesel-price.html';
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36';

// ────────────────────────────────────────────────────────────────────────────
// Static seeds. Updated manually; representative residential rates.
// Sources: IOCL "Prices of Petroleum Products" (LPG), city-gas-distributor
// websites (CNG), CEA tariff orders (electricity). Last reviewed 2026-04.
// ────────────────────────────────────────────────────────────────────────────

const CNG_BY_SLUG: Record<string, string> = {
  delhi: '79.20',
  'uttar-pradesh': '81.70',
  haryana: '82.10',
  maharashtra: '75.00',
  gujarat: '78.50',
  rajasthan: '85.80',
  'madhya-pradesh': '83.50',
  karnataka: '89.50',
  'tamil-nadu': '88.30',
  'andhra-pradesh': '90.00',
  telangana: '88.00',
  'west-bengal': '95.00',
  bihar: '92.00',
  punjab: '84.50',
  chandigarh: '83.20',
  kerala: '92.50',
  jharkhand: '93.50',
  goa: '86.00',
  chhattisgarh: '88.50',
  odisha: '92.00',
  uttarakhand: '90.00',
  'jammu-kashmir': null as unknown as string,
};

const LPG_BY_SLUG: Record<string, string> = {
  delhi: '803.00',
  mumbai: '802.50',
  maharashtra: '802.50',
  kolkata: '829.00',
  'west-bengal': '829.00',
  chennai: '818.50',
  'tamil-nadu': '818.50',
  bangalore: '805.50',
  karnataka: '805.50',
  hyderabad: '855.50',
  telangana: '855.50',
  'andhra-pradesh': '853.00',
  'uttar-pradesh': '840.50',
  haryana: '805.00',
  gujarat: '855.50',
  rajasthan: '856.50',
  'madhya-pradesh': '858.50',
  punjab: '865.50',
  bihar: '901.00',
  jharkhand: '870.50',
  kerala: '816.00',
  odisha: '859.00',
  chhattisgarh: '866.00',
  'jammu-kashmir': '935.50',
  'himachal-pradesh': '852.50',
  uttarakhand: '838.00',
  assam: '843.00',
  goa: '843.00',
  chandigarh: '812.50',
  puducherry: '795.50',
};

const ELECTRICITY_BY_SLUG: Record<string, string> = {
  delhi: '3.00',
  maharashtra: '4.71',
  karnataka: '4.15',
  'tamil-nadu': '4.50',
  gujarat: '3.50',
  'andhra-pradesh': '2.65',
  telangana: '2.60',
  'west-bengal': '5.27',
  'uttar-pradesh': '5.50',
  bihar: '6.10',
  rajasthan: '5.55',
  'madhya-pradesh': '4.05',
  kerala: '3.15',
  punjab: '4.49',
  haryana: '2.95',
  odisha: '3.00',
  chhattisgarh: '3.90',
  jharkhand: '5.75',
  uttarakhand: '2.90',
  'himachal-pradesh': '3.65',
  goa: '1.90',
  assam: '5.15',
  'jammu-kashmir': '1.60',
  chandigarh: '2.75',
  puducherry: '2.95',
  'arunachal-pradesh': '3.30',
  manipur: '5.40',
  meghalaya: '3.40',
  mizoram: '4.50',
  nagaland: '4.20',
  sikkim: '1.50',
  tripura: '3.55',
  ladakh: '1.60',
  'andaman-nicobar': '2.25',
  lakshadweep: '1.50',
};

// ────────────────────────────────────────────────────────────────────────────
// Goodreturns scraper
// ────────────────────────────────────────────────────────────────────────────

async function fetchGoodreturns(url: string): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,*/*' },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    throw new Error(`Goodreturns ${url} returned ${res.status}`);
  }
  const html = await res.text();
  const $ = cheerio.load(html);

  // Goodreturns publishes one table where the first column is the state name
  // and the second column is today's price (a third column is yesterday's).
  // The exact CSS class is volatile so we walk every <table> on the page and
  // accept any row whose first cell matches a known state slug.
  $('table tr').each((_, row) => {
    const cells = $(row).find('td');
    if (cells.length < 2) return;
    const labelRaw = $(cells[0]).text().trim();
    if (!labelRaw) return;
    const slug = normaliseLabel(labelRaw);
    if (!getStateBySlug(slug)) return;

    // Price cell may carry an ₹ symbol, commas, or trailing chars like "/L".
    const priceRaw = $(cells[1]).text().trim();
    const m = priceRaw.replace(/,/g, '').match(/(\d+(?:\.\d+)?)/);
    if (!m) return;
    if (!result.has(slug)) result.set(slug, m[1]!);
  });

  return result;
}

async function refreshPetrolDiesel(): Promise<PetrolDieselCache> {
  const [petrolMap, dieselMap] = await Promise.all([
    fetchGoodreturns(GOODRETURNS_PETROL).catch((err) => {
      logger.warn({ err }, '[fuel] Goodreturns petrol fetch failed');
      return new Map<string, string>();
    }),
    fetchGoodreturns(GOODRETURNS_DIESEL).catch((err) => {
      logger.warn({ err }, '[fuel] Goodreturns diesel fetch failed');
      return new Map<string, string>();
    }),
  ]);

  const merged: Map<string, ScrapedRow> = new Map();
  const slugs = new Set<string>([...petrolMap.keys(), ...dieselMap.keys()]);
  for (const slug of slugs) {
    merged.set(slug, {
      petrol: petrolMap.get(slug) ?? null,
      diesel: dieselMap.get(slug) ?? null,
    });
  }

  const fresh: PetrolDieselCache = { bySlug: merged, fetchedAt: new Date() };
  liveCache = fresh;
  logger.info(
    { rows: merged.size, fetchedAt: fresh.fetchedAt },
    '[fuel] petrol/diesel cache refreshed',
  );
  return fresh;
}

async function getPetrolDieselCache(): Promise<PetrolDieselCache> {
  const now = Date.now();
  if (liveCache && now - liveCache.fetchedAt.getTime() < CACHE_TTL_MS) {
    return liveCache;
  }
  // Stale-while-revalidate: hand back stale and refresh in background.
  if (liveCache) {
    if (!inflightRefresh) {
      inflightRefresh = refreshPetrolDiesel()
        .catch((err) => {
          logger.warn({ err }, '[fuel] background refresh failed');
          return liveCache!;
        })
        .finally(() => { inflightRefresh = null; });
    }
    return liveCache;
  }
  if (!inflightRefresh) {
    inflightRefresh = refreshPetrolDiesel().finally(() => { inflightRefresh = null; });
  }
  return inflightRefresh;
}

// ────────────────────────────────────────────────────────────────────────────
// Static seed fallbacks (per-state) for petrol/diesel when scrape fails.
// Major-metro residential averages. Refreshed manually with each release.
// ────────────────────────────────────────────────────────────────────────────

const PETROL_SEED_BY_SLUG: Record<string, string> = {
  delhi: '94.77',
  maharashtra: '103.50',
  karnataka: '102.92',
  'tamil-nadu': '100.85',
  'west-bengal': '105.41',
  'uttar-pradesh': '94.69',
  gujarat: '94.49',
  rajasthan: '104.72',
  'madhya-pradesh': '106.47',
  'andhra-pradesh': '108.29',
  telangana: '107.41',
  kerala: '107.59',
  haryana: '94.96',
  punjab: '94.76',
  bihar: '105.18',
  jharkhand: '97.81',
  chhattisgarh: '101.04',
  odisha: '101.06',
  uttarakhand: '93.45',
  'himachal-pradesh': '95.89',
  goa: '96.52',
  assam: '98.19',
  'jammu-kashmir': '99.28',
  chandigarh: '94.24',
  puducherry: '96.59',
};

const DIESEL_SEED_BY_SLUG: Record<string, string> = {
  delhi: '87.67',
  maharashtra: '90.03',
  karnataka: '88.99',
  'tamil-nadu': '92.43',
  'west-bengal': '92.02',
  'uttar-pradesh': '87.81',
  gujarat: '90.17',
  rajasthan: '90.21',
  'madhya-pradesh': '91.84',
  'andhra-pradesh': '96.17',
  telangana: '95.65',
  kerala: '96.43',
  haryana: '87.85',
  punjab: '87.17',
  bihar: '92.04',
  jharkhand: '92.56',
  chhattisgarh: '94.27',
  odisha: '92.64',
  uttarakhand: '88.32',
  'himachal-pradesh': '87.69',
  goa: '88.49',
  assam: '89.42',
  'jammu-kashmir': '84.39',
  chandigarh: '82.40',
  puducherry: '87.34',
};

// ────────────────────────────────────────────────────────────────────────────
// Public API
// ────────────────────────────────────────────────────────────────────────────

export async function getFuelPricesForState(
  stateCodeOrSlug: string,
): Promise<StateFuelPrices | null> {
  const codeUpper = stateCodeOrSlug.toUpperCase();
  const slugLower = stateCodeOrSlug.toLowerCase();
  const meta: FuelState | undefined =
    getStateByCode(codeUpper) ?? getStateBySlug(slugLower);
  if (!meta) return null;

  const cache = await getPetrolDieselCache();
  const scraped = cache.bySlug.get(meta.slug);
  const petrol = scraped?.petrol ?? PETROL_SEED_BY_SLUG[meta.slug] ?? null;
  const diesel = scraped?.diesel ?? DIESEL_SEED_BY_SLUG[meta.slug] ?? null;
  const petrolDieselSource: 'goodreturns' | 'seed' =
    scraped?.petrol || scraped?.diesel ? 'goodreturns' : 'seed';

  return {
    stateCode: meta.code,
    stateName: meta.name,
    petrol,
    diesel,
    cng: CNG_BY_SLUG[meta.slug] ?? null,
    lpg: LPG_BY_SLUG[meta.slug] ?? null,
    electricity: ELECTRICITY_BY_SLUG[meta.slug] ?? null,
    fetchedAt: cache.fetchedAt.toISOString(),
    petrolDieselSource,
  };
}

export async function getAllStateFuelPrices(): Promise<StateFuelPrices[]> {
  const cache = await getPetrolDieselCache();
  const out: StateFuelPrices[] = [];
  const seen = new Set<string>();
  for (const meta of FUEL_STATES) {
    if (seen.has(meta.slug)) continue;
    seen.add(meta.slug);
    const scraped = cache.bySlug.get(meta.slug);
    const petrol = scraped?.petrol ?? PETROL_SEED_BY_SLUG[meta.slug] ?? null;
    const diesel = scraped?.diesel ?? DIESEL_SEED_BY_SLUG[meta.slug] ?? null;
    out.push({
      stateCode: meta.code,
      stateName: meta.name,
      petrol,
      diesel,
      cng: CNG_BY_SLUG[meta.slug] ?? null,
      lpg: LPG_BY_SLUG[meta.slug] ?? null,
      electricity: ELECTRICITY_BY_SLUG[meta.slug] ?? null,
      fetchedAt: cache.fetchedAt.toISOString(),
      petrolDieselSource:
        scraped?.petrol || scraped?.diesel ? 'goodreturns' : 'seed',
    });
  }
  return out.sort((a, b) => a.stateName.localeCompare(b.stateName));
}

/** Force a re-scrape. Called by the daily cron. */
export async function syncFuelPrices(): Promise<{ rows: number; fetchedAt: string }> {
  const cache = await refreshPetrolDiesel();
  return { rows: cache.bySlug.size, fetchedAt: cache.fetchedAt.toISOString() };
}

// Warm cache on module load — first request is instant. Failures non-fatal.
void refreshPetrolDiesel().catch((err) => {
  logger.warn({ err }, '[fuel] warm-up fetch failed');
});
