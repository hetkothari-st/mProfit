/**
 * Kotak Mahindra Mutual Fund factsheet/holdings adapter — the side-effecting half.
 *
 * ===========================================================================
 * VERIFIED 2026-09-07 (live walk of kotakmf.com; one real workbook downloaded)
 * ===========================================================================
 *
 * WHAT WAS PROVEN
 *  - Kotak publishes ONE consolidated workbook, 119 sheets. It has NO `Index`
 *    sheet: the code→name map lives on a sheet literally named `Scheme`, whose
 *    headers are `Abbreviations | Scheme Name`. There is also a `Common Notes`
 *    sheet. A reader that assumes "Index" the way SBI/Nippon/ABSL do finds
 *    nothing and concludes the file is malformed.
 *  - The July-2026 workbook downloaded and parsed:
 *      https://vatseelabs-s3.kotakmf.com/FAD/Portfolios/Consolidated-SEBI-Portfolio-as-on-July-31,-2026/ConsolidatedSEBIPortfolioJuly2026.xlsx
 *    Note the LITERAL commas and hyphens in the directory segment.
 *  - Split bot protection, and it is the useful way round:
 *      * `www.kotakmf.com` sits behind RADWARE BOT MANAGER. A plain curl gets
 *        HTTP 200 — and a redirect to `https://validate.perfdrive.com/...`, so
 *        the failure does not even look like a failure. The listing call
 *        therefore needs a real browser session.
 *      * `vatseelabs-s3.kotakmf.com` (the CDN that serves the file) is NOT
 *        protected. Plain curl works. So once a URL is known, downloading it
 *        needs nothing special.
 *  - `assetmanagement.kotak.com` is NXDOMAIN. Dead, not merely moved.
 *
 * WHAT IS STILL UNPROVEN
 *  - The CDN path LOOKS constructible from (month name, month-end day, year),
 *    but that is one observation, and Kotak's own site reaches the file through
 *    the listing API rather than by building the path. Constructing it here
 *    would be a guess dressed as a fact, so this adapter does not.
 *  - The factsheet URL's "folder month is the data month, filename month is the
 *    month after" rule is likewise inferred from a single example.
 *
 * Everything checkable without the network lives in `kotak.parse.ts` and is
 * covered by fixtures.
 */

import {
  parseKotakPortfolio,
  parseKotakSchemeFacts,
  KOTAK_ADAPTER_ID,
  KOTAK_ADAPTER_VERSION,
  KOTAK_AMC_CODE,
} from './kotak.parse.js';
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
   * VERIFIED and AUTHORITATIVE: the listing behind the site's "Portfolios" tab.
   * `417` is the sub-header id for Portfolios; `option=51` selects
   * "Consolidated & Fortnightly Portfolio". Each record carries a `content`
   * field which is the CDN path, relative to `cdnBase`.
   *
   * ⚠ Behind Radware Bot Manager — a scripted GET returns 200 with a redirect
   * to validate.perfdrive.com, so callers must check that they got JSON and not
   * a challenge page. A real browser session is needed here (but not for the
   * download).
   */
  portfolioListingApi: (page = 1, pageSize = 10): string =>
    'https://www.kotakmf.com/api/kotakapi/forms/user/v1/getsubheaderList/417' +
    `?option=51&pagination=1&pageSize=${pageSize}&pageNumber=${page}`,

  /** Prefix for a listing record's `content` value. NOT bot-protected. */
  cdnBase: 'https://vatseelabs-s3.kotakmf.com/',

  /**
   * How to pick the right record: monthly and FORTNIGHTLY disclosures are
   * interleaved in the same listing, so filter on the title rather than taking
   * the newest row.
   */
  monthlyListingTitle: (asOf: Date): string =>
    `Consolidated SEBI Portfolio as on ${monthNameUtc(asOf)} <D>, ${yearUtc(asOf)}`,

  /** VERIFIED: the July-2026 file. One observation — see the header. */
  observedPortfolioFile:
    'https://vatseelabs-s3.kotakmf.com/FAD/Portfolios/' +
    'Consolidated-SEBI-Portfolio-as-on-July-31,-2026/ConsolidatedSEBIPortfolioJuly2026.xlsx',

  /**
   * VERIFIED: monthly factsheet PDF. The `/factsheet/` path is NOT bot-gated.
   * The folder month and the filename month DISAGREE — folder is the data
   * month, filename is the month after — which is why this is spelled out
   * rather than interpolated twice from one value.
   */
  factsheetPdf: (asOf: Date): string => {
    const folder = `${monthNameUtc(asOf)}_${yearUtc(asOf)}`;
    const published = new Date(Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth() + 1, 1));
    const name = `Kotak MF Factsheet ${monthNameUtc(published)} ${yearUtc(published)}.pdf`;
    return `https://www.kotakmf.com/factsheet/${folder}/${encodeURIComponent(name)}`;
  },

  /** DEAD: no DNS record as of 2026-09-07. */
  deadHost: 'assetmanagement.kotak.com (NXDOMAIN)',
} as const;

/**
 * Supplied by the caller once a browser-session listing client exists; see
 * `ENDPOINTS.portfolioListingApi`. It must return the resolved CDN URL
 * (`cdnBase` + the record's `content`).
 */
export type PortfolioUrlResolver = (asOf: Date, schemeCode: string) => Promise<string | null>;

/** Supplied by the caller once PDF text extraction exists. See `factsheetPdf`. */
export type FactsheetTextResolver = (schemeCode: string) => Promise<string | null>;

let portfolioUrlResolver: PortfolioUrlResolver | null = null;
let factsheetTextResolver: FactsheetTextResolver | null = null;

/** Install (or, with `null`, remove) the listing-backed URL resolver. */
export function setKotakPortfolioUrlResolver(resolver: PortfolioUrlResolver | null): void {
  portfolioUrlResolver = resolver;
}

/** Install (or, with `null`, remove) the factsheet PDF-text resolver. */
export function setKotakFactsheetTextResolver(resolver: FactsheetTextResolver | null): void {
  factsheetTextResolver = resolver;
}

export const kotakFactsheetAdapter: MfFactsheetAdapter = {
  amcCode: KOTAK_AMC_CODE,
  id: KOTAK_ADAPTER_ID,
  version: KOTAK_ADAPTER_VERSION,

  async fetchSchemeFacts(
    schemeCode: string,
    ctx: FactsheetFetchContext,
  ): Promise<MfFactsheetResult<SchemeFactsRaw>> {
    const text = factsheetTextResolver === null ? null : await factsheetTextResolver(schemeCode);
    if (text === null || text.trim().length === 0) {
      return factsheetFail(
        'PORTAL_CHANGED',
        'Kotak publishes one consolidated factsheet PDF at ' +
          'https://www.kotakmf.com/factsheet/<Month>_<YYYY>/' +
          'Kotak MF Factsheet <MonthAfter> <YYYY>.pdf (GET; that path is NOT ' +
          'bot-gated; note the folder month and filename month deliberately ' +
          'differ). This adapter has no PDF text extractor. Install one via ' +
          'setKotakFactsheetTextResolver().',
      );
    }
    // A consolidated factsheet states one TER per plan on one line, so the
    // parser refuses to pick between them unless told which plan this scheme
    // code is. Without this it reads both figures off the page and discards
    // them, and MfSchemeTer stays empty while AUM from the same text writes.
    const planType = ctx.schemePlanType === undefined ? null : await ctx.schemePlanType(schemeCode);
    return parseKotakSchemeFacts({ schemeCode, text, ...(planType === null ? {} : { planType }) });
  },

  async fetchPortfolio(
    schemeCode: string,
    asOf: Date,
    ctx: FactsheetFetchContext,
  ): Promise<MfFactsheetResult<PortfolioRaw>> {
    const url = portfolioUrlResolver === null ? null : await portfolioUrlResolver(asOf, schemeCode);

    // DELIBERATE typed failure. The CDN path looks buildable from one sample,
    // but Kotak's own page resolves it through the listing API, and a path
    // built from a single observation that silently 404s is the worst of both
    // worlds: it looks like a network blip and it is actually a wrong guess.
    if (url === null) {
      return factsheetFail(
        'PORTAL_CHANGED',
        'Kotak resolves its consolidated portfolio through a listing call, not a ' +
          `constructible path. Required: GET ${ENDPOINTS.portfolioListingApi()} ` +
          '(417 = "Portfolios", option 51 = "Consolidated & Fortnightly Portfolio") ' +
          'from a REAL BROWSER SESSION — www.kotakmf.com is behind Radware Bot ' +
          'Manager and answers a scripted request with HTTP 200 plus a redirect to ' +
          'validate.perfdrive.com. Monthly and fortnightly rows are interleaved, so ' +
          `filter on the title "${ENDPOINTS.monthlyListingTitle(asOf)}", then build ` +
          `the download as ${ENDPOINTS.cdnBase} + record.content (that CDN host is ` +
          'NOT bot-protected, so the download itself needs no session) and hand it ' +
          `back via setKotakPortfolioUrlResolver(). Requested scheme: ${schemeCode}.`,
      );
    }

    // Consolidated workbook keyed by Kotak's abbreviation. The mapping is on the
    // sheet named `Scheme` (`Abbreviations | Scheme Name`) — Kotak has no
    // `Index` sheet.
    return fetchAndParsePortfolioWorkbook({
      adapterId: KOTAK_ADAPTER_ID,
      url,
      schemeCode,
      sheetName: schemeCode,
      asOf,
      ctx,
      parse: parseKotakPortfolio,
    });
  },
};
