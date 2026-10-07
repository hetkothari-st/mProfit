/**
 * MFAPI daily-NAV history feed — side-effecting half
 * (`docs/mf-analytics/01-DATA-FOUNDATION.md §2`, `07-IMPLEMENTATION-PLAN.md`
 * Task 1.4; `.parse.ts` / `.v1.ts` split per `CONTEXT.md §14`).
 *
 * Responsibilities, and nothing else: get the bytes, hand them to the pure
 * parser, and turn every way the network can go wrong into a TYPED OUTCOME.
 * The upsert, the DLQ and the scheduling live in
 * `jobs/mfNavHistoryBackfillJob.ts`.
 *
 * ===========================================================================
 * THE REAL API — probed live on 2026-09-07. Not taken from documentation.
 * ===========================================================================
 *
 * Everything below was measured against the running service. Where it differs
 * from what the task brief and the older `backfillMfNavHistory()` in
 * `amfi.service.ts` assumed, that is called out, because the difference is the
 * whole reason this module exists.
 *
 * --- Endpoint --------------------------------------------------------------
 *
 *   GET https://api.mfapi.in/mf/<schemeCode>
 *   200 OK, Content-Type: application/json, Server: nginx/1.24.0
 *   Content-Length ~132 KB for a 3,375-point scheme. No compression negotiated
 *   by default; `Vary: Accept-Encoding` is offered.
 *
 * Scheme codes are the SAME integers AMFI publishes in `NAVAll.txt`, so
 * `MfSchemeMeta.schemeCode` / `MutualFundMaster.schemeCode` index this feed
 * directly with no mapping table.
 *
 * --- ⚠ There is no 404 for an unknown scheme -------------------------------
 *
 * This is the single most important observed difference, and getting it wrong
 * means silently ingesting nothing while reporting success.
 *
 *   GET /mf/99999999   (well-formed but unknown)
 *     -> HTTP **200**, body:
 *        {"meta":{"fund_house":"","scheme_type":"","scheme_category":"",
 *                 "scheme_code":0,"scheme_name":"",
 *                 "isin_growth":null,"isin_div_reinvestment":null},
 *         "data":[],"status":"SUCCESS"}
 *
 *   `status` is literally "SUCCESS". The only signals that the scheme is
 *   unknown are `data: []` and the blanked `meta`. A caller that checks the
 *   status code, or the `status` field, sees a healthy success.
 *
 *   GET /mf/abcdef     (non-numeric)
 *     -> HTTP **400**, body: {"error":"invalid scheme_code"}
 *
 * So the brief's "handle 404 as a typed outcome" maps onto reality as three
 * distinct outcomes — `not_found` (200 + empty), `invalid_scheme_code` (400),
 * and a genuine `http_error` — and `NOT_FOUND` is reached through the BODY,
 * not the status line. A real 404 is still handled, in case the service adds
 * one later; it just is not what happens today.
 *
 * --- Payload ---------------------------------------------------------------
 *
 * Documented in full, with the day-first date reasoning and the live zero-NAV
 * example, in `mfapiNavHistory.parse.ts`. In brief: `{meta, data, status}`,
 * `data` newest-first, points are `{date: "DD-MM-YYYY", nav: "69.66000"}` with
 * BOTH values as strings, ~3,375 points back to 02-01-2013 for scheme 120465.
 *
 * ===========================================================================
 * BEING A GOOD CITIZEN
 * ===========================================================================
 *
 * mfapi.in is a free, single-operator community mirror of public AMFI data. It
 * has no published rate limit, no API key and no commercial relationship with
 * us. A backfill over even a few hundred schemes is, for that host, an
 * unannounced traffic spike — and the failure mode of getting it wrong is not
 * a 429 we retry, it is being blocked and taking the free history source away
 * from everyone.
 *
 * So the defaults below are deliberately timid, and they are defaults rather
 * than constants only so a test can set them to zero:
 *
 *   - `DEFAULT_CONCURRENCY = 3` (the brief's ceiling is 4). Each response is
 *     ~130 KB, so 3 in flight is already ~400 KB of concurrent transfer.
 *   - `DEFAULT_DELAY_MS = 250` between request STARTS, giving a steady-state
 *     ceiling around 12 req/s and, in practice with 3 workers, ~4-8 req/s.
 *   - A `user-agent` that says who we are and where to complain. An operator
 *     who wants this traffic stopped should be able to identify it without
 *     having to guess, which an anonymous default agent makes impossible.
 *   - One retry, and only for a 429/5xx/network error — never for a 400 or a
 *     200-with-empty-data, which retrying cannot fix and would only double the
 *     load for nothing.
 */

import { request } from 'undici';
import { setTimeout as sleep } from 'node:timers/promises';
import { gunzipSync, inflateSync } from 'node:zlib';
import { logger } from '../lib/logger.js';
import {
  parseMfapiNavHistory,
  MFAPI_NAV_HISTORY_ADAPTER_ID,
  MFAPI_NAV_HISTORY_ADAPTER_VERSION,
  type NavHistoryParseResult,
} from './mfapiNavHistory.parse.js';

export { MFAPI_NAV_HISTORY_ADAPTER_ID, MFAPI_NAV_HISTORY_ADAPTER_VERSION };

/**
 * Not read from `config/env.ts`: that file is owned elsewhere and is off
 * limits for this change. Overridable per call for tests, which must never
 * reach the network.
 */
export const MFAPI_BASE_URL = 'https://api.mfapi.in/mf';

/** See "BEING A GOOD CITIZEN" above for why these numbers and not bigger ones. */
export const DEFAULT_CONCURRENCY = 3;
export const DEFAULT_DELAY_MS = 250;
export const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * Identifies us to the operator of a free service. Deliberately carries a
 * contact path — an anonymous agent gives an operator who wants this traffic
 * gone no option but to block by IP.
 */
export const MFAPI_USER_AGENT =
  'PortfolioOS/0.3 (mutual-fund NAV history backfill; +https://github.com/portfolioos)';

// ---------------------------------------------------------------------------
// Outcomes
// ---------------------------------------------------------------------------

export type MfapiFailureReason =
  /** 200 with `data: []` — MFAPI has no such scheme. NOT an HTTP 404. */
  | 'not_found'
  /** 400 `{"error":"invalid scheme_code"}` — the code is not numeric. */
  | 'invalid_scheme_code'
  /** Any other non-2xx. Retryable ones were already retried. */
  | 'http_error'
  /** Connection reset, DNS, timeout. */
  | 'network_error'
  /** 2xx whose body was not JSON, or whose JSON was not the expected shape. */
  | 'malformed_body'
  /** The parser's day-first guard tripped; the dates cannot be trusted. */
  | 'date_format_changed';

export type MfapiNavHistoryOutcome =
  | { ok: true; schemeCode: string; result: NavHistoryParseResult; httpStatus: number }
  | {
      ok: false;
      schemeCode: string;
      reason: MfapiFailureReason;
      detail: string;
      httpStatus: number | null;
      /**
       * Present for `not_found`: the parse still succeeded, it just carried no
       * points. Lets a caller record MFAPI's blank `meta` without re-parsing.
       */
      result?: NavHistoryParseResult;
    };

export interface FetchMfapiOptions {
  baseUrl?: string;
  timeoutMs?: number;
  /** Retries for 429/5xx/network only. Default 1 (so: two attempts total). */
  retries?: number;
  /** Backoff before the retry. Default 1000 ms. */
  retryDelayMs?: number;
  /**
   * Injection seam for tests. Returns the decoded body plus the status line;
   * when absent, undici is used. Deliberately not a full HTTP client
   * abstraction — just enough that a test never opens a socket.
   */
  transport?: (url: string) => Promise<{ statusCode: number; body: unknown }>;
}

// ---------------------------------------------------------------------------
// One scheme
// ---------------------------------------------------------------------------

/** 429 and 5xx are transient; 4xx (bar 429) is a statement about the request. */
function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

/**
 * ⚠ undici does NOT transparently decompress. This cost a full 141-scheme run.
 *
 * `fetch`/axios negotiate and decode `Content-Encoding` for you. `undici.request`
 * does neither: it sends no `accept-encoding` of its own, and if you add one it
 * hands back the RAW COMPRESSED BYTES. `res.body.text()` then returns gzip
 * bytes decoded as UTF-8 — a non-empty string full of replacement characters,
 * which `JSON.parse` rejects. The symptom is not "compression is broken", it is
 * every single scheme failing as a malformed body while the HTTP status is a
 * healthy 200.
 *
 * Measured on scheme 120465: 131,926 bytes uncompressed, 14,901 gzipped — an
 * 89% saving on every request against a free community host. That is worth
 * decompressing by hand for; it is not worth silently dropping the header and
 * sending nine times the traffic.
 *
 * Only `gzip` and `deflate` are requested, and only those are decoded. `br` is
 * deliberately not asked for: Node's brotli is fine, but adding an encoding we
 * request without a matching decode branch is exactly the bug documented above.
 */
async function undiciTransport(
  url: string,
  timeoutMs: number,
): Promise<{ statusCode: number; body: unknown }> {
  const res = await request(url, {
    method: 'GET',
    maxRedirections: 3,
    headersTimeout: timeoutMs,
    bodyTimeout: timeoutMs,
    headers: {
      accept: 'application/json',
      'user-agent': MFAPI_USER_AGENT,
      'accept-encoding': 'gzip, deflate',
    },
  });

  // The body must be drained regardless of status or undici keeps the
  // connection out of the pool. Bytes rather than `.text()` so the decoder
  // below sees the real octets, and `JSON.parse` rather than `.json()` so a
  // non-JSON error page becomes our `malformed_body` with the actual text in
  // hand instead of an opaque undici throw.
  const raw = Buffer.from(await res.body.arrayBuffer());
  if (raw.length === 0) return { statusCode: res.statusCode, body: undefined };

  const encodingHeader = res.headers['content-encoding'];
  const encoding = (Array.isArray(encodingHeader) ? encodingHeader[0] : encodingHeader)
    ?.toLowerCase()
    .trim();

  let text: string;
  try {
    if (encoding === 'gzip') text = gunzipSync(raw).toString('utf8');
    else if (encoding === 'deflate') text = inflateSync(raw).toString('utf8');
    else text = raw.toString('utf8');
  } catch (err) {
    // A declared encoding whose payload will not decode. Reported rather than
    // swallowed, and distinguishable from "the JSON was bad", because the two
    // have completely different causes.
    return {
      statusCode: res.statusCode,
      body: {
        __nonJsonBody: `content-encoding "${encoding ?? 'identity'}" failed to decode: ${
          err instanceof Error ? err.message : String(err)
        }`,
      },
    };
  }

  try {
    return { statusCode: res.statusCode, body: JSON.parse(text) as unknown };
  } catch {
    return { statusCode: res.statusCode, body: { __nonJsonBody: text.slice(0, 500) } };
  }
}

/**
 * Fetch and parse one scheme's full NAV history.
 *
 * Never throws. Every failure — including a thrown transport error — comes
 * back as `{ok: false}` with a reason, because the caller is a loop over
 * hundreds of schemes and one dead scheme must not end it (`CONTEXT.md §3.5`).
 */
export async function fetchMfapiNavHistory(
  schemeCode: string,
  options: FetchMfapiOptions = {},
): Promise<MfapiNavHistoryOutcome> {
  const baseUrl = options.baseUrl ?? MFAPI_BASE_URL;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const retries = options.retries ?? 1;
  const retryDelayMs = options.retryDelayMs ?? 1000;
  const transport = options.transport ?? ((url: string) => undiciTransport(url, timeoutMs));

  const url = `${baseUrl}/${encodeURIComponent(schemeCode)}`;

  let lastDetail = '';
  let lastStatus: number | null = null;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    if (attempt > 0) await sleep(retryDelayMs);

    let statusCode: number;
    let body: unknown;
    try {
      ({ statusCode, body } = await transport(url));
    } catch (err) {
      lastDetail = err instanceof Error ? err.message : String(err);
      lastStatus = null;
      // Network errors are the retryable kind; fall through to the next
      // attempt. Logged at debug because a handful across a 500-scheme run is
      // normal and warn-level noise here trains people to ignore the log.
      logger.debug({ schemeCode, attempt, err }, '[mfapi] transport error');
      continue;
    }

    lastStatus = statusCode;

    if (statusCode === 400) {
      // Terminal by construction: the code is not a number and never will be.
      return {
        ok: false,
        schemeCode,
        reason: 'invalid_scheme_code',
        detail: `HTTP 400 from MFAPI: ${JSON.stringify(body)?.slice(0, 200) ?? ''}`,
        httpStatus: 400,
      };
    }

    if (statusCode === 404) {
      // Not what MFAPI does today (it returns 200 + empty), but handled so a
      // future change to a conventional 404 lands as `not_found` rather than
      // as an unexplained `http_error`.
      return {
        ok: false,
        schemeCode,
        reason: 'not_found',
        detail: 'HTTP 404 from MFAPI',
        httpStatus: 404,
      };
    }

    if (statusCode < 200 || statusCode >= 300) {
      lastDetail = `HTTP ${statusCode} from MFAPI`;
      if (isRetryableStatus(statusCode) && attempt < retries) {
        logger.debug({ schemeCode, statusCode, attempt }, '[mfapi] retryable status');
        continue;
      }
      return {
        ok: false,
        schemeCode,
        reason: 'http_error',
        detail: lastDetail,
        httpStatus: statusCode,
      };
    }

    const result = parseMfapiNavHistory(body);

    if (result.dateFormatWarning !== null) {
      // Loud and terminal. A format flip makes every date wrong in a way
      // nothing downstream can detect, so the only safe response is to write
      // nothing for this scheme and put it where a human will see it.
      logger.error(
        { schemeCode, warning: result.dateFormatWarning },
        '[mfapi] date-format guard tripped — refusing to ingest',
      );
      return {
        ok: false,
        schemeCode,
        reason: 'date_format_changed',
        detail: result.dateFormatWarning,
        httpStatus: statusCode,
        result,
      };
    }

    if (result.isEmpty) {
      // The 200-with-blank-meta case documented at the top of this file. It is
      // a legitimate answer ("we do not have this scheme"), not an error, so
      // it must not be retried and must not be logged as a failure — but the
      // caller has to be able to tell it from a successful ingest of 0 rows.
      const shapeBroken = result.failures.some((f) => f.index === -1);
      return {
        ok: false,
        schemeCode,
        reason: shapeBroken ? 'malformed_body' : 'not_found',
        detail: shapeBroken
          ? `unexpected body shape: ${result.failures.map((f) => f.detail ?? f.reason).join('; ')}`
          : 'MFAPI returned HTTP 200 with an empty data array — scheme not in the MFAPI archive',
        httpStatus: statusCode,
        result,
      };
    }

    return { ok: true, schemeCode, result, httpStatus: statusCode };
  }

  return {
    ok: false,
    schemeCode,
    reason: 'network_error',
    detail: lastDetail || 'all attempts failed',
    httpStatus: lastStatus,
  };
}

// ---------------------------------------------------------------------------
// Many schemes
// ---------------------------------------------------------------------------

export interface FetchBatchOptions extends FetchMfapiOptions {
  /** In-flight requests. Clamped to [1, 4] — see the rate-limit note above. */
  concurrency?: number;
  /** Delay before each request START, per worker. */
  delayMs?: number;
  /**
   * Called as each scheme resolves, in completion order.
   *
   * The batch is a STREAM, not a collect-then-return, and that is the point:
   * a 500-scheme run holds ~3,000 NAV points per scheme, and buffering all of
   * them before the first write is ~1.5 M objects in memory and nothing
   * durable on disk if the process dies at scheme 499. The callback lets the
   * job persist and discard each scheme as it lands.
   *
   * A throw from the callback aborts the batch — the callback is the caller's
   * own code, so an error in it is a bug, not a scheme-level failure to
   * swallow.
   */
  onResult: (outcome: MfapiNavHistoryOutcome) => Promise<void>;
  /** Checked between schemes; returning true stops the batch cleanly. */
  shouldStop?: () => boolean;
}

/**
 * Fetch many schemes with bounded concurrency, streaming each result out.
 *
 * A fixed pool of workers pulling from a shared cursor, rather than
 * `Promise.all` over chunks: with chunks, every worker waits for the slowest
 * member of its chunk before any of them starts the next one, so one 8-second
 * scheme idles the other two for 8 seconds. A shared cursor keeps exactly
 * `concurrency` requests in flight for the whole run, which is both faster and
 * — the part that matters for a free host — a FLATTER load profile than the
 * bursts a chunked version produces.
 */
export async function fetchMfapiNavHistoryBatch(
  schemeCodes: readonly string[],
  options: FetchBatchOptions,
): Promise<void> {
  const concurrency = Math.max(1, Math.min(options.concurrency ?? DEFAULT_CONCURRENCY, 4));
  const delayMs = options.delayMs ?? DEFAULT_DELAY_MS;

  let cursor = 0;
  let aborted = false;

  const worker = async (): Promise<void> => {
    for (;;) {
      if (aborted) return;
      if (options.shouldStop?.() === true) return;

      const index = cursor;
      cursor += 1;
      if (index >= schemeCodes.length) return;

      const schemeCode = schemeCodes[index];
      if (schemeCode === undefined) return;

      // Before the request, not after: a delay after the last request of the
      // run is pure dead time, and pacing the START is what actually bounds
      // the request rate.
      if (delayMs > 0) await sleep(delayMs);

      const outcome = await fetchMfapiNavHistory(schemeCode, options);
      try {
        await options.onResult(outcome);
      } catch (err) {
        // The caller's own handler failed. Not a scheme-level failure to
        // route to the DLQ — it is a bug in the consumer — so the batch stops
        // and the error propagates rather than being counted as a bad scheme.
        aborted = true;
        throw err;
      }
    }
  };

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
}
