/**
 * Side-effecting fetcher for MoSPI CPI (eSankhyiki). Network and URLs only;
 * every byte goes to the pure, fixture-tested `mospiCpi.parse.ts`.
 *
 * =============================================================================
 * VERIFIED 2026-11-03 — the real requests
 * =============================================================================
 * Current series (base 2024, COICOP divisions, Jan 2026 →):
 *   GET https://api.mospi.gov.in/api/cpi/getCPIData
 *       ?base_year=2024&series=Current&Format=JSON&limit=100&page=1
 *       &year=YYYY&month_code=M&state_code=S
 *   With `state_code` set, page 1 leads with all 39 division-level rows
 *   (13 divisions × Rural/Urban/Combined). One request per state-month.
 *   `limit` must be 10..100 or the API answers HTTP 200 with an `error` body.
 *
 * Previous series (base 2012, Jan 2011 → Dec 2025):
 *   GET https://api.mospi.gov.in/api/cpi/getCPIIndex
 *       ?base_year=2012&series=Current&Format=JSON&limit=200&page=N
 *       &year=Y1,Y2,...&state_code=LEGACY
 *   `limit` max 200. Four years for one state ≈ 4,032 rows ≈ 21 pages.
 *   The old series numbers states differently (99 = All India).
 *
 * No auth, no key, no cookies. Errors and "no data" both come back as HTTP 200
 * with a JSON body, which the parser classifies. Never throws.
 */

import { constants as cryptoConstants } from 'node:crypto';
import { Agent, request } from 'undici';
import { logger } from '../lib/logger.js';
import type { HttpTextOutcome } from './nseIndices.v1.js';
import {
  parseCpi2024Page,
  parseCpi2012Page,
  legacyRowsToDivisions,
  type CpiParseFailure,
  type CpiRow,
  type LegacySubgroupRow,
} from './mospiCpi.parse.js';

export const MOSPI_CPI_ADAPTER_ID = 'mospi.cpi';
export const MOSPI_CPI_ADAPTER_VERSION = '1';

export const MOSPI_CPI2024_URL = 'https://api.mospi.gov.in/api/cpi/getCPIData';
export const MOSPI_CPI2012_URL = 'https://api.mospi.gov.in/api/cpi/getCPIIndex';

const HEADERS: Readonly<Record<string, string>> = {
  accept: 'application/json',
  'user-agent': 'EveryPaisa-CPI/1.0',
};

/** Safety stop for the paged legacy fetch — 4 years is ~21 pages. */
const MAX_LEGACY_PAGES = 60;

export type CpiFetchOutcome =
  | { ok: true; rows: CpiRow[]; failures: CpiParseFailure[]; sourceRef: string }
  /** Month not released yet (or no data for that state). Not a failure. */
  | { ok: true; rows: []; failures: []; sourceRef: string; noData: true }
  | { ok: false; reason: string; detail: string; sourceRef: string; httpStatus?: number; bodySample?: string };

export type FetchText = (url: string) => Promise<HttpTextOutcome>;

/**
 * TLS: api.mospi.gov.in only completes a handshake with legacy (RFC 5746-less)
 * renegotiation allowed. OpenSSL 3 — Node 17+ — refuses that by default with
 * `ERR_SSL_UNSAFE_LEGACY_RENEGOTIATION_DISABLED` (measured 2026-11-03; curl on
 * Windows/schannel does not, which is why a curl probe looks fine). This agent
 * re-enables it for this one host only, never globally. The risk it reopens
 * (CVE-2009-3555 prefix injection) is bounded here: read-only public data,
 * no credentials sent, and every body is shape-checked by the parser.
 */
const mospiAgent = new Agent({
  connect: { secureOptions: cryptoConstants.SSL_OP_LEGACY_SERVER_CONNECT },
});

const MOSPI_HOST = 'api.mospi.gov.in';

const getOnce: FetchText = async (url) => {
  if (new URL(url).host !== MOSPI_HOST) {
    return { ok: false, reason: 'NETWORK_ERROR', detail: `Refusing legacy-TLS transport for ${url}` };
  }
  try {
    const res = await request(url, {
      method: 'GET',
      headers: HEADERS,
      dispatcher: mospiAgent,
      bodyTimeout: 30_000,
      headersTimeout: 15_000,
    });
    if (res.statusCode < 200 || res.statusCode >= 300) {
      await res.body.dump();
      return { ok: false, reason: 'HTTP_ERROR', detail: `HTTP ${res.statusCode} from ${url}`, httpStatus: res.statusCode };
    }
    return { ok: true, text: await res.body.text() };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    logger.warn({ err, url }, '[mospi.cpi] transport error');
    return { ok: false, reason: 'NETWORK_ERROR', detail };
  }
};

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * MoSPI rate-limits: the first full backfill (2026-11-03) drew HTTP 429 after
 * a few hundred back-to-back requests. Back off and retry a 429/503 a few
 * times before giving up; the job's resume logic covers anything that still
 * fails (the next daily run re-fetches only what is missing).
 */
const RETRY_BACKOFF_MS = [5_000, 15_000, 45_000];
/** Pause between pages of one paged request — courtesy, and the 429 fix. */
const PAGE_PAUSE_MS = 600;

const defaultGet: FetchText = async (url) => {
  for (let attempt = 0; ; attempt += 1) {
    const res = await getOnce(url);
    const retryable = !res.ok && (res.httpStatus === 429 || res.httpStatus === 503);
    if (!retryable || attempt >= RETRY_BACKOFF_MS.length) return res;
    logger.warn({ url, httpStatus: res.ok ? null : res.httpStatus, attempt }, '[mospi.cpi] throttled — backing off');
    await sleep(RETRY_BACKOFF_MS[attempt]!);
  }
};

/** One state-month of the current series. */
export async function fetchCpi2024StateMonth(
  args: { stateCode: number; year: number; month: number },
  fetchText: FetchText = defaultGet,
): Promise<CpiFetchOutcome> {
  const sourceRef = `cpi2024:s${args.stateCode}:${args.year}-${String(args.month).padStart(2, '0')}`;
  const u = new URL(MOSPI_CPI2024_URL);
  u.searchParams.set('base_year', '2024');
  u.searchParams.set('series', 'Current');
  u.searchParams.set('Format', 'JSON');
  u.searchParams.set('limit', '100');
  u.searchParams.set('page', '1');
  u.searchParams.set('year', String(args.year));
  u.searchParams.set('month_code', String(args.month));
  u.searchParams.set('state_code', String(args.stateCode));

  const res = await fetchText(u.toString());
  if (!res.ok) {
    return { ok: false, reason: res.reason, detail: res.detail, sourceRef, ...(res.httpStatus === undefined ? {} : { httpStatus: res.httpStatus }) };
  }
  const parsed = parseCpi2024Page(res.text, args.stateCode);
  if (parsed.kind === 'empty') return { ok: true, rows: [], failures: [], sourceRef, noData: true };
  if (parsed.kind === 'fatal') {
    return { ok: false, reason: parsed.reason, detail: parsed.detail, sourceRef, bodySample: res.text.slice(0, 300) };
  }
  // The request named one month; anything else on the page is not ours.
  const rows = parsed.rows.filter((r) => r.year === args.year && r.month === args.month);
  return { ok: true, rows, failures: parsed.failures, sourceRef };
}

/** Several years of the previous series for one state, all pages, mapped to divisions. */
export async function fetchCpi2012StateYears(
  args: { stateCode: number; legacyStateCode: number; years: readonly number[] },
  fetchText: FetchText = defaultGet,
): Promise<CpiFetchOutcome> {
  const sourceRef = `cpi2012:s${args.stateCode}:${args.years.join(',')}`;
  const subgroupRows: LegacySubgroupRow[] = [];
  const failures: CpiParseFailure[] = [];

  for (let page = 1, totalPages = 1; page <= totalPages; page += 1) {
    if (page > MAX_LEGACY_PAGES) {
      return { ok: false, reason: 'TOO_MANY_PAGES', detail: `More than ${MAX_LEGACY_PAGES} pages for ${sourceRef}`, sourceRef };
    }
    if (page > 1 && fetchText === defaultGet) await sleep(PAGE_PAUSE_MS);
    const u = new URL(MOSPI_CPI2012_URL);
    u.searchParams.set('base_year', '2012');
    u.searchParams.set('series', 'Current');
    u.searchParams.set('Format', 'JSON');
    u.searchParams.set('limit', '200');
    u.searchParams.set('page', String(page));
    u.searchParams.set('year', args.years.join(','));
    u.searchParams.set('state_code', String(args.legacyStateCode));

    const res = await fetchText(u.toString());
    if (!res.ok) {
      return { ok: false, reason: res.reason, detail: `${res.detail} (page ${page})`, sourceRef, ...(res.httpStatus === undefined ? {} : { httpStatus: res.httpStatus }) };
    }
    const parsed = parseCpi2012Page(res.text);
    if (parsed.kind === 'empty') {
      if (page === 1) return { ok: true, rows: [], failures: [], sourceRef, noData: true };
      break;
    }
    if (parsed.kind === 'fatal') {
      return { ok: false, reason: parsed.reason, detail: `${parsed.detail} (page ${page})`, sourceRef, bodySample: res.text.slice(0, 300) };
    }
    subgroupRows.push(...parsed.rows);
    failures.push(...parsed.failures);
    totalPages = parsed.totalPages;
  }

  // Map only once every page is in, so Housing and Fuel & Light for one
  // month cannot be averaged from half a pair.
  return { ok: true, rows: legacyRowsToDivisions(subgroupRows, args.stateCode), failures, sourceRef };
}
