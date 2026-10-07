/**
 * Side-effecting fetcher for niftyindices.com Total Return Index history.
 *
 * `01-DATA-FOUNDATION.md §3` (`nseIndices.ts`), `07` Task 1.3.
 *
 * The `.v1.ts` half of the §14 split: **network and URLs only**. Every byte
 * this file obtains is handed to `parseNiftyTriJson` in `nseIndices.parse.ts`,
 * which is pure and fixture-tested. Nothing in here interprets a row, computes
 * a value, or decides what a series means.
 *
 * =============================================================================
 * VERIFIED 2026-09-07 — the real request
 * =============================================================================
 * This file previously guessed at a CSV export
 * (`Backpage.aspx/getHistoricaldatatabletoCSV?indexName=…`). That endpoint does
 * not exist. Reverse-engineered from the site's own bundle
 * (`liveindexsa.niftyindices.com/assets/js/IISLComponet.js`) and confirmed
 * against live responses, the real call is:
 *
 * ```
 * POST https://www.niftyindices.com/BackPage/getTotalReturnIndexString
 * content-type: application/json; charset=utf-8
 *
 * {"cinfo":"{'name':'NIFTY 50','startDate':'01-Jan-2024','endDate':'31-Jan-2024','indexName':'NIFTY 50'}"}
 * ```
 *
 * Three details worth stating because each one is a trap:
 *
 *  1. The path is `/BackPage/…`, an MVC controller action — **not** the
 *     `/Backpage.aspx/…` page-method the old comment assumed. The ASPX form
 *     answers a plain GET with the site's HTML shell under HTTP 200.
 *  2. `cinfo` is a **string containing JSON-ish text with single quotes**,
 *     nested inside a real JSON object. That is what the site sends and what
 *     the server's model binder expects; it is not a mistake to be tidied up.
 *  3. Sending no `content-type: application/json` returns the site's HTML
 *     homepage with HTTP 200 rather than an error. Hence `looksLikeJson` below
 *     and the `not_json` parse reason: a 200 proves nothing here.
 *
 * Also verified live, and the reason several defensive behaviours below are
 * shaped the way they are:
 *  - **No session cookie, referer or origin is required.** Only the
 *    content-type is load-bearing. We send browser-ish headers anyway: the
 *    host sits behind Akamai bot management (it sets `ak_bmsc`/`bm_mi` on the
 *    HTML page) and a naked client is the first thing such a rule tightens on.
 *  - **The 365-day limit is client-side only.** `IISLComponet.js` refuses a
 *    longer range in the browser; the server happily returned 2,726 rows for
 *    01-Jan-2015..31-Dec-2025 in 157 ms. So we do not chunk a decade into
 *    eleven requests — one request is both faster and politer.
 *  - **An unknown index name returns `[]` with HTTP 200**, never an error.
 *    That is why the parser treats an empty array as `empty_payload` and this
 *    file turns it into a loud `EMPTY_BODY` outcome rather than "no rows
 *    today".
 *  - **Only the eight broad-market equity TRI names below actually resolve.**
 *    See `NSE_INDEX_REQUEST_NAME`.
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
  parseNiftyTriJson,
  type IndexParseFailure,
  type IndexPriceRow,
} from './nseIndices.parse.js';

/** Bumped, never edited in place, when the wire format changes (§3.4/§14).
 *  v1 was the never-working CSV guess; v2 is the verified JSON page-method. */
export const NSE_INDICES_ADAPTER_ID = 'nse.indices';
export const NSE_INDICES_ADAPTER_VERSION = '2';

/**
 * Why a fetch produced no usable data.
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
  /** 2xx with nothing in the body, or with an empty JSON array — which is how
   *  niftyindices answers an index name it does not recognise. */
  | 'EMPTY_BODY'
  /** 2xx with a body that is plainly not JSON (the site's HTML shell, a login
   *  wall). Distinguished from a parse failure because the remedy is
   *  different: the endpoint moved, rather than its fields did. */
  | 'NOT_JSON'
  /** The parser rejected the whole payload. */
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
   *  from a whole-payload failure — 3 bad rows out of 2,400 is not a fetch
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
 * Seed code → the index name niftyindices expects. **Verified live**: every
 * entry below was confirmed to return rows for 01-Jan-2024..31-Jan-2024, and
 * every code deliberately absent was confirmed to return `[]`.
 *
 * Kept as an explicit map rather than derived from the code string. Deriving
 * it ("NIFTY50_TRI" → "NIFTY 50") would be a rule that silently produces a
 * plausible-but-wrong name for every future index, and a wrong name returns an
 * empty array, not an error.
 *
 * The endpoint takes two names. The site resolves the second (the long name a
 * user picked) through `IndexMapping.json` into the first (the short "trading"
 * name) and sends both; the server keys off the short one. We store the short
 * name and send it for both, which is what the site does whenever the two are
 * equal — verified to work for all eight, including the four whose long and
 * short names differ (e.g. `NIFTY SMLCAP 250` vs `NIFTY SMALLCAP 250`).
 *
 * Note the **absence of the `TRI` suffix**. The endpoint is the TRI endpoint;
 * asking it for "NIFTY 50 - TRI" (the old guess) returns `[]`. The series is
 * total-return because of the endpoint, not because of the name.
 *
 * Codes absent from this map resolve to `NOT_CONFIGURED` — an honest "we do
 * not know how to ask for this", which is the correct thing to tell an
 * operator. See `BENCHMARK_TRI_NOT_FREELY_AVAILABLE` in `benchmarkIndexSeed.ts`
 * for which ones are expected to stay absent and why.
 */
export const NSE_INDEX_REQUEST_NAME: Readonly<Record<string, string>> = {
  NIFTY50_TRI: 'NIFTY 50',
  NIFTY100_TRI: 'NIFTY 100',
  NIFTY200_TRI: 'NIFTY 200',
  NIFTY500_TRI: 'NIFTY 500',
  NIFTY_MIDCAP150_TRI: 'NIFTY MIDCAP 150',
  NIFTY_SMALLCAP250_TRI: 'NIFTY SMLCAP 250',
  NIFTY_LARGEMIDCAP250_TRI: 'NIFTY LARGEMID250',
  NIFTY_MIDSMALLCAP400_TRI: 'NIFTY MIDSML 400',
  // Deliberately NOT mapped. Each was probed live on 2026-09-07 against both
  // `/BackPage/getTotalReturnIndexString` and `/BackPage/getHistoricaldatatabletoString`
  // under several spellings, and every attempt returned an empty array:
  //   NIFTY50_HYBRID_COMPOSITE_DEBT_65_35_TRI
  //   NIFTY_SHORT_DURATION_DEBT / NIFTY_CORPORATE_BOND / NIFTY_LIQUID
  // They are real NSE indices, but the public historical-data tool does not
  // serve them; NSE puts fixed-income and hybrid history behind its paid data
  // subscription. Guessing another spelling would only produce more `[]`.
};

/** The verified TRI page-method. Overridable per call for tests and mirrors. */
export const TRI_ENDPOINT_URL = 'https://www.niftyindices.com/BackPage/getTotalReturnIndexString';

/**
 * Browser-ish headers.
 *
 * Verified: only `content-type` is actually required today. The rest is
 * deliberate insurance — `www.niftyindices.com` is fronted by Akamai bot
 * management, and a request with no `user-agent` and no `referer` is exactly
 * the shape such a rule starts rejecting first. Copied from
 * `nseBhavcopy.service.ts` / `nseLive.service.ts` rather than invented, so that
 * three NSE-family feeds in this repo do not become three separate outages the
 * day NSE tightens the check.
 */
const BROWSER_HEADERS: Readonly<Record<string, string>> = {
  'user-agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'content-type': 'application/json; charset=utf-8',
  accept: 'application/json, text/javascript, */*; q=0.01',
  'accept-language': 'en-US,en;q=0.9',
  'x-requested-with': 'XMLHttpRequest',
  referer: 'https://www.niftyindices.com/reports/historical-data',
  origin: 'https://www.niftyindices.com',
};

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
  postJson?: (url: string, body: string) => Promise<HttpTextOutcome>;
}

export type HttpTextOutcome =
  | { ok: true; text: string }
  | { ok: false; reason: 'HTTP_ERROR' | 'NETWORK_ERROR'; detail: string; httpStatus?: number };

/**
 * GET a URL and return its body as text, or a typed failure.
 *
 * Retained (and still exported through `__sharedTransport`) because
 * `mfPublishedReturns.v1.ts` and `bseIndices.v1.ts` fetch with GET. The
 * `catch` returns a typed failure and logs — it neither swallows
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
 * POST a JSON body and return the response as text.
 *
 * `maxRedirections: 0` on purpose. undici replays a POST body across a 307 but
 * degrades a 301/302 to GET, and a silently-degraded GET here returns the
 * site's HTML homepage under HTTP 200 — a "successful" response containing no
 * data. Better to see the 3xx as an `HTTP_ERROR` and know the endpoint moved.
 */
export async function httpPostJson(
  url: string,
  body: string,
  headers: Readonly<Record<string, string>> = BROWSER_HEADERS,
): Promise<HttpTextOutcome> {
  try {
    const res = await request(url, {
      method: 'POST',
      headers,
      body,
      maxRedirections: 0,
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
 * Cheap sanity check before handing a body to the JSON parser.
 *
 * niftyindices answers a request without `content-type: application/json` with
 * its full HTML homepage under HTTP 200, and its own `content-type` on the
 * *successful* JSON response is `text/html; charset=utf-8` — so neither the
 * status code nor the response header can be trusted to tell JSON from HTML.
 * Sniffing the first non-space byte can.
 */
export function looksLikeJson(text: string): boolean {
  const head = text.trimStart();
  return head.startsWith('[') || head.startsWith('{');
}

/**
 * Kept for `mfPublishedReturns.v1.ts`, which fetches a genuinely comma-
 * separated source and shares this transport module.
 */
export function looksLikeCsv(text: string): boolean {
  const head = text.trimStart().slice(0, 400).toLowerCase();
  if (head.startsWith('<') || head.startsWith('{') || head.startsWith('[')) return false;
  if (head.includes('<!doctype') || head.includes('<html')) return false;
  return head.includes(',');
}

/**
 * Build the `cinfo` payload the endpoint expects.
 *
 * The single quotes are not a typo and not ours to fix — see the header. The
 * only escaping that matters is the index name, which is under our control
 * (`NSE_INDEX_REQUEST_NAME`) and contains no quotes; a name that did would
 * break the server's parse, so we strip them rather than emit a payload the
 * far end will silently misread.
 */
export function buildTriRequestBody(indexName: string, range: IndexFetchRange): string {
  const safe = indexName.replace(/['"\\]/g, '');
  const cinfo =
    `{'name':'${safe}','startDate':'${formatNiftyDate(range.from)}',` +
    `'endDate':'${formatNiftyDate(range.to)}','indexName':'${safe}'}`;
  return JSON.stringify({ cinfo });
}

/**
 * Fetch one index's TRI history over `range`, oldest-first, deduplicated.
 *
 * One request for the whole range. The endpoint served eleven years in a
 * single 157 ms response when probed, so chunking would multiply the load on
 * a public site for no benefit — and a chunked fetch that half-succeeds is
 * exactly how a benchmark ends up with an invisible hole in the middle.
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

  const url = options.url ?? TRI_ENDPOINT_URL;
  const post = options.postJson ?? ((u: string, b: string) => httpPostJson(u, b));

  const res = await post(url, buildTriRequestBody(indexName, range));
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
      detail: `Empty body for "${indexName}" ${sourceRef}.`,
      sourceRef,
    };
  }

  if (!looksLikeJson(res.text)) {
    return {
      ok: false,
      reason: 'NOT_JSON',
      detail:
        `Response for "${indexName}" is not JSON. niftyindices serves its HTML ` +
        `shell under HTTP 200 when the request is not recognised as an AJAX ` +
        `JSON POST — check the content-type header and the /BackPage/ path.`,
      sourceRef,
      bodySample: res.text.trimStart().slice(0, 300),
    };
  }

  const parsed = parseNiftyTriJson(res.text);
  const fatal = parsed.failures.find(
    (f) => f.reason === 'not_json' || f.reason === 'not_array' || f.reason === 'empty_payload',
  );
  if (fatal) {
    if (fatal.reason === 'empty_payload') {
      return {
        ok: false,
        reason: 'EMPTY_BODY',
        detail:
          `niftyindices returned an empty array for "${indexName}" over ` +
          `${sourceRef}. It answers an index name it does not recognise with ` +
          `[] and HTTP 200, so this is far more likely a wrong request name ` +
          `than a month with no trading. Verify the name against ` +
          `liveindexsa.niftyindices.com/assets/json/IndexMapping.json.`,
        sourceRef,
      };
    }
    return {
      ok: false,
      reason: 'PARSE_REJECTED',
      detail:
        `Unusable payload for "${indexName}" (${fatal.reason}). The response ` +
        `shape has changed — capture a fixture and bump the adapter version.`,
      sourceRef,
      bodySample: fatal.raw,
    };
  }

  return {
    ok: true,
    rows: parsed.rows,
    failures: parsed.failures,
    sourceRef,
    adapterId: NSE_INDICES_ADAPTER_ID,
    adapterVersion: NSE_INDICES_ADAPTER_VERSION,
  };
}

/**
 * Exposed so `bseIndices.v1.ts`, `fbilTbillCurve.v1.ts` and
 * `mfPublishedReturns.v1.ts` reuse ONE transport and ONE body-sniffing check.
 * Several feeds with slightly different timeout and sniffing behaviour is
 * several separate incidents the first time a provider starts answering
 * 200-with-an-HTML-error-page.
 */
export const __sharedTransport = { httpGetText, httpPostJson, looksLikeCsv, looksLikeJson };
