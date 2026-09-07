/**
 * Pure parser for niftyindices.com historical index CSV downloads.
 *
 * `01-DATA-FOUNDATION.md` §3 (`nseIndices.ts`), Task 1.3 in `07`.
 *
 * PURE MODULE, per the §14 `.parse.ts` / `.v1.ts` split: no network, no fs, no
 * Prisma. The side-effecting fetcher (`nseIndices.v1.ts`, a later task) does the
 * cookie/header dance that `nseBhavcopy.service.ts` and `nseUniverse.service.ts`
 * already model, and hands the CSV text to `parseNiftyIndexCsv`. Keeping the
 * split means a niftyindices layout change is a *new fixture*, not a debugging
 * session against a live government-adjacent website.
 *
 * ---------------------------------------------------------------------------
 * ASSUMED INPUT FORMAT
 * ---------------------------------------------------------------------------
 * A header row followed by data rows, roughly:
 *
 *   Index Name,Index Date,Open Index Value,High Index Value,Low Index Value,
 *   Closing Index Value,Points Change,Change(%),Volume,Turnover (Rs. Cr.),
 *   P/E,P/B,Div Yield
 *
 * Observed variations we tolerate deliberately:
 *   - Dates come as `DD MMM YYYY` from one endpoint and `DD-MM-YYYY` from
 *     another. Both are handled; so are `DD-MMM-YYYY` and ISO, because guessing
 *     wrong here silently shifts an entire index series by months.
 *   - Rows arrive newest-first. We always emit oldest-first (see below).
 *   - Numeric fields carry Indian digit grouping ("1,23,456.78") and are then
 *     quoted, so a naive `split(',')` mis-columns the row. We use a
 *     quote-aware splitter.
 *   - Trailing blank lines and a stray BOM.
 *
 * We read the CLOSING value only. Open/high/low are not stored: every metric in
 * `02-METRICS.md` is close-to-close, and storing unused columns invites someone
 * to compute a "true range" volatility that is not comparable to the NAV-based
 * volatility we compute for funds.
 *
 * This file also owns the primitives (CSV splitting, date parsing, value
 * validation, gap detection) that `bseIndices.parse.ts` reuses. Two index
 * parsers that disagree about what "duplicate_date" means would be worse than
 * a cross-import.
 */

import type { Decimal } from 'decimal.js';
import { toDecimal } from '@portfolioos/shared';

/** One accepted observation. `date` is UTC midnight; `value` is the close. */
export interface IndexPriceRow {
  date: Date;
  value: Decimal;
}

/**
 * Why a row was dropped. Closed union so the job layer can map each reason to
 * an `IngestionFailure` reason string without a default branch that hides new
 * cases (§3.5 — failures are recorded, never swallowed).
 */
export type IndexParseFailureReason =
  /** No header row we recognise. The whole file is rejected. */
  | 'missing_header'
  /** Fewer columns than the header promised. */
  | 'short_row'
  /** Date cell present but not in any format we accept. */
  | 'bad_date'
  /** Close cell empty, "-", "NA" — a genuine hole in the source. */
  | 'missing_value'
  /** Close cell present but not numeric. */
  | 'bad_value'
  /** `01 §6`: index value <= 0 is rejected, never stored. */
  | 'non_positive_value'
  /** `01 §6`: the same date appears twice in one file. */
  | 'duplicate_date';

export interface IndexParseFailure {
  /** 1-based line number in the original text, so a human can open the file. */
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
 * Split one CSV line, respecting double quotes and `""` escapes.
 *
 * Required, not optional: niftyindices quotes turnover ("1,23,456.78"), and a
 * `split(',')` shifts every column after it, which silently makes P/E the
 * closing value. Cheap hand-rolled splitter beats a dependency for one format.
 */
export function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

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
 * Locate the header row among the first few lines.
 *
 * Some index downloads prepend a title/date-range line before the header. We
 * scan instead of assuming line 1 so one cosmetic preamble does not reject the
 * whole file.
 */
function findHeader(
  lines: readonly string[],
  matches: (cols: string[]) => boolean,
  maxScan = 10,
): { index: number; cols: string[] } | null {
  const limit = Math.min(lines.length, maxScan);
  for (let i = 0; i < limit; i++) {
    const raw = lines[i];
    if (!raw || !raw.trim()) continue;
    // Strip a UTF-8 BOM off the first cell. NSE/BSE exports carry one, and it
    // would otherwise leave the first header cell as "<BOM>Index Name",
    // which no header matcher recognises — the whole file would be rejected
    // for a single invisible byte.
    const cols = splitCsvLine(raw).map((c) => c.replace(/^\uFEFF/, '').trim());
    if (matches(cols)) return { index: i, cols };
  }
  return null;
}

function norm(h: string): string {
  return h.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** Index of the first header whose normalised form satisfies `pred`, or -1. */
function findCol(cols: readonly string[], pred: (n: string) => boolean): number {
  return cols.findIndex((c) => pred(norm(c)));
}

/**
 * Shared row loop for both NSE and BSE. Given resolved column positions, emit
 * rows and failures with identical semantics for every reason code.
 */
function collectRows(
  lines: readonly string[],
  headerIndex: number,
  dateIdx: number,
  closeIdx: number,
): IndexParseResult {
  const rows: IndexPriceRow[] = [];
  const failures: IndexParseFailure[] = [];
  const seen = new Map<number, number>(); // epoch ms -> line number first seen
  const minCols = Math.max(dateIdx, closeIdx) + 1;

  for (let i = headerIndex + 1; i < lines.length; i++) {
    const raw = lines[i]!;
    if (!raw.trim()) continue; // blank / trailing newline — not a failure
    const lineNo = i + 1;
    const cols = splitCsvLine(raw);

    if (cols.length < minCols) {
      failures.push({ line: lineNo, raw, reason: 'short_row' });
      continue;
    }

    const date = parseIndexDate(cols[dateIdx]!);
    if (!date) {
      failures.push({ line: lineNo, raw, reason: 'bad_date' });
      continue;
    }

    const value = parseIndexValue(cols[closeIdx]!);
    if (!value.ok) {
      failures.push({ line: lineNo, raw, reason: value.reason });
      continue;
    }

    const key = date.getTime();
    if (seen.has(key)) {
      // `01 §6`. Keep the FIRST occurrence and reject the later one. Arbitrary
      // but must be deterministic: "last wins" would make the parse depend on
      // the source's row order, and niftyindices order is not stable.
      failures.push({ line: lineNo, raw, reason: 'duplicate_date' });
      continue;
    }
    seen.set(key, lineNo);
    rows.push({ date, value: value.value });
  }

  // Always oldest-first. The source serves newest-first, `detectGaps` and every
  // metric window assume ascending, and a stable order is what makes the
  // "parse twice, identical output" determinism test meaningful.
  rows.sort((a, b) => a.date.getTime() - b.date.getTime());
  return { rows, failures };
}

/**
 * Parse a niftyindices.com historical CSV.
 *
 * Never throws. A file we cannot make sense of yields
 * `{ rows: [], failures: [{ reason: 'missing_header' }] }` so the caller writes
 * one `IngestionFailure` and moves on (§3.5).
 */
export function parseNiftyIndexCsv(text: string): IndexParseResult {
  const lines = text.split(/\r?\n/);

  const header = findHeader(
    lines,
    (cols) =>
      findCol(cols, (n) => n === 'indexdate' || n === 'date' || n === 'historicaldate') !== -1 &&
      findCol(cols, (n) => n.startsWith('closing') || n === 'close' || n === 'closeindexvalue') !== -1,
  );

  if (!header) {
    return {
      rows: [],
      failures: [
        { line: 1, raw: (lines[0] ?? '').slice(0, 300), reason: 'missing_header' },
      ],
    };
  }

  const dateIdx = findCol(
    header.cols,
    (n) => n === 'indexdate' || n === 'date' || n === 'historicaldate',
  );
  const closeIdx = findCol(
    header.cols,
    (n) => n.startsWith('closing') || n === 'close' || n === 'closeindexvalue',
  );

  return collectRows(lines, header.index, dateIdx, closeIdx);
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

/** Internal helpers shared with `bseIndices.parse.ts`. Not part of the feed's
 *  public contract; exported only so the sibling parser cannot drift. */
export const __indexCsvInternals = { findHeader, findCol, collectRows, norm };
