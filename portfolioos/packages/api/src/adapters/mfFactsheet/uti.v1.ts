/**
 * UTI Mutual Fund factsheet/holdings adapter — the side-effecting half.
 *
 * ===========================================================================
 * VERIFIED 2026-09-07 (live walk of utimf.com; one real zip downloaded)
 * ===========================================================================
 *
 * UTI is the awkward one of the ten. THREE separate things stand between a
 * month and a scheme's holdings, and only the third is unusual:
 *
 *  1. DISCOVERY. `ENDPOINTS.portfolioDiscoveryApi` returns the month's file.
 *     The `month` parameter MUST be the full English month name — `7` and `07`
 *     both return `{"rows":[]}`, i.e. an empty result that looks exactly like
 *     "not published yet". Verified.
 *  2. A ZIP. The download is a zip of four files; the portfolio is the one
 *     whose name starts `Sebi Exposure` (observed: "Sebi Exposure as on
 *     31 Jul 2026_final.xlsx"). Match that prefix case-insensitively — the rest
 *     of the name is not stable. This adapter family has no unzip step.
 *  3. ⚠ A STACKED SINGLE SHEET. Unlike every other AMC here, UTI does NOT put
 *     one scheme per sheet. All 83 schemes live on ONE sheet as consecutive
 *     blocks delimited by `SCHEME CODE<nnn>STARTS` / `SCHEME CODE<nnn>ENDS`
 *     sentinel rows. Selecting a scheme therefore means SLICING ROWS, not
 *     picking a sheet — and `fetchAndParsePortfolioWorkbook` cannot do that.
 *     The inner sheet NAME is also unstable ("Sebi Exposure" in June 2026,
 *     "exposure" in July 2026), so sheet 0 is used positionally.
 *
 * Point 3 is why this file does its own fetch rather than delegating: handing
 * the consolidated sheet to the parser would return the FIRST scheme's holdings
 * for every scheme asked about — plausible numbers, wrong fund, no error. The
 * guard below counts the sentinels and refuses rather than let that happen.
 *
 * WHAT IS STILL UNPROVEN
 *  - Filenames inside the zip are not fully deterministic: June 2026's carried
 *    an `_rv1` revision suffix. The `Sebi Exposure` prefix is the stable part.
 *  - The CloudFront URL's folder is the PUBLICATION month while the filename
 *    carries the AS-ON date, so the two disagree by design. The API's
 *    `?VersionId=…` query is NOT required (verified).
 *
 * Everything checkable without the network lives in `uti.parse.ts` and is
 * covered by fixtures.
 */

import { logger } from '../../lib/logger.js';
import {
  parseUtiPortfolio,
  parseUtiSchemeFacts,
  UTI_ADAPTER_ID,
  UTI_ADAPTER_VERSION,
  UTI_AMC_CODE,
} from './uti.parse.js';
import { factsheetFail } from './types.js';
import { monthNameUtc, readWorkbook, sheetToGrid, yearUtc } from './v1Support.js';
import type {
  FactsheetFetchContext,
  MfFactsheetAdapter,
  MfFactsheetResult,
  PortfolioParseInput,
  PortfolioRaw,
  SchemeFactsRaw,
} from './types.js';

/** Live endpoints as observed on 2026-09-07. */
export const ENDPOINTS = {
  /**
   * VERIFIED and AUTHORITATIVE: JSON discovery for the month's disclosure zip.
   * `month` must be the FULL English month name; a numeric month returns
   * `{"rows":[]}` rather than an error.
   */
  portfolioDiscoveryApi: (asOf: Date): string =>
    'https://www.utimf.com/api/get-consolidate-portfolio-disclosure' +
    `?year=${yearUtc(asOf)}&month=${monthNameUtc(asOf)}`,

  /** VERIFIED: the July-2026 zip. Folder = publication month, name = as-on date. */
  observedPortfolioZip:
    'https://d3ce1o48hc5oli.cloudfront.net/s3fs-public/2026-08/fw_uti_mf_scheme_portfolios_31.07.2026.zip',

  /**
   * Which of the zip's four members is the portfolio. Prefix match, case
   * insensitive — the suffix varies ("_final", "_rv1", …).
   */
  zipMemberPrefix: 'Sebi Exposure',

  /** VERIFIED: the "UTI Fund Watch" factsheet listing. */
  factsheetApi: (asOf: Date): string =>
    `https://www.utimf.com/api/get-fact-sheet?year=${yearUtc(asOf)}&month=${monthNameUtc(asOf)}`,
} as const;

/**
 * Supplied by the caller once a discovery + unzip client exists.
 *
 * ⚠ CONTRACT: the URL it returns must point at a workbook holding THIS SCHEME
 * ALONE, on its first sheet. Pointing it at UTI's consolidated `Sebi Exposure`
 * sheet is a correctness bug, not a shortcut — see point 3 in the header. The
 * fetch below verifies this and refuses a consolidated sheet rather than
 * trusting the caller.
 */
export type PortfolioUrlResolver = (asOf: Date, schemeCode: string) => Promise<string | null>;

/** Supplied by the caller once PDF text extraction exists. See `factsheetApi`. */
export type FactsheetTextResolver = (schemeCode: string) => Promise<string | null>;

let portfolioUrlResolver: PortfolioUrlResolver | null = null;
let factsheetTextResolver: FactsheetTextResolver | null = null;

/** Install (or, with `null`, remove) the single-scheme workbook URL resolver. */
export function setUtiPortfolioUrlResolver(resolver: PortfolioUrlResolver | null): void {
  portfolioUrlResolver = resolver;
}

/** Install (or, with `null`, remove) the factsheet PDF-text resolver. */
export function setUtiFactsheetTextResolver(resolver: FactsheetTextResolver | null): void {
  factsheetTextResolver = resolver;
}

/** `SCHEME CODE123STARTS` — the row that opens one scheme's block. */
const SCHEME_BLOCK_START_RE = /^\s*scheme\s*code\s*\d+\s*starts\s*$/i;

/**
 * How many scheme blocks does this grid contain?
 *
 * A single-scheme extract has 0 or 1; UTI's consolidated sheet has 83. Counting
 * is cheap and it is the only thing standing between a mis-wired resolver and
 * 83 funds all reporting the same holdings.
 */
function countSchemeBlocks(rows: readonly (readonly string[])[]): number {
  let n = 0;
  for (const row of rows) {
    for (const cell of row) {
      if (SCHEME_BLOCK_START_RE.test(cell)) {
        n += 1;
        break;
      }
    }
  }
  return n;
}

export const utiFactsheetAdapter: MfFactsheetAdapter = {
  amcCode: UTI_AMC_CODE,
  id: UTI_ADAPTER_ID,
  version: UTI_ADAPTER_VERSION,

  async fetchSchemeFacts(
    schemeCode: string,
    ctx: FactsheetFetchContext,
  ): Promise<MfFactsheetResult<SchemeFactsRaw>> {
    const text = factsheetTextResolver === null ? null : await factsheetTextResolver(schemeCode);
    if (text === null || text.trim().length === 0) {
      return factsheetFail(
        'PORTAL_CHANGED',
        'UTI exposes its "Fund Watch" factsheet through a listing call: GET ' +
          `${ENDPOINTS.factsheetApi(new Date())} (month must be the FULL English ` +
          'month name; a numeric month silently returns an empty row set). The ' +
          'result is a PDF and this adapter has no text extractor. Install a ' +
          'resolver via setUtiFactsheetTextResolver().',
      );
    }
    // A consolidated factsheet states one TER per plan on one line, so the
    // parser refuses to pick between them unless told which plan this scheme
    // code is. Without this it reads both figures off the page and discards
    // them, and MfSchemeTer stays empty while AUM from the same text writes.
    const planType = ctx.schemePlanType === undefined ? null : await ctx.schemePlanType(schemeCode);
    return parseUtiSchemeFacts({ schemeCode, text, ...(planType === null ? {} : { planType }) });
  },

  async fetchPortfolio(
    schemeCode: string,
    asOf: Date,
    ctx: FactsheetFetchContext,
  ): Promise<MfFactsheetResult<PortfolioRaw>> {
    const url = portfolioUrlResolver === null ? null : await portfolioUrlResolver(asOf, schemeCode);

    // DELIBERATE typed failure covering all three missing steps at once, so the
    // operator reading the DLQ sees the whole gap rather than discovering it one
    // 404 at a time.
    if (url === null) {
      return factsheetFail(
        'PORTAL_CHANGED',
        'UTI needs three steps this adapter does not implement. (1) GET ' +
          `${ENDPOINTS.portfolioDiscoveryApi(asOf)} — the month MUST be the full ` +
          'English name; "7"/"07" return {"rows":[]}, which is indistinguishable ' +
          'from "not published". (2) The result is a ZIP of four files ' +
          `(e.g. ${ENDPOINTS.observedPortfolioZip}); take the member whose name ` +
          `starts "${ENDPOINTS.zipMemberPrefix}" (case-insensitive; suffixes vary — ` +
          '"_final", "_rv1"). (3) That workbook puts ALL 83 schemes on ONE sheet as ' +
          'blocks delimited by SCHEME CODE<nnn>STARTS/ENDS rows, so a scheme is a ' +
          'ROW SLICE, not a sheet, and nothing here can slice it. Install a resolver ' +
          'via setUtiPortfolioUrlResolver() that returns a workbook containing this ' +
          `scheme ALONE on sheet 0. Requested scheme: ${schemeCode}.`,
      );
    }

    let bytes: Uint8Array;
    try {
      bytes = await ctx.fetchBinary(url, { signal: ctx.abortSignal });
    } catch (err) {
      logger.warn(
        { adapter: UTI_ADAPTER_ID, schemeCode, url, err },
        'mfFactsheet.portfolio.fetchFailed',
      );
      return factsheetFail(
        'FETCH_FAILED',
        `Could not fetch ${url}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    if (bytes.byteLength === 0) {
      return factsheetFail(
        'NOT_PUBLISHED',
        `${url} returned an empty body; the disclosure for this month is probably not out yet.`,
      );
    }

    let grid: readonly (readonly string[])[];
    try {
      const wb = readWorkbook(bytes);
      // Sheet 0 POSITIONALLY: UTI's inner sheet name moved from "Sebi Exposure"
      // (June 2026) to "exposure" (July 2026), so matching on the name is the
      // less stable of the two options.
      const first = wb.SheetNames[0];
      const ws = first === undefined ? undefined : wb.Sheets[first];
      if (ws === undefined) {
        return factsheetFail('PORTAL_CHANGED', `Workbook at ${url} has no sheets.`);
      }
      grid = sheetToGrid(ws);
    } catch (err) {
      return factsheetFail(
        'PORTAL_CHANGED',
        `${url} did not parse as a workbook (${bytes.byteLength} bytes): ` +
          `${err instanceof Error ? err.message : String(err)}. It is most likely ` +
          'still the ZIP, or an error page.',
      );
    }

    // THE GUARD. `uti.parse.ts` stops at the first `SCHEME CODE<nnn>ENDS`, so a
    // consolidated sheet would parse cleanly and return scheme #1's holdings
    // under whatever code was asked for — 83 funds, one portfolio, no error
    // anywhere. Refusing is the only safe answer.
    const blocks = countSchemeBlocks(grid);
    if (blocks > 1) {
      return factsheetFail(
        'PORTAL_CHANGED',
        `${url} is UTI's CONSOLIDATED sheet: it carries ${blocks} ` +
          'SCHEME CODE<nnn>STARTS blocks, one per scheme. Parsing it would return ' +
          `the FIRST block's holdings for every scheme asked about, silently. ` +
          'setUtiPortfolioUrlResolver() must return a workbook sliced to one ' +
          `scheme. Requested scheme: ${schemeCode}.`,
      );
    }

    const input: PortfolioParseInput = { schemeCode, rows: grid, expectedAsOf: asOf };
    return parseUtiPortfolio(input);
  },
};
