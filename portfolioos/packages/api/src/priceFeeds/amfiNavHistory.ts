/**
 * AMFI's historical NAV report — the only public source that can fill a gap
 * after the fact.
 *
 *   https://portal.amfiindia.com/DownloadNAVHistoryReport_Po.aspx?frmdt=..&todt=..
 *
 * Its columns are NOT NAVAll's. Both files have eight fields and both are
 * semicolon-separated, which makes reusing the NAVAll parser tempting and
 * wrong:
 *
 *   NAVAll : code ; ISIN growth ; ISIN reinvest ; name ; plan ; option ; NAV ; date
 *   History: code ; NAV name    ; plan          ; option ; ISIN growth ; ISIN reinvest ; NAV ; date
 *
 * Read the history file with NAVAll's offsets and the ISIN lands in the NAV
 * column — the same class of mistake that caused the outage this backfill
 * exists to repair. So it gets its own parser, its own fixture, and a test
 * that asserts the two are not interchangeable.
 *
 * Verified against the file AMFI served on 21 Sep 2026.
 */

import { request } from 'undici';
import { logger } from '../lib/logger.js';

const HISTORY_URL = 'https://portal.amfiindia.com/DownloadNAVHistoryReport_Po.aspx';

export interface AmfiHistoryNavRow {
  schemeCode: string;
  /** The full published name, which carries plan and option in its text. */
  navName: string;
  planType: string | null;
  optionType: string | null;
  isin: string | null;
  nav: string;
  /** Date-only, UTC midnight, matching how MFNav stores it. */
  date: Date;
}

export interface AmfiHistoryParseOutcome {
  rows: AmfiHistoryNavRow[];
  dataLines: number;
  parseFailures: number;
}

const MONTHS: Record<string, number> = {
  Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
  Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
};

/** "15-Sep-2026" → UTC midnight, or null. */
export function parseAmfiHistoryDate(s: string): Date | null {
  const m = s.trim().match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/);
  if (!m) return null;
  const mo = MONTHS[m[2]!];
  if (mo === undefined) return null;
  return new Date(Date.UTC(Number(m[3]), mo, Number(m[1])));
}

/** "15-Sep-2026", the format the endpoint's query string wants. */
export function toAmfiDateParam(d: Date): string {
  const names = Object.keys(MONTHS);
  return `${String(d.getUTCDate()).padStart(2, '0')}-${names[d.getUTCMonth()]}-${d.getUTCFullYear()}`;
}

export function parseAmfiNavHistoryText(text: string): AmfiHistoryParseOutcome {
  const rows: AmfiHistoryNavRow[] = [];
  let dataLines = 0;
  let parseFailures = 0;

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || !line.includes(';')) continue;
    if (line.startsWith('Scheme Code')) continue;

    const parts = line.split(';');
    const schemeCode = parts[0]?.trim() ?? '';
    // Section headers and AMC names have no semicolons and never reach here;
    // anything else that is not a numeric code is not a data row either.
    if (!/^\d+$/.test(schemeCode)) continue;

    dataLines += 1;
    if (parts.length < 8) {
      parseFailures += 1;
      continue;
    }

    const navName = parts[1]?.trim() ?? '';
    const planType = parts[2]?.trim() || null;
    const optionType = parts[3]?.trim() || null;
    const isin = parts[4]?.trim() || null;
    const nav = parts[6]?.trim() ?? '';
    const date = parseAmfiHistoryDate(parts[7] ?? '');

    // "N.A." is AMFI saying the scheme had no NAV that day — an answer.
    if (nav === 'N.A.' || nav === '') continue;
    if (!navName || !date || Number.isNaN(Number(nav))) {
      parseFailures += 1;
      continue;
    }

    rows.push({ schemeCode, navName, planType, optionType, isin, nav, date });
  }

  return { rows, dataLines, parseFailures };
}

/**
 * Fetch one window. AMFI serves roughly 24 MB for a calendar month, so the
 * caller walks month by month rather than asking for a year at once.
 */
export async function fetchAmfiNavHistory(from: Date, to: Date): Promise<string> {
  const url = `${HISTORY_URL}?frmdt=${toAmfiDateParam(from)}&todt=${toAmfiDateParam(to)}`;
  logger.info({ url }, '[amfiHistory] fetching');
  const res = await request(url, {
    method: 'GET',
    maxRedirections: 5,
    headers: {
      'user-agent': 'Mozilla/5.0 (compatible; EveryPaisa/0.3)',
      accept: 'text/plain,*/*',
    },
  });
  if (res.statusCode < 200 || res.statusCode >= 300) {
    throw new Error(`AMFI history fetch failed: ${res.statusCode}`);
  }
  return await res.body.text();
}
