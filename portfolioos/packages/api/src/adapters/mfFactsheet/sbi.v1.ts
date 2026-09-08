/**
 * SBI Mutual Fund factsheet/holdings adapter — the side-effecting half.
 *
 * ===========================================================================
 * VERIFIED 2026-09-07 (live walk of sbimf.com; one real disclosure downloaded)
 * ===========================================================================
 *
 * WHAT WAS PROVEN
 *  - SBI publishes ONE consolidated monthly-portfolio workbook covering every
 *    scheme: 122 sheets, one per scheme, plus an `Index` sheet mapping
 *    `Scheme Code | Scheme Short code | Scheme Name`. A sheet is keyed by the
 *    SBI-internal SHORT code, not by an AMFI code.
 *  - `ENDPOINTS.consolidatedPortfolioXlsx` downloads: the July-2026 workbook
 *    was fetched, opened and parsed end-to-end by `sbi.parse.ts`. The
 *    `?sfvrsn=` cache-buster the site appends to its own links is NOT needed.
 *
 * WHAT IS STILL UNPROVEN
 *  - Only ONE month's URL was exercised. The slug embeds the month-end DAY
 *    ("...as-on-31st-july-2026.xlsx"), so it is constructible — see
 *    `monthEndDayUtc` — but it is BRITTLE: a 30-day month, a leap February or
 *    a typo in SBI's hand-authored slug all break it, and the breakage looks
 *    like a plain 404. `ENDPOINTS.portfolioDiscovery` is the authoritative
 *    answer and should be preferred by any job that runs unattended.
 *  - The factsheet PDF slug's month CASING was exercised for one month only.
 *
 * SBI is one of only two of the ten registered AMCs (with ICICI Pru) whose
 * portfolio URL can be built from (month, year) alone, and the ONLY one whose
 * `fetchPortfolio` runs today with no injected discovery client — the other
 * nine either need a listing call first or ship the workbook inside a zip.
 *
 * Everything checkable without the network lives in `sbi.parse.ts` and is
 * covered by fixtures. This file stays thin: resolve a URL, fetch it, hand the
 * bytes to the parser. The less judgement here, the less breaks when the site
 * moves.
 */

import {
  parseSbiPortfolio,
  parseSbiSchemeFacts,
  SBI_ADAPTER_ID,
  SBI_ADAPTER_VERSION,
  SBI_AMC_CODE,
} from './sbi.parse.js';
import { factsheetFail } from './types.js';
import {
  fetchAndParsePortfolioWorkbook,
  monthEndDayUtc,
  monthNameUtc,
  ordinalDay,
  yearUtc,
} from './v1Support.js';
import type {
  FactsheetFetchContext,
  MfFactsheetAdapter,
  MfFactsheetResult,
  PortfolioRaw,
  SchemeFactsRaw,
} from './types.js';

/**
 * Live endpoints as observed on 2026-09-07. Nothing here is a guess; where a
 * shape could not be proven the entry says so in its own comment rather than
 * being quietly promoted to fact.
 */
export const ENDPOINTS = {
  /**
   * VERIFIED: the consolidated all-schemes monthly portfolio workbook.
   *
   * Constructible, but see the header — the month-end day is part of the slug,
   * which makes this the most fragile of the two constructible URLs.
   */
  consolidatedPortfolioXlsx: (asOf: Date): string =>
    'https://www.sbimf.com/docs/default-source/scheme-portfolios/' +
    `all-schemes-monthly-portfolio---as-on-${ordinalDay(monthEndDayUtc(asOf))}-` +
    `${monthNameUtc(asOf).toLowerCase()}-${yearUtc(asOf)}.xlsx`,

  /**
   * VERIFIED and AUTHORITATIVE: the listing call SBI's own portfolio page
   * makes. Returns an HTML `<tr>` fragment carrying ~121 `<a href>` links, one
   * workbook per scheme, for the requested month.
   *
   * Prefer this over `consolidatedPortfolioXlsx` in an unattended job: it
   * cannot be wrong about the month-end day, because SBI states the URL.
   */
  portfolioDiscovery: {
    method: 'POST' as const,
    url: 'https://www.sbimf.com/ajaxcall/CMS/GetSchemePortfolioSheets',
    /** JSON body. `PSMonth` is the full English month name; `PSYear` a string. */
    body: (asOf: Date): Record<string, unknown> => ({
      FundId: 0,
      PSYear: yearUtc(asOf),
      PSMonth: monthNameUtc(asOf),
      PSFrequency: 'Monthly',
    }),
    responseShape: 'HTML <tr> fragment, ~121 <a href> links, one per scheme',
  },

  /**
   * VERIFIED: one consolidated 106-page factsheet PDF covering every SBI
   * scheme. There is no per-scheme factsheet page to fetch as text.
   */
  consolidatedFactsheetPdf: (asOf: Date): string =>
    'https://www.sbimf.com/docs/default-source/scheme-factsheets/' +
    `all-sbimf-schemes-factsheet-${monthNameUtc(asOf).toLowerCase()}-${yearUtc(asOf)}.pdf`,
} as const;

/**
 * Supplied by the caller once a discovery client exists; see
 * `ENDPOINTS.portfolioDiscovery`.
 *
 * Returning `null` means "not published for this month", which the adapter
 * reports as a typed failure rather than falling back to a guess. A guessed URL
 * that 404s is indistinguishable from a transient network fault, and an
 * operator who reads `FETCH_FAILED` retries instead of fixing.
 */
export type PortfolioUrlResolver = (asOf: Date, schemeCode: string) => Promise<string | null>;

/**
 * Supplied by the caller once PDF text extraction exists.
 *
 * SBI's factsheet is a PDF and `parseSbiSchemeFacts` consumes TEXT. Fetching
 * the PDF with `ctx.fetchText` would hand the parser a few hundred kilobytes of
 * binary and get back `MALFORMED_INPUT` — a failure that blames the parser for
 * a capability nobody built. So extraction is an explicit dependency instead.
 */
export type FactsheetTextResolver = (schemeCode: string) => Promise<string | null>;

let portfolioUrlResolver: PortfolioUrlResolver | null = null;
let factsheetTextResolver: FactsheetTextResolver | null = null;

/** Install (or, with `null`, remove) the discovery-backed URL resolver. */
export function setSbiPortfolioUrlResolver(resolver: PortfolioUrlResolver | null): void {
  portfolioUrlResolver = resolver;
}

/** Install (or, with `null`, remove) the factsheet PDF-text resolver. */
export function setSbiFactsheetTextResolver(resolver: FactsheetTextResolver | null): void {
  factsheetTextResolver = resolver;
}

export const sbiFactsheetAdapter: MfFactsheetAdapter = {
  amcCode: SBI_AMC_CODE,
  id: SBI_ADAPTER_ID,
  version: SBI_ADAPTER_VERSION,

  async fetchSchemeFacts(
    schemeCode: string,
    _ctx: FactsheetFetchContext,
  ): Promise<MfFactsheetResult<SchemeFactsRaw>> {
    const text = factsheetTextResolver === null ? null : await factsheetTextResolver(schemeCode);
    if (text === null || text.trim().length === 0) {
      return factsheetFail(
        'PORTAL_CHANGED',
        'SBI publishes no per-scheme factsheet page; the facts live in one ' +
          'consolidated PDF at https://www.sbimf.com/docs/default-source/' +
          'scheme-factsheets/all-sbimf-schemes-factsheet-<month>-<year>.pdf ' +
          '(GET, month lowercase). This adapter has no PDF text extractor, so it ' +
          'cannot read it. Install one via setSbiFactsheetTextResolver(); it must ' +
          'return the extracted text of the pages covering this scheme.',
      );
    }
    return parseSbiSchemeFacts({ schemeCode, text });
  },

  async fetchPortfolio(
    schemeCode: string,
    asOf: Date,
    ctx: FactsheetFetchContext,
  ): Promise<MfFactsheetResult<PortfolioRaw>> {
    // Discovery wins when installed, because it is authoritative about the
    // month-end day; the constructed URL is the unattended fallback.
    const resolved =
      portfolioUrlResolver === null ? null : await portfolioUrlResolver(asOf, schemeCode);
    const url = resolved ?? ENDPOINTS.consolidatedPortfolioXlsx(asOf);

    // `schemeCode` is used verbatim as the worksheet name. SBI keys its sheets
    // by an internal SHORT code and the workbook's `Index` sheet holds the
    // `Scheme Code | Scheme Short code | Scheme Name` mapping. If the caller's
    // code is not that short code, the workbook helper fails with
    // `PORTAL_CHANGED` and lists every available sheet — the actionable
    // outcome. It never falls back to a neighbouring sheet.
    return fetchAndParsePortfolioWorkbook({
      adapterId: SBI_ADAPTER_ID,
      url,
      schemeCode,
      sheetName: schemeCode,
      asOf,
      ctx,
      parse: parseSbiPortfolio,
    });
  },
};
