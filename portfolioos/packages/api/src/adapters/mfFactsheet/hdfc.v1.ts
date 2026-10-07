/**
 * HDFC Mutual Fund factsheet/holdings adapter — the side-effecting half.
 *
 * ===========================================================================
 * VERIFIED 2026-09-07 (live walk of hdfcfund.com; one real disclosure fetched)
 * ===========================================================================
 *
 * WHAT WAS PROVEN
 *  - HDFC publishes ONE FILE PER SCHEME. There is no consolidated workbook.
 *  - The landing page `ENDPOINTS.monthlyPortfolioLanding` is SERVER-RENDERED:
 *    all ~109 `.xlsx` links are present in the HTML, no JS execution needed.
 *    So discovery is a page scrape, not an API call.
 *  - File URLs look like
 *      https://files.hdfcfund.com/s3fs-public/<YYYY-MM>/Monthly HDFC <Scheme Name> - <DD Month YYYY>.xlsx
 *    where the two dates DISAGREE ON PURPOSE: the folder is the PUBLICATION
 *    month (`2026-08`) and the filename carries the DATA date (`31 July 2026`).
 *  - The scheme-name strings are hand-typed and quirky. Observed:
 *      "Monthly HDFC Banking  Financial Services Fund" — the ampersand is
 *      DROPPED and the resulting double space is KEPT;
 *      "Monthly HDFC ELSS Tax saver" — lowercase "saver".
 *    Which is exactly why this is a scrape and not a template.
 *
 *  - ⚠ AKAMAI BOT PROTECTION, and it applies to BOTH `www.hdfcfund.com` and
 *    `files.hdfcfund.com`. A plain curl gets HTTP 403 even with a browser
 *    User-Agent. Getting through needs the full browser header set — see
 *    `ENDPOINTS.requiredBrowserHeaders` — plus a `Referer` on the file CDN.
 *    `FactsheetFetchContext` exposes no header hook, so the INJECTED fetcher
 *    must add them; this adapter cannot. A 403 surfacing here as
 *    `FETCH_FAILED` almost always means the caller's fetcher is missing them,
 *    not that HDFC is down.
 *
 * WHAT IS STILL UNPROVEN
 *  - How many sheets a per-scheme workbook carries. Sheet 0 is used, which is
 *    right for a single-sheet file and would silently read the wrong sheet if
 *    HDFC ever ships two. Re-verify before trusting a multi-sheet file.
 *  - The factsheet PDF filename carries a Drupal dedupe suffix ("_1") that is
 *    NOT derivable, so the factsheet is a scrape too.
 *
 * Everything checkable without the network lives in `hdfc.parse.ts` and is
 * covered by fixtures.
 */

import {
  parseHdfcPortfolio,
  parseHdfcSchemeFacts,
  HDFC_ADAPTER_ID,
  HDFC_ADAPTER_VERSION,
  HDFC_AMC_CODE,
} from './hdfc.parse.js';
import { factsheetFail } from './types.js';
import { fetchAndParsePortfolioWorkbook } from './v1Support.js';
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
   * VERIFIED and AUTHORITATIVE: server-rendered listing of every scheme's
   * monthly portfolio workbook. GET, then read the `<a href>` set.
   */
  monthlyPortfolioLanding: 'https://www.hdfcfund.com/statutory-disclosure/portfolio/monthly-portfolio',

  /** VERIFIED: server-rendered listing of the monthly factsheet PDFs. */
  factsheetLanding: 'https://www.hdfcfund.com/mutual-funds/factsheets',

  /**
   * The OBSERVED file shape. Documentation only — deliberately NOT a builder,
   * because two of its three inputs are unguessable (a publication month that
   * differs from the data month, and a hand-typed scheme-name string that drops
   * ampersands and keeps the double space they leave behind).
   */
  observedPortfolioFilePattern:
    'https://files.hdfcfund.com/s3fs-public/<YYYY-MM publication>/' +
    'Monthly HDFC <Scheme Name as HDFC types it> - <DD Month YYYY data date>.xlsx',

  /** One observed factsheet, showing the non-derivable Drupal "_1" suffix. */
  observedFactsheetPdf:
    'https://files.hdfcfund.com/s3fs-public/2026-08/HDFC%20MF%20Factsheet%20-%20July%202026_1.pdf',

  /**
   * The headers Akamai requires. The injected fetcher must send these on BOTH
   * hosts; the file CDN additionally wants a `Referer` pointing at the landing
   * page it was linked from.
   */
  requiredBrowserHeaders: [
    'User-Agent (a real browser UA)',
    'Accept',
    'Accept-Language',
    'Upgrade-Insecure-Requests',
    'Sec-Fetch-Dest',
    'Sec-Fetch-Mode',
    'Sec-Fetch-Site',
    'Sec-Fetch-User',
    'sec-ch-ua, sec-ch-ua-mobile, sec-ch-ua-platform',
    'Referer (files.hdfcfund.com only)',
  ] as const,
} as const;

/**
 * Supplied by the caller once a scraper for `monthlyPortfolioLanding` exists.
 * It must return the direct `files.hdfcfund.com` `.xlsx` URL for this scheme
 * and month, matched against the scraped link text.
 */
export type PortfolioUrlResolver = (asOf: Date, schemeCode: string) => Promise<string | null>;

/** Supplied by the caller once PDF text extraction exists. See `factsheetLanding`. */
export type FactsheetTextResolver = (schemeCode: string) => Promise<string | null>;

let portfolioUrlResolver: PortfolioUrlResolver | null = null;
let factsheetTextResolver: FactsheetTextResolver | null = null;

/** Install (or, with `null`, remove) the scrape-backed URL resolver. */
export function setHdfcPortfolioUrlResolver(resolver: PortfolioUrlResolver | null): void {
  portfolioUrlResolver = resolver;
}

/** Install (or, with `null`, remove) the factsheet PDF-text resolver. */
export function setHdfcFactsheetTextResolver(resolver: FactsheetTextResolver | null): void {
  factsheetTextResolver = resolver;
}

export const hdfcFactsheetAdapter: MfFactsheetAdapter = {
  amcCode: HDFC_AMC_CODE,
  id: HDFC_ADAPTER_ID,
  version: HDFC_ADAPTER_VERSION,

  async fetchSchemeFacts(
    schemeCode: string,
    ctx: FactsheetFetchContext,
  ): Promise<MfFactsheetResult<SchemeFactsRaw>> {
    const text = factsheetTextResolver === null ? null : await factsheetTextResolver(schemeCode);
    if (text === null || text.trim().length === 0) {
      return factsheetFail(
        'PORTAL_CHANGED',
        'HDFC factsheets are consolidated PDFs whose filenames carry a Drupal ' +
          `dedupe suffix ("_1") that cannot be derived, so they must be scraped ` +
          `from ${ENDPOINTS.factsheetLanding} (GET, with the Akamai browser ` +
          `headers: ${ENDPOINTS.requiredBrowserHeaders.join(', ')}) and then text- ` +
          'extracted. This adapter does neither. Install a resolver via ' +
          'setHdfcFactsheetTextResolver().',
      );
    }
    // A consolidated factsheet states one TER per plan on one line, so the
    // parser refuses to pick between them unless told which plan this scheme
    // code is. Without this it reads both figures off the page and discards
    // them, and MfSchemeTer stays empty while AUM from the same text writes.
    const planType = ctx.schemePlanType === undefined ? null : await ctx.schemePlanType(schemeCode);
    return parseHdfcSchemeFacts({ schemeCode, text, ...(planType === null ? {} : { planType }) });
  },

  async fetchPortfolio(
    schemeCode: string,
    asOf: Date,
    ctx: FactsheetFetchContext,
  ): Promise<MfFactsheetResult<PortfolioRaw>> {
    const url = portfolioUrlResolver === null ? null : await portfolioUrlResolver(asOf, schemeCode);

    // DELIBERATE typed failure. HDFC's filenames are hand-typed per scheme and
    // the folder month differs from the data month, so any URL this adapter
    // could construct would be a guess — and a guessed URL that 404s reads as a
    // transient network fault, which is the one diagnosis that makes an
    // operator wait instead of act. Naming the scrape is the honest answer.
    if (url === null) {
      return factsheetFail(
        'PORTAL_CHANGED',
        'HDFC publishes one workbook per scheme with a hand-typed filename ' +
          '(ampersands dropped, double spaces kept, inconsistent casing) under a ' +
          'PUBLICATION-month folder that differs from the data month, so the URL ' +
          `is not constructible. Required: GET ${ENDPOINTS.monthlyPortfolioLanding} ` +
          '(server-rendered, all ~109 .xlsx links are in the HTML) with the Akamai ' +
          `browser headers — ${ENDPOINTS.requiredBrowserHeaders.join(', ')} — then ` +
          'match this scheme by link text and hand the direct files.hdfcfund.com ' +
          'URL back via setHdfcPortfolioUrlResolver(). Shape for reference: ' +
          `${ENDPOINTS.observedPortfolioFilePattern}. Requested scheme: ${schemeCode}.`,
      );
    }

    // No `sheetName`: HDFC's per-scheme workbook was observed with the holdings
    // on the first sheet. See the header — this is the one unproven assumption
    // left in this file.
    return fetchAndParsePortfolioWorkbook({
      adapterId: HDFC_ADAPTER_ID,
      url,
      schemeCode,
      asOf,
      ctx,
      parse: parseHdfcPortfolio,
    });
  },
};
