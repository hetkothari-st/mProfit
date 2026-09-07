/**
 * Pure parser for niftyindices.com Total Return Index history.
 *
 * `01-DATA-FOUNDATION.md` §3 (`nseIndices.ts`), Task 1.3 in `07`.
 *
 * PURE MODULE, per the §14 `.parse.ts` / `.v1.ts` split: no network, no fs, no
 * Prisma. The side-effecting fetcher (`nseIndices.v1.ts`) does the POST and
 * hands the response body here.
 *
 * ---------------------------------------------------------------------------
 * VERIFIED INPUT FORMAT (captured live 2026-09-07)
 * ---------------------------------------------------------------------------
 * This parser was rewritten from a real response. The previous version parsed
 * a *CSV* that niftyindices does not actually serve: the "csv format" link on
 * https://www.niftyindices.com/reports/historical-data is a client-side export
 * built in the browser from an already-rendered HTML table, so no CSV ever
 * crosses the wire. The wire format is JSON.
 *
 * `POST https://www.niftyindices.com/BackPage/getTotalReturnIndexString`
 * answers HTTP 200 with a **JSON array** — note `content-type` is
 * `text/html; charset=utf-8`, which is a lie and must not be trusted:
 *
 * ```json
 * [{"RequestNumber":"TRI63924364898181473400",
 *   "Index Name":"Nifty 50",
 *   "Date":"31 Jan 2024",
 *   "TotalReturnsIndex":"31939.59",
 *   "NTR_Value":"28933.54"}, ...]
 * ```
 *
 * Properties observed against the live endpoint, each of which this parser
 * depends on and the fixtures pin:
 *   - Rows arrive **newest-first**. We always emit oldest-first.
 *   - `Date` is `DD MMM YYYY`. Other Indian formats are still accepted because
 *     guessing wrong here shifts an entire index series by months.
 *   - Every numeric field is a **string**, not a JSON number. That is a gift:
 *     the value never passes through an IEEE-754 double before we see it, so
 *     `toDecimal` receives the provider's exact digits (§3.2).
 *   - `NTR_Value` is present only for NIFTY 50 / NIFTY MIDCAP 50 / NIFTY 500
 *     and is the literal string `"-"` for every other index.
 *   - `RequestNumber` is a per-request nonce and differs on every call. It
 *     carries no information about the observation and is ignored.
 *
 * ---------------------------------------------------------------------------
 * WHY WE READ `TotalReturnsIndex` AND NEVER `NTR_Value`
 * ---------------------------------------------------------------------------
 * `TotalReturnsIndex` is the gross Total Return Index: dividends reinvested in
 * full on the ex-date. `NTR_Value` is the *Net* Total Return Index, which
 * reinvests dividends after a notional withholding tax.
 *
 * Two independent reasons to take the gross series:
 *   1. SEBI's Feb-2018 circular mandates TRI benchmarking for Indian mutual
 *      funds, and the TRI every AMC and factsheet quotes is the gross one. A
 *      metric computed against NTR is not comparable with any published number.
 *   2. NSE publishes `NTR_Value` for exactly three indices. Silently preferring
 *      it "when available" would put three of our eight benchmarks on a
 *      different, systematically lower series than the other five — so a fund
 *      benchmarked to NIFTY 50 would score better than an identical fund
 *      benchmarked to NIFTY 100, purely because of which column we happened to
 *      find. Consistency beats a marginally more "correct" tax treatment.
 *
 * ---------------------------------------------------------------------------
 * This file also owns the primitives (date parsing, value validation, the row
 * loop, gap detection) that `bseIndices.parse.ts` reuses. Two index parsers
 * that disagreed about what "duplicate_date" means would be worse than a
 * cross-import.
 */

import type { Decimal } from 'decimal.js';
import { toDecimal } from '@portfolioos/shared';

/** One accepted observation. `date` is UTC midnight; `value` is the close. */
export interface IndexPriceRow {
  date: Date;
  value: Decimal;
}

/**
 * Why a row — or a whole payload — was rejected. Closed union so the job layer
 * can map each reason to an `IngestionFailure` reason string without a default
 * branch that hides new cases (§3.5 — failures are recorded, never swallowed).
 */
export type IndexParseFailureReason =
  /** Body is not JSON at all. Almost always an HTML error/login page served
   *  with HTTP 200 — see the `content-type` lie documented above. */
  | 'not_json'
  /** Valid JSON, but not the array of row objects we expect. */
  | 'not_array'
  /**
   * A syntactically perfect **empty** array.
   *
   * This is the single most dangerous response the endpoint produces: an index
   * name it does not recognise returns `[]` with HTTP 200 rather than an error
   * (verified live against `name: 'NIFTY NOT A REAL INDEX'`). Treated as a
   * whole-payload failure, never as "the market was closed all month", because
   * the two are indistinguishable downstream and only one of them is our bug.
   */
  | 'empty_payload'
  /** An array element that is not an object (string, number, null). */
  | 'not_an_object'
  /** No `Date` property, or it is blank. */
  | 'missing_date'
  /** Date cell present but not in any format we accept. */
  | 'bad_date'
  /** Value cell empty, "-", "NA" — a genuine hole in the source. */
  | 'missing_value'
  /** Value cell present but not numeric. */
  | 'bad_value'
  /** `01 §6`: index value <= 0 is rejected, never stored. */
  | 'non_positive_value'
  /** `01 §6`: the same date appears twice in one payload. */
  | 'duplicate_date';

export interface IndexParseFailure {
  /**
   * 1-based position of the offending element in the response array, so an
   * operator can find it in the captured payload. Whole-payload failures
   * (`not_json`, `not_array`, `empty_payload`) report `1`.
   */
  line: number;
  raw: string;
  reason: IndexParseFailureReason;
}

export interface IndexParseResult {
  rows: IndexPriceRow[];
  failures: IndexParseFailure[];
}

/** A stretch where the index has no observation. See `detectGaps`. */
export interface IndexGap {
  /** Last observation before the hole. */
  from: Date;
  /** First observation after the hole. */
  to: Date;
  /** Mon-Fri days strictly between `from` and `to`. */
  businessDays: number;
}

const MONTHS: Readonly<Record<string, number>> = {
  jan: 0, january: 0,
  feb: 1, february: 1,
  mar: 2, march: 2,
  apr: 3, april: 3,
  may: 4,
  jun: 5, june: 5,
  jul: 6, july: 6,
  aug: 7, august: 7,
  sep: 8, sept: 8, september: 8,
  oct: 9, october: 9,
  nov: 10, november: 10,
  dec: 11, december: 11,
};

const ISO_DATE = /^(\d{4})-(\d{1,2})-(\d{1,2})$/;
const DMY_NAMED = /^(\d{1,2})[\s/-]+([A-Za-z]{3,9})[\s/-]+(\d{4})$/;
const DMY_NUMERIC = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/;
/** Plain decimal after separators are stripped. Rejects "1.2.3", "12a", "". */
const NUMERIC = /^-?\d+(?:\.\d+)?$/;

/**
 * Parse an index date to UTC midnight.
 *
 * Everything is anchored to UTC (§14.2). Constructing with `new Date(y, m, d)`
 * would build the date in the server's local zone; on a UTC-hosted box that is
 * accidentally right, and on a developer's IST laptop every row lands at
 * 18:30 the previous day — which shifts an entire index history by one day
 * against the NAV series and quietly corrupts every alpha we compute.
 *
 * Returns `null` rather than throwing: an unparseable date is one bad row, not
 * a reason to abandon nine years of good ones.
 */
export function parseIndexDate(raw: string): Date | null {
  const s = raw.trim().replace(/\s+/g, ' ');
  if (!s) return null;

  let y: number;
  let m: number;
  let d: number;

  const iso = ISO_DATE.exec(s);
  const named = DMY_NAMED.exec(s);
  const numeric = DMY_NUMERIC.exec(s);

  if (iso) {
    y = Number.parseInt(iso[1]!, 10);
    m = Number.parseInt(iso[2]!, 10) - 1;
    d = Number.parseInt(iso[3]!, 10);
  } else if (named) {
    const mon = MONTHS[named[2]!.toLowerCase()];
    if (mon === undefined) return null;
    d = Number.parseInt(named[1]!, 10);
    m = mon;
    y = Number.parseInt(named[3]!, 10);
  } else if (numeric) {
    // Day-first. Indian sources are unambiguously DD-MM-YYYY; treating
    // "05-04-2024" as May 4th would put a whole month of rows in the wrong
    // place without ever failing to parse.
    d = Number.parseInt(numeric[1]!, 10);
    m = Number.parseInt(numeric[2]!, 10) - 1;
    y = Number.parseInt(numeric[3]!, 10);
  } else {
    return null;
  }

  const dt = new Date(Date.UTC(y, m, d));
  // Round-trip check rejects 31 Feb / month 13 rather than letting JS roll them
  // forward into a plausible-looking wrong date.
  if (
    dt.getUTCFullYear() !== y ||
    dt.getUTCMonth() !== m ||
    dt.getUTCDate() !== d
  ) {
    return null;
  }
  return dt;
}

export type IndexValueOutcome =
  | { ok: true; value: Decimal }
  | { ok: false; reason: 'missing_value' | 'bad_value' | 'non_positive_value' };

/**
 * Validate and coerce an index level (`01 §6`: "index value <= 0 rejected").
 *
 * Index levels are money-like, so `toDecimal` — never `parseFloat`/`Number`
 * (§3.1, `portfolioos/no-money-coercion`). The regex guard runs *before*
 * `toDecimal` so we never need a try/catch around it, which keeps this
 * function clear of `portfolioos/no-silent-catch` territory entirely.
 *
 * A zero or negative index level is not a market event; it is a parsing or
 * source error. Storing one would make every return computed across it
 * meaningless (a divide by zero, or a sign flip in the log of the ratio), so
 * it is rejected at ingest rather than quarantined for later.
 */
export function parseIndexValue(raw: string): IndexValueOutcome {
  const cleaned = raw.trim().replace(/[₹\s,]/g, '');
  if (cleaned === '' || cleaned === '-' || /^n\.?a\.?$/i.test(cleaned)) {
    return { ok: false, reason: 'missing_value' };
  }
  if (!NUMERIC.test(cleaned)) return { ok: false, reason: 'bad_value' };
  const value = toDecimal(cleaned);
  if (value.lte(0)) return { ok: false, reason: 'non_positive_value' };
  return { ok: true, value };
}

/**
 * Read one string field out of a decoded JSON row.
 *
 * The providers type every numeric as a string, but a future format change
 * that switches to real JSON numbers must degrade to a `bad_*` failure rather
 * than crashing on `.trim()` of a number — so numbers are stringified here,
 * deliberately, and everything else (null, object, array, undefined) becomes
 * the empty string, which the callers map to `missing_*`.
 */
function readCell(row: Record<string, unknown>, key: string): string {
  const v = row[key];
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return String(v);
  return '';
}

/**
 * Shared row loop for both NSE and BSE. Given already-extracted date/value
 * cells, emit rows and failures with identical semantics for every reason
 * code, and always in ascending date order.
 *
 * `index` on each item is the 0-based array position; reported as `line`
 * 1-based.
 */
export function collectIndexRows(
  items: readonly { index: number; dateRaw: string; valueRaw: string; raw: string }[],
): IndexParseResult {
  const rows: IndexPriceRow[] = [];
  const failures: IndexParseFailure[] = [];
  const seen = new Set<number>();

  for (const item of items) {
    const line = item.index + 1;

    if (!item.dateRaw.trim()) {
      failures.push({ line, raw: item.raw, reason: 'missing_date' });
      continue;
    }

    const date = parseIndexDate(item.dateRaw);
    if (!date) {
      failures.push({ line, raw: item.raw, reason: 'bad_date' });
      continue;
    }

    const value = parseIndexValue(item.valueRaw);
    if (!value.ok) {
      failures.push({ line, raw: item.raw, reason: value.reason });
      continue;
    }

    const key = date.getTime();
    if (seen.has(key)) {
      // `01 §6`. Keep the FIRST occurrence and reject the later one. Arbitrary
      // but must be deterministic: "last wins" would make the parse depend on
      // the source's row order, and niftyindices order is not stable.
      failures.push({ line, raw: item.raw, reason: 'duplicate_date' });
      continue;
    }
    seen.add(key);
    rows.push({ date, value: value.value });
  }

  // Always oldest-first. Both sources serve newest-first, `detectGaps` and
  // every metric window assume ascending, and a stable order is what makes the
  // "parse twice, identical output" determinism test meaningful.
  rows.sort((a, b) => a.date.getTime() - b.date.getTime());
  return { rows, failures };
}

/**
 * Decode a JSON body into an array of row objects, or explain why not.
 *
 * Shared with `bseIndices.parse.ts`, which unwraps a `{ Table: [...] }`
 * envelope first. Never throws — a provider serving an HTML error page under
 * HTTP 200 is an expected operational state, not an exception (§3.5).
 */
export function decodeJsonRows(
  text: string,
  pick: (parsed: unknown) => unknown,
): { ok: true; rows: unknown[] } | { ok: false; failure: IndexParseFailure } {
  const sample = text.trimStart().slice(0, 300);
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    // Not swallowed: converted into a typed, reported failure whose `raw`
    // carries the first bytes so an operator can see the login wall / error
    // page for themselves.
    return { ok: false, failure: { line: 1, raw: sample, reason: 'not_json' } };
  }

  const picked = pick(parsed);
  if (!Array.isArray(picked)) {
    return { ok: false, failure: { line: 1, raw: sample, reason: 'not_array' } };
  }
  if (picked.length === 0) {
    return { ok: false, failure: { line: 1, raw: sample, reason: 'empty_payload' } };
  }
  return { ok: true, rows: picked };
}

/** The fields we read off a niftyindices TRI row. See the header essay. */
export const NIFTY_TRI_DATE_KEY = 'Date';
export const NIFTY_TRI_VALUE_KEY = 'TotalReturnsIndex';

/**
 * Parse a `getTotalReturnIndexString` response body.
 *
 * Never throws. A body we cannot make sense of yields
 * `{ rows: [], failures: [{ reason: 'not_json' | 'not_array' | 'empty_payload' }] }`
 * so the caller writes one `IngestionFailure` and moves on (§3.5).
 */
export function parseNiftyTriJson(text: string): IndexParseResult {
  const decoded = decodeJsonRows(text, (p) => p);
  if (!decoded.ok) return { rows: [], failures: [decoded.failure] };

  const items: { index: number; dateRaw: string; valueRaw: string; raw: string }[] = [];
  const failures: IndexParseFailure[] = [];

  decoded.rows.forEach((entry, i) => {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      failures.push({ line: i + 1, raw: JSON.stringify(entry) ?? 'undefined', reason: 'not_an_object' });
      return;
    }
    const row = entry as Record<string, unknown>;
    items.push({
      index: i,
      dateRaw: readCell(row, NIFTY_TRI_DATE_KEY),
      valueRaw: readCell(row, NIFTY_TRI_VALUE_KEY),
      raw: JSON.stringify(row).slice(0, 300),
    });
  });

  const collected = collectIndexRows(items);
  return {
    rows: collected.rows,
    // Element-shape failures come first so the reported line numbers stay
    // ascending overall, which is what an operator scanning a DLQ row expects.
    failures: [...failures, ...collected.failures].sort((a, b) => a.line - b.line),
  };
}

/**
 * Count Mon-Fri days in the open interval (`from`, `to`).
 *
 * Weekends only. We do **not** model Indian market holidays: this repo has no
 * NSE/BSE holiday calendar, holidays move (they follow the lunar calendar and
 * state notifications), and a wrong calendar produces *missed* gaps, which is
 * the dangerous direction. A false "gap" alert costs someone thirty seconds; a
 * missed one lets `02-METRICS.md` compute alpha across a hole in the benchmark
 * and publish it as fact.
 *
 * Exported because `06 §7`'s "no new benchmark row for > 3 business days" alert
 * needs the same arithmetic against `today`.
 */
export function countBusinessDaysBetween(from: Date, to: Date): number {
  const DAY = 86_400_000;
  const start = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()) + DAY;
  const end = Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate()) - DAY;
  if (end < start) return 0;

  const days = Math.floor((end - start) / DAY) + 1;
  const fullWeeks = Math.floor(days / 7);
  let count = fullWeeks * 5;
  let dow = new Date(start).getUTCDay();
  for (let i = 0; i < days - fullWeeks * 7; i++) {
    if (dow !== 0 && dow !== 6) count++;
    dow = (dow + 1) % 7;
  }
  return count;
}

/**
 * Find every stretch where the index is missing more than `maxBusinessDayGap`
 * business days in a row.
 *
 * `02-METRICS.md §1`: an index with gaps > 5 business days inside a metric
 * window makes every benchmark-relative metric `BENCHMARK_UNAVAILABLE`. The
 * absolute metrics still compute — a hole in the benchmark says nothing about
 * the fund.
 *
 * An ordinary Fri→Mon weekend has zero business days between it and is never
 * reported, at any threshold >= 0. A single missing Wednesday reports
 * `businessDays: 1`.
 *
 * Does not mutate `rows`; sorts a copy, because callers pass the parse result
 * straight through and re-ordering it under them would be a nasty surprise.
 */
export function detectGaps(
  rows: readonly IndexPriceRow[],
  maxBusinessDayGap: number,
): IndexGap[] {
  const sorted = [...rows].sort((a, b) => a.date.getTime() - b.date.getTime());
  const gaps: IndexGap[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const from = sorted[i - 1]!.date;
    const to = sorted[i]!.date;
    const businessDays = countBusinessDaysBetween(from, to);
    if (businessDays > maxBusinessDayGap) gaps.push({ from, to, businessDays });
  }
  return gaps;
}
