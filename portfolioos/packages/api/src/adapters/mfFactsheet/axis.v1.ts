/**
 * Axis Mutual Fund factsheet/holdings adapter — the side-effecting half.
 *
 * ===========================================================================
 * VERIFIED 2026-09-07 (live walk of axismf.com; one real workbook downloaded)
 * ===========================================================================
 *
 * WHAT WAS PROVEN
 *  - Axis publishes ONE consolidated workbook, 87 sheets: an `Index` sheet plus
 *    one per scheme, keyed by an internal code (`AXIS500`, …).
 *  - The July-2026 file downloaded and parsed:
 *      https://www.axismf.com/1/5/464/560/3622/4463/Monthly_Portfolio_31_07_2026_b590bc59d9.xlsx
 *    The trailing `_b590bc59d9` is a RANDOM STRAPI CONTENT HASH. It is not
 *    derivable from anything, which is what makes this URL unconstructible —
 *    the numeric path segments are equally opaque.
 *  - The document listing that yields it is a POST API. Without the
 *    `Authorization: Bearer …` header it returns 403 ForbiddenError; the token
 *    is a 256-hex static string embedded in the site's page JS.
 *
 * WHAT IS STILL UNPROVEN / DELIBERATELY ABSENT
 *  - The Bearer token is NOT stored in this file. It is a credential scraped
 *    from someone else's page JS; hard-coding it here would put a secret in the
 *    repo (`CONTEXT.md §3.8`) and would silently rot the day Axis rotates it.
 *    The caller supplies it, along with a `browser-id` UUID.
 *  - The listing MIXES monthly with weekly and ad-hoc disclosures, and some
 *    months (August 2026, observed) carry NO monthly file at all. So a caller
 *    must filter on the label, and an empty result is `NOT_PUBLISHED`, not a
 *    defect.
 *
 * Everything checkable without the network lives in `axis.parse.ts` and is
 * covered by fixtures.
 */

import {
  parseAxisPortfolio,
  parseAxisSchemeFacts,
  AXIS_ADAPTER_ID,
  AXIS_ADAPTER_VERSION,
  AXIS_AMC_CODE,
} from './axis.parse.js';
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
   * VERIFIED and AUTHORITATIVE: the scheme-document listing. POST, JSON.
   *
   * Required headers:
   *   Content-Type: application/json
   *   Authorization: Bearer <256-hex static token from the site's page JS>
   *   browser-id: <uuid>
   * Omitting Authorization returns 403 ForbiddenError.
   */
  schemeDocumentsApi: {
    method: 'POST' as const,
    url: 'https://www.axismf.com/cms/get-scheme-documents',
    requiredHeaders: [
      'Content-Type: application/json',
      'Authorization: Bearer <256-hex token from page JS — supplied by the caller, never stored here>',
      'browser-id: <uuid>',
    ] as const,
    body: (asOf: Date): Record<string, unknown> => ({
      sdType: 'yearMonthSchemeDocs',
      sdID: 'sdMonthSchemePortfolio',
      year: yearUtc(asOf),
      month: monthNameUtc(asOf),
      schemeCode: 'Consolidated',
    }),
  },

  /** VERIFIED: the July-2026 file, showing the Strapi hash that kills templating. */
  observedPortfolioFile:
    'https://www.axismf.com/1/5/464/560/3622/4463/Monthly_Portfolio_31_07_2026_b590bc59d9.xlsx',

  /** VERIFIED: the factsheet listing. Same auth story as `schemeDocumentsApi`. */
  factsheetApi: {
    method: 'POST' as const,
    url: 'https://www.axismf.com/cms/product/factsheet',
    body: (asOf: Date): Record<string, unknown> => ({
      year: yearUtc(asOf),
      month: monthNameUtc(asOf),
    }),
  },
} as const;

/**
 * Supplied by the caller once an authenticated client for
 * `ENDPOINTS.schemeDocumentsApi` exists. It must return the direct `.xlsx` URL
 * (hash suffix and all) for the MONTHLY consolidated disclosure.
 */
export type PortfolioUrlResolver = (asOf: Date, schemeCode: string) => Promise<string | null>;

/** Supplied by the caller once PDF text extraction exists. See `factsheetApi`. */
export type FactsheetTextResolver = (schemeCode: string) => Promise<string | null>;

let portfolioUrlResolver: PortfolioUrlResolver | null = null;
let factsheetTextResolver: FactsheetTextResolver | null = null;

/** Install (or, with `null`, remove) the API-backed URL resolver. */
export function setAxisPortfolioUrlResolver(resolver: PortfolioUrlResolver | null): void {
  portfolioUrlResolver = resolver;
}

/** Install (or, with `null`, remove) the factsheet PDF-text resolver. */
export function setAxisFactsheetTextResolver(resolver: FactsheetTextResolver | null): void {
  factsheetTextResolver = resolver;
}

export const axisFactsheetAdapter: MfFactsheetAdapter = {
  amcCode: AXIS_AMC_CODE,
  id: AXIS_ADAPTER_ID,
  version: AXIS_ADAPTER_VERSION,

  async fetchSchemeFacts(
    schemeCode: string,
    _ctx: FactsheetFetchContext,
  ): Promise<MfFactsheetResult<SchemeFactsRaw>> {
    const text = factsheetTextResolver === null ? null : await factsheetTextResolver(schemeCode);
    if (text === null || text.trim().length === 0) {
      return factsheetFail(
        'PORTAL_CHANGED',
        'Axis exposes factsheets only through an authenticated listing: POST ' +
          `${ENDPOINTS.factsheetApi.url} with ` +
          `${JSON.stringify(ENDPOINTS.factsheetApi.body(new Date()))} and headers ` +
          `${ENDPOINTS.schemeDocumentsApi.requiredHeaders.join(', ')}; the result is ` +
          'a PDF. This adapter holds no token and has no PDF text extractor. ' +
          'Install a resolver via setAxisFactsheetTextResolver().',
      );
    }
    return parseAxisSchemeFacts({ schemeCode, text });
  },

  async fetchPortfolio(
    schemeCode: string,
    asOf: Date,
    ctx: FactsheetFetchContext,
  ): Promise<MfFactsheetResult<PortfolioRaw>> {
    const url = portfolioUrlResolver === null ? null : await portfolioUrlResolver(asOf, schemeCode);

    // DELIBERATE typed failure. The filename ends in a random Strapi content
    // hash, so there is no URL to guess at — and pretending otherwise would
    // produce a 404 that reads as a transient fetch fault rather than as
    // "nobody has built the listing client yet".
    if (url === null) {
      return factsheetFail(
        'PORTAL_CHANGED',
        'Axis file URLs end in a random Strapi content hash ' +
          `(${ENDPOINTS.observedPortfolioFile}) and are not constructible. ` +
          `Required: POST ${ENDPOINTS.schemeDocumentsApi.url} with body ` +
          `${JSON.stringify(ENDPOINTS.schemeDocumentsApi.body(asOf))} and headers ` +
          `${ENDPOINTS.schemeDocumentsApi.requiredHeaders.join(', ')} — without the ` +
          'Authorization header it returns 403 ForbiddenError. The response mixes ' +
          'monthly with weekly/ad-hoc files and some months have no monthly file at ' +
          'all, so filter on the label; then hand the direct .xlsx URL back via ' +
          `setAxisPortfolioUrlResolver(). Requested scheme: ${schemeCode}.`,
      );
    }

    // Consolidated workbook: `Index` sheet plus one sheet per scheme, keyed by
    // Axis's internal code (e.g. AXIS500).
    return fetchAndParsePortfolioWorkbook({
      adapterId: AXIS_ADAPTER_ID,
      url,
      schemeCode,
      sheetName: schemeCode,
      asOf,
      ctx,
      parse: parseAxisPortfolio,
    });
  },
};
