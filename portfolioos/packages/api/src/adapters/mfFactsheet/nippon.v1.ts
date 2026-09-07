/**
 * Nippon India Mutual Fund factsheet/holdings adapter — the side-effecting half.
 *
 * ===========================================================================
 * VERIFIED 2026-09-07 (live walk of mf.nipponindiaim.com; one file downloaded)
 * ===========================================================================
 *
 * WHAT WAS PROVEN
 *  - Nippon publishes ONE consolidated workbook: 108 sheets — an `Index` sheet
 *    plus one per scheme, keyed by a TWO-CHARACTER internal code (`GF`, `GS`).
 *  - The July-2026 file downloaded and parsed:
 *      https://mf.nipponindiaim.com/InvestorServices/FactsheetsDocuments/NIMF-MONTHLY-PORTFOLIO-31-July-26.xls
 *    Its extension says `.xls` but its first bytes are `PK\x03\x04` — it is a
 *    real XLSX wearing the wrong suffix. SheetJS sniffs the content, so this is
 *    harmless here; it matters if anyone ever branches on the extension.
 *  - `ENDPOINTS.disclosureLanding` carries every historical link as a STATIC
 *    `<a href>` in server-rendered HTML — no JS, so a plain GET plus a link
 *    scrape is enough.
 *
 * WHAT IS STILL UNPROVEN / NOT CONSTRUCTIBLE
 *  - The filename is hand-authored and its shape changes month to month.
 *    Observed across the archive: `-30-Jun-26`, `-31-May-26`, `-30-April-26`
 *    (full month name), `-Nov-25` (NO DAY AT ALL) and
 *    `NIMF_MONTHLY_PORTFOLIO_31-Jan-25` (underscores instead of hyphens).
 *    Five different conventions is not a pattern; it is a scrape.
 *  - The factsheet path DID change shape at a known boundary and is built
 *    below — but the boundary itself was observed, not documented, so treat
 *    `factsheetPdf` as verified only either side of one cutover.
 *
 * Everything checkable without the network lives in `nippon.parse.ts` and is
 * covered by fixtures.
 */

import {
  parseNipponPortfolio,
  parseNipponSchemeFacts,
  NIPPON_ADAPTER_ID,
  NIPPON_ADAPTER_VERSION,
  NIPPON_AMC_CODE,
} from './nippon.parse.js';
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
   * VERIFIED and AUTHORITATIVE: static, server-rendered page listing every
   * monthly portfolio file Nippon has ever published. GET, then scrape hrefs.
   */
  disclosureLanding:
    'https://mf.nipponindiaim.com/investor-service/downloads/factsheet-portfolio-and-other-disclosures',

  /** VERIFIED: the July-2026 consolidated workbook. One observation, not a rule. */
  observedPortfolioFile:
    'https://mf.nipponindiaim.com/InvestorServices/FactsheetsDocuments/NIMF-MONTHLY-PORTFOLIO-31-July-26.xls',

  /**
   * The naming variants seen in the archive, kept verbatim so nobody
   * "simplifies" the scrape into a template again.
   */
  observedNamingVariants: [
    'NIMF-MONTHLY-PORTFOLIO-31-July-26.xls',
    'NIMF-MONTHLY-PORTFOLIO-30-Jun-26.xls',
    'NIMF-MONTHLY-PORTFOLIO-31-May-26.xls',
    'NIMF-MONTHLY-PORTFOLIO-30-April-26.xls',
    'NIMF-MONTHLY-PORTFOLIO-Nov-25.xls (no day)',
    'NIMF_MONTHLY_PORTFOLIO_31-Jan-25.xls (underscores)',
  ] as const,

  /**
   * VERIFIED: monthly factsheet PDF. Nippon moved both the directory and the
   * month casing at April 2026 — `/FactSheetsDocuments/` with an UPPERCASE
   * month from Apr-2026 on, `/FactSheets/` with a Title-case month before it.
   */
  factsheetPdf: (asOf: Date): string => {
    const month = monthNameUtc(asOf);
    const year = yearUtc(asOf);
    const movedAt = Date.UTC(2026, 3, 1); // 2026-04-01, the observed cutover.
    return asOf.getTime() >= movedAt
      ? `https://mf.nipponindiaim.com/InvestorServices/FactSheetsDocuments/Nippon-FS-${month.toUpperCase()}-${year}.pdf`
      : `https://mf.nipponindiaim.com/InvestorServices/FactSheets/Nippon-FS-${month}-${year}.pdf`;
  },
} as const;

/**
 * Supplied by the caller once a scraper for `disclosureLanding` exists. It must
 * return the direct consolidated-workbook URL for this month.
 */
export type PortfolioUrlResolver = (asOf: Date, schemeCode: string) => Promise<string | null>;

/** Supplied by the caller once PDF text extraction exists. See `factsheetPdf`. */
export type FactsheetTextResolver = (schemeCode: string) => Promise<string | null>;

let portfolioUrlResolver: PortfolioUrlResolver | null = null;
let factsheetTextResolver: FactsheetTextResolver | null = null;

/** Install (or, with `null`, remove) the scrape-backed URL resolver. */
export function setNipponPortfolioUrlResolver(resolver: PortfolioUrlResolver | null): void {
  portfolioUrlResolver = resolver;
}

/** Install (or, with `null`, remove) the factsheet PDF-text resolver. */
export function setNipponFactsheetTextResolver(resolver: FactsheetTextResolver | null): void {
  factsheetTextResolver = resolver;
}

export const nipponFactsheetAdapter: MfFactsheetAdapter = {
  amcCode: NIPPON_AMC_CODE,
  id: NIPPON_ADAPTER_ID,
  version: NIPPON_ADAPTER_VERSION,

  async fetchSchemeFacts(
    schemeCode: string,
    _ctx: FactsheetFetchContext,
  ): Promise<MfFactsheetResult<SchemeFactsRaw>> {
    const text = factsheetTextResolver === null ? null : await factsheetTextResolver(schemeCode);
    if (text === null || text.trim().length === 0) {
      return factsheetFail(
        'PORTAL_CHANGED',
        'Nippon publishes one consolidated factsheet PDF — from Apr-2026 at ' +
          'https://mf.nipponindiaim.com/InvestorServices/FactSheetsDocuments/' +
          'Nippon-FS-<MONTH-UPPERCASE>-<YYYY>.pdf, before that under ' +
          '/InvestorServices/FactSheets/ with a Title-case month. This adapter ' +
          'has no PDF text extractor. Install one via ' +
          'setNipponFactsheetTextResolver().',
      );
    }
    return parseNipponSchemeFacts({ schemeCode, text });
  },

  async fetchPortfolio(
    schemeCode: string,
    asOf: Date,
    ctx: FactsheetFetchContext,
  ): Promise<MfFactsheetResult<PortfolioRaw>> {
    const url = portfolioUrlResolver === null ? null : await portfolioUrlResolver(asOf, schemeCode);

    // DELIBERATE typed failure. Six months of Nippon filenames use five
    // different conventions, so any constructed URL is a coin flip — and a
    // wrong one 404s, which reads as a transient fetch fault and gets retried
    // forever instead of fixed once.
    if (url === null) {
      return factsheetFail(
        'PORTAL_CHANGED',
        'Nippon names its monthly portfolio file by hand and the convention ' +
          `changes month to month (${ENDPOINTS.observedNamingVariants.join('; ')}), ` +
          `so it is not constructible. Required: GET ${ENDPOINTS.disclosureLanding} ` +
          '(static server-rendered HTML, every historical link is a plain <a href>), ' +
          'pick the row for this month, and hand the direct URL back via ' +
          `setNipponPortfolioUrlResolver(). Requested scheme: ${schemeCode}.`,
      );
    }

    // Consolidated workbook: the scheme lives on a sheet named with Nippon's
    // two-character internal code, and the `Index` sheet holds the mapping. A
    // code that is not a sheet name fails with `PORTAL_CHANGED` listing all 108
    // sheet names rather than falling through to a neighbouring scheme.
    return fetchAndParsePortfolioWorkbook({
      adapterId: NIPPON_ADAPTER_ID,
      url,
      schemeCode,
      sheetName: schemeCode,
      asOf,
      ctx,
      parse: parseNipponPortfolio,
    });
  },
};
