/**
 * CarWale used-car listings adapter — Tier-0 live source.
 *
 * CarWale (carwale.com) also serves schema.org/Car JSON-LD on used-car
 * search pages. Same parser logic as CarDekho — different host, different
 * inventory, gives us a second independent live data source for cross-
 * validation via the chain's median aggregator.
 */

import { Decimal } from 'decimal.js';
import { logger } from '../../lib/logger.js';
import type {
  ValuationAdapter,
  ValuationFetchResult,
  ValuationQueryInput,
} from './types.js';

const ID = 'valuation.carwale.scraper';
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
  offers?: { price?: number | string };
}

function extractCars(html: string): SchemaCar[] {
  const cars: SchemaCar[] = [];
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
      const car = o as SchemaCar;
      // Pull price from offers if not on the car directly
      if (car.price == null && car.offers?.price != null) {
        car.price = car.offers.price;
      }
      out.push(car);
    }
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

async function fetchCarWaleMedian(input: ValuationQueryInput): Promise<Decimal | null> {
  const makeSlug = slugify(input.make);
  const modelSlug = slugify(input.model);

  const urls = [
    `https://www.carwale.com/used/cars-for-sale/${makeSlug}-${modelSlug}/`,
    `https://www.carwale.com/used/cars-for-sale/${makeSlug}/${modelSlug}/`,
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
        logger.debug({ url, status: res.status }, '[carwale] non-200');
        continue;
      }
      html = await res.text();
    } catch (err) {
      logger.debug({ url, err: err instanceof Error ? err.message : String(err) }, '[carwale] fetch failed');
      continue;
    }

    const cars = extractCars(html);
    if (cars.length === 0) continue;

    const matchingPrices: Decimal[] = [];
    for (const car of cars) {
      if (!nameMatches(car, input.make, input.model)) continue;
      const cy = yearOf(car);
      if (cy === null) continue;
      if (Math.abs(cy - input.year) > 1) continue;
      const p = priceOf(car);
      if (p && p.gt(50000) && p.lt(20_000_000)) matchingPrices.push(p);
    }

    if (matchingPrices.length >= 3) return median(matchingPrices);

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
      if (broader.length >= 3) return median(broader);
    }
  }

  return null;
}

export const carWaleAdapter: ValuationAdapter = {
  id: ID,
  version: VERSION,
  displayName: 'CarWale',
  isDeterministic: false,

  async fetch(input: ValuationQueryInput): Promise<ValuationFetchResult> {
    try {
      const med = await fetchCarWaleMedian(input);
      if (med === null) {
        return { ok: false, error: 'CarWale: no matching listings', retryable: true };
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
