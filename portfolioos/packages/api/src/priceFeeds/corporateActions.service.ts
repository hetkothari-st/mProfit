import { request } from 'undici';
import { Decimal } from 'decimal.js';
import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';
import type { CorporateActionType } from '@prisma/client';
import { followRedirects } from '../lib/httpDispatcher.js';

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') q = !q;
    else if (c === ',' && !q) {
      out.push(cur);
      cur = '';
    } else cur += c;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

export interface CorpActionRow {
  symbol: string;
  series: string;
  company: string;
  subject: string;
  exDate: Date;
  recordDate: Date | null;
  type: CorporateActionType;
  ratio: Decimal | null;
  amount: Decimal | null;
  raw: string;
}

function parseDdMmmYyyy(s: string): Date | null {
  // NSE writes "16-Jun-2025", BSE "16 Jun 2025".
  const m = s.trim().match(/^(\d{1,2})[- ]([A-Za-z]{3})[- ](\d{4})$/);
  if (!m) return null;
  const months: Record<string, number> = {
    Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
    Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
  };
  const mo = months[m[2]!];
  if (mo === undefined) return null;
  return new Date(Date.UTC(Number(m[3]), mo, Number(m[1])));
}

/**
 * "From Rs 2/- Per Share To Re 1/- Per Share", "Rs.10/- to Rs.5/-",
 * "Rs 10 to Rs 2": old face value, then new. NSE writes "/-" and
 * "Per Share" between the two numbers, and "Re" for one rupee — the old
 * "<n> to <n>" pattern matched none of that, so splits were stored without a
 * ratio and never applied (launch review B3).
 */
const FACE_VALUE_FROM_TO =
  /(?:r[se]\.?\s*)?(\d+(?:\.\d+)?)\s*(?:\/-)?\s*(?:per\s+(?:equity\s+)?share)?\s*to\s*(?:r[se]\.?\s*)?(\d+(?:\.\d+)?)/i;

/**
 * Every action one purpose line announces. NSE files a bonus issued together
 * with a split as one line ("Bonus 4:1 And Face Value Split ..."); reading only
 * the first half left the split out.
 */
function classifyAll(subject: string): Array<ReturnType<typeof classify>> {
  const parts = subject.split(/\s+(?:and|&)\s+|\s*\/\s+(?=[a-z])/i).map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) return [classify(subject)];
  const out = parts.map((p) => classify(p));
  // A part that names nothing we know falls through to DIVIDEND with no
  // amount; drop those when another part carries the real action.
  const known = out.filter((c) => !(c.type === 'DIVIDEND' && c.amount === null));
  return known.length > 0 ? known : [classify(subject)];
}

function classify(subject: string): {
  type: CorporateActionType;
  ratio: Decimal | null;
  amount: Decimal | null;
} {
  const s = subject.toLowerCase();
  if (s.includes('dividend')) {
    const m = subject.match(/rs\.?\s*(\d+(?:\.\d+)?)/i) ?? subject.match(/inr\s*(\d+(?:\.\d+)?)/i) ?? subject.match(/\b(\d+(?:\.\d+)?)\s*%/i);
    const amount = m ? new Decimal(m[1]!) : null;
    return { type: 'DIVIDEND', ratio: null, amount };
  }
  if (s.includes('bonus')) {
    const m = subject.match(/(\d+)\s*[:/]\s*(\d+)/);
    const ratio = m ? new Decimal(m[1]!).div(new Decimal(m[2]!)) : null;
    return { type: 'BONUS', ratio, amount: null };
  }
  if (s.includes('split') || s.includes('sub division') || s.includes('sub-division') || s.includes('stock split')) {
    const m = subject.match(FACE_VALUE_FROM_TO);
    if (m) return { type: 'SPLIT', ratio: new Decimal(m[1]!).div(new Decimal(m[2]!)), amount: null };
    const n = subject.match(/(\d+)\s*[:/]\s*(\d+)/);
    return {
      type: 'SPLIT',
      ratio: n ? new Decimal(n[1]!).div(new Decimal(n[2]!)) : null,
      amount: null,
    };
  }
  if (s.includes('rights')) {
    const m = subject.match(/(\d+)\s*[:/]\s*(\d+)/);
    return {
      type: 'RIGHTS',
      ratio: m ? new Decimal(m[1]!).div(new Decimal(m[2]!)) : null,
      amount: null,
    };
  }
  if (s.includes('buyback') || s.includes('buy back')) return { type: 'BUYBACK', ratio: null, amount: null };
  if (s.includes('merger') || s.includes('amalgamation')) return { type: 'MERGER', ratio: null, amount: null };
  if (s.includes('demerger') || s.includes('de-merger')) return { type: 'DEMERGER', ratio: null, amount: null };
  return { type: 'DIVIDEND', ratio: null, amount: null };
}

/**
 * Counts alongside the rows, so the feed canary can tell "NSE published a
 * quiet day" from "the CSV changed shape and we now read none of it". The
 * NAVAll eight-column incident was exactly the second case wearing the
 * first one's clothes.
 */
export interface CorpActionParseOutcome {
  rows: CorpActionRow[];
  /** Lines after the header. */
  dataLines: number;
  /** Data lines we could not read as a corporate action. */
  parseFailures: number;
}

export function parseCorpActionsCsv(text: string): CorpActionRow[] {
  return parseCorpActionsCsvWithCounts(text).rows;
}

export function parseCorpActionsCsvWithCounts(text: string): CorpActionParseOutcome {
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return { rows: [], dataLines: 0, parseFailures: 0 };
  const header = splitCsvLine(lines[0]!).map((h) => h.toUpperCase().replace(/[^A-Z0-9]/g, ''));
  const idx = (k: string) => header.findIndex((h) => h === k.replace(/[^A-Z0-9]/g, ''));

  const iSymbol = idx('SYMBOL');
  const iSeries = idx('SERIES');
  const iCompany = idx('COMPANY') !== -1 ? idx('COMPANY') : idx('COMPANYNAME');
  const iSubject = idx('PURPOSE') !== -1 ? idx('PURPOSE') : idx('SUBJECT');
  const iExDate = idx('EXDATE');
  const iRecord = idx('RECORDDATE');

  const rows: CorpActionRow[] = [];
  let parseFailures = 0;
  for (let i = 1; i < lines.length; i++) {
    const c = splitCsvLine(lines[i]!);
    const symbol = (c[iSymbol] ?? '').trim();
    const subject = (c[iSubject] ?? '').trim();
    const exDate = parseDdMmmYyyy(c[iExDate] ?? '');
    if (!symbol || !subject || !exDate) {
      parseFailures++;
      continue;
    }
    for (const cls of classifyAll(subject)) {
      rows.push({
        symbol,
        series: c[iSeries] ?? 'EQ',
        company: c[iCompany] ?? '',
        subject,
        exDate,
        recordDate: parseDdMmmYyyy(c[iRecord] ?? ''),
        type: cls.type,
        ratio: cls.ratio,
        amount: cls.amount,
        raw: subject,
      });
    }
  }
  return { rows, dataLines: lines.length - 1, parseFailures };
}

export interface CorpActionLoadResult {
  /** Rows the CSV gave us that we could read. */
  fetched: number;
  inserted: number;
  skipped: number;
  /** Data lines in the CSV, readable or not. */
  dataLines: number;
  /** Data lines we could not read. */
  parseFailures: number;
  /** Which source answered: NSE's JSON API, the BSE fallback, or neither. */
  source?: 'nse' | 'bse' | 'none';
}

// ─── NSE JSON API (primary) ──────────────────────────────────────────
//
// The archive CSV (archives.nseindia.com/.../corporate_actions.csv) returns
// 404. The site's own JSON API serves the same data; www.nseindia.com 301s to
// www.nseindia.in, which answered with JSON on 2026-11-27 (see
// test/fixtures/corporateActions/README.md). NSE sometimes refuses API calls
// without its session cookies, so the homepage is loaded first and its
// cookies are sent with the API call.

const NSE_HOME_URL = 'https://www.nseindia.com/';
const NSE_CA_API_URL = 'https://www.nseindia.com/api/corporates-corporateActions';
/** Window fetched each run: about two years back (holdings bought before older actions, missed runs) and two months ahead. A two-year window answered in one call (4,209 rows) on 2026-11-27. */
const CA_LOOKBACK_DAYS = 800;
const CA_LOOKAHEAD_DAYS = 60;

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

/** One row of NSE's corporates-corporateActions JSON. */
export interface NseCorpActionJson {
  symbol?: string;
  series?: string;
  comp?: string;
  subject?: string;
  exDate?: string;
  recDate?: string;
  isin?: string;
}

export interface CorpActionJsonOutcome extends CorpActionParseOutcome {
  /** ISIN per symbol where the source gives one; matched before the symbol. */
  isinBySymbol: Map<string, string>;
}

export function parseNseCorpActionsJson(json: unknown): CorpActionJsonOutcome {
  const list = Array.isArray(json) ? (json as NseCorpActionJson[]) : [];
  const rows: CorpActionRow[] = [];
  const isinBySymbol = new Map<string, string>();
  let parseFailures = 0;
  for (const r of list) {
    const symbol = (r.symbol ?? '').trim();
    const subject = (r.subject ?? '').trim();
    const exDate = parseDdMmmYyyy(r.exDate ?? '');
    if (!symbol || !subject || !exDate) {
      parseFailures++;
      continue;
    }
    if (r.isin && r.isin.trim() && r.isin.trim() !== '-') isinBySymbol.set(symbol, r.isin.trim());
    for (const cls of classifyAll(subject)) {
      rows.push({
        symbol,
        series: r.series ?? 'EQ',
        company: r.comp ?? '',
        subject,
        exDate,
        recordDate: parseDdMmmYyyy(r.recDate ?? ''),
        type: cls.type,
        ratio: cls.ratio,
        amount: cls.amount,
        raw: subject,
      });
    }
  }
  return { rows, dataLines: list.length, parseFailures, isinBySymbol };
}

const ddMmYyyy = (d: Date) =>
  `${String(d.getUTCDate()).padStart(2, '0')}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${d.getUTCFullYear()}`;
const yyyymmdd = (d: Date) =>
  `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;

/** Cookie pairs from a response's set-cookie headers, ready for a Cookie header. */
export function cookieHeaderFrom(setCookie: string | string[] | undefined): string {
  const list = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  return list.map((c) => c.split(';')[0]!.trim()).filter(Boolean).join('; ');
}

function caWindow(now: Date): { from: Date; to: Date } {
  return {
    from: new Date(now.getTime() - CA_LOOKBACK_DAYS * 86_400_000),
    to: new Date(now.getTime() + CA_LOOKAHEAD_DAYS * 86_400_000),
  };
}

async function fetchNseCorpActionsJson(now: Date): Promise<unknown> {
  let cookie = '';
  try {
    const home = await request(NSE_HOME_URL, {
      method: 'GET',
      headers: { 'user-agent': BROWSER_UA, accept: 'text/html,application/xhtml+xml', 'accept-language': 'en-US,en;q=0.9' },
      dispatcher: followRedirects,
    });
    cookie = cookieHeaderFrom(home.headers['set-cookie']);
    await home.body.dump();
  } catch (err) {
    // The API often answers without the cookies: carry on and let it decide.
    logger.warn({ err }, '[CA] NSE homepage (cookie warm-up) failed');
  }
  const { from, to } = caWindow(now);
  const url = `${NSE_CA_API_URL}?index=equities&from_date=${ddMmYyyy(from)}&to_date=${ddMmYyyy(to)}`;
  const res = await request(url, {
    method: 'GET',
    headers: {
      'user-agent': BROWSER_UA,
      accept: 'application/json, text/plain, */*',
      'accept-language': 'en-US,en;q=0.9',
      referer: 'https://www.nseindia.com/companies-listing/corporate-filings-actions',
      ...(cookie ? { cookie } : {}),
    },
    dispatcher: followRedirects,
  });
  if (res.statusCode < 200 || res.statusCode >= 300) {
    await res.body.dump();
    throw new Error(`NSE corporate-actions API answered ${res.statusCode}`);
  }
  return res.body.json();
}

// ─── BSE (fallback) ──────────────────────────────────────────────────
//
// UNVERIFIED: BSE's API refused this machine (HTTP 403, Akamai) on
// 2026-11-27, so the shape read below is the listing BSE's own website uses,
// not a captured response. Every field is read defensively; a row that cannot
// be read counts as a parse failure, which the feed canary reports.

const BSE_CA_API_URL = 'https://api.bseindia.com/BseIndiaAPI/api/DefaultData/w';

type BseCorpActionJson = Record<string, unknown>;

function pick(r: BseCorpActionJson, ...keys: string[]): string {
  for (const k of keys) {
    const v = r[k] ?? r[k.toLowerCase()] ?? r[k.toUpperCase()];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return '';
}

export function parseBseCorpActionsJson(json: unknown): CorpActionJsonOutcome {
  const table = (json as { Table?: unknown } | null)?.Table;
  const list: BseCorpActionJson[] = Array.isArray(json)
    ? (json as BseCorpActionJson[])
    : Array.isArray(table)
      ? (table as BseCorpActionJson[])
      : [];
  const rows: CorpActionRow[] = [];
  let parseFailures = 0;
  for (const r of list) {
    const symbol = pick(r, 'short_name', 'Short_Name', 'scrip_name');
    const subject = pick(r, 'Purpose', 'purpose');
    const exDate = parseDdMmmYyyy(pick(r, 'Ex_date', 'Ex_Date', 'exdate'));
    if (!symbol || !subject || !exDate) {
      parseFailures++;
      continue;
    }
    for (const cls of classifyAll(subject)) {
      rows.push({
        symbol,
        series: 'BSE',
        company: pick(r, 'long_name', 'scrip_name'),
        subject,
        exDate,
        recordDate: parseDdMmmYyyy(pick(r, 'RD_Date', 'Record_date')),
        type: cls.type,
        ratio: cls.ratio,
        amount: cls.amount,
        raw: subject,
      });
    }
  }
  return { rows, dataLines: list.length, parseFailures, isinBySymbol: new Map() };
}

async function fetchBseCorpActionsJson(now: Date): Promise<unknown> {
  const { from, to } = caWindow(now);
  const url =
    `${BSE_CA_API_URL}?Fdate=${yyyymmdd(from)}&TDate=${yyyymmdd(to)}` +
    '&Purposecode=&ddlcategorys=E&ddlindustrys=&scripcode=&segment=0&strSearch=S';
  const res = await request(url, {
    method: 'GET',
    headers: {
      'user-agent': BROWSER_UA,
      accept: 'application/json, text/plain, */*',
      referer: 'https://www.bseindia.com/',
      origin: 'https://www.bseindia.com',
    },
    dispatcher: followRedirects,
  });
  if (res.statusCode < 200 || res.statusCode >= 300) {
    await res.body.dump();
    throw new Error(`BSE corporate-actions API answered ${res.statusCode}`);
  }
  return res.body.json();
}

// ─── Storing ─────────────────────────────────────────────────────────

export interface StoreCorporateActionsResult {
  inserted: number;
  /** Existing rows whose missing ratio/amount this run filled in. */
  repaired: number;
  skipped: number;
}

/**
 * Store parsed rows, one per (stock, type, ex-date). A split stored before the
 * parser could read NSE's wording has no ratio and was never applied; when a
 * later run reads the ratio it is filled in rather than skipped.
 */
export async function storeCorporateActions(
  rows: CorpActionRow[],
  source: string,
  isinBySymbol: Map<string, string> = new Map(),
): Promise<StoreCorporateActionsResult> {
  let inserted = 0;
  let repaired = 0;
  let skipped = 0;
  for (const row of rows) {
    const isin = isinBySymbol.get(row.symbol);
    const stock =
      (isin ? await prisma.stockMaster.findUnique({ where: { isin } }) : null) ??
      (await prisma.stockMaster.findUnique({ where: { symbol: row.symbol } }));
    if (!stock) {
      skipped++;
      continue;
    }
    const existing = await prisma.corporateAction.findFirst({
      where: { stockId: stock.id, type: row.type, exDate: row.exDate },
    });
    if (existing) {
      const fillRatio = existing.ratio === null && row.ratio !== null;
      const fillAmount = existing.amount === null && row.amount !== null;
      if (fillRatio || fillAmount) {
        await prisma.corporateAction.update({
          where: { id: existing.id },
          data: { ...(fillRatio ? { ratio: row.ratio } : {}), ...(fillAmount ? { amount: row.amount } : {}) },
        });
        repaired++;
      } else {
        skipped++;
      }
      continue;
    }
    await prisma.corporateAction.create({
      data: {
        stockId: stock.id,
        type: row.type,
        exDate: row.exDate,
        ratio: row.ratio,
        amount: row.amount,
        details: {
          subject: row.subject,
          recordDate: row.recordDate?.toISOString() ?? null,
          company: row.company,
          series: row.series,
          source,
        },
      },
    });
    inserted++;
  }
  return { inserted, repaired, skipped };
}

/**
 * Nightly corporate-actions sync: NSE's JSON API first, BSE when NSE fails or
 * returns nothing readable. Neither answering is reported as zero rows, which
 * the feed canary flags.
 */
export async function loadNseCorporateActions(now: Date = new Date()): Promise<CorpActionLoadResult> {
  const { parsed, source } = await fetchCorporateActionRows(now);
  if (!parsed) return { fetched: 0, inserted: 0, skipped: 0, dataLines: 0, parseFailures: 0, source };

  logger.info(
    { source, rowCount: parsed.rows.length, dataLines: parsed.dataLines, parseFailures: parsed.parseFailures },
    '[CA] parsed corporate actions',
  );
  const stored = await storeCorporateActions(parsed.rows, source, parsed.isinBySymbol);
  logger.info({ source, ...stored }, '[CA] load complete');
  return {
    fetched: parsed.rows.length,
    inserted: stored.inserted + stored.repaired,
    skipped: stored.skipped,
    dataLines: parsed.dataLines,
    parseFailures: parsed.parseFailures,
    source,
  };
}

/** Fetch and parse only — NSE first, then BSE. No database writes. */
export async function fetchCorporateActionRows(
  now: Date = new Date(),
): Promise<{ parsed: CorpActionJsonOutcome | null; source: 'nse' | 'bse' | 'none' }> {
  let parsed: CorpActionJsonOutcome | null = null;
  let source: 'nse' | 'bse' | 'none' = 'none';

  try {
    logger.info('[CA] fetching NSE corporate actions (JSON API)');
    const nse = parseNseCorpActionsJson(await fetchNseCorpActionsJson(now));
    if (nse.rows.length > 0) {
      parsed = nse;
      source = 'nse';
    } else {
      logger.warn({ dataLines: nse.dataLines, parseFailures: nse.parseFailures }, '[CA] NSE returned no readable rows');
    }
  } catch (err) {
    logger.warn({ err }, '[CA] NSE fetch failed; trying BSE');
  }

  if (!parsed) {
    try {
      const bse = parseBseCorpActionsJson(await fetchBseCorpActionsJson(now));
      if (bse.rows.length > 0) {
        parsed = bse;
        source = 'bse';
      } else {
        logger.warn({ dataLines: bse.dataLines, parseFailures: bse.parseFailures }, '[CA] BSE returned no readable rows');
      }
    } catch (err) {
      logger.warn({ err }, '[CA] BSE fetch failed');
    }
  }

  return { parsed, source };
}
