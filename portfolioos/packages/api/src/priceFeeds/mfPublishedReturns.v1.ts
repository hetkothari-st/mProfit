/**
 * Side-effecting fetcher for externally published trailing scheme returns —
 * the comparison source behind `06-QUALITY-COMPLIANCE.md §2`'s monthly
 * reconciliation.
 *
 * `.v1.ts` half of the `CONTEXT.md §14` split: **network and URLs only**. The
 * bytes go straight to `parseMfPublishedReturns`, which is pure and
 * fixture-tested. This file decides nothing about what a return means.
 *
 * =============================================================================
 * EVERY URL AND PATH BELOW IS **UNVERIFIED**
 * =============================================================================
 * Same convention, and the same honesty, as `adapters/pf/epf/uanLookup.v1.ts`
 * and `priceFeeds/fbilTbillCurve.v1.ts`.
 *
 * `06 §2` says "AMFI publishes scheme performance; MFAPI exposes it; a paid
 * feed is better". This repo has verified access to exactly one MFAPI route —
 * `api.mfapi.in/mf/<schemeCode>`, the NAV history endpoint already used by
 * `priceFeeds/amfi.service.ts`. It has **no verified access to a trailing-
 * returns route on that host or anywhere else.**
 *
 * Specifically unverified:
 *   1. `MFAPI_PERFORMANCE_URL_TEMPLATE` — that a `/performance` sibling of the
 *      NAV route exists at all, and that it is keyed by AMFI scheme code.
 *   2. The response body's shape. The assumption is documented in full at the
 *      top of `mfPublishedReturns.parse.ts`; correcting it is a fixture change
 *      plus a version bump here, never an in-place edit to the parser's
 *      expectations.
 *   3. Whether the source publishes TER and AUM alongside returns at all. The
 *      parser treats each of the three as independently optional, so a source
 *      that carries only returns reconciles returns and reports the other two
 *      as un-reconciled rather than as matches.
 *
 * ### Before enabling this in production
 * Point `fetchMfPublishedReturns` at a real endpoint (or a paid feed adapter),
 * add its real body to `test/fixtures/mf/reconciliation/`, confirm the units in
 * the parser header, and bump `MF_PUBLISHED_RETURNS_ADAPTER_VERSION`. Until
 * then the job's honest outcome against production is `COULD_NOT_RECONCILE`,
 * which is the point: see below.
 *
 * =============================================================================
 * NEVER THROWS, NEVER FABRICATES A COMPARISON
 * =============================================================================
 * `mfReconciliationJob` must survive a dead feed without taking the process
 * down, so every path returns a typed outcome and the job writes an
 * `IngestionFailure` (`CONTEXT.md §3.5`).
 *
 * And there is a sharper rule here than for the price feeds. For a price feed,
 * "no data" costs you a stale number. For a *reconciliation* feed, "no data"
 * silently mutates into "nothing disagreed with us" — the job would report a
 * clean run having compared nothing, and the operator would read that as
 * assurance. So this file never returns an empty success: no figures is a
 * failure outcome, and the job keeps `COULD_NOT_RECONCILE` strictly distinct
 * from `RECONCILED`.
 */

import { logger } from '../lib/logger.js';
import { __sharedTransport, type HttpTextOutcome } from './nseIndices.v1.js';
import {
  parseMfPublishedReturns,
  type MfPublishedReturns,
  type MfPublishedReturnsParseFailureReason,
} from './mfPublishedReturns.parse.js';

export const MF_PUBLISHED_RETURNS_ADAPTER_ID = 'mf.publishedReturns';
export const MF_PUBLISHED_RETURNS_ADAPTER_VERSION = '1';

/**
 * UNVERIFIED. `{schemeCode}` is substituted, URL-encoded.
 *
 * Kept as an explicit template rather than assembled at the call site so that
 * the one string an operator must correct after checking the live API is
 * findable by grepping for "UNVERIFIED".
 */
export const MFAPI_PERFORMANCE_URL_TEMPLATE = 'https://api.mfapi.in/mf/{schemeCode}/performance';

const REQUEST_HEADERS: Readonly<Record<string, string>> = {
  accept: 'application/json',
  'user-agent': 'PortfolioOS/0.3 (mf-reconciliation)',
};

export type MfPublishedReturnsFetchFailureReason =
  /** No endpoint configured for this source. We do not know how to ask. */
  | 'NOT_CONFIGURED'
  /** Non-2xx. `httpStatus` carries the code. */
  | 'HTTP_ERROR'
  /** DNS/TLS/timeout/socket. The source may simply be down. */
  | 'NETWORK_ERROR'
  /** 2xx with nothing (or whitespace) in the body. */
  | 'EMPTY_BODY'
  /**
   * 2xx with a body that is plainly not JSON (an HTML error page, a login
   * wall). Distinguished from a parse rejection because the remedy differs:
   * the endpoint moved, rather than its fields did.
   */
  | 'NOT_JSON'
  /** The parser rejected the payload. `parseReason` carries which rule. */
  | 'PARSE_REJECTED';

export interface MfPublishedReturnsFetchSuccess {
  ok: true;
  data: MfPublishedReturns;
  sourceRef: string;
  adapterId: string;
  adapterVersion: string;
}

export interface MfPublishedReturnsFetchFailure {
  ok: false;
  reason: MfPublishedReturnsFetchFailureReason;
  /** Human-readable, safe to put in an `IngestionFailure.errorMessage`. */
  detail: string;
  /** What we asked for, for the DLQ's `sourceRef`. */
  sourceRef: string;
  httpStatus?: number;
  parseReason?: MfPublishedReturnsParseFailureReason;
  /** First bytes of an unexpected body, for diagnosing drift. Truncated. */
  bodySample?: string;
}

export type MfPublishedReturnsFetchOutcome =
  | MfPublishedReturnsFetchSuccess
  | MfPublishedReturnsFetchFailure;

/**
 * The seam the whole job is testable through, and the reason no test in this
 * repo can reach mfapi.in.
 *
 * A single-scheme signature rather than a batch one is deliberate. The panel
 * is 30 schemes (`06 §2`) and one scheme's dead response must cost exactly that
 * scheme's comparison — a batch call that 404s costs all thirty and turns a
 * partial reconciliation into a total blackout.
 */
export type PublishedReturnsFetcher = (
  schemeCode: string,
) => Promise<MfPublishedReturnsFetchOutcome>;

export interface MfPublishedReturnsFetchOptions {
  /** Override the UNVERIFIED template above. */
  urlTemplate?: string;
  /** Injectable transport — tests set this so nothing here can reach mfapi.in. */
  fetchText?: (url: string) => Promise<HttpTextOutcome>;
}

/** Cheap check before handing a body to a JSON parser: HTML error pages are 200s. */
function looksLikeJson(text: string): boolean {
  const head = text.trimStart().slice(0, 1);
  return head === '{' || head === '[';
}

export async function fetchMfPublishedReturns(
  schemeCode: string,
  options: MfPublishedReturnsFetchOptions = {},
): Promise<MfPublishedReturnsFetchOutcome> {
  const sourceRef = `published-returns:${schemeCode}`;
  const template = options.urlTemplate ?? MFAPI_PERFORMANCE_URL_TEMPLATE;

  if (!template.includes('{schemeCode}')) {
    return {
      ok: false,
      reason: 'NOT_CONFIGURED',
      detail:
        `URL template "${template}" has no {schemeCode} placeholder, so every scheme ` +
        `would be asked for at the same URL. Refusing to fetch rather than reconcile ` +
        `30 schemes against one fund's numbers.`,
      sourceRef,
    };
  }

  const url = template.replace('{schemeCode}', encodeURIComponent(schemeCode));
  const get = options.fetchText ?? ((u: string) => __sharedTransport.httpGetText(u, REQUEST_HEADERS));
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
      detail:
        `Empty body for scheme ${schemeCode}. Reported as a failure, not as "this scheme ` +
        `publishes nothing" — the two are indistinguishable from here and only one of them ` +
        `is safe to treat as agreement.`,
      sourceRef,
    };
  }

  if (!looksLikeJson(res.text)) {
    return {
      ok: false,
      reason: 'NOT_JSON',
      detail:
        `Response for scheme ${schemeCode} is not JSON (HTML/text). The endpoint has moved ` +
        `or now requires a session. Verify ${MFAPI_PERFORMANCE_URL_TEMPLATE} — it is UNVERIFIED.`,
      sourceRef,
      bodySample: res.text.trimStart().slice(0, 300),
    };
  }

  const parsed = parseMfPublishedReturns(res.text, { expectedSchemeCode: schemeCode });
  if (!parsed.ok) {
    logger.warn(
      { schemeCode, reason: parsed.reason },
      '[mfPublishedReturns] payload rejected by the parser',
    );
    return {
      ok: false,
      reason: 'PARSE_REJECTED',
      detail: parsed.detail,
      sourceRef,
      parseReason: parsed.reason,
      ...(parsed.bodySample === undefined ? {} : { bodySample: parsed.bodySample }),
    };
  }

  return {
    ok: true,
    data: parsed.data,
    sourceRef,
    adapterId: MF_PUBLISHED_RETURNS_ADAPTER_ID,
    adapterVersion: MF_PUBLISHED_RETURNS_ADAPTER_VERSION,
  };
}
