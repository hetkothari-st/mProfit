/**
 * Side-effecting fetcher for niftyindices.com historical index data.
 *
 * `01-DATA-FOUNDATION.md §3` (`nseIndices.ts`), `07` Task 1.3.
 *
 * The `.v1.ts` half of the §14 split: **network and URLs only**. Every byte
 * this file obtains is handed to `parseNiftyIndexCsv` in
 * `nseIndices.parse.ts`, which is pure and fixture-tested. Nothing in here
 * interprets a row, computes a value, or decides what a series means. That
 * boundary is the whole point: when niftyindices changes its layout the fix is
 * a new fixture plus a new `.v2.ts`, not a debugging session against a live
 * site with a tested parser in the blast radius.
 *
 * =============================================================================
 * ⚠ EVERY URL, PARAMETER AND INDEX NAME BELOW IS **UNVERIFIED**
 * =============================================================================
 * They were written from the documented/observed shape of niftyindices.com, NOT
 * from a live session against it, and this repo has no verified access to the
 * endpoint. Exactly the same caveat the EPFO adapters carry
 * (`adapters/pf/epf/uanLookup.v1.ts`): treat them as a starting point to be
 * corrected against the real site before this feed is trusted in production.
 *
 * Specifically unverified:
 *   1. `HISTORICAL_CSV_URL` — that niftyindices serves a CSV export at this
 *      path, with these query parameters. The site's own UI drives a POST to
 *      an ASPX page-method (`Backpage.aspx/getHistoricaldatatabletoString`)
 *      that answers with JSON, not CSV. If that is the only route that works,
 *      the correct fix is a `nseIndices.v2.ts` with a JSON parser beside
 *      `nseIndices.parse.ts` — NOT a JSON→CSV transform smuggled into this
 *      file, which would put untested shape-conversion logic on the
 *      side-effecting side of the split.
 *   2. `NSE_INDEX_REQUEST_NAME` — the exact index-name strings the endpoint
 *      expects ("NIFTY 50 - TRI" style). A wrong name almost certainly yields
 *      an empty body rather than an error, which is why `EMPTY_BODY` is a
 *      distinct, loud outcome below and not silently "zero rows today".
 *   3. That the equity endpoint also serves the hybrid and fixed-income
 *      indices. `BENCHMARK_TRI_NOT_FREELY_AVAILABLE` already records the
 *      belief that it does not.
 *   4. `MAX_RANGE_DAYS` — that the endpoint refuses very long ranges. The
 *      chunking below is defensive, not measured.
 *
 * =============================================================================
 * WHY THIS MODULE NEVER THROWS
 * =============================================================================
 * `benchmarkPriceJob` iterates every seeded index and must survive one of them
 * failing (`CONTEXT.md §3.5`). A throw here would either take the other
 * thirteen indices down or force the job into a `try/catch` per call that
 * loses the reason. Instead every path returns a discriminated
 * `IndexFetchOutcome`; the caller pattern-matches and writes an
 * `IngestionFailure` with the reason intact.
 *
 * This module also **never fabricates rows**. An empty or unrecognisable
 * response yields a failure outcome, never `rows: []` dressed up as success —
 * a benchmark that silently returns no data would make `detectGaps` see a hole
 * that the staleness alert then attributes to the market rather than to us.
 */

import { request } from 'undici';
import { logger } from '../lib/logger.js';
import {
  parseNiftyIndexCsv,
  type IndexParseFailure,
  type IndexPriceRow,
} from './nseIndices.parse.js';

/** Bumped, never edited in place, when the wire format changes (§3.4/§14). */
export const NSE_INDICES_ADAPTER_ID = 'nse.indices';
export const NSE_INDICES_ADAPTER_VERSION = '1';

/**
 * Why a fetch produced no usable text.
 *
 * A closed union so the job can map each case to a DLQ reason without a
 * default branch that swallows a new one. The distinction that matters
 * operationally is `NOT_CONFIGURED` (permanent, known, nothing to do —
 * a human action would not help) versus everything else (transient or drift,
 * worth a DLQ row and a look).
 */
export type IndexFetchFailureReason =
  /** No request mapping for this index code — we do not know how to ask. */
  | 'NOT_CONFIGURED'
  /** Non-2xx from the endpoint. `httpStatus` carries the code. */
  | 'HTTP_ERROR'
  /** DNS/TLS/timeout/socket. The site may simply be down. */
  | 'NETWORK_ERROR'
  /** 2xx with nothing (or whitespace) in the body. */
  | 'EMPTY_BODY'
  /** 2xx with a body that is plainly not the CSV we asked for (HTML error
   *  page, JSON, a login wall). Distinguished from a parse failure because the
   *  remedy is different: the endpoint moved, rather than its columns did. */
  | 'NOT_CSV'
  /** The parser rejected the whole file — no header it recognises. */
  | 'PARSE_REJECTED';

export interface IndexFetchFailure {
  ok: false;
  reason: IndexFetchFailureReason;
  /** Human-readable, safe to put in an `IngestionFailure.errorMessage`. */
  detail: string;
  /** What we asked for, for the DLQ's `sourceRef`. */
  sourceRef: string;
  httpStatus?: number;
  /** First bytes of an unexpected body, for diagnosing drift. Truncated. */
  bodySample?: string;
}

export interface IndexFetchSuccess {
  ok: true;
  rows: IndexPriceRow[];
  /** Row-level rejections from the pure parser. The job DLQs these separately
   *  from a whole-file failure — 3 bad rows out of 2,400 is not a fetch
   *  failure, and treating it as one would discard 2,397 good observations. */
  failures: IndexParseFailure[];
  sourceRef: string;
  adapterId: string;
  adapterVersion: string;
}

export type IndexFetchOutcome = IndexFetchSuccess | IndexFetchFailure;

export interface IndexFetchRange {
  /** Inclusive, UTC midnight. */
  from: Date;
  /** Inclusive, UTC midnight. */
  to: Date;
}

/**
 * ⚠ UNVERIFIED. Seed code → the index name niftyindices expects.
 *
 * Kept as an explicit map rather than derived from the code string. Deriving
 * it ("NIFTY50_TRI" → "NIFTY 50 - TRI") would be a rule that silently produces
 * a plausible-but-wrong name for every future index, and a wrong name here
 * returns an empty body, not an error.
 *
 * Codes absent from this map resolve to `NOT_CONFIGURED` — an honest "we do
 * not know how to ask for this", which is the correct thing to tell an
 * operator. See `BENCHMARK_TRI_NOT_FREELY_AVAILABLE` in `benchmarkIndexSeed.ts`
 * for which ones are expected to stay absent and why.
 */
export const NSE_INDEX_REQUEST_NAME: Readonly<Record<string, string>> = {
  NIFTY50_TRI: 'NIFTY 50 - TRI',
  NIFTY100_TRI: 'NIFTY 100 - TRI',
  NIFTY200_TRI: 'NIFTY 200 - TRI',
  NIFTY500_TRI: 'NIFTY 500 - TRI',
  NIFTY_MIDCAP150_TRI: 'NIFTY MIDCAP150 - TRI',
  NIFTY_SMALLCAP250_TRI: 'NIFTY SMALLCAP250 - TRI',
  NIFTY_LARGEMIDCAP250_TRI: 'NIFTY LARGEMIDCAP250 - TRI',
  NIFTY_MIDSMALLCAP400_TRI: 'NIFTY MIDSMALLCAP400 - TRI',
  // Deliberately NOT mapped, because we do not believe the equity historical
  // endpoint serves them and a guessed name would return an empty body that
  // looks like "the market was closed":
  //   NIFTY50_HYBRID_COMPOSITE_DEBT_65_35_TRI  (multi-asset endpoint)
  //   NIFTY_SHORT_DURATION_DEBT / NIFTY_CORPORATE_BOND / NIFTY_LIQUID
  //     (fixed-income endpoint)
};

/**
 * ⚠ UNVERIFIED base URL for the historical CSV export.
 *
 * Overridable per call so an operator who discovers the real path can point
 * the feed at it without a redeploy of this file's logic, and so the backfill
 * script can be run against a locally-saved mirror.
 */
export const HISTORICAL_CSV_URL = 'https://www.niftyindices.com/Backpage.aspx/getHistoricaldatatabletoCSV';

/**
 * Browser-ish headers. Copied deliberately from `nseBhavcopy.service.ts` and
 * `nseUniverse.service.ts` rather than invented: NSE-family hosts 403 requests
 * without a plausible `user-agent` and a matching `referer`, and three feeds in
 * this repo disagreeing about what they send is three separate outages when
 * NSE tightens the check.
 */
const BROWSER_HEADERS = {
  'user-agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  accept: 'text/csv,application/octet-stream,*/*;q=0.8',
  'accept-language': 'en-US,en;q=0.9',
  referer: 'https://www.niftyindices.com/reports/historical-data',
  origin: 'https://www.niftyindices.com',
};

/**
 * ⚠ UNVERIFIED. Longest range we ask for in one request.
 *
 * A 10-year backfill is ~2,500 trading days. Whether the endpoint will serve
 * that in one response is unknown, and the failure mode of asking for too much
 * is usually a truncated body rather than an error — which would look like a
 * gap in the index rather than a broken request. 365 days per call is well
 * inside anything plausible, and `fetchNiftyIndexHistory` stitches the chunks.
 */
const MAX_RANGE_DAYS = 365;

const MONTH_ABBR = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const;

/** `DD-MMM-YYYY`, the format niftyindices' own UI submits. UTC parts only —
 *  formatting from local parts would shift the range by a day on an IST box. */
export function formatNiftyDate(d: Date): string {
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mmm = MONTH_ABBR[d.getUTCMonth()];
  return `${dd}-${mmm}-${d.getUTCFullYear()}`;
}

export interface NseIndexFetchOptions {
  /** Override the endpoint (mirror, corrected path, test double). */
  url?: string;
  /** Override the index name sent to the endpoint. */
  requestName?: string;
  /** Injectable transport. The job and backfill never set this; tests do, so
   *  that no test in this repo can accidentally hit niftyindices.com. */
  fetchText?: (url: string) => Promise<HttpTextOutcome>;
}

export type HttpTextOutcome =
  | { ok: true; text: string }
  | { ok: false; reason: 'HTTP_ERROR' | 'NETWORK_ERROR'; detail: string; httpStatus?: number };

/**
 * GET a URL and return its body as text, or a typed failure.
 *
 * The `catch` returns a typed failure and logs — it neither swallows
 * (`portfolioos/no-silent-catch`) nor rethrows, because a dead endpoint is an
 * expected operational state for a scraped feed, not an exception.
 */
export async function httpGetText(
  url: string,
  headers: Readonly<Record<string, string>> = BROWSER_HEADERS,
): Promise<HttpTextOutcome> {
  try {
    const res = await request(url, {
      method: 'GET',
      headers,
      maxRedirections: 5,
      bodyTimeout: 30_000,
      headersTimeout: 15_000,
    });
    if (res.statusCode < 200 || res.statusCode >= 300) {
      await res.body.dump();
      return {
        ok: false,
        reason: 'HTTP_ERROR',
        detail: `HTTP ${res.statusCode} from ${url}`,
        httpStatus: res.statusCode,
      };
    }
    return { ok: true, text: await res.body.text() };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    logger.warn({ err, url }, '[indices.v1] transport error');
    return { ok: false, reason: 'NETWORK_ERROR', detail };
  }
}

/**
 * Cheap sanity check before handing a body to the CSV parser.
 *
 * niftyindices answers a bad request with an HTML error page or a JSON
 * envelope, both HTTP 200. Feeding either to `parseNiftyIndexCsv` would
 * produce `missing_header`, which reads as "their columns changed" when the
 * truth is "we asked the wrong endpoint". Two different problems, two
 * different fixes, so two different reason codes.
 */
export function looksLikeCsv(text: string): boolean {
  const head = text.trimStart().slice(0, 400).toLowerCase();
  if (head.startsWith('<') || head.startsWith('{') || head.startsWith('[')) return false;
  if (head.includes('<!doctype') || head.includes('<html')) return false;
  return head.includes(',');
}

/** Split an inclusive date range into <= `MAX_RANGE_DAYS` inclusive chunks. */
export function chunkRange(range: IndexFetchRange, maxDays = MAX_RANGE_DAYS): IndexFetchRange[] {
  const DAY = 86_400_000;
  const out: IndexFetchRange[] = [];
  let cursor = range.from.getTime();
  const end = range.to.getTime();
  while (cursor <= end) {
    const chunkEnd = Math.min(cursor + (maxDays - 1) * DAY, end);
    out.push({ from: new Date(cursor), to: new Date(chunkEnd) });
    cursor = chunkEnd + DAY;
  }
  return out;
}

function buildUrl(base: string, indexName: string, range: IndexFetchRange): string {
  const u = new URL(base);
  // ⚠ UNVERIFIED parameter names.
  u.searchParams.set('indexName', indexName);
  u.searchParams.set('fromDate', formatNiftyDate(range.from));
  u.searchParams.set('toDate', formatNiftyDate(range.to));
  return u.toString();
}

/**
 * Fetch one index's history over `range`, oldest-first, deduplicated.
 *
 * Chunking is invisible to the caller: a chunk that fails fails the whole
 * fetch. Returning a partial series as `ok: true` would hand the job a
 * benchmark with a hole in the middle and no indication of it, and every alpha
 * computed across that hole would be wrong while looking perfectly healthy.
 * A failed range is retried whole on the next run, which is cheap.
 */
export async function fetchNiftyIndexHistory(
  indexCode: string,
  range: IndexFetchRange,
  options: NseIndexFetchOptions = {},
): Promise<IndexFetchOutcome> {
  const indexName = options.requestName ?? NSE_INDEX_REQUEST_NAME[indexCode];
  const sourceRef = `${indexCode}@${formatNiftyDate(range.from)}..${formatNiftyDate(range.to)}`;

  if (!indexName) {
    return {
      ok: false,
      reason: 'NOT_CONFIGURED',
      detail:
        `No niftyindices request name is mapped for "${indexCode}". This is a ` +
        `known gap, not a fetch failure: see BENCHMARK_TRI_NOT_FREELY_AVAILABLE ` +
        `in benchmarkIndexSeed.ts. Add a NSE_INDEX_REQUEST_NAME entry only after ` +
        `verifying the exact name against the live endpoint.`,
      sourceRef,
    };
  }

  const base = options.url ?? HISTORICAL_CSV_URL;
  const get = options.fetchText ?? httpGetText;

  const rows: IndexPriceRow[] = [];
  const failures: IndexParseFailure[] = [];
  const seen = new Set<number>();

  for (const chunk of chunkRange(range)) {
    const url = buildUrl(base, indexName, chunk);
    const res = await get(url);
    if (!res.ok) {
      return {
        ok: false,
        reason: res.reason,
        detail: res.detail,
        sourceRef,
        ...(res.httpStatus === undefined ? {} : { httpStatus: res.httpStatus }),
      };
    }

    if (!res.text.trim()) {
      return {
        ok: false,
        reason: 'EMPTY_BODY',
        detail: `Empty body for ${indexName} ${formatNiftyDate(chunk.from)}..${formatNiftyDate(chunk.to)}. The index name or the endpoint is probably wrong — niftyindices answers an unknown index with nothing rather than an error.`,
        sourceRef,
      };
    }

    if (!looksLikeCsv(res.text)) {
      return {
        ok: false,
        reason: 'NOT_CSV',
        detail: `Response for ${indexName} is not CSV (HTML/JSON/other). The endpoint has moved or requires a session.`,
        sourceRef,
        bodySample: res.text.trimStart().slice(0, 300),
      };
    }

    const parsed = parseNiftyIndexCsv(res.text);
    if (parsed.rows.length === 0 && parsed.failures.some((f) => f.reason === 'missing_header')) {
      return {
        ok: false,
        reason: 'PARSE_REJECTED',
        detail: `No recognisable header in the CSV for ${indexName}. The export's columns have changed — add a fixture and bump the adapter version.`,
        sourceRef,
        bodySample: res.text.trimStart().slice(0, 300),
      };
    }

    failures.push(...parsed.failures);
    for (const row of parsed.rows) {
      // Chunk boundaries are inclusive on both ends, so consecutive chunks can
      // legitimately both carry an edge date if the endpoint is inclusive too.
      // First occurrence wins, matching the parser's own duplicate rule.
      const key = row.date.getTime();
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push(row);
    }
  }

  rows.sort((a, b) => a.date.getTime() - b.date.getTime());

  return {
    ok: true,
    rows,
    failures,
    sourceRef,
    adapterId: NSE_INDICES_ADAPTER_ID,
    adapterVersion: NSE_INDICES_ADAPTER_VERSION,
  };
}

/**
 * Exposed so `bseIndices.v1.ts` and `rbiRiskFree.v1.ts` reuse ONE transport and
 * ONE "is this actually CSV" check. Three feeds with three slightly different
 * timeout and body-sniffing behaviours is three separate incidents the first
 * time a provider starts answering 200-with-an-HTML-error-page.
 */
export const __sharedTransport = { httpGetText, looksLikeCsv };
