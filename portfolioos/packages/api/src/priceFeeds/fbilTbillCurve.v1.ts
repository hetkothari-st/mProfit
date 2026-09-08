/**
 * Side-effecting fetcher for the risk-free rate — FBIL's T-Bill par yield
 * curve, 3-month point.
 *
 * `01-DATA-FOUNDATION.md §1, §3`, `07` Task 1.3.
 *
 * `.v1.ts` half of the §14 split: **network and URLs only**. The bytes go
 * straight to `parseFbilTbillCurve`, which is pure and fixture-tested. This
 * file decides nothing about what a rate means.
 *
 * =============================================================================
 * WHY NOT RBI — the finding this file replaces (probed 2026-09-07)
 * =============================================================================
 * This module used to be `rbiRiskFree.v1.ts` and pointed at
 * `https://data.rbi.org.in/DBIE/dbie.rbi/api/report/download/csv` with a
 * guessed `reportId`. Every part of that was wrong, and the RBI route is not
 * merely awkward — it is **not reachable programmatically at all**:
 *
 *  - `dbie.rbi.org.in` is decommissioned. It resolves to the `data.rbi.org.in`
 *    host, which presents no certificate for the old name
 *    (`ERR_TLS_CERT_ALTNAME_INVALID`). The "connection failed" seen earlier was
 *    a genuine TLS failure, not a client quirk.
 *  - The hardcoded CSV path returns HTTP 404 with RBI's "Page Not Found" shell.
 *    So do `/sdmx`, `/biprws/logon/long` and `/biprws/v1/documents`. There is
 *    no CSV export endpoint and no SAP REST SDK exposed.
 *  - `data.rbi.org.in` is an Angular SPA against a TCS CIMS gateway
 *    (`/CIMS_Gateway_DBIE/GATEWAY/SERVICES/<service>`, POST, JSON, custom
 *    `channelkey` / `authorization` headers). A session token can be minted,
 *    but every data call made with a self-minted token — including one minted
 *    by in-page `fetch` inside a real browser session on the portal, with the
 *    portal's own cookies — answers
 *    `{"errorCode":"4311","errorMessage":"Current session is unauthorized"}`.
 *    Only the token the app produces during its own bootstrap works. Cookie
 *    and header mimicry does not reproduce it.
 *  - The data does exist there: report 663, "Auctions of 91-Day Government of
 *    India Treasury Bills", weekly, 08-Jan-1993 → present. Opening it in the
 *    portal loads `/BOE/OpenDocument/...` — **SAP BusinessObjects Web
 *    Intelligence**. The "CSV export" the old parser assumed is a BOE in-app
 *    export behind a BOE logon, not a URL. DBIE's own query payloads are
 *    additionally AES-encrypted client-side.
 *
 * Conclusion: RBI's primary-auction cut-off yield has no free machine-readable
 * endpoint. Rather than leave a fetcher that looks functional and cannot work,
 * that code is deleted and this one replaces it.
 *
 * =============================================================================
 * VERIFIED 2026-09-07 — the real request
 * =============================================================================
 * ```
 * GET https://www.fbil.org.in/wasdm/tbill/fetchfiltered
 *       ?fromDate=YYYY-MM-DD&toDate=YYYY-MM-DD&authenticated=false
 * accept: application/json
 * ```
 * No auth, no cookie priming, no referer, no origin. HTTP 200,
 * `content-type: application/json`, a bare array of
 * `{processRunDate, displayTime, tenorName, rate, comments}`.
 *
 * Measured, not assumed:
 *  - `2016-01-01 → 2026-09-07` in **one** request: 3.78 MB, 28,936 rows,
 *    2,181 distinct dates, in ~3.2 s. No chunking needed.
 *  - The series **begins 2017-08-23**. Anything earlier returns `[]`. A
 *    ten-year backfill therefore yields ~9 years, and metric windows reaching
 *    before Aug 2017 genuinely have no risk-free rate.
 *  - Daily on business days (240-245 observations a year), zero nulls, zero
 *    non-positive rates, range 2.89 – 7.17.
 *  - Three identical runs over the same window returned identical values.
 *
 * Two failure modes that are NOT outages, and are why `looksLikeJson` is not
 * enough on its own here:
 *  - A date in any format but `YYYY-MM-DD` → **HTTP 500** with a Java stack
 *    trace (`org.fbil.wasdm.common.exception.WASDMExceptionInterceptor`). A
 *    500 from this host frequently means "bad input", not "provider down".
 *  - `authenticated=true` → **HTTP 500**. Always send `authenticated=false`.
 *
 * ⚠ PUBLICATION LAG AND LICENSING. On 2026-09-07 the newest free observation
 * was 2026-08-28 — roughly five to seven business days behind. FBIL sells this
 * data commercially and the free tier appears deliberately delayed, so the
 * `06 §7` staleness alert must tolerate ~10 calendar days rather than a
 * handful of business days. **Someone must read FBIL's terms of use before
 * this ships in a paid product.** This file establishes reachability, not
 * licence.
 *
 * =============================================================================
 * NEVER THROWS, NEVER FABRICATES A RATE
 * =============================================================================
 * `riskFreeRateJob` must survive a dead provider without taking the process
 * down, so every path returns a typed outcome and the job writes an
 * `IngestionFailure` (`CONTEXT.md §3.5`).
 *
 * And there is a sharper rule here than for the index feeds: a missing
 * risk-free rate must NEVER become a number. `parseFbilTbillCurve` rejects a
 * blank/`-`/null rate as `missing_rate` rather than 0, because a zero
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
  parseFbilTbillCurve,
  FBIL_RISK_FREE_TENOR,
  type RiskFreeParseFailure,
  type RiskFreeRow,
  type RiskFreeSeries,
} from './riskFree.parse.js';

export const FBIL_RISK_FREE_ADAPTER_ID = 'fbil.tbillCurve';
export const FBIL_RISK_FREE_ADAPTER_VERSION = '1';

/** The series id these rows are stored under. Deliberately NOT `TBILL_91D` —
 *  see the essay in `riskFree.parse.ts`: this is the secondary-market par
 *  yield curve, not RBI's primary-auction cut-off, and the two must never be
 *  filed under one name. */
export const FBIL_RISK_FREE_SERIES: RiskFreeSeries = 'FBIL_TBILL_3M';

/** First date FBIL publishes. Requests before this return `[]`. */
export const FBIL_SERIES_START = '2017-08-23';

export interface RiskFreeFetchSuccess {
  ok: true;
  series: RiskFreeSeries;
  rows: RiskFreeRow[];
  /** Row-level rejections from the pure parser — DLQ'd separately from a
   *  whole-payload failure, so one malformed day does not discard the other
   *  2,180 observations. */
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

/** Verified endpoint. Overridable per call for tests and mirrors. */
export const FBIL_TBILL_URL = 'https://www.fbil.org.in/wasdm/tbill/fetchfiltered';

const FBIL_HEADERS: Readonly<Record<string, string>> = {
  'user-agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  accept: 'application/json',
  'accept-language': 'en-US,en;q=0.9',
  referer: 'https://www.fbil.org.in/',
};

/**
 * `YYYY-MM-DD` from UTC parts. Anything else — including `DD-MM-YYYY`, which
 * every other Indian source in this repo uses — makes FBIL answer HTTP 500
 * with a Java stack trace, so this format is load-bearing, not cosmetic.
 * Local parts would shift the requested window by a day on an IST box.
 */
export function formatFbilDate(d: Date): string {
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${d.getUTCFullYear()}-${mm}-${dd}`;
}

export interface RiskFreeFetchOptions {
  url?: string;
  /** Which point on the curve to keep. Defaults to the 3-month (91-day) one. */
  tenor?: string;
  /** Injectable transport — tests set this so nothing here can reach FBIL. */
  fetchText?: (url: string) => Promise<HttpTextOutcome>;
}

/**
 * Fetch the T-Bill curve over `range` and keep one tenor.
 *
 * One request for the whole range: a decade is 3.8 MB and about three seconds,
 * and a chunked fetch that half-succeeds is how a risk-free series ends up
 * with an invisible hole that nothing downstream can detect.
 */
export async function fetchFbilTbillCurve(
  range: IndexFetchRange,
  options: RiskFreeFetchOptions = {},
): Promise<RiskFreeFetchOutcome> {
  const tenor = options.tenor ?? FBIL_RISK_FREE_TENOR;
  const sourceRef = `${FBIL_RISK_FREE_SERIES}@${formatFbilDate(range.from)}..${formatFbilDate(range.to)}`;

  const u = new URL(options.url ?? FBIL_TBILL_URL);
  u.searchParams.set('fromDate', formatFbilDate(range.from));
  u.searchParams.set('toDate', formatFbilDate(range.to));
  // Not optional: `authenticated=true` returns HTTP 500 on the free endpoint.
  u.searchParams.set('authenticated', 'false');

  const get = options.fetchText ?? ((url: string) => __sharedTransport.httpGetText(url, FBIL_HEADERS));
  const res = await get(u.toString());

  if (!res.ok) {
    const badInput =
      res.httpStatus === 500
        ? ' NOTE: FBIL answers a malformed date (anything but YYYY-MM-DD) and ' +
          'authenticated=true with HTTP 500, so a 500 here is more often a bad ' +
          'request than a provider outage.'
        : '';
    return {
      ok: false,
      reason: res.reason,
      detail: res.detail + badInput,
      sourceRef,
      ...(res.httpStatus === undefined ? {} : { httpStatus: res.httpStatus }),
    };
  }

  if (!res.text.trim()) {
    return {
      ok: false,
      reason: 'EMPTY_BODY',
      detail:
        `FBIL returned an empty body for ${sourceRef}. Reporting this as a ` +
        `failure rather than "no rates this period" is deliberate — a silently ` +
        `absent risk-free rate is how every Sharpe ratio in the system becomes ` +
        `a return/volatility ratio.`,
      sourceRef,
    };
  }

  if (!__sharedTransport.looksLikeJson(res.text)) {
    return {
      ok: false,
      reason: 'NOT_JSON',
      detail: `FBIL response for ${sourceRef} is not JSON. The endpoint has moved or now requires a session.`,
      sourceRef,
      bodySample: res.text.trimStart().slice(0, 300),
    };
  }

  const parsed = parseFbilTbillCurve(res.text, tenor);
  const fatal = parsed.failures.find(
    (f) =>
      f.reason === 'not_json' ||
      f.reason === 'not_array' ||
      f.reason === 'empty_payload' ||
      f.reason === 'tenor_not_found',
  );
  if (fatal) {
    if (fatal.reason === 'empty_payload') {
      return {
        ok: false,
        reason: 'EMPTY_BODY',
        detail:
          `FBIL returned an empty array for ${sourceRef}. Its T-Bill curve ` +
          `begins ${FBIL_SERIES_START}; a window entirely before that date is ` +
          `expected to be empty, and any other empty window means the request ` +
          `was rejected.`,
        sourceRef,
      };
    }
    if (fatal.reason === 'tenor_not_found') {
      return {
        ok: false,
        reason: 'PARSE_REJECTED',
        detail:
          `FBIL returned rows for ${sourceRef} but none with tenorName ` +
          `${JSON.stringify(tenor)}. The provider has renamed its tenors — ` +
          `capture a fixture, pick the new label, and bump the adapter version. ` +
          `Reported loudly rather than as zero rows, because a quietly empty ` +
          `risk-free series still lets every metric compute.`,
        sourceRef,
        bodySample: fatal.raw,
      };
    }
    return {
      ok: false,
      reason: 'PARSE_REJECTED',
      detail: `Unusable payload for ${sourceRef} (${fatal.reason}). The response shape has changed.`,
      sourceRef,
      bodySample: fatal.raw,
    };
  }

  return {
    ok: true,
    series: parsed.series,
    rows: parsed.rows,
    failures: parsed.failures,
    sourceRef,
    adapterId: FBIL_RISK_FREE_ADAPTER_ID,
    adapterVersion: FBIL_RISK_FREE_ADAPTER_VERSION,
  };
}
