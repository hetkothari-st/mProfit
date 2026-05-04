/**
 * Rahastas.in scraper — Tier-2 fallback for RC lookups.
 *
 * Rahastas (rahastas.in) is another public Indian vehicle-info portal that
 * mirrors VAHAN data on a Next.js front-end. Same `__NEXT_DATA__` extraction
 * pattern as CarInfo, but a different host — gives us a third independent
 * scrape surface so a single site outage doesn't take the whole free chain
 * down.
 *
 * No API key, no login, no CAPTCHA on the public page.
 */

import { logger } from '../../lib/logger.js';
import {
  extractNextData,
  findVehicleObject,
  mapToVehicleRecord,
} from './carinfo.js';
import type {
  VehicleAdapter,
  VehicleFetchResult,
  VehicleRecord,
} from './types.js';

export const RAHASTAS_ADAPTER_ID = 'vahan.rahastas.scraper';
export const RAHASTAS_VERSION = '1';

const UA =
  'Mozilla/5.0 (Linux; Android 12; SM-A526B) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0.6367.82 Mobile Safari/537.36';

const BASES = [
  'https://www.rahastas.in',
  'https://rahastas.in',
];

const PATHS = [
  '/rc-check/',
  '/rc-details/',
  '/vehicle-information/',
];

async function fetchPage(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      'User-Agent': UA,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-IN,en;q=0.9',
      'Cache-Control': 'no-cache',
    },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`HTTP_${res.status} fetching ${url}`);
  return res.text();
}

export async function fetchRahastasRC(regNo: string): Promise<VehicleRecord> {
  const clean = regNo.replace(/\s+/g, '').toUpperCase();
  const errors: string[] = [];

  for (const base of BASES) {
    for (const path of PATHS) {
      const url = `${base}${path}${encodeURIComponent(clean)}`;
      try {
        const html = await fetchPage(url);
        const pageProps = extractNextData(html);
        if (!pageProps) {
          errors.push(`${url}: no __NEXT_DATA__`);
          continue;
        }
        const vehicleObj = findVehicleObject(pageProps);
        if (!vehicleObj) {
          errors.push(`${url}: no vehicle object`);
          continue;
        }
        const record = mapToVehicleRecord(vehicleObj, clean);
        if (record.make || record.ownerName || record.fuelType) {
          if (record.metadata) record.metadata['source'] = 'rahastas';
          return record;
        }
        errors.push(`${url}: empty record`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`${url}: ${msg}`);
      }
    }
  }

  throw new Error(`Rahastas: all paths failed → ${errors.slice(0, 3).join(' | ')}`);
}

export const rahastasAdapter: VehicleAdapter = {
  id: RAHASTAS_ADAPTER_ID,
  version: RAHASTAS_VERSION,
  displayName: 'Rahastas.in',
  supportsAuto: true,

  async fetch(regNo): Promise<VehicleFetchResult> {
    try {
      const record = await fetchRahastasRC(regNo);
      return { ok: true, record };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn({ err: msg, regNo }, '[rahastas] RC fetch failed');
      return { ok: false, error: msg, retryable: true };
    }
  },
};
