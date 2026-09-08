/**
 * Pure parsing primitives and the FBIL T-Bill curve parser for the risk-free
 * rate — the input to every Sharpe, Sortino, alpha and M2 in `02-METRICS.md`.
 *
 * `01-DATA-FOUNDATION.md` §1 ("Risk-free rate") and §3.
 *
 * PURE MODULE (§14): no network, no fs, no Prisma. `fbilTbillCurve.v1.ts`
 * fetches and hands text here.
 *
 * ===========================================================================
 * WHY THIS FILE IS NO LONGER CALLED `rbiRiskFree.parse.ts`
 * ===========================================================================
 * It used to hold a CSV parser for "the RBI DBIE 91-day Treasury Bill
 * primary-auction cut-off yield", written from an assumed export shape. That
 * CSV does not exist. `dbie.rbi.org.in` is a decommissioned hostname (it
 * resolves to the `data.rbi.org.in` host, which serves no certificate for it),
 * and the replacement portal renders its T-Bill reports through SAP
 * BusinessObjects Web Intelligence behind a session that cannot be minted
 * outside the portal's own Angular bootstrap. The full evidence is in
 * `fbilTbillCurve.v1.ts`.
 *
 * The parser that read that imaginary CSV has been deleted rather than left
 * behind, because a tested parser for a format nobody serves is exactly the
 * trap this rewrite exists to remove: it passes its tests forever and proves
 * nothing. What survives here are the primitives that were always sound —
 * `parseRatePct` and `forwardFillToDates` — plus a parser for a source that is
 * actually reachable.
 *
 * ===========================================================================
 * VERIFIED INPUT FORMAT — FBIL T-Bill curve (captured 2026-09-07)
 * ===========================================================================
 * `GET https://www.fbil.org.in/wasdm/tbill/fetchfiltered`
 *   `?fromDate=YYYY-MM-DD&toDate=YYYY-MM-DD&authenticated=false`
 * answers HTTP 200, `content-type: application/json`, with a bare array:
 *
 * ```json
 * [{"processRunDate":"2026-08-28 00:00:00",
 *   "displayTime":"2026-08-28 17:30:00",
 *   "tenorName":"3 Months",
 *   "rate":5.280000,
 *   "comments":" "}]
 * ```
 *
 * Fourteen tenors per date (`7 Days`, `14 Days`, `1 Month` … `12 Months`),
 * newest-first, daily on business days. We keep the `3 Months` point and skip
 * the rest — skipping, not failing: the other thirteen are perfectly good data
 * that this series does not want.
 *
 * ---------------------------------------------------------------------------
 * ⚠ THIS IS NOT THE SAME SERIES THE OLD PARSER CLAIMED
 * ---------------------------------------------------------------------------
 * FBIL's T-Bill curve is a **par yield curve derived from secondary-market
 * NDS-OM trades**, published daily at 17:30 IST. RBI's report 663 is the
 * **primary-auction cut-off yield**, weekly. They are close but not the same
 * number, and the old file explicitly warned that quietly substituting the
 * secondary-market yield "would produce a series that parses cleanly, stores
 * cleanly, and is the wrong risk-free rate".
 *
 * That warning is honoured by **not reusing the name**. The series id is
 * `FBIL_TBILL_3M`, not `TBILL_91D`, so no stored row can be mistaken for an
 * RBI auction cut-off and every downstream reader can see which curve it is
 * looking at. For Sharpe/Sortino purposes the daily secondary-market curve is
 * arguably the better input — it has no auction-week holes — but that is a
 * judgement someone must be able to see, not one hidden behind a shared label.
 */

import type { Decimal } from 'decimal.js';
import { toDecimal } from '@portfolioos/shared';

/**
 * Which curve a set of rows came from. Carried on the result rather than
 * inferred by the caller so two risk-free series can never be confused after
 * the rows leave the function.
 *
 * - `TBILL_91D` — RBI 91-day T-bill primary-auction cut-off, weekly.
 *   **No reachable free source.** Retained because `RiskFreeRate.series` rows
 *   may already exist under it and because the job accepts a series name.
 * - `FBIL_TBILL_3M` — FBIL 3-month T-bill par yield, daily. Reachable.
 */
export type RiskFreeSeries = 'TBILL_91D' | 'FBIL_TBILL_3M';

/**
 * The series the metrics layer reads its risk-free rate from.
 *
 * ONE constant, imported by both the producer (`fbilTbillCurve.v1.ts` /
 * `riskFreeRateJob`) and the consumer (`mfMetrics.service.ts`). It lives in
 * this pure module rather than in the fetcher so the metrics service does not
 * have to import network code to learn a string.
 *
 * Why it is not `TBILL_91D`: RBI's DBIE host is decommissioned and the
 * replacement portal has no machine-readable path, so the only free source is
 * FBIL's secondary-market T-bill par curve. That is a different quantity from
 * the primary-auction cut-off the spec named -- a few basis points apart,
 * immaterial to a Sharpe ratio but not the same number -- and filing it under
 * `TBILL_91D` would have silently mixed two series the moment RBI ever came
 * back. The metrics service was still reading `TBILL_91D` after the switch,
 * which meant every Sharpe/Sortino/alpha found zero risk-free rows. Sharing
 * the constant is what makes that class of drift a compile error.
 */
export const ACTIVE_RISK_FREE_SERIES: RiskFreeSeries = 'FBIL_TBILL_3M';

/** One observation. `ratePct` is a percentage — 6.89 means 6.89% p.a. */
export interface RiskFreeRow {
  date: Date;
  ratePct: Decimal;
}

export type RiskFreeParseFailureReason =
  /** Body is not JSON at all — an HTML error page, or FBIL's 500 stack trace. */
  | 'not_json'
  /** Valid JSON, but not the array of observations we expect. */
  | 'not_array'
  /** A syntactically perfect empty array. FBIL answers a window that predates
   *  the series (it starts 2017-08-23) this way, so it is a real state — but a
   *  whole-payload failure, never "no rates existed that year". */
  | 'empty_payload'
  /** An array element that is not an object. */
  | 'not_an_object'
  /** The payload had rows, but none for the tenor we asked for. Means the
   *  provider renamed its tenors, which would otherwise look like an outage. */
  | 'tenor_not_found'
  | 'missing_date'
  | 'bad_date'
  /** Rate cell blank / "-" / null — never a zero. */
  | 'missing_rate'
  | 'bad_rate'
  /** Outside the plausible band — see `RATE_MIN_EXCL` / `RATE_MAX_INCL`. */
  | 'rate_out_of_range'
  | 'duplicate_date';

export interface RiskFreeParseFailure {
  /** 1-based position of the offending element in the response array.
   *  Whole-payload failures report `1`. */
  line: number;
  raw: string;
  reason: RiskFreeParseFailureReason;
}

export interface RiskFreeParseResult {
  series: RiskFreeSeries;
  rows: RiskFreeRow[];
  failures: RiskFreeParseFailure[];
}

/**
 * Plausibility band for an Indian short-tenor T-bill yield, as a percent.
 *
 * The historical range since 1993 is roughly 3% (COVID trough; FBIL's own
 * 3-month series bottoms at 2.89) to 13%+ (the mid-90s). We reject <= 0
 * outright — a zero or negative yield has never happened in India and, if
 * stored, silently turns every Sharpe ratio into a raw return/volatility
 * ratio. The upper bound of 25 is deliberately loose: it catches the real
 * failure mode, which is a mis-read field picking up an amount in ₹ crore, not
 * a genuine rate spike.
 */
const RATE_MIN_EXCL = 0;
const RATE_MAX_INCL = 25;

const NUMERIC = /^-?\d+(?:\.\d+)?$/;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export type RateOutcome =
  | { ok: true; value: Decimal }
  | { ok: false; reason: 'missing_rate' | 'bad_rate' | 'rate_out_of_range' };

/**
 * Validate and coerce a percentage rate.
 *
 * A rate is money-like for our purposes: it is multiplied into returns, so a
 * float rounding error propagates into every ratio. `toDecimal`, never
 * `parseFloat`/`Number` (§3.1, `portfolioos/no-money-coercion`). The regex runs
 * first so `toDecimal` can never throw and no catch block is needed.
 */
export function parseRatePct(raw: string): RateOutcome {
  const cleaned = raw.trim().replace(/[%\s,]/g, '');
  if (cleaned === '' || cleaned === '-' || /^n\.?a\.?$/i.test(cleaned)) {
    return { ok: false, reason: 'missing_rate' };
  }
  if (!NUMERIC.test(cleaned)) return { ok: false, reason: 'bad_rate' };
  const value = toDecimal(cleaned);
  if (value.lte(RATE_MIN_EXCL) || value.gt(RATE_MAX_INCL)) {
    return { ok: false, reason: 'rate_out_of_range' };
  }
  return { ok: true, value };
}

/**
 * `processRunDate` is `YYYY-MM-DD HH:MM:SS` with no zone, always at midnight.
 *
 * Deliberately string surgery rather than `new Date(raw)`: a zone-less string
 * is parsed as *local* time by V8, so on an IST laptop every observation would
 * land at 18:30 the previous day and the whole series would sit one day out
 * against the NAV dates it is matched to (§14.2).
 *
 * Returns `null` on anything but the exact expected shape, so a format change
 * becomes a visible `bad_date` failure rather than a silently wrong date.
 */
export function parseFbilDate(raw: string): Date | null {
  const s = raw.trim();
  const datePart = s.includes(' ') ? s.slice(0, s.indexOf(' ')) : s;
  const m = ISO_DATE.exec(datePart);
  if (!m) return null;
  const y = Number.parseInt(m[1]!, 10);
  const mo = Number.parseInt(m[2]!, 10) - 1;
  const d = Number.parseInt(m[3]!, 10);
  const dt = new Date(Date.UTC(y, mo, d));
  // Round-trip rejects 2024-02-31 rather than letting JS roll it into March.
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo || dt.getUTCDate() !== d) return null;
  return dt;
}

/**
 * The tenor we treat as the risk-free rate.
 *
 * `3 Months` is FBIL's label for the 91-day point. Named, not derived, and
 * conspicuous on purpose: taking `1 Month` or `12 Months` instead would
 * produce a series that parses cleanly, stores cleanly, and is the wrong
 * risk-free rate for every metric downstream.
 */
export const FBIL_RISK_FREE_TENOR = '3 Months';

/**
 * Read a cell that may be a JSON string or a JSON number.
 *
 * `rate` arrives as a real JSON number (`5.280000`), so it has already passed
 * through an IEEE-754 double before `JSON.parse` returns; there is nothing a
 * parser can do about that. `String(v)` gives V8's shortest round-trip
 * representation of the double, which for a two-decimal rate is exactly the
 * provider's value, and `toDecimal` takes it from there so no *further* float
 * arithmetic happens (§3.2). `null`/absent becomes `''`, which the caller maps
 * to `missing_rate` — never to zero.
 */
function readCell(row: Record<string, unknown>, key: string): string {
  const v = row[key];
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return String(v);
  return '';
}

/**
 * Parse an FBIL `tbill/fetchfiltered` response, keeping one tenor.
 *
 * Never throws. Rows come out oldest-first regardless of source order (FBIL
 * serves newest-first), deduplicated by date (first occurrence wins,
 * deterministically), with every rejected element recorded in `failures` for
 * the DLQ (§3.5).
 */
export function parseFbilTbillCurve(
  text: string,
  tenor: string = FBIL_RISK_FREE_TENOR,
): RiskFreeParseResult {
  const series: RiskFreeSeries = 'FBIL_TBILL_3M';
  const sample = text.trimStart().slice(0, 300);

  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    // Not swallowed: turned into a typed, reported failure whose `raw` carries
    // the first bytes. FBIL answers a malformed `fromDate` with HTTP 500 and a
    // Java stack trace, and `authenticated=true` with a 500 JSON error body —
    // both of which an operator needs to see, not a generic "parse failed".
    return { series, rows: [], failures: [{ line: 1, raw: sample, reason: 'not_json' }] };
  }

  if (!Array.isArray(parsed)) {
    return { series, rows: [], failures: [{ line: 1, raw: sample, reason: 'not_array' }] };
  }
  if (parsed.length === 0) {
    return { series, rows: [], failures: [{ line: 1, raw: sample, reason: 'empty_payload' }] };
  }

  const rows: RiskFreeRow[] = [];
  const failures: RiskFreeParseFailure[] = [];
  const seen = new Set<number>();
  let sawTenor = false;

  parsed.forEach((entry, i) => {
    const line = i + 1;
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      failures.push({ line, raw: JSON.stringify(entry) ?? 'undefined', reason: 'not_an_object' });
      return;
    }
    const row = entry as Record<string, unknown>;
    // Other tenors are valid data we simply do not want. Skipping silently is
    // correct here — recording thirteen "failures" per date would bury the
    // real ones under 26,000 rows of noise on a ten-year backfill.
    if (readCell(row, 'tenorName').trim() !== tenor) return;
    sawTenor = true;

    const raw = JSON.stringify(row).slice(0, 300);
    const dateRaw = readCell(row, 'processRunDate');
    if (!dateRaw.trim()) {
      failures.push({ line, raw, reason: 'missing_date' });
      return;
    }
    const date = parseFbilDate(dateRaw);
    if (!date) {
      failures.push({ line, raw, reason: 'bad_date' });
      return;
    }

    const rate = parseRatePct(readCell(row, 'rate'));
    if (!rate.ok) {
      failures.push({ line, raw, reason: rate.reason });
      return;
    }

    if (seen.has(date.getTime())) {
      failures.push({ line, raw, reason: 'duplicate_date' });
      return;
    }
    seen.add(date.getTime());
    rows.push({ date, ratePct: rate.value });
  });

  if (!sawTenor) {
    // A non-empty payload with no row for our tenor means FBIL renamed its
    // tenor labels. Without this the job would report a clean success with
    // zero rows, and the risk-free series would quietly stop updating.
    failures.push({
      line: 1,
      raw: `no element with tenorName === ${JSON.stringify(tenor)}; ${parsed.length} element(s) present`,
      reason: 'tenor_not_found',
    });
  }

  rows.sort((a, b) => a.date.getTime() - b.date.getTime());
  return { series, rows, failures: failures.sort((a, b) => a.line - b.line) };
}

/** Result of a forward-fill lookup. `ratePct: null` means "no observation on
 *  or before this date" — the caller must treat that as missing data, not 0. */
export interface ForwardFilledRate {
  date: Date;
  ratePct: Decimal | null;
}

/**
 * Carry each observation forward to the requested dates.
 *
 * ===========================================================================
 * THIS MUST NEVER BE USED TO SYNTHESISE ROWS FOR THE DATABASE
 * ===========================================================================
 * `01-DATA-FOUNDATION.md` §3 is explicit: "Forward-fill to daily in the math
 * layer, never in storage." `RiskFreeRate` holds exactly the observations the
 * provider published and nothing else.
 *
 * The reason is not tidiness. If we wrote synthetic rows for the gaps:
 *
 *   1. We could no longer tell an observation from an interpolation. Six months
 *      later nobody knows which rows were published, and a reconciliation
 *      against the source (`06 §2`) becomes impossible.
 *   2. A late revision would have to chase every derived row, and any missed
 *      one silently contradicts its neighbours.
 *   3. The `06 §7` staleness alert ("no new row for N business days") would
 *      never fire, because the fill would keep manufacturing fresh-looking rows
 *      forever after the feed died.
 *
 * Forward-fill is a *reading* of the series, so it belongs at read time, in the
 * metrics layer, where it is cheap, reversible and visible.
 *
 * Semantics: for each target date, take the last observation whose date is
 * **on or before** it. A target date earlier than the first observation yields
 * `null` — NOT the first rate. Back-filling would mean asserting the 2024
 * risk-free rate applied in 2014, which would corrupt exactly the long-horizon
 * metrics that matter most. This matters more with FBIL than it did with the
 * imagined RBI series: FBIL's history begins on 2017-08-23, so any metric
 * window reaching further back genuinely has no rate and must say so.
 *
 * Neither input is mutated; both are sorted defensively on copies, because a
 * caller passing a parse result straight in should not have it reordered.
 */
export function forwardFillToDates(
  observedRows: readonly RiskFreeRow[],
  targetDates: readonly Date[],
): ForwardFilledRate[] {
  const observations = [...observedRows].sort((a, b) => a.date.getTime() - b.date.getTime());

  // Preserve the caller's target order in the output while walking the
  // observations once: sort indices, fill, then restore.
  const order = targetDates
    .map((date, index) => ({ date, index }))
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  const out: ForwardFilledRate[] = new Array<ForwardFilledRate>(targetDates.length);
  let cursor = 0;
  let current: Decimal | null = null;

  for (const { date, index } of order) {
    const t = date.getTime();
    while (cursor < observations.length && observations[cursor]!.date.getTime() <= t) {
      current = observations[cursor]!.ratePct;
      cursor++;
    }
    out[index] = { date, ratePct: current };
  }

  return out;
}
