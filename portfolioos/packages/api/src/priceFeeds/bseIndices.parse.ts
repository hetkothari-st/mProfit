/**
 * Pure parser for BSE's index-archive JSON.
 *
 * `01-DATA-FOUNDATION.md` §3: "Sensex TRI and BSE indices via a
 * `bseIndices.ts` sibling." Kept as its own file rather than a mode flag on the
 * NSE parser because the two exchanges change their payloads independently —
 * one file per source means a BSE change is a BSE fixture and a BSE version
 * bump, and cannot regress Nifty parsing.
 *
 * PURE MODULE (§14): no network, no fs, no Prisma. `bseIndices.v1.ts` fetches.
 *
 * ===========================================================================
 * ⚠ READ THIS BEFORE WIRING THIS PARSER TO ANYTHING
 * ===========================================================================
 * This parser is **verified against the live BSE archive API** (captured
 * 2026-09-07) and is correct. It is nevertheless **not connected to a
 * benchmark**, on purpose, because every series BSE serves for free through it
 * is a PRICE-RETURN series.
 *
 * The evidence, all captured live and pinned as fixtures:
 *   - `GET api.bseindia.com/BseIndiaAPI/api/FillddlIndex/w?fmdt=&todt=` is the
 *     archive tool's own index picker. It lists **149** indices
 *     (`bse-index-list.json`). Not one is a total-return variant: there is
 *     `SENSEX` / "BSE SENSEX", and no `SENSEX_TRI`, no "Total Return", no
 *     "… TR" anywhere in it.
 *   - Eight plausible TR codes (`SENSEX_TRI`, `SENSEXTRI`, `SENTRI`,
 *     `SPBSSENTR`, `SENSEXTR`, …) all return `{"Table":[]}` with HTTP 200.
 *   - BSE's daily all-index snapshot
 *     (`www.bseindia.com/Downloads/AllIndices/AllIndices_<DDMMYYYY>.csv`,
 *     linked from `Indexarchive_filedownload`) likewise carries price-return
 *     closes only.
 *   - Sanity check on the numbers: `SENSEX` closes at 72271.94 on 01-Jan-2024.
 *     The Sensex *TRI* was around 110,000 on that date. The series this API
 *     returns is unambiguously the price-return index.
 *
 * So `bseIndices.v1.ts` maps **no** index code, and `SENSEX_TRI` is listed in
 * `BENCHMARK_TRI_NOT_FREELY_AVAILABLE`. The parser exists, tested against real
 * bytes, so that the day BSE publishes a TR code the only change needed is one
 * map entry — and so that nobody "fixes" the missing benchmark by pointing it
 * at `SENSEX`, which would parse perfectly and inflate every alpha measured
 * against it by roughly the market's dividend yield. See the essay in
 * `benchmarkIndexSeed.ts`.
 *
 * ---------------------------------------------------------------------------
 * VERIFIED INPUT FORMAT
 * ---------------------------------------------------------------------------
 * `GET api.bseindia.com/BseIndiaAPI/api/IndexArchDailyPAR/w`
 *   `?fmdt=DD/MM/YYYY&index=<code>&period=D&todt=DD/MM/YYYY`
 * answers HTTP 200, `content-type: application/json`, with a `Table` envelope:
 *
 * ```json
 * {"Table":[{"Day":1,"Month":"January","year":"2024","Turnover":"819.55",
 *            "tdate":"2024-01-01T00:00:00","I_name":"SENSEX ",
 *            "I_open":72218.39,"I_high":72561.91,"I_low":72031.23,
 *            "I_close":72271.94,"I_pe":25.57,"I_pb":3.73,"I_yl":1.10, ...}]}
 * ```
 *
 * Differences from the NSE payload that this parser absorbs:
 *   - a `{ Table: [...] }` envelope rather than a bare array;
 *   - `tdate` is an ISO-ish `YYYY-MM-DDT00:00:00` local-naive timestamp, not
 *     `DD MMM YYYY`. The time part is always midnight; we take the date half
 *     and anchor it to UTC rather than letting `new Date(...)` interpret a
 *     zone-less string in the server's local zone;
 *   - OHLC arrive as JSON **numbers**, not strings. They have therefore
 *     already been through an IEEE-754 double before we ever see them — see
 *     the note on `I_close` below;
 *   - rows arrive oldest-first here (NSE serves newest-first). Both are sorted
 *     ascending by the shared row loop, so neither caller has to care.
 *
 * Everything else (UTC date handling, `<= 0` rejection, `duplicate_date`,
 * ascending output order, failure reason codes) is the *same code* as the NSE
 * parser, imported from `nseIndices.parse.ts`. Two benchmark parsers that
 * disagreed about what counts as a duplicate would produce benchmark series
 * with different failure semantics for no reason.
 */

import {
  collectIndexRows,
  decodeJsonRows,
  type IndexParseFailure,
  type IndexParseResult,
} from './nseIndices.parse.js';

// Re-exported so a consumer of the BSE feed does not have to import from the
// NSE file to name the result types.
export type {
  IndexPriceRow,
  IndexParseFailure,
  IndexParseFailureReason,
  IndexParseResult,
  IndexGap,
} from './nseIndices.parse.js';
export { detectGaps, countBusinessDaysBetween } from './nseIndices.parse.js';

/** Envelope key, and the two row fields we read. */
export const BSE_TABLE_KEY = 'Table';
export const BSE_DATE_KEY = 'tdate';
export const BSE_CLOSE_KEY = 'I_close';

/**
 * Take the date half of `2024-01-01T00:00:00`.
 *
 * Deliberately string surgery rather than `new Date(raw)`: that string carries
 * no zone, so V8 parses it as *local* time. On a UTC box that is accidentally
 * right and on an IST developer's laptop every observation lands at 18:30 the
 * previous day, silently shifting a whole index history by one day against the
 * NAV series (§14.2). Splitting the string and handing `YYYY-MM-DD` to
 * `parseIndexDate` keeps the anchor unambiguous.
 *
 * Returns the input untouched when it is not the expected shape, so a format
 * change surfaces as a `bad_date` failure with the real cell in `raw` rather
 * than as a silently wrong date.
 */
export function bseDateCell(raw: string): string {
  const t = raw.indexOf('T');
  return t === -1 ? raw.trim() : raw.slice(0, t).trim();
}

/**
 * Read a BSE cell that may be a JSON string or a JSON number.
 *
 * `I_close` arrives as a real JSON number, so it has already been through a
 * double by the time `JSON.parse` returns — there is nothing this parser can
 * do about that, and nothing to gain from pretending otherwise. `String(v)`
 * gives V8's shortest round-trip representation of that double, which is the
 * closest thing to the provider's digits still available, and `toDecimal`
 * takes it from there so no *further* float arithmetic happens (§3.2). Worth
 * recording because the NSE feed does not have this problem: it types every
 * numeric as a string.
 */
function readCell(row: Record<string, unknown>, key: string): string {
  const v = row[key];
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return String(v);
  return '';
}

/**
 * Parse an `IndexArchDailyPAR` response body. Never throws; an unrecognised
 * body yields a single whole-payload failure so the job writes one
 * `IngestionFailure` and continues (§3.5).
 */
export function parseBseIndexJson(text: string): IndexParseResult {
  const decoded = decodeJsonRows(text, (p) =>
    typeof p === 'object' && p !== null ? (p as Record<string, unknown>)[BSE_TABLE_KEY] : undefined,
  );
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
      dateRaw: bseDateCell(readCell(row, BSE_DATE_KEY)),
      valueRaw: readCell(row, BSE_CLOSE_KEY),
      raw: JSON.stringify(row).slice(0, 300),
    });
  });

  const collected = collectIndexRows(items);
  return {
    rows: collected.rows,
    failures: [...failures, ...collected.failures].sort((a, b) => a.line - b.line),
  };
}
