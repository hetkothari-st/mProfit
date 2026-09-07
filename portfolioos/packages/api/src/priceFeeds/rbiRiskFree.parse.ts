/**
 * Pure parser for the RBI DBIE 91-day Treasury Bill primary-auction cut-off
 * yield — the risk-free rate for every Sharpe, Sortino, alpha and M2 in
 * `02-METRICS.md`.
 *
 * `01-DATA-FOUNDATION.md` §1 ("Risk-free rate | RBI DBIE — 91-day T-bill
 * cut-off yield | weekly") and §3 (`rbiRiskFree.ts`).
 *
 * PURE MODULE (§14): no network, no fs, no Prisma. `rbiRiskFree.v1.ts` fetches
 * and hands text to `parseRbi91DayTbill`.
 *
 * ===========================================================================
 * ASSUMED INPUT FORMAT — READ THIS BEFORE WRITING THE FETCHER
 * ===========================================================================
 * DBIE (https://data.rbi.org.in) can serve the same table as CSV, XLSX or an
 * HTML page. **We assume CSV**, and the fetcher must request the CSV export
 * rather than scraping the rendered page. Reasons:
 *
 *   - The HTML table is rendered by a JS grid; scraping it means a headless
 *     browser for one weekly number, which is absurd operationally.
 *   - The XLSX would drag a spreadsheet dependency into a price feed.
 *   - The CSV export is a stable, documented artefact of the same report.
 *
 * The CSV we expect, allowing for a preamble DBIE always writes:
 *
 *     Reserve Bank of India - Database on Indian Economy
 *     91-Day Treasury Bill (Primary) Yield
 *     Frequency : Weekly
 *
 *     Date,91-Day Treasury Bill (Primary) Yield
 *     05 Apr 2024,6.8912
 *     12 Apr 2024,6.8750
 *     19 Apr 2024,-
 *
 * What we tolerate:
 *   - any number of preamble/blank lines before the header (scanned, capped);
 *   - a header whose value column is named anything containing "yield",
 *     "rate", "t-bill"/"tbill" or "91";
 *   - `DD MMM YYYY`, `DD-MM-YYYY`, `DD-MMM-YYYY` and ISO dates;
 *   - `-`, `NA`, blank for a week with no auction (a real occurrence — auctions
 *     are skipped around some holidays). These become `missing_rate` failures,
 *     never a zero. A zero risk-free rate would quietly inflate every Sharpe
 *     ratio in the system.
 *
 * If DBIE's CSV export ever changes shape, that is a **new version** of the
 * fetcher and a new fixture here — not an edit to this parser's expectations.
 */

import type { Decimal } from 'decimal.js';
import { toDecimal } from '@portfolioos/shared';
import { splitCsvLine, parseIndexDate } from './nseIndices.parse.js';

/**
 * The only series this parser produces. Stored on the result rather than
 * inferred by the caller so a future FBIL/MIBOR parser cannot be mistaken for
 * this one after the rows leave the function.
 */
export type RiskFreeSeries = 'TBILL_91D';

/** One weekly observation. `ratePct` is a percentage — 6.89 means 6.89% p.a. */
export interface RiskFreeRow {
  date: Date;
  ratePct: Decimal;
}

export type RiskFreeParseFailureReason =
  | 'missing_header'
  | 'short_row'
  | 'bad_date'
  /** No auction that week, or a hole in DBIE's series. */
  | 'missing_rate'
  | 'bad_rate'
  /** Outside the plausible band — see `RATE_MIN_EXCL` / `RATE_MAX_INCL`. */
  | 'rate_out_of_range'
  | 'duplicate_date';

export interface RiskFreeParseFailure {
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
 * Plausibility band for an Indian 91-day T-bill cut-off yield, as a percent.
 *
 * The historical range since 1993 is roughly 3.2% (COVID trough) to 13%+ (the
 * mid-90s). We reject <= 0 outright — a zero or negative cut-off yield has
 * never happened in India and, if stored, silently turns every Sharpe ratio
 * into a raw return/volatility ratio. The upper bound of 25 is deliberately
 * loose: it catches the real failure mode, which is a mis-columned parse
 * picking up an amount in ₹ crore, not a genuine rate spike.
 */
const RATE_MIN_EXCL = 0;
const RATE_MAX_INCL = 25;

const NUMERIC = /^-?\d+(?:\.\d+)?$/;
const MAX_HEADER_SCAN = 25;

function norm(h: string): string {
  return h.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function isDateHeader(n: string): boolean {
  return n === 'date' || n === 'weekended' || n === 'weekending' || n === 'asondate';
}

function isRateHeader(n: string): boolean {
  return (
    n.includes('yield') ||
    n.includes('cutoff') ||
    n.includes('tbill') ||
    n.includes('treasurybill') ||
    n.includes('91day') ||
    n.includes('rate')
  );
}

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
 * Parse a DBIE 91-day T-bill CSV export. Never throws.
 *
 * Rows come out oldest-first regardless of source order, deduplicated by date
 * (first occurrence wins, deterministically), with every rejected row recorded
 * in `failures` for the DLQ (§3.5).
 */
export function parseRbi91DayTbill(text: string): RiskFreeParseResult {
  const lines = text.split(/\r?\n/);

  let headerIndex = -1;
  let dateIdx = -1;
  let rateIdx = -1;

  const limit = Math.min(lines.length, MAX_HEADER_SCAN);
  for (let i = 0; i < limit; i++) {
    const raw = lines[i];
    if (!raw || !raw.trim()) continue;
    const cols = splitCsvLine(raw).map((c) => c.replace(/^\uFEFF/, '').trim());
    const d = cols.findIndex((c) => isDateHeader(norm(c)));
    if (d === -1) continue;
    // Only look for the rate column among cells other than the date cell —
    // "Date" itself must never satisfy `isRateHeader`.
    const r = cols.findIndex((c, idx) => idx !== d && isRateHeader(norm(c)));
    if (r === -1) continue;
    headerIndex = i;
    dateIdx = d;
    rateIdx = r;
    break;
  }

  if (headerIndex === -1) {
    return {
      series: 'TBILL_91D',
      rows: [],
      failures: [
        { line: 1, raw: (lines[0] ?? '').slice(0, 300), reason: 'missing_header' },
      ],
    };
  }

  const rows: RiskFreeRow[] = [];
  const failures: RiskFreeParseFailure[] = [];
  const seen = new Set<number>();
  const minCols = Math.max(dateIdx, rateIdx) + 1;

  for (let i = headerIndex + 1; i < lines.length; i++) {
    const raw = lines[i]!;
    if (!raw.trim()) continue;
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

    const rate = parseRatePct(cols[rateIdx]!);
    if (!rate.ok) {
      failures.push({ line: lineNo, raw, reason: rate.reason });
      continue;
    }

    if (seen.has(date.getTime())) {
      failures.push({ line: lineNo, raw, reason: 'duplicate_date' });
      continue;
    }
    seen.add(date.getTime());
    rows.push({ date, ratePct: rate.value });
  }

  rows.sort((a, b) => a.date.getTime() - b.date.getTime());
  return { series: 'TBILL_91D', rows, failures };
}

/** Result of a forward-fill lookup. `ratePct: null` means "no observation on
 *  or before this date" — the caller must treat that as missing data, not 0. */
export interface ForwardFilledRate {
  date: Date;
  ratePct: Decimal | null;
}

/**
 * Carry each weekly observation forward to the requested dates.
 *
 * ===========================================================================
 * THIS MUST NEVER BE USED TO SYNTHESISE ROWS FOR THE DATABASE
 * ===========================================================================
 * `01-DATA-FOUNDATION.md` §3 is explicit: "Forward-fill to daily in the math
 * layer, never in storage." `RiskFreeRate` holds exactly the observations RBI
 * published — one per auction week — and nothing else.
 *
 * The reason is not tidiness. If we wrote 5 synthetic daily rows per real
 * weekly one:
 *
 *   1. We could no longer tell an observation from an interpolation. Six months
 *      later nobody knows which rows RBI actually published, and a
 *      reconciliation against the source (`06 §2`) becomes impossible.
 *   2. A late revision (RBI does restate DBIE series) would have to chase four
 *      derived rows per real one, and any missed row silently contradicts its
 *      neighbours.
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
 * metrics that matter most.
 *
 * Neither input is mutated; both are sorted defensively on copies, because a
 * caller passing a parse result straight in should not have it reordered.
 */
export function forwardFillToDates(
  weeklyRows: readonly RiskFreeRow[],
  targetDates: readonly Date[],
): ForwardFilledRate[] {
  const observations = [...weeklyRows].sort((a, b) => a.date.getTime() - b.date.getTime());

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
