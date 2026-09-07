/**
 * Side-effecting fetcher for the RBI DBIE 91-day Treasury Bill primary-auction
 * cut-off yield — the risk-free rate behind every Sharpe, Sortino, alpha and
 * M2 in `02-METRICS.md`.
 *
 * `01-DATA-FOUNDATION.md §1, §3`, `07` Task 1.3.
 *
 * `.v1.ts` half of the §14 split: **network and URLs only**. The bytes go
 * straight to `parseRbi91DayTbill`, which is pure and fixture-tested. This file
 * decides nothing about what a rate means.
 *
 * =============================================================================
 * ⚠ EVERY URL AND PARAMETER BELOW IS **UNVERIFIED**
 * =============================================================================
 * Written from the documented shape of DBIE's CSV export, NOT from a live
 * session; this repo has no verified access to data.rbi.org.in. Same convention
 * as `adapters/pf/epf/uanLookup.v1.ts`.
 *
 * Specifically unverified:
 *   1. `DBIE_CSV_URL` and its query parameters — DBIE's report IDs and export
 *      paths have changed at least once with the portal rewrite. The parser's
 *      own header comment already fixes the contract: **request the CSV
 *      export, never scrape the rendered HTML grid.** If only HTML is
 *      reachable, that is a new fetcher version with an HTML parser beside the
 *      CSV one, not a scraper bolted into this file.
 *   2. Whether DBIE serves the full 10-year window in one response. The
 *      backfill asks for the whole range in a single request because a weekly
 *      series is ~520 rows even over a decade — small enough that chunking
 *      would add failure modes without buying anything. If the endpoint turns
 *      out to cap the range, chunk here (and say so).
 *
 * =============================================================================
 * NEVER THROWS, NEVER FABRICATES A RATE
 * =============================================================================
 * `riskFreeRateJob` must survive a dead DBIE without taking the process down,
 * so every path returns a typed outcome and the job writes an
 * `IngestionFailure` (`CONTEXT.md §3.5`).
 *
 * And there is a sharper rule here than for the index feeds: a missing
 * risk-free rate must NEVER become a number. `parseRbi91DayTbill` already
 * rejects `-`/`NA`/blank as `missing_rate` rather than 0, because a zero
 * risk-free rate silently turns every Sharpe ratio in the system into a plain
 * return/volatility ratio — a wrong number that looks completely reasonable.
 * This file preserves that by refusing to invent an empty success: no data is
 * a failure outcome, not `rows: []`.
 */

import {
  __sharedTransport,
  type HttpTextOutcome,
  type IndexFetchFailureReason,
  type IndexFetchRange,
} from './nseIndices.v1.js';
import {
  parseRbi91DayTbill,
  type RiskFreeParseFailure,
  type RiskFreeRow,
  type RiskFreeSeries,
} from './rbiRiskFree.parse.js';

export const RBI_RISK_FREE_ADAPTER_ID = 'rbi.riskFree';
export const RBI_RISK_FREE_ADAPTER_VERSION = '1';

export interface RiskFreeFetchSuccess {
  ok: true;
  series: RiskFreeSeries;
  rows: RiskFreeRow[];
  /** Row-level rejections from the pure parser — DLQ'd separately from a
   *  whole-file failure. A week with no auction is a legitimate `missing_rate`
   *  and must not discard the other 519 observations. */
  failures: RiskFreeParseFailure[];
  sourceRef: string;
  adapterId: string;
  adapterVersion: string;
}

export interface RiskFreeFetchFailure {
  ok: false;
  reason: IndexFetchFailureReason;
  detail: string;
  sourceRef: string;
  httpStatus?: number;
  bodySample?: string;
}

export type RiskFreeFetchOutcome = RiskFreeFetchSuccess | RiskFreeFetchFailure;

/** ⚠ UNVERIFIED. Overridable per call. */
export const DBIE_CSV_URL = 'https://data.rbi.org.in/DBIE/dbie.rbi/api/report/download/csv';

/**
 * ⚠ UNVERIFIED. DBIE's internal report identifier for the 91-day T-bill
 * primary-auction cut-off yield, weekly.
 *
 * Named, not derived, and deliberately conspicuous: pointing this at the
 * *secondary market* 91-day yield, or at the 182/364-day tenor, would produce a
 * series that parses cleanly, stores cleanly, and is the wrong risk-free rate
 * for every metric downstream. Confirm the report's title on the portal before
 * trusting a row.
 */
export const DBIE_TBILL_91D_REPORT_ID = 'IHS_TBILL_91D_PRIMARY_YIELD_WEEKLY';

const RBI_HEADERS = {
  'user-agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  accept: 'text/csv,application/octet-stream,*/*;q=0.8',
  'accept-language': 'en-US,en;q=0.9',
  referer: 'https://data.rbi.org.in/',
};

const MONTH_ABBR = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const;

/** `DD-MMM-YYYY` from UTC parts. Local parts would shift the requested window
 *  by a day on an IST box and silently drop or duplicate an edge week. */
function formatDbieDate(d: Date): string {
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${dd}-${MONTH_ABBR[d.getUTCMonth()]}-${d.getUTCFullYear()}`;
}

export interface RiskFreeFetchOptions {
  url?: string;
  reportId?: string;
  /** Injectable transport — tests set this so nothing here can reach RBI. */
  fetchText?: (url: string) => Promise<HttpTextOutcome>;
}

/**
 * Fetch the weekly 91-day T-bill cut-off series over `range`.
 *
 * One request for the whole range: a decade of a weekly series is ~520 rows.
 */
export async function fetchRbi91DayTbill(
  range: IndexFetchRange,
  options: RiskFreeFetchOptions = {},
): Promise<RiskFreeFetchOutcome> {
  const reportId = options.reportId ?? DBIE_TBILL_91D_REPORT_ID;
  const sourceRef = `TBILL_91D@${formatDbieDate(range.from)}..${formatDbieDate(range.to)}`;

  const u = new URL(options.url ?? DBIE_CSV_URL);
  // ⚠ UNVERIFIED parameter names.
  u.searchParams.set('reportId', reportId);
  u.searchParams.set('fromDate', formatDbieDate(range.from));
  u.searchParams.set('toDate', formatDbieDate(range.to));

  const get = options.fetchText ?? ((url: string) => __sharedTransport.httpGetText(url, RBI_HEADERS));
  const res = await get(u.toString());

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
      detail:
        `DBIE returned an empty body for report "${reportId}". Report IDs change ` +
        `with portal revisions; verify it on data.rbi.org.in. Reporting this as ` +
        `a failure rather than "no rates this period" is deliberate — a silently ` +
        `absent risk-free rate is how every Sharpe ratio in the system becomes a ` +
        `return/volatility ratio.`,
      sourceRef,
    };
  }

  if (!__sharedTransport.looksLikeCsv(res.text)) {
    return {
      ok: false,
      reason: 'NOT_CSV',
      detail: `DBIE response for "${reportId}" is not CSV (HTML/JSON/other). The export endpoint has moved or now requires a session.`,
      sourceRef,
      bodySample: res.text.trimStart().slice(0, 300),
    };
  }

  const parsed = parseRbi91DayTbill(res.text);
  if (parsed.rows.length === 0 && parsed.failures.some((f) => f.reason === 'missing_header')) {
    return {
      ok: false,
      reason: 'PARSE_REJECTED',
      detail: `No recognisable header in the DBIE CSV for "${reportId}". Add a fixture and bump the adapter version.`,
      sourceRef,
      bodySample: res.text.trimStart().slice(0, 300),
    };
  }

  return {
    ok: true,
    series: parsed.series,
    rows: parsed.rows,
    failures: parsed.failures,
    sourceRef,
    adapterId: RBI_RISK_FREE_ADAPTER_ID,
    adapterVersion: RBI_RISK_FREE_ADAPTER_VERSION,
  };
}
