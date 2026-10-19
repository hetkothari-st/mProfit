/**
 * Mirae Asset Mutual Fund factsheet/holdings adapter — the side-effecting half.
 *
 * ===========================================================================
 * VERIFIED 2026-09-07 (live walk of miraeassetmf.co.in; one workbook opened)
 * ===========================================================================
 *
 * WHAT WAS PROVEN
 *  - Mirae publishes ONE FILE PER SCHEME, and each workbook has EXACTLY ONE
 *    sheet, named with the scheme's internal code (e.g. `MASCF`).
 *  - Discovery is a JSON POST — `ENDPOINTS.downloadsApi`. The response is
 *    `{"Data":[{Id,Title,URL,PublishDate,…}],"DataCount":3616}`, where
 *    `PublishDate` is the ASP.NET `/Date(ms)/` form, not ISO.
 *  - File URLs look like
 *      https://www.miraeassetmf.co.in/docs/default-source/portfolios/<schemeSlug>-<month><year>.xlsx
 *    e.g. `mascf-july2026.xlsx`.
 *
 * WHY THAT URL IS STILL NOT CONSTRUCTIBLE
 *  `<schemeSlug>` is a Mirae-internal abbreviation — `mascf`, `mdbf`, `evetf` —
 *  with no derivation from the scheme name, the AMFI code or the ISIN. It has
 *  to be READ from the discovery response. The month/year half of the filename
 *  is guessable; the half that identifies the fund is not, and getting it wrong
 *  either 404s or, worse, fetches a different fund's file.
 *
 * WHAT IS STILL UNPROVEN
 *  - Whether the slug is stable for a scheme across months. Treat the discovery
 *    response as authoritative per month rather than caching a slug forever.
 *
 * Everything checkable without the network lives in `mirae.parse.ts` and is
 * covered by fixtures.
 */

import {
  parseMiraePortfolio,
  parseMiraeSchemeFacts,
  MIRAE_ADAPTER_ID,
  MIRAE_ADAPTER_VERSION,
  MIRAE_AMC_CODE,
} from './mirae.parse.js';
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
   * VERIFIED and AUTHORITATIVE: the downloads listing. POST, JSON, no auth.
   *
   * `modulename` selects the disclosure family:
   *   portfolio_tab1 → MONTHLY, portfolio_tab2 → half-yearly,
   *   portfolio_tab3 → fortnightly, Factsheet → the monthly factsheet PDFs.
   * Note the capital F on `Factsheet`: the `fact_tab1` ids that appear in the
   * page HTML are not valid module names.
   */
  downloadsApi: {
    method: 'POST' as const,
    url: 'https://www.miraeassetmf.co.in/AjaxService/GetDownloadsData',
    contentType: 'application/json;charset=utf-8',
    body: (moduleName: string, page = 1, pageSize = 12): Record<string, unknown> => ({
      request: { modulename: moduleName, pgno: page, pgsize: pageSize },
    }),
    modules: {
      monthlyPortfolio: 'portfolio_tab1',
      halfYearlyPortfolio: 'portfolio_tab2',
      fortnightlyPortfolio: 'portfolio_tab3',
      factsheet: 'Factsheet',
    } as const,
    responseShape: '{"Data":[{Id,Title,URL,PublishDate}],"DataCount":n}; PublishDate is /Date(ms)/',
  },

  /**
   * The observed file shape. Deliberately takes the slug as an ARGUMENT rather
   * than deriving it — see the header. Callers pass what discovery told them.
   */
  portfolioXlsx: (schemeSlug: string, asOf: Date): string =>
    'https://www.miraeassetmf.co.in/docs/default-source/portfolios/' +
    `${schemeSlug}-${monthNameUtc(asOf).toLowerCase()}${yearUtc(asOf)}.xlsx`,

  /**
   * VERIFIED: the factsheet PDF path, including Mirae's misspelled directory
   * ("fachsheet") and the TRIPLE hyphen before the month. There is a
   * `passive-factsheet---` sibling for the index/ETF range.
   */
  observedFactsheetPdf:
    'https://www.miraeassetmf.co.in/docs/default-source/fachsheet/active-factsheet---july-2026.pdf',
} as const;

/**
 * Supplied by the caller once a discovery client exists; see
 * `ENDPOINTS.downloadsApi`. It must return the direct per-scheme `.xlsx` URL
 * read out of the listing — the scheme slug cannot be derived here.
 */
export type PortfolioUrlResolver = (asOf: Date, schemeCode: string) => Promise<string | null>;

/** Supplied by the caller once PDF text extraction exists. */
export type FactsheetTextResolver = (schemeCode: string) => Promise<string | null>;

let portfolioUrlResolver: PortfolioUrlResolver | null = null;
let factsheetTextResolver: FactsheetTextResolver | null = null;

/** Install (or, with `null`, remove) the discovery-backed URL resolver. */
export function setMiraePortfolioUrlResolver(resolver: PortfolioUrlResolver | null): void {
  portfolioUrlResolver = resolver;
}

/** Install (or, with `null`, remove) the factsheet PDF-text resolver. */
export function setMiraeFactsheetTextResolver(resolver: FactsheetTextResolver | null): void {
  factsheetTextResolver = resolver;
}

export const miraeFactsheetAdapter: MfFactsheetAdapter = {
  amcCode: MIRAE_AMC_CODE,
  id: MIRAE_ADAPTER_ID,
  version: MIRAE_ADAPTER_VERSION,

  async fetchSchemeFacts(
    schemeCode: string,
    ctx: FactsheetFetchContext,
  ): Promise<MfFactsheetResult<SchemeFactsRaw>> {
    const text = factsheetTextResolver === null ? null : await factsheetTextResolver(schemeCode);
    if (text === null || text.trim().length === 0) {
      return factsheetFail(
        'PORTAL_CHANGED',
        'Mirae lists its factsheets through the downloads API: POST ' +
          `${ENDPOINTS.downloadsApi.url} (Content-Type ` +
          `${ENDPOINTS.downloadsApi.contentType}) with body ` +
          `${JSON.stringify(ENDPOINTS.downloadsApi.body(ENDPOINTS.downloadsApi.modules.factsheet))} ` +
          '— note the capital F; the fact_tab1 ids in the page HTML are invalid. ' +
          `The result is a PDF (e.g. ${ENDPOINTS.observedFactsheetPdf}, plus a ` +
          '"passive-factsheet---" variant) and this adapter has no text extractor. ' +
          'Install a resolver via setMiraeFactsheetTextResolver().',
      );
    }
    // A consolidated factsheet states one TER per plan on one line, so the
    // parser refuses to pick between them unless told which plan this scheme
    // code is. Without this it reads both figures off the page and discards
    // them, and MfSchemeTer stays empty while AUM from the same text writes.
    const planType = ctx.schemePlanType === undefined ? null : await ctx.schemePlanType(schemeCode);
    return parseMiraeSchemeFacts({ schemeCode, text, ...(planType === null ? {} : { planType }) });
  },

  async fetchPortfolio(
    schemeCode: string,
    asOf: Date,
    ctx: FactsheetFetchContext,
  ): Promise<MfFactsheetResult<PortfolioRaw>> {
    const url = portfolioUrlResolver === null ? null : await portfolioUrlResolver(asOf, schemeCode);

    // DELIBERATE typed failure. Half of Mirae's filename is a date and half is
    // an undiscoverable internal slug; building the date half and guessing the
    // slug is how one fund's holdings end up filed under another fund's code.
    if (url === null) {
      return factsheetFail(
        'PORTAL_CHANGED',
        'Mirae file URLs embed an internal scheme slug ("mascf", "mdbf", "evetf") ' +
          'that cannot be derived from the scheme name, AMFI code or ISIN, so the ' +
          `URL is not constructible. Required: POST ${ENDPOINTS.downloadsApi.url} ` +
          `(Content-Type ${ENDPOINTS.downloadsApi.contentType}) with body ` +
          `${JSON.stringify(ENDPOINTS.downloadsApi.body(ENDPOINTS.downloadsApi.modules.monthlyPortfolio))}, ` +
          'page through Data[] (DataCount was 3616), match this scheme by Title, and ' +
          'hand the record URL back via setMiraePortfolioUrlResolver(). Shape for ' +
          `reference: ${ENDPOINTS.portfolioXlsx('<schemeSlug>', asOf)}. Requested ` +
          `scheme: ${schemeCode}.`,
      );
    }

    // No `sheetName`: a Mirae workbook holds exactly ONE sheet, named with the
    // AMC's internal code rather than the caller's scheme code, so taking sheet
    // 0 is both correct and the only option that does not need a code mapping.
    return fetchAndParsePortfolioWorkbook({
      adapterId: MIRAE_ADAPTER_ID,
      url,
      schemeCode,
      asOf,
      ctx,
      parse: parseMiraePortfolio,
    });
  },
};
