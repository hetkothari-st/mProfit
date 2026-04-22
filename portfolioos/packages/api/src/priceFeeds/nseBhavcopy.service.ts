/**
 * NSE EOD bhavcopy fallback price source.
 *
 * NSE publishes a full daily bhavcopy at:
 *   https://nsearchives.nseindia.com/products/content/sec_bhavdata_full_DDMMYYYY.csv
 *
 * Used as a fallback when Yahoo Finance returns no price for a symbol.
 * The file is only available ~6pm IST on trading days, so we walk back
 * up to 3 calendar days to find the most recent available file.
 *
 * In-memory cache keyed by calendar date so a single server-day only
 * triggers one download (the file is ~1 MB).
 */

import { request } from 'undici';
import { Decimal } from 'decimal.js';
import { logger } from '../lib/logger.js';

const BROWSER_HEADERS = {
  'user-agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  accept: 'text/csv,application/octet-stream,*/*;q=0.8',
  'accept-language': 'en-US,en;q=0.9',
  referer: 'https://www.nseindia.com/',
  origin: 'https://www.nseindia.com',
};

function bhavcopyCopyUrl(date: Date): string {
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yyyy = date.getFullYear();
  return `https://nsearchives.nseindia.com/products/content/sec_bhavdata_full_${dd}${mm}${yyyy}.csv`;
}

let cacheKey = '';
let cacheMap: Map<string, Decimal> = new Map();

function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function parseBhavcopyCsv(text: string): Map<string, Decimal> {
  const map = new Map<string, Decimal>();
  const lines = text.split(/\r?\n/);
  if (lines.length < 2) return map;

  const header = lines[0]!.split(',').map((h) => h.trim().toUpperCase());
  const symIdx = header.indexOf('SYMBOL');
  const closeIdx = header.findIndex(
    (h) => h === 'CLOSE_PRICE' || h === 'CLOSE' || h === 'LAST_PRICE',
  );
  const seriesIdx = header.indexOf('SERIES');

  if (symIdx === -1 || closeIdx === -1) {
    logger.warn({ headerSample: header.slice(0, 6).join(',') }, '[nseBhavcopy] unexpected CSV header');
    return map;
  }

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line?.trim()) continue;
    const parts = line.split(',');
    if (parts.length < Math.max(symIdx, closeIdx) + 1) continue;
    // Only EQ series — skip futures, bonds, warrants, etc.
    if (seriesIdx !== -1 && parts[seriesIdx]?.trim() !== 'EQ') continue;
    const sym = parts[symIdx]!.trim().toUpperCase();
    const close = parts[closeIdx]!.trim().replace(/[₹,]/g, '');
    if (!sym || !close || close === '0' || close === '-') continue;
    try {
      map.set(sym, new Decimal(close));
    } catch {
      // bad numeric value — skip row
    }
  }
  return map;
}

/**
 * Return a symbol→price map from the most recent available bhavcopy.
 * Result is cached for the current calendar day.
 */
export async function getNseBhavPrices(): Promise<Map<string, Decimal>> {
  const key = todayKey();
  if (cacheKey === key && cacheMap.size > 0) return cacheMap;

  const today = new Date();
  for (let daysAgo = 0; daysAgo <= 4; daysAgo++) {
    const d = new Date(today);
    d.setDate(d.getDate() - daysAgo);
    if (d.getDay() === 0 || d.getDay() === 6) continue; // skip weekends

    const url = bhavcopyCopyUrl(d);
    try {
      const res = await request(url, {
        method: 'GET',
        headers: BROWSER_HEADERS,
        maxRedirections: 5,
        bodyTimeout: 30_000,
        headersTimeout: 15_000,
      });
      if (res.statusCode !== 200) {
        logger.debug({ status: res.statusCode, daysAgo }, '[nseBhavcopy] HTTP non-200, trying previous day');
        await res.body.dump();
        continue;
      }
      const text = await res.body.text();
      const prices = parseBhavcopyCsv(text);
      if (prices.size > 200) {
        cacheKey = key;
        cacheMap = prices;
        logger.info({ symbols: prices.size, daysAgo }, '[nseBhavcopy] loaded');
        return prices;
      }
      logger.warn({ daysAgo, size: prices.size }, '[nseBhavcopy] file parsed but suspiciously small');
    } catch (err) {
      logger.debug({ err, daysAgo }, '[nseBhavcopy] fetch error, trying previous day');
    }
  }

  logger.warn('[nseBhavcopy] could not fetch bhavcopy for any recent trading day — prices will rely on Yahoo only');
  return new Map();
}

/** Look up the latest EOD close price for a single NSE symbol. */
export async function getNseBhavPrice(symbol: string): Promise<Decimal | null> {
  const prices = await getNseBhavPrices();
  return prices.get(symbol.trim().toUpperCase()) ?? null;
}
