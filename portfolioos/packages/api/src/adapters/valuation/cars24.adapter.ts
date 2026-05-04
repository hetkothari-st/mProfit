/**
 * Cars24 used-car listing scraper — Tier-1 live source.
 *
 * Cars24 (cars24.com) is India's largest used-car marketplace. Their
 * search-results pages list current asking prices for any make+model+year
 * combination. We compute the median asking price as the "good condition"
 * market price.
 *
 * Public HTML, no API key, no CAPTCHA on listing pages. URL pattern:
 *   /buy-used-{make}-{model}-cars-{city}/?year_from=YYYY&year_to=YYYY
 *
 * Failure modes (all return ok:false → chain falls through):
 *   - Cars24 returns 0 listings for the make/model/year combo
 *   - DOM changes (we look for embedded JSON in <script> tags)
 *   - Rate-limited / blocked
 */

import { Decimal } from 'decimal.js';
import { logger } from '../../lib/logger.js';
import type {
  ValuationAdapter,
  ValuationFetchResult,
  ValuationQueryInput,
} from './types.js';

const ID = 'valuation.cars24.scraper';
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

/**
 * Pulls listing prices from Cars24 search results. Looks for the embedded
 * Next.js __NEXT_DATA__ blob and extracts the price array from it.
 */
async function fetchCars24Median(input: ValuationQueryInput): Promise<Decimal | null> {
  const makeSlug = slugify(input.make);
  const modelSlug = slugify(input.model);
  const url = `https://www.cars24.com/buy-used-${makeSlug}-${modelSlug}-cars/?year_from=${input.year}&year_to=${input.year}`;

  let html: string;
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': UA,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-IN,en;q=0.9',
      },
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) {
      logger.debug({ url, status: res.status }, '[cars24] non-200');
      return null;
    }
    html = await res.text();
  } catch (err) {
    logger.debug({ url, err: err instanceof Error ? err.message : String(err) }, '[cars24] fetch failed');
    return null;
  }

  // Extract __NEXT_DATA__ JSON blob
  const m = html.match(/<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([^<]+)<\/script>/i);
  if (!m) return null;

  let data: unknown;
  try {
    data = JSON.parse(m[1]!);
  } catch {
    return null;
  }

  // Cars24's structure changes — be defensive. Look for any "price" or "listingPrice" fields.
  const prices: Decimal[] = [];
  const MIN = new Decimal(50000);
  const MAX = new Decimal(10_000_000);
  function walk(obj: unknown, depth = 0): void {
    if (depth > 8) return;
    if (Array.isArray(obj)) {
      for (const item of obj) walk(item, depth + 1);
      return;
    }
    if (obj && typeof obj === 'object') {
      const o = obj as Record<string, unknown>;
      for (const k of ['price', 'listingPrice', 'sellingPrice', 'displayPrice']) {
        const v = o[k];
        if (typeof v === 'number') {
          try {
            const d = new Decimal(v);
            if (d.gt(MIN) && d.lt(MAX)) prices.push(d);
          } catch { /* skip */ }
        } else if (typeof v === 'string') {
          // Strip Indian currency formatting: "₹12,34,567" → "1234567"
          const cleaned = v.replace(/[^\d.]/g, '');
          if (cleaned) {
            try {
              const d = new Decimal(cleaned);
              if (d.gt(MIN) && d.lt(MAX)) prices.push(d);
            } catch { /* skip */ }
          }
        }
      }
      for (const val of Object.values(o)) walk(val, depth + 1);
    }
  }
  walk(data);

  if (prices.length === 0) return null;
  return median(prices);
}

export const cars24Adapter: ValuationAdapter = {
  id: ID,
  version: VERSION,
  displayName: 'Cars24',
  isDeterministic: false,

  async fetch(input: ValuationQueryInput): Promise<ValuationFetchResult> {
    try {
      const med = await fetchCars24Median(input);
      if (med === null) {
        return { ok: false, error: 'Cars24: no listings found', retryable: true };
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
