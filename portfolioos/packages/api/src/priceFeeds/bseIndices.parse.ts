/**
 * Pure parser for BSE historical index CSV downloads (S&P BSE SENSEX TRI and
 * siblings).
 *
 * `01-DATA-FOUNDATION.md` §3: "Sensex TRI and BSE indices via a
 * `bseIndices.ts` sibling." Kept as its own file rather than a mode flag on the
 * NSE parser because the two exchanges change their layouts independently —
 * one file per source means a BSE change is a BSE fixture and a BSE version
 * bump, and cannot regress Nifty parsing.
 *
 * PURE MODULE (§14): no network, no fs, no Prisma. `bseIndices.v1.ts` fetches.
 *
 * ---------------------------------------------------------------------------
 * ASSUMED INPUT FORMAT
 * ---------------------------------------------------------------------------
 * BSE's "Indices → Historical Data" export is a plain CSV, typically with a
 * one- or two-line preamble naming the index and the date range, then:
 *
 *   Date,Open,High,Low,Close
 *   01-Apr-2024,120345.67,120901.12,120100.05,120789.44
 *
 * Differences from the NSE export that this parser absorbs:
 *   - a title/preamble before the header (we scan the first 10 lines);
 *   - `DD-MMM-YYYY` dates rather than `DD MMM YYYY`;
 *   - no index-name column, so the index identity comes from the request, not
 *     the file — the caller supplies the `code`.
 *
 * Everything else (quote-aware splitting, UTC date handling, `<= 0` rejection,
 * `duplicate_date`, ascending output order) is the *same code* as the NSE
 * parser, imported from `nseIndices.parse.ts`. Two benchmark parsers that
 * disagreed about what counts as a duplicate, or that sorted differently, would
 * produce benchmark series with different failure semantics for no reason.
 */

import {
  __indexCsvInternals,
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

const { findHeader, findCol, collectRows } = __indexCsvInternals;

/** Header cell names BSE has used for the date column. */
const isDateHeader = (n: string): boolean =>
  n === 'date' || n === 'tradedate' || n === 'indexdate';

/**
 * Header cell names for the closing level.
 *
 * `closingindexvalue` is included because BSE occasionally mirrors NSE's
 * wording on the TRI exports. `closeprice` shows up on the equity bhavcopy
 * style export. We take close only — see the NSE parser's note on why
 * open/high/low are deliberately dropped.
 */
const isCloseHeader = (n: string): boolean =>
  n === 'close' ||
  n === 'closeprice' ||
  n === 'closevalue' ||
  n.startsWith('closing');

/**
 * Parse a BSE historical index CSV. Never throws; an unrecognised file yields a
 * single `missing_header` failure so the job writes one `IngestionFailure` and
 * continues (§3.5).
 */
export function parseBseIndexCsv(text: string): IndexParseResult {
  const lines = text.split(/\r?\n/);

  const header = findHeader(
    lines,
    (cols) => findCol(cols, isDateHeader) !== -1 && findCol(cols, isCloseHeader) !== -1,
  );

  if (!header) {
    return {
      rows: [],
      failures: [
        { line: 1, raw: (lines[0] ?? '').slice(0, 300), reason: 'missing_header' },
      ],
    };
  }

  return collectRows(
    lines,
    header.index,
    findCol(header.cols, isDateHeader),
    findCol(header.cols, isCloseHeader),
  );
}
