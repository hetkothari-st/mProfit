/**
 * Side-effecting fetcher for BSE's index-archive API.
 *
 * `01-DATA-FOUNDATION.md §3` ("Sensex TRI and BSE indices via a
 * `bseIndices.ts` sibling"), `07` Task 1.3.
 *
 * `.v1.ts` half of the §14 split: **network and URLs only**. The bytes go to
 * `parseBseIndexJson`, which is pure and fixture-tested. The transport and the
 * outcome types are imported from `nseIndices.v1.ts` rather than re-declared —
 * two index feeds that disagree about what a timeout or a
 * 200-with-an-HTML-error-page means would produce two different-looking
 * incidents for one root cause.
 *
 * =============================================================================
 * ⚠ THIS FEED IS WIRED, VERIFIED, AND DELIBERATELY RETURNS NOT_CONFIGURED
 * =============================================================================
 * The endpoint below is real and was confirmed working on 2026-09-07. What
 * does **not** exist is a free BSE **total-return** series to point it at.
 *
 * `BSE_INDEX_REQUEST_CODE` is therefore **empty**, so `SENSEX_TRI` — the only
 * BSE code in `BENCHMARK_INDEX_SEED` — resolves to `NOT_CONFIGURED` and the
 * job skips it without a DLQ row (a documented permanent gap is configuration,
 * not a failure). `SENSEX_TRI` is listed in
 * `BENCHMARK_TRI_NOT_FREELY_AVAILABLE` so the staleness alert stays quiet too.
 *
 * The evidence is laid out in full in `bseIndices.parse.ts`. The short version:
 * BSE's own archive picker lists 149 indices and none of them is a TR variant;
 * eight plausible TR codes all return `{"Table":[]}`; and the code that *is*
 * available, `SENSEX`, closed at 72,271.94 on 01-Jan-2024 — the price-return
 * index, roughly 38,000 points below the Sensex TRI on the same day.
 *
 * **Do not add `SENSEX` to the map.** It fetches cleanly, parses cleanly,
 * stores cleanly, and hands every fund benchmarked against it the market's
 * entire dividend yield (~1.2-1.5% p.a. in India) as alpha that does not
 * exist — inflating information ratio, up/down capture, M2 and the star rating
 * together, consistently, and undetectably. That is precisely the failure
 * `test/invariants/mf-benchmark-tri-only.test.ts` exists to prevent, and it is
 * why this map is empty rather than "helpfully" populated.
 *
 * Never throws; never fabricates rows. See the same headings in
 * `nseIndices.v1.ts` for why.
 */

import {
  __sharedTransport,
  formatNiftyDate,
  type IndexFetchOutcome,
  type IndexFetchRange,
  type HttpTextOutcome,
} from './nseIndices.v1.js';
import { parseBseIndexJson } from './bseIndices.parse.js';

export const BSE_INDICES_ADAPTER_ID = 'bse.indices';
/** v1 was the never-working CSV guess; v2 is the verified JSON archive API. */
export const BSE_INDICES_ADAPTER_VERSION = '2';

/**
 * The archive tool's own daily-history call, verified live.
 *
 * `GET .../IndexArchDailyPAR/w?fmdt=DD/MM/YYYY&index=<code>&period=D&todt=DD/MM/YYYY`
 * → `{"Table":[{ tdate, I_open, I_high, I_low, I_close, ... }]}`.
 */
export const INDEX_ARCHIVE_URL = 'https://api.bseindia.com/BseIndiaAPI/api/IndexArchDailyPAR/w';

/**
 * The picker that enumerates every index the archive serves, verified live.
 * Not called by this module; recorded here because it is the check to re-run
 * before ever concluding that BSE still has no TR series.
 */
export const INDEX_LIST_URL = 'https://api.bseindia.com/BseIndiaAPI/api/FillddlIndex/w?fmdt=&todt=';

/**
 * BSE-specific headers. `api.bseindia.com` answers a request whose `origin`
 * and `referer` do not name bseindia.com with a 302 to `error_Bse.html`
 * (verified), so these are not decoration.
 */
const BSE_HEADERS: Readonly<Record<string, string>> = {
  'user-agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  accept: 'application/json, text/plain, */*',
  'accept-language': 'en-US,en;q=0.9',
  referer: 'https://www.bseindia.com/',
  origin: 'https://www.bseindia.com',
};

/**
 * Seed code → the identifier BSE expects.
 *
 * **Intentionally empty.** Read the header before adding anything. An unmapped
 * code is an honest `NOT_CONFIGURED`; a guessed one — or the price-return
 * `SENSEX` — is a silent data-integrity bug that no user could ever detect.
 */
export const BSE_INDEX_REQUEST_CODE: Readonly<Record<string, string>> = {};

export interface BseIndexFetchOptions {
  url?: string;
  requestCode?: string;
  /** Injectable transport — tests set this so nothing here can reach BSE. */
  fetchText?: (url: string) => Promise<HttpTextOutcome>;
}

/** BSE wants `DD/MM/YYYY`. UTC parts only, for the reason in `formatNiftyDate`. */
export function formatBseDate(d: Date): string {
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getUTCFullYear()}`;
}

function buildUrl(base: string, code: string, range: IndexFetchRange): string {
  const u = new URL(base);
  u.searchParams.set('fmdt', formatBseDate(range.from));
  u.searchParams.set('index', code);
  u.searchParams.set('period', 'D');
  u.searchParams.set('todt', formatBseDate(range.to));
  return u.toString();
}

/**
 * Fetch one BSE index's history over `range`, oldest-first, deduplicated.
 *
 * One request for the whole range, as with NSE: the archive API served a full
 * month in ~200 ms and there is nothing to gain from splitting a public
 * endpoint's work into more requests than it needs.
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
        `No BSE request identifier is mapped for "${indexCode}". BSE publishes ` +
        `no free total-return series: its archive picker lists 149 indices and ` +
        `none is a TR variant, and the freely available "SENSEX" code is the ` +
        `PRICE-RETURN index. Benchmarking against that would invent roughly the ` +
        `market's dividend yield as alpha. Schemes on this benchmark must ` +
        `degrade to BENCHMARK_UNAVAILABLE rather than compare against a PRI.`,
      sourceRef,
    };
  }

  const base = options.url ?? INDEX_ARCHIVE_URL;
  const get = options.fetchText ?? ((url: string) => __sharedTransport.httpGetText(url, BSE_HEADERS));

  const res = await get(buildUrl(base, requestCode, range));
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
      detail: `Empty body for BSE "${requestCode}" over ${sourceRef}.`,
      sourceRef,
    };
  }

  if (!__sharedTransport.looksLikeJson(res.text)) {
    return {
      ok: false,
      reason: 'NOT_JSON',
      detail:
        `Response for BSE "${requestCode}" is not JSON. api.bseindia.com ` +
        `redirects to an HTML error page when the origin/referer check fails.`,
      sourceRef,
      bodySample: res.text.trimStart().slice(0, 300),
    };
  }

  const parsed = parseBseIndexJson(res.text);
  const fatal = parsed.failures.find(
    (f) => f.reason === 'not_json' || f.reason === 'not_array' || f.reason === 'empty_payload',
  );
  if (fatal) {
    if (fatal.reason === 'empty_payload') {
      return {
        ok: false,
        reason: 'EMPTY_BODY',
        detail:
          `BSE returned an empty Table for "${requestCode}" over ${sourceRef}. ` +
          `The archive API answers an unknown index code with {"Table":[]} and ` +
          `HTTP 200, so this is far more likely a wrong code than a month with ` +
          `no trading. Check FillddlIndex (${INDEX_LIST_URL}).`,
        sourceRef,
      };
    }
    return {
      ok: false,
      reason: 'PARSE_REJECTED',
      detail:
        `Unusable payload for BSE "${requestCode}" (${fatal.reason}). The ` +
        `response shape has changed — capture a fixture and bump the adapter ` +
        `version.`,
      sourceRef,
      bodySample: fatal.raw,
    };
  }

  return {
    ok: true,
    rows: parsed.rows,
    failures: parsed.failures,
    sourceRef,
    adapterId: BSE_INDICES_ADAPTER_ID,
    adapterVersion: BSE_INDICES_ADAPTER_VERSION,
  };
}
