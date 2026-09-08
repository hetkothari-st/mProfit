/**
 * Shared side-effecting scaffolding for the `<amc>.v1.ts` adapters.
 *
 * NOT pure — this is the half that touches the network. It is deliberately
 * thin: resolve a URL, fetch it, hand the bytes to a pure parser, translate a
 * thrown transport error into a typed failure. The less judgement lives here,
 * the less breaks when an AMC moves a page (`CONTEXT.md §14`, and the same
 * rationale written out in `adapters/pf/epf/uanLookup.v1.ts`).
 *
 * URL status per AMC is recorded in each `.v1.ts` header. As of 2026-09-07 all
 * ten were walked against the live sites; see `ENDPOINTS` in each file for what
 * is a verified static URL and what still needs a listing call.
 */

import { Decimal } from '@portfolioos/shared';
import * as XLSX from 'xlsx';
import { logger } from '../../lib/logger.js';
import { csvToGrid } from './normalise.js';
import { factsheetFail } from './types.js';
import type {
  FactsheetFetchContext,
  MfFactsheetResult,
  PortfolioParseInput,
  PortfolioRaw,
  SchemeFactsParseInput,
  SchemeFactsRaw,
} from './types.js';

/**
 * Fetch a CSV/text portfolio export and run it through a pure parser.
 *
 * ⚠ NO ADAPTER USES THIS ANY MORE, and none should. The 2026-09-07 live walk
 * found that all ten registered AMCs publish XLS/XLSX (or a zip of them) and
 * not one publishes CSV, so every `fetchPortfolio` goes through
 * `fetchAndParsePortfolioWorkbook` below. Kept only because a future
 * non-AMC source might genuinely be CSV; reaching for it on an AMC means the
 * URL is wrong, not that the format is.
 *
 * A transport failure becomes `FETCH_FAILED` (retryable) rather than
 * `PORTAL_CHANGED` (needs a human). Conflating the two is how a week of
 * transient 503s gets logged as "the AMC redesigned" and a real redesign gets
 * logged as "flaky network" — the operator then acts on neither.
 */
export async function fetchAndParsePortfolioCsv(args: {
  adapterId: string;
  url: string;
  schemeCode: string;
  asOf: Date;
  ctx: FactsheetFetchContext;
  parse: (input: PortfolioParseInput) => MfFactsheetResult<PortfolioRaw>;
  marketCapLookup?: PortfolioParseInput['marketCapLookup'];
}): Promise<MfFactsheetResult<PortfolioRaw>> {
  let text: string;
  try {
    text = await args.ctx.fetchText(args.url, { signal: args.ctx.abortSignal });
  } catch (err) {
    logger.warn(
      { adapter: args.adapterId, schemeCode: args.schemeCode, url: args.url, err },
      'mfFactsheet.portfolio.fetchFailed',
    );
    return factsheetFail(
      'FETCH_FAILED',
      `Could not fetch ${args.url}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  if (text.trim().length === 0) {
    // An empty body for a month the AMC has not published yet is expected, not
    // a defect — the holdings job runs on the 12th and some AMCs are late.
    return factsheetFail(
      'NOT_PUBLISHED',
      `${args.url} returned an empty body; the disclosure for this month is probably not out yet.`,
    );
  }

  const input: PortfolioParseInput = {
    schemeCode: args.schemeCode,
    rows: csvToGrid(text),
    expectedAsOf: args.asOf,
    ...(args.marketCapLookup === undefined ? {} : { marketCapLookup: args.marketCapLookup }),
  };
  return args.parse(input);
}

/** Fetch a factsheet page as text and run it through a pure parser. */
export async function fetchAndParseFacts(args: {
  adapterId: string;
  url: string;
  schemeCode: string;
  ctx: FactsheetFetchContext;
  parse: (input: SchemeFactsParseInput) => MfFactsheetResult<SchemeFactsRaw>;
  planType?: 'DIRECT' | 'REGULAR';
  expectedAsOf?: Date;
}): Promise<MfFactsheetResult<SchemeFactsRaw>> {
  let text: string;
  try {
    text = await args.ctx.fetchText(args.url, { signal: args.ctx.abortSignal });
  } catch (err) {
    logger.warn(
      { adapter: args.adapterId, schemeCode: args.schemeCode, url: args.url, err },
      'mfFactsheet.facts.fetchFailed',
    );
    return factsheetFail(
      'FETCH_FAILED',
      `Could not fetch ${args.url}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  return args.parse({
    schemeCode: args.schemeCode,
    text,
    ...(args.planType === undefined ? {} : { planType: args.planType }),
    ...(args.expectedAsOf === undefined ? {} : { expectedAsOf: args.expectedAsOf }),
  });
}

/**
 * `YYYY-MM` from a Date, in UTC.
 *
 * Unused by the ten AMC adapters: not one of them keys a disclosure path on
 * `YYYY-MM`. They spell the month as an English word (see `monthNameUtc`),
 * and the two that do use a numeric folder — HDFC and UTI — key it on the
 * PUBLICATION month, which is a month later than the data month and therefore
 * not derivable from `asOf` at all.
 */
export function monthKey(d: Date): string {
  return d.toISOString().slice(0, 7);
}

// ---------------------------------------------------------------------------
// Workbook extraction
// ---------------------------------------------------------------------------

/**
 * Is this Excel number format a PERCENT format?
 *
 * `%` inside a quoted literal ("Rs. 100%") or escaped (`\%`) is a character to
 * print, not a scaling instruction, so both are stripped before the test.
 */
function isPercentFormat(z: string | undefined): boolean {
  if (z === undefined || z.length === 0) return false;
  return z.replace(/"[^"]*"/g, '').replace(/\\./g, '').includes('%');
}

/**
 * ONE cell → the string the parsers see.
 *
 * ===========================================================================
 * THE RULE THAT MAKES ALL TEN AMCs PARSEABLE — read before changing this
 * ===========================================================================
 *
 * Verified 2026-09-07 against one real monthly disclosure from each of the ten
 * registered AMCs. Their `% to NAV` columns are stored two INCOMPATIBLE ways:
 *
 *   SBI, HDFC, Kotak, UTI      →  stored 9.21   with a plain format ("#,##0.00")
 *   ICICI, Nippon, Axis,       →  stored 0.0921 with a percent format ("0.00%")
 *   ABSL, Mirae, DSP
 *
 * Reading the RAW value gives 0.0921 for six of the ten, so their weights sum
 * to ~1 instead of ~100 and the 97–103% gate in `normalise.ts` rejects every
 * file those six AMCs publish — a 100× error that looks like a data problem
 * and is actually an extraction problem.
 *
 * The number format is exactly the metadata that disambiguates them: a cell
 * storing a fraction is ALWAYS marked as a percent format, because that is the
 * only way Excel renders it as "9.21%" to the human who published it. So we
 * read what the publisher sees, not what the file stores, and both conventions
 * converge on one percent-valued string.
 *
 * Percent cells specifically are scaled from the RAW value rather than taken
 * from SheetJS's pre-rendered `w`: `w` honours the display format, which is
 * 2dp, and ~100 weights each rounded to 2dp can drift the sum enough to matter
 * against a 3-point-wide band. Only the `%` suffix is borrowed from the format.
 *
 * For every other cell the publisher's rendering wins outright — see the note
 * on the `c.w` branch below for the SBI date-serial defect that rule prevents.
 */
function cellToText(c: XLSX.CellObject | undefined): string {
  if (c === undefined) return '';

  if (c.t === 'n' && typeof c.v === 'number' && isPercentFormat(c.z as string | undefined)) {
    // Scale via Decimal, not `v * 100`. Going through the number's own string
    // form is EXACT: "0.057" x 100 is 5.7, where the float multiply gives
    // 5.700000000000001 — noise that would then be stored as a weight and
    // shown to a user. This is also why there is no rounding step here; there
    // is nothing to round away.
    return `${new Decimal(String(c.v)).times(100).toString()}%`;
  }

  // The publisher's own rendering wins over ANY reconstruction of the value —
  // including, especially, a date.
  //
  // SBI's as-of cell is the Excel date serial 46234 with the format
  // "mmmm dd, yyyy", which displays as "July 31, 2026". SheetJS's `cellDates`
  // turns that serial into a JS Date at local midnight; in Asia/Kolkata that
  // instant is 2026-07-30T18:30:00Z, so `toISOString().slice(0,10)` yields
  // "2026-07-30" — every SBI snapshot filed ONE DAY EARLY, silently, for a
  // month-end disclosure where the day is the whole point.
  //
  // This check therefore sits ABOVE the Date branch, not below it. (Found by
  // running the real SBI workbook through this function: the CSV fixtures took
  // the `w` path and so could never have caught it — the same fixture-agrees-
  // with-code trap this adapter family was rewritten to escape.)
  if (c.w !== undefined) return c.w.trim();

  // Only for a date cell the publisher left unformatted. ISO, because
  // `parseFactsheetDate` must not have to guess day-first vs month-first.
  if (c.t === 'd' && c.v instanceof Date) return c.v.toISOString().slice(0, 10);
  if (c.v === undefined || c.v === null) return '';
  return String(c.v).trim();
}

/**
 * Flatten one worksheet of a real AMC workbook into the ragged string grid the
 * pure parsers consume.
 *
 * Deliberately NOT `XLSX.utils.sheet_to_json`: that helper returns raw values,
 * which is precisely the bug described on `cellToText`. Blank rows are
 * PRESERVED, because every AMC's as-of line is located by its offset above the
 * header row and dropping blanks shifts it.
 */
export function sheetToGrid(ws: XLSX.WorkSheet): string[][] {
  const ref = ws['!ref'];
  if (ref === undefined) return [];
  const range = XLSX.utils.decode_range(ref);
  const grid: string[][] = [];
  for (let r = range.s.r; r <= range.e.r; r += 1) {
    const row: string[] = [];
    for (let c = range.s.c; c <= range.e.c; c += 1) {
      row.push(cellToText(ws[XLSX.utils.encode_cell({ r, c })] as XLSX.CellObject | undefined));
    }
    while (row.length > 0 && row[row.length - 1] === '') row.pop();
    grid.push(row);
  }
  return grid;
}

/**
 * Pick a worksheet by name, case- and whitespace-insensitively.
 *
 * Needed because the sheet a scheme lives on is an AMC-internal short code
 * whose casing is not stable across months: UTI's single sheet was
 * "Sebi Exposure" in June 2026 and "exposure" in July 2026.
 */
export function findSheet(wb: XLSX.WorkBook, wanted: string): string | null {
  const key = wanted.trim().toLowerCase();
  return wb.SheetNames.find((n) => n.trim().toLowerCase() === key) ?? null;
}

/** Read a workbook with the cell metadata `cellToText` depends on. */
export function readWorkbook(bytes: Uint8Array): XLSX.WorkBook {
  // `cellNF` keeps the number format (the fraction-vs-percent tell) and
  // `cellText` keeps the display string. Without cellNF every percent column
  // silently reverts to raw fractions.
  return XLSX.read(bytes, { type: 'array', cellNF: true, cellText: true, cellDates: true });
}

/**
 * Fetch a real XLS/XLSX monthly disclosure and run one of its sheets through a
 * pure parser.
 *
 * `sheetName` is the AMC-internal scheme code. Nine of the ten AMCs ship one
 * workbook holding every scheme as its own sheet (or, for ICICI Pru and DSP, a
 * zip of workbooks); resolving `schemeCode` to that code is the caller's job.
 */
export async function fetchAndParsePortfolioWorkbook(args: {
  adapterId: string;
  url: string;
  schemeCode: string;
  /** Worksheet holding this scheme. Omitted → see `excludeSheets`. */
  sheetName?: string;
  /**
   * For a workbook that is ALREADY per-scheme, where the holdings sheet carries
   * the AMC's own abbreviation and so cannot be named ahead of time: the sheets
   * that are definitely not holdings. Exactly one sheet must remain.
   *
   * The alternative — taking sheet 0 — is what this exists to avoid: ICICI's
   * per-scheme workbooks carry a `Derivative` sheet alongside the holdings, and
   * parsing that as holdings would produce a portfolio that is wrong rather than
   * missing. Ambiguity is reported, never guessed, for the same reason.
   */
  excludeSheets?: readonly string[];
  asOf: Date;
  ctx: FactsheetFetchContext;
  parse: (input: PortfolioParseInput) => MfFactsheetResult<PortfolioRaw>;
  marketCapLookup?: PortfolioParseInput['marketCapLookup'];
}): Promise<MfFactsheetResult<PortfolioRaw>> {
  let bytes: Uint8Array;
  try {
    bytes = await args.ctx.fetchBinary(args.url, { signal: args.ctx.abortSignal });
  } catch (err) {
    logger.warn(
      { adapter: args.adapterId, schemeCode: args.schemeCode, url: args.url, err },
      'mfFactsheet.portfolio.fetchFailed',
    );
    return factsheetFail(
      'FETCH_FAILED',
      `Could not fetch ${args.url}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  if (bytes.byteLength === 0) {
    return factsheetFail(
      'NOT_PUBLISHED',
      `${args.url} returned an empty body; the disclosure for this month is probably not out yet.`,
    );
  }

  let wb: XLSX.WorkBook;
  try {
    wb = readWorkbook(bytes);
  } catch (err) {
    // An AMC serving an HTML error page with a .xlsx URL lands here. That is a
    // portal change, not a transport fault, and must not be retried forever.
    return factsheetFail(
      'PORTAL_CHANGED',
      `${args.url} did not parse as a workbook (${bytes.byteLength} bytes): ` +
        `${err instanceof Error ? err.message : String(err)}. ` +
        'The AMC is most likely serving an error page or has changed format.',
    );
  }

  let sheet: string | null | undefined;
  if (args.sheetName !== undefined) {
    sheet = findSheet(wb, args.sheetName);
  } else if (args.excludeSheets !== undefined) {
    const excluded = new Set(args.excludeSheets.map((s) => s.trim().toLowerCase()));
    const candidates = wb.SheetNames.filter((n) => !excluded.has(n.trim().toLowerCase()));
    if (candidates.length !== 1) {
      return factsheetFail(
        'PORTAL_CHANGED',
        `Workbook at ${args.url} should hold exactly one holdings sheet after ` +
          `excluding ${JSON.stringify(args.excludeSheets)}, but ${candidates.length} ` +
          `remain: ${candidates.slice(0, 40).join(', ')}. ` +
          'Picking one would risk parsing the wrong sheet as holdings.',
        { sheetNames: wb.SheetNames },
      );
    }
    sheet = candidates[0];
  } else {
    sheet = wb.SheetNames[0];
  }
  if (sheet === null || sheet === undefined) {
    return factsheetFail(
      'PORTAL_CHANGED',
      `Workbook at ${args.url} has no sheet named ${JSON.stringify(args.sheetName)}. ` +
        `Available: ${wb.SheetNames.slice(0, 40).join(', ')}`,
      { sheetNames: wb.SheetNames },
    );
  }

  const ws = wb.Sheets[sheet];
  if (ws === undefined) {
    return factsheetFail('PORTAL_CHANGED', `Sheet ${JSON.stringify(sheet)} is empty.`);
  }

  const input: PortfolioParseInput = {
    schemeCode: args.schemeCode,
    rows: sheetToGrid(ws),
    expectedAsOf: args.asOf,
    ...(args.marketCapLookup === undefined ? {} : { marketCapLookup: args.marketCapLookup }),
  };
  return args.parse(input);
}

// ---------------------------------------------------------------------------
// Date helpers for URL construction
// ---------------------------------------------------------------------------

/**
 * Every AMC that publishes a constructible disclosure URL spells the month as
 * an English word rather than a number, and several of them also spell the
 * month-end DAY into the slug. These helpers exist so that the ten `.v1.ts`
 * files do not each carry their own month table — ten copies of the same array
 * is ten chances for one of them to start at "Jan" while the others start at
 * "January".
 *
 * All of them read the date in UTC. `asOf` is a month-end supplied by the job
 * layer and stored as `@db.Date`; reading it with local getters would move a
 * 31-July month-end to 30 July for anyone west of Greenwich and build a URL for
 * the wrong file (which, at these AMCs, 404s rather than returning last
 * month — so the bug would surface as `FETCH_FAILED`, which reads as a network
 * fault).
 */
const MONTH_NAMES: readonly string[] = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/** "July" for any date in July. */
export function monthNameUtc(d: Date): string {
  return MONTH_NAMES[d.getUTCMonth()] as string;
}

/** Four-digit year as a string, for slug interpolation. */
export function yearUtc(d: Date): string {
  return String(d.getUTCFullYear());
}

/**
 * Last calendar day of `d`'s month (28/29/30/31).
 *
 * Derived rather than read off `d` because a caller may hand us any date
 * within the disclosure month, and SBI's slug names the month-end day.
 */
export function monthEndDayUtc(d: Date): number {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
}

/** "31st", "30th", "1st", "22nd" — SBI writes the ordinal into its filename. */
export function ordinalDay(n: number): string {
  // 11th/12th/13th are the exceptions the naive last-digit rule gets wrong.
  const teens = n % 100;
  if (teens >= 11 && teens <= 13) return `${n}th`;
  const last = n % 10;
  if (last === 1) return `${n}st`;
  if (last === 2) return `${n}nd`;
  if (last === 3) return `${n}rd`;
  return `${n}th`;
}
