/**
 * ICICI Prudential Mutual Fund factsheet/holdings adapter — the side-effecting
 * half.
 *
 * ===========================================================================
 * VERIFIED 2026-09-07 (live walk of icicipruamc.com; one real zip downloaded)
 * ===========================================================================
 *
 * WHAT WAS PROVEN
 *  - `ENDPOINTS.monthlyPortfolioZip` is the cleanest URL of the ten: a plain
 *    Azure blob path built from (year, month name) with NO cache-buster, no
 *    content hash and no listing call. Downloaded and opened.
 *  - Availability is directly probeable: a month ICICI has not published yet
 *    returns Azure's own "The specified blob does not exist" 404 rather than a
 *    friendly HTML page, so `NOT_PUBLISHED` can be told apart from a redesign.
 *  - The zip holds 146 SEPARATE `.xlsx` files, ONE PER SCHEME, named by the
 *    full scheme name ("ICICI Prudential Balanced Advantage Fund.xlsx"). Each
 *    workbook carries a scheme-abbreviation sheet (e.g. `BAF`) plus a
 *    `Derivative` sheet.
 *  - The factsheet PDF URL is fully constructible and was downloaded.
 *  - `archive.icicipruamc.com`, the host that used to serve pre-blob history,
 *    has NO DNS record at all. It is dead, not merely 404 — do not retry it and
 *    do not treat its absence as a transient fault.
 *
 * WHAT IS STILL UNPROVEN / NOT IMPLEMENTED
 *  - The URL is constructible but the PAYLOAD IS A ZIP, and this adapter family
 *    has no unzip step: `fetchAndParsePortfolioWorkbook` fetches bytes and
 *    hands them straight to SheetJS. So `fetchPortfolio` cannot run today even
 *    though it knows exactly where the file is. It says so, loudly, instead of
 *    fetching the zip and letting SheetJS fail with a confusing message about
 *    an unrecognised workbook.
 *  - Only one month's zip was opened; the member-naming convention across
 *    months is inferred from that one.
 *
 * Everything checkable without the network lives in `icici.parse.ts` and is
 * covered by fixtures.
 */

import {
  parseIciciPortfolio,
  parseIciciSchemeFacts,
  ICICI_ADAPTER_ID,
  ICICI_ADAPTER_VERSION,
  ICICI_AMC_CODE,
} from './icici.parse.js';
import { factsheetFail } from './types.js';
import { fetchAndParsePortfolioWorkbook, monthNameUtc, yearUtc } from './v1Support.js';
import type {
  FactsheetFetchContext,
  MfFactsheetAdapter,
  MfFactsheetResult,
  PortfolioRaw,
  SchemeFactsRaw,
} from './types.js';

/** Live endpoints as observed on 2026-09-07. */
export const ENDPOINTS = {
  /**
   * VERIFIED: the month's complete portfolio disclosure, as a ZIP of 146
   * per-scheme workbooks. `<MonthName>` is the full English name, capitalised,
   * and appears twice — once as a path segment, once in the filename.
   */
  monthlyPortfolioZip: (asOf: Date): string =>
    'https://www.icicipruamc.com/blob/downloads/Files/Monthly%20Portfolio%20Disclosures/' +
    `${yearUtc(asOf)}/${monthNameUtc(asOf)}/` +
    `Monthly-Portfolio-Disclosure-${monthNameUtc(asOf)}-${yearUtc(asOf)}.zip`,

  /**
   * How a member of that zip is named. Recorded as a template rather than a
   * builder because the input is the FULL scheme name as ICICI writes it, which
   * this adapter is not given — the caller holds it.
   */
  zipMemberTemplate: '<Full Scheme Name>.xlsx — e.g. "ICICI Prudential Balanced Advantage Fund.xlsx"',

  /** VERIFIED: consolidated factsheet PDF; month lowercase, year four digits. */
  factsheetPdf: (asOf: Date): string =>
    'https://digitalfactsheet.icicipruamc.com/fact/pdf/' +
    `fund-factsheet-for-${monthNameUtc(asOf).toLowerCase()}-${yearUtc(asOf)}.pdf`,

  /**
   * DEAD. `archive.icicipruamc.com` no longer resolves — there is no DNS record,
   * so every request fails at name resolution. Kept here so the next person to
   * find it in an old runbook does not spend an afternoon on it.
   */
  deadArchiveHost: 'archive.icicipruamc.com (NXDOMAIN as of 2026-09-07)',
} as const;

/**
 * Supplied by the caller once a client that can open `monthlyPortfolioZip`
 * exists. It must return a URL to a SINGLE, ALREADY-EXTRACTED `.xlsx` for this
 * scheme — not the zip — because nothing downstream of here can unzip.
 */
export type PortfolioUrlResolver = (asOf: Date, schemeCode: string) => Promise<string | null>;

/** Supplied by the caller once PDF text extraction exists. See `factsheetPdf`. */
export type FactsheetTextResolver = (schemeCode: string) => Promise<string | null>;

let portfolioUrlResolver: PortfolioUrlResolver | null = null;
let factsheetTextResolver: FactsheetTextResolver | null = null;

/** Install (or, with `null`, remove) the extracted-workbook URL resolver. */
export function setIciciPortfolioUrlResolver(resolver: PortfolioUrlResolver | null): void {
  portfolioUrlResolver = resolver;
}

/** Install (or, with `null`, remove) the factsheet PDF-text resolver. */
export function setIciciFactsheetTextResolver(resolver: FactsheetTextResolver | null): void {
  factsheetTextResolver = resolver;
}

export const iciciFactsheetAdapter: MfFactsheetAdapter = {
  amcCode: ICICI_AMC_CODE,
  id: ICICI_ADAPTER_ID,
  version: ICICI_ADAPTER_VERSION,

  async fetchSchemeFacts(
    schemeCode: string,
    _ctx: FactsheetFetchContext,
  ): Promise<MfFactsheetResult<SchemeFactsRaw>> {
    const text = factsheetTextResolver === null ? null : await factsheetTextResolver(schemeCode);
    if (text === null || text.trim().length === 0) {
      return factsheetFail(
        'PORTAL_CHANGED',
        'ICICI Pru publishes one consolidated factsheet PDF at ' +
          'https://digitalfactsheet.icicipruamc.com/fact/pdf/' +
          'fund-factsheet-for-<month-lowercase>-<year>.pdf (GET, verified ' +
          '2026-09-07). This adapter has no PDF text extractor. Install one via ' +
          'setIciciFactsheetTextResolver(); it must return the extracted text of ' +
          'the pages covering this scheme.',
      );
    }
    return parseIciciSchemeFacts({ schemeCode, text });
  },

  async fetchPortfolio(
    schemeCode: string,
    asOf: Date,
    ctx: FactsheetFetchContext,
  ): Promise<MfFactsheetResult<PortfolioRaw>> {
    const url = portfolioUrlResolver === null ? null : await portfolioUrlResolver(asOf, schemeCode);

    // DELIBERATE typed failure, not a guessed fetch. The zip URL below is
    // verified and would download happily — and then SheetJS would either
    // choke on it or, worse, read the zip's central directory as an
    // "unrecognised workbook" and report a format problem that has nothing to
    // do with ICICI's format. An honest AMC_NOT_SUPPORTED-shaped answer that
    // names the missing step beats a fetcher that appears to be having network
    // trouble.
    if (url === null) {
      // Two different failures used to share this message, and the difference
      // matters to whoever reads the DLQ: no resolver installed is a wiring
      // gap, while a resolver that returned null means the archive was opened
      // and this scheme was not in it — an AMFI-vs-AMC naming difference, which
      // is fixed in the resolver's matcher, not here.
      if (portfolioUrlResolver !== null) {
        return factsheetFail(
          'PORTAL_CHANGED',
          `The monthly archive (${ENDPOINTS.monthlyPortfolioZip(asOf)}) was ` +
            `reachable but holds no member for scheme ${schemeCode}. ICICI names ` +
            `members ${ENDPOINTS.zipMemberTemplate}, spelled as the AMC writes it; ` +
            "AMFI's name for the same fund can differ in wording, not just " +
            'punctuation ("Focused Fund" vs "Focused Equity Fund"). Matching those ' +
            'is deliberately left unmatched rather than guessed: the wrong ' +
            "portfolio reported as this fund's is worse than none.",
        );
      }
      return factsheetFail(
        'PORTAL_CHANGED',
        'ICICI Pru ships the month as a ZIP of 146 per-scheme workbooks and this ' +
          'adapter has no unzip step, so it cannot select a scheme. Required: GET ' +
          `${ENDPOINTS.monthlyPortfolioZip(asOf)} (no auth, no cache-buster; a ` +
          'month that is not out yet returns an Azure "specified blob does not ' +
          `exist" 404), extract the member named ${ENDPOINTS.zipMemberTemplate}, ` +
          `then hand its URL/bytes back via setIciciPortfolioUrlResolver(). The ` +
          `scheme lives on a sheet named with its abbreviation (the workbook also ` +
          `carries a "Derivative" sheet). Requested scheme: ${schemeCode}.`,
      );
    }

    return fetchAndParsePortfolioWorkbook({
      adapterId: ICICI_ADAPTER_ID,
      url,
      schemeCode,
      // Per-scheme workbook: the holdings sheet carries ICICI's own scheme
      // abbreviation ("LIQUID" for 120197), not the AMFI scheme code, so it
      // cannot be named ahead of time. Excluding the `Derivative` sheet leaves
      // exactly one candidate — which is still explicit, and still refuses to
      // guess if the workbook ever grows a third sheet.
      excludeSheets: ['Derivative'],
      asOf,
      ctx,
      parse: parseIciciPortfolio,
    });
  },
};
