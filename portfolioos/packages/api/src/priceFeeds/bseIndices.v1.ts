/**
 * Side-effecting fetcher for BSE historical index data (S&P BSE SENSEX TRI and
 * siblings).
 *
 * `01-DATA-FOUNDATION.md §3` ("Sensex TRI and BSE indices via a
 * `bseIndices.ts` sibling"), `07` Task 1.3.
 *
 * `.v1.ts` half of the §14 split: **network and URLs only**. The bytes go to
 * `parseBseIndexCsv`, which is pure and fixture-tested. The transport, the
 * "is this actually CSV" check and the outcome types are imported from
 * `nseIndices.v1.ts` rather than re-declared — two index feeds that disagree
 * about what a timeout or a 200-with-an-HTML-error-page means would produce two
 * different-looking incidents for one root cause.
 *
 * =============================================================================
 * ⚠ EVERY URL, PARAMETER AND INDEX IDENTIFIER BELOW IS **UNVERIFIED**
 * =============================================================================
 * Written from the documented shape of BSE's "Indices → Historical Data"
 * export, NOT from a live session; this repo has no verified access to it.
 * Same convention as `adapters/pf/epf/uanLookup.v1.ts`.
 *
 * Specifically unverified:
 *   1. `HISTORICAL_CSV_URL` and its query parameters. BSE's own site drives
 *      `api.bseindia.com/BseIndiaAPI/api/...` JSON endpoints behind an
 *      `Origin`/`Referer` check; whether a plain CSV export exists at a stable
 *      path is exactly what has not been confirmed. If only JSON is reachable,
 *      the fix is a `bseIndices.v2.ts` plus a JSON parser next to
 *      `bseIndices.parse.ts` — not a JSON→CSV transform hidden in this file.
 *   2. `BSE_INDEX_REQUEST_CODE` — BSE addresses indices by an internal numeric
 *      code as often as by name. `SENSEX_TRI` in particular has a separate
 *      identifier from plain SENSEX, and using the price-return SENSEX by
 *      mistake is the single most damaging error this feed can make (see the
 *      TRI essay in `benchmarkIndexSeed.ts`). Verify it against the live site
 *      and confirm the returned series is the TOTAL RETURN one before trusting
 *      a single row.
 *   3. That BSE serves a >1y range in one response.
 *
 * Never throws; never fabricates rows. See the same headings in
 * `nseIndices.v1.ts` for why.
 */

import {
  __sharedTransport,
  chunkRange,
  formatNiftyDate,
  type IndexFetchOutcome,
  type IndexFetchRange,
  type HttpTextOutcome,
} from './nseIndices.v1.js';
import { parseBseIndexCsv } from './bseIndices.parse.js';
import type { IndexParseFailure, IndexPriceRow } from './nseIndices.parse.js';

export const BSE_INDICES_ADAPTER_ID = 'bse.indices';
export const BSE_INDICES_ADAPTER_VERSION = '1';

/**
 * ⚠ UNVERIFIED base URL.
 *
 * Overridable per call so a corrected path can be supplied without editing
 * this file, and so the backfill can run against a locally-saved mirror.
 */
export const HISTORICAL_CSV_URL = 'https://www.bseindia.com/indices/IndexArchiveData.aspx';

/**
 * BSE-specific headers. `api.bseindia.com` rejects requests whose `origin` and
 * `referer` do not name bseindia.com, so these are not decoration.
 */
const BSE_HEADERS = {
  'user-agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  accept: 'text/csv,application/octet-stream,*/*;q=0.8',
  'accept-language': 'en-US,en;q=0.9',
  referer: 'https://www.bseindia.com/indices/IndexArchiveData.html',
  origin: 'https://www.bseindia.com',
};

/**
 * ⚠ UNVERIFIED. Seed code → the identifier BSE expects.
 *
 * Explicit map, not a derivation, for the same reason as the NSE one: a
 * derived-but-wrong identifier returns an empty body rather than an error, and
 * for BSE a *plausible* wrong identifier returns the PRICE-RETURN Sensex —
 * which parses perfectly, stores perfectly, and quietly inflates every alpha
 * measured against it. An unmapped code is `NOT_CONFIGURED`; a guessed one is
 * a silent data-integrity bug.
 */
export const BSE_INDEX_REQUEST_CODE: Readonly<Record<string, string>> = {
  SENSEX_TRI: 'SENSEX_TRI',
};

export interface BseIndexFetchOptions {
  url?: string;
  requestCode?: string;
  /** Injectable transport — tests set this so nothing here can reach BSE. */
  fetchText?: (url: string) => Promise<HttpTextOutcome>;
}

function buildUrl(base: string, code: string, range: IndexFetchRange): string {
  const u = new URL(base);
  // ⚠ UNVERIFIED parameter names.
  u.searchParams.set('index', code);
  u.searchParams.set('fromdate', formatNiftyDate(range.from));
  u.searchParams.set('todate', formatNiftyDate(range.to));
  return u.toString();
}

/**
 * Fetch one BSE index's history over `range`, oldest-first, deduplicated.
 *
 * A failed chunk fails the whole fetch — a partial series reported as success
 * is a benchmark with an invisible hole, and every metric computed across it is
 * wrong while looking healthy.
 */
export async function fetchBseIndexHistory(
  indexCode: string,
  range: IndexFetchRange,
  options: BseIndexFetchOptions = {},
): Promise<IndexFetchOutcome> {
  const requestCode = options.requestCode ?? BSE_INDEX_REQUEST_CODE[indexCode];
  const sourceRef = `${indexCode}@${formatNiftyDate(range.from)}..${formatNiftyDate(range.to)}`;

  if (!requestCode) {
    return {
      ok: false,
      reason: 'NOT_CONFIGURED',
      detail:
        `No BSE request identifier is mapped for "${indexCode}". Add a ` +
        `BSE_INDEX_REQUEST_CODE entry only after confirming on the live site ` +
        `that the identifier returns the TOTAL RETURN series and not the ` +
        `price-return one.`,
      sourceRef,
    };
  }

  const base = options.url ?? HISTORICAL_CSV_URL;
  const get = options.fetchText ?? ((url: string) => __sharedTransport.httpGetText(url, BSE_HEADERS));

  const rows: IndexPriceRow[] = [];
  const failures: IndexParseFailure[] = [];
  const seen = new Set<number>();

  for (const chunk of chunkRange(range)) {
    const url = buildUrl(base, requestCode, chunk);
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
        detail: `Empty body for BSE "${requestCode}" ${formatNiftyDate(chunk.from)}..${formatNiftyDate(chunk.to)} — the identifier or the endpoint is probably wrong.`,
        sourceRef,
      };
    }

    if (!__sharedTransport.looksLikeCsv(res.text)) {
      return {
        ok: false,
        reason: 'NOT_CSV',
        detail: `Response for BSE "${requestCode}" is not CSV (HTML/JSON/other). The endpoint has moved or requires a session.`,
        sourceRef,
        bodySample: res.text.trimStart().slice(0, 300),
      };
    }

    const parsed = parseBseIndexCsv(res.text);
    if (parsed.rows.length === 0 && parsed.failures.some((f) => f.reason === 'missing_header')) {
      return {
        ok: false,
        reason: 'PARSE_REJECTED',
        detail: `No recognisable header in the BSE CSV for "${requestCode}". Add a fixture and bump the adapter version.`,
        sourceRef,
        bodySample: res.text.trimStart().slice(0, 300),
      };
    }

    failures.push(...parsed.failures);
    for (const row of parsed.rows) {
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
    adapterId: BSE_INDICES_ADAPTER_ID,
    adapterVersion: BSE_INDICES_ADAPTER_VERSION,
  };
}
