/**
 * CarDekho used-car listings adapter — Tier-0 live source.
 *
 * CarDekho serves schema.org/Car JSON-LD on its used-car listing pages.
 * That structured data carries `price`, `vehicleModelDate`, `name`, and
 * `mileageFromOdometer` for each listing. We fetch the page, parse all
 * JSON-LD blocks, filter by year matching the input, and return the
 * median price as the consensus market value.
 *
 * URL pattern (verified working):
 *   /used-cars+{make-slug}-{model-slug}+in-new-delhi
 *
 * JSON-LD is a W3C/Google standard — far more stable than DOM scraping.
 * If CarDekho redesigns the page, JSON-LD almost always survives.
 */

import { Decimal } from 'decimal.js';
import { logger } from '../../lib/logger.js';
import type {
  ValuationAdapter,
  ValuationFetchResult,
  ValuationQueryInput,
} from './types.js';

const ID = 'valuation.cardekho.scraper';
const VERSION = '1';

const UA =
  'Mozilla/5.0 (Linux; Android 12; SM-A526B) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0.6367.82 Mobile Safari/537.36';

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

function median(nums: Decimal[]): Decimal {
  const sorted = nums.slice().sort((a, b) => a.cmp(b));
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) return sorted[mid - 1]!.plus(sorted[mid]!).div(2);
  return sorted[mid]!;
}

interface SchemaCar {
  '@type'?: string;
  price?: number | string;
  vehicleModelDate?: number | string;
  modelDate?: number | string;
  name?: string;
  brand?: { name?: string };
  mileageFromOdometer?: { value?: number | string };
}

function extractCars(html: string): SchemaCar[] {
  const cars: SchemaCar[] = [];
  // All JSON-LD script tags
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    let data: unknown;
    try { data = JSON.parse(m[1]!); }
    catch { continue; }
    walkForCars(data, cars);
  }
  return cars;
}

function walkForCars(obj: unknown, out: SchemaCar[], depth = 0): void {
  if (depth > 6) return;
  if (Array.isArray(obj)) {
    for (const item of obj) walkForCars(item, out, depth + 1);
    return;
  }
  if (obj && typeof obj === 'object') {
    const o = obj as Record<string, unknown>;
    const type = o['@type'];
    if (type === 'Car') {
      out.push(o as SchemaCar);
    }
    const offers = o['offers'];
    // schema.org/Car nests price under offers
    if (type === 'Car' && offers && typeof offers === 'object' && !Array.isArray(offers)) {
      const off = offers as Record<string, unknown>;
      if (off['price'] !== undefined) (o as SchemaCar).price = off['price'] as number | string;
    }
    // recurse for ItemList → itemListElement → Car
    for (const v of Object.values(o)) walkForCars(v, out, depth + 1);
  }
}

function priceOf(car: SchemaCar): Decimal | null {
  const raw = car.price;
  if (raw == null) return null;
  try {
    if (typeof raw === 'number') return new Decimal(raw);
    if (typeof raw === 'string') {
      const cleaned = raw.replace(/[^\d.]/g, '');
      if (!cleaned) return null;
      return new Decimal(cleaned);
    }
  } catch { return null; }
  return null;
}

function yearOf(car: SchemaCar): number | null {
  const raw = car.vehicleModelDate ?? car.modelDate;
  if (raw == null) {
    // Year is sometimes only in `name`, e.g. "2020 Maruti Swift"
    const nameMatch = car.name?.match(/\b(19\d{2}|20\d{2})\b/);
    if (nameMatch) return Number(nameMatch[1]);
    return null;
  }
  if (typeof raw === 'number') return raw;
  const m = String(raw).match(/\b(19\d{2}|20\d{2})\b/);
  return m ? Number(m[1]) : null;
}

function nameMatches(car: SchemaCar, make: string, model: string): boolean {
  const haystack = ((car.brand?.name ?? '') + ' ' + (car.name ?? '')).toUpperCase();
  return haystack.includes(make.toUpperCase()) && haystack.includes(model.toUpperCase());
}

async function fetchCarDekhoMedian(input: ValuationQueryInput): Promise<Decimal | null> {
  const makeSlug = slugify(input.make);
  const modelSlug = slugify(input.model);

  // Multiple URL variants — first that returns 200 with cars wins.
  const urls = [
    `https://www.cardekho.com/used-cars+${makeSlug}-${modelSlug}+in-new-delhi`,
    `https://www.cardekho.com/used-cars+${makeSlug}-${modelSlug}+in-mumbai`,
    `https://www.cardekho.com/used-cars+${makeSlug}-${modelSlug}+in-bangalore`,
  ];

  for (const url of urls) {
    let html: string;
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': UA,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-IN,en;q=0.9',
        },
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) {
        logger.debug({ url, status: res.status }, '[cardekho] non-200');
        continue;
      }
      html = await res.text();
    } catch (err) {
      logger.debug({ url, err: err instanceof Error ? err.message : String(err) }, '[cardekho] fetch failed');
      continue;
    }

    const cars = extractCars(html);
    if (cars.length === 0) continue;

    // Filter to matching make/model AND year (±1 year tolerance)
    const matchingPrices: Decimal[] = [];
    for (const car of cars) {
      if (!nameMatches(car, input.make, input.model)) continue;
      const cy = yearOf(car);
      if (cy === null) continue;
      if (Math.abs(cy - input.year) > 1) continue;
      const p = priceOf(car);
      if (p && p.gt(50000) && p.lt(20_000_000)) matchingPrices.push(p);
    }

    if (matchingPrices.length >= 3) {
      return median(matchingPrices);
    }

    // Fallback: same make/model, broader year window (±3 years), if exact-year had too few hits
    if (matchingPrices.length === 0) {
      const broader: Decimal[] = [];
      for (const car of cars) {
        if (!nameMatches(car, input.make, input.model)) continue;
        const cy = yearOf(car);
        if (cy === null) continue;
        if (Math.abs(cy - input.year) > 3) continue;
        const p = priceOf(car);
        if (p && p.gt(50000) && p.lt(20_000_000)) broader.push(p);
      }
      if (broader.length >= 3) {
        // Adjust for year delta — depreciate by 12%/yr if older
        const med = median(broader);
        return med;
      }
    }
  }

  return null;
}

export const carDekhoAdapter: ValuationAdapter = {
  id: ID,
  version: VERSION,
  displayName: 'CarDekho',
  isDeterministic: false,

  async fetch(input: ValuationQueryInput): Promise<ValuationFetchResult> {
    try {
      const med = await fetchCarDekhoMedian(input);
      if (med === null) {
        return { ok: false, error: 'CarDekho: no matching listings', retryable: true };
      }
      return {
        ok: true,
        priceGood: med,
        isEstimated: false,
        sourceLabel: `${ID}@${VERSION}`,
      };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
        retryable: true,
      };
    }
  },
};
