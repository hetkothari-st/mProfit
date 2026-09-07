/**
 * DSP Mutual Fund factsheet/holdings adapter — the side-effecting half.
 *
 * ===========================================================================
 * VERIFIED 2026-09-07 (live walk of dspim.com; one real zip downloaded)
 * ===========================================================================
 *
 * WHAT WAS PROVEN
 *  - `ENDPOINTS.portfolioDisclosureLanding` is fully static server-rendered
 *    HTML with ~500 direct `<a href>` links, grouped into "Fortnightly
 *    Portfolios for Debt Schemes", "Half-Yearly", "Month End Portfolio
 *    Disclosures" and "Scheme Performance". Take links from the MONTH END
 *    section — the others are different disclosures with similar filenames.
 *  - The July-2026 download worked:
 *      https://www.dspim.com/media/pages/mandatory-disclosures/portfolio-disclosures/081d3fbd38-1786372968/monthend-portfolios_31_july_2026.zip
 *    The path segment is `<random content hash>-<upload epoch>`, so the URL is
 *    not constructible even before the filename is considered — and the
 *    filename slug is itself inconsistent month to month:
 *      monthend-portfolios_31_july_2026.zip
 *      monthend-portfolios_30-april-2026.zip
 *      monthend-portfolio-31march2026.zip     (singular, no separators)
 *      monthend-portfolio-november-2025.zip   (no day at all)
 *  - The zip holds exactly TWO workbooks, split by asset type:
 *      "DSP Equity FOF ISIN Portfolio as on 31 Jul 2026.xlsx" — 63 sheets
 *      "DSP ISIN DEBT Portfolio as on 31 Jul 2026.xlsx"       — 26 sheets
 *    One sheet per scheme, named with a DSP-internal short code
 *    ("Flexi Cap", "LIQUID", "SMALLCAP"). So selecting a scheme means choosing
 *    the right WORKBOOK and then the right SHEET.
 *  - The factsheet's friendly URL 307-redirects to a hashed media path. It
 *    works with redirect-following on a GET; a bare HEAD returns the 307 with
 *    no body, so probing with HEAD proves nothing.
 *
 * ⚠ DSP's factsheet does NOT carry the real TER — it points the reader at
 * https://www.dspim.com/ter instead. So a `terPct` of `null` from this AMC is
 * usually correct behaviour, not a parser gap, and the cost pillar needs that
 * separate page.
 *
 * Everything checkable without the network lives in `dsp.parse.ts` and is
 * covered by fixtures.
 */

import {
  parseDspPortfolio,
  parseDspSchemeFacts,
  DSP_ADAPTER_ID,
  DSP_ADAPTER_VERSION,
  DSP_AMC_CODE,
} from './dsp.parse.js';
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
   * VERIFIED and AUTHORITATIVE: static listing of every portfolio disclosure.
   * GET, then scrape the "Month End Portfolio Disclosures" section only.
   */
  portfolioDisclosureLanding: 'https://www.dspim.com/mandatory-disclosures/portfolio-disclosures',

  /** VERIFIED: the July-2026 zip, showing the hash-and-epoch path segment. */
  observedPortfolioZip:
    'https://www.dspim.com/media/pages/mandatory-disclosures/portfolio-disclosures/' +
    '081d3fbd38-1786372968/monthend-portfolios_31_july_2026.zip',

  /** The two members of that zip, and how they split the range. */
  zipMembers: [
    'DSP Equity FOF ISIN Portfolio as on <DD Mon YYYY>.xlsx (equity + FOF, 63 sheets)',
    'DSP ISIN DEBT Portfolio as on <DD Mon YYYY>.xlsx (debt, 26 sheets)',
  ] as const,

  /** Slug variants seen in the archive; kept so nobody re-derives a template. */
  observedNamingVariants: [
    'monthend-portfolios_31_july_2026.zip',
    'monthend-portfolios_30-april-2026.zip',
    'monthend-portfolio-31march2026.zip',
    'monthend-portfolio-november-2025.zip',
  ] as const,

  /**
   * VERIFIED: the friendly factsheet URL. It 307-redirects to a hashed media
   * path — follow redirects, and use GET; HEAD returns the 307 with no body.
   */
  factsheetPdf: (asOf: Date): string =>
    `https://www.dspim.com/downloads/dsp-factsheet-${monthNameUtc(asOf).toLowerCase()}-${yearUtc(asOf)}.pdf`,

  /** Where DSP actually publishes TER. The factsheet does not contain it. */
  terPage: 'https://www.dspim.com/ter',
} as const;

/**
 * Supplied by the caller once a scraper + unzip client exists. It must return
 * the URL of ONE EXTRACTED workbook — the equity/FOF one or the debt one,
 * whichever holds this scheme — not the zip.
 */
export type PortfolioUrlResolver = (asOf: Date, schemeCode: string) => Promise<string | null>;

/** Supplied by the caller once PDF text extraction exists. See `factsheetPdf`. */
export type FactsheetTextResolver = (schemeCode: string) => Promise<string | null>;

let portfolioUrlResolver: PortfolioUrlResolver | null = null;
let factsheetTextResolver: FactsheetTextResolver | null = null;

/** Install (or, with `null`, remove) the extracted-workbook URL resolver. */
export function setDspPortfolioUrlResolver(resolver: PortfolioUrlResolver | null): void {
  portfolioUrlResolver = resolver;
}

/** Install (or, with `null`, remove) the factsheet PDF-text resolver. */
export function setDspFactsheetTextResolver(resolver: FactsheetTextResolver | null): void {
  factsheetTextResolver = resolver;
}

export const dspFactsheetAdapter: MfFactsheetAdapter = {
  amcCode: DSP_AMC_CODE,
  id: DSP_ADAPTER_ID,
  version: DSP_ADAPTER_VERSION,

  async fetchSchemeFacts(
    schemeCode: string,
    _ctx: FactsheetFetchContext,
  ): Promise<MfFactsheetResult<SchemeFactsRaw>> {
    const text = factsheetTextResolver === null ? null : await factsheetTextResolver(schemeCode);
    if (text === null || text.trim().length === 0) {
      return factsheetFail(
        'PORTAL_CHANGED',
        'DSP publishes one consolidated factsheet PDF at ' +
          `${ENDPOINTS.factsheetPdf(new Date())} (month/year interpolated). It is a ` +
          '307 to a hashed media path, so it must be fetched with GET and redirects ' +
          'followed — a HEAD returns the 307 with no body. This adapter has no PDF ' +
          'text extractor; install a resolver via setDspFactsheetTextResolver(). ' +
          `Note that the factsheet does NOT carry the TER — DSP publishes it at ` +
          `${ENDPOINTS.terPage} — so a null terPct from this AMC is expected.`,
      );
    }
    return parseDspSchemeFacts({ schemeCode, text });
  },

  async fetchPortfolio(
    schemeCode: string,
    asOf: Date,
    ctx: FactsheetFetchContext,
  ): Promise<MfFactsheetResult<PortfolioRaw>> {
    const url = portfolioUrlResolver === null ? null : await portfolioUrlResolver(asOf, schemeCode);

    // DELIBERATE typed failure. DSP's path carries a random content hash and an
    // upload epoch, so there is nothing to construct — and even with the right
    // zip, choosing between the equity and debt workbooks is a step this
    // adapter cannot take.
    if (url === null) {
      return factsheetFail(
        'PORTAL_CHANGED',
        'DSP portfolio URLs embed a random content hash and an upload epoch ' +
          `(${ENDPOINTS.observedPortfolioZip}) and the filename slug changes month ` +
          `to month (${ENDPOINTS.observedNamingVariants.join('; ')}), so nothing here ` +
          `is constructible. Required: GET ${ENDPOINTS.portfolioDisclosureLanding} ` +
          '(static HTML, ~500 <a href> links), take the link from the "Month End ' +
          'Portfolio Disclosures" section for this month, download the zip and ' +
          `extract the workbook that holds this scheme — ${ENDPOINTS.zipMembers.join(' | ')} ` +
          '— then hand that URL back via setDspPortfolioUrlResolver(). Requested ' +
          `scheme: ${schemeCode}.`,
      );
    }

    // One sheet per scheme, named with DSP's internal short code ("Flexi Cap",
    // "LIQUID", "SMALLCAP"). A code that is not a sheet name fails with
    // `PORTAL_CHANGED` listing the sheets — which also tells the operator they
    // picked the debt workbook when they wanted the equity one.
    return fetchAndParsePortfolioWorkbook({
      adapterId: DSP_ADAPTER_ID,
      url,
      schemeCode,
      sheetName: schemeCode,
      asOf,
      ctx,
      parse: parseDspPortfolio,
    });
  },
};
