/**
 * Aditya Birla Sun Life Mutual Fund factsheet/holdings adapter — the
 * side-effecting half.
 *
 * ===========================================================================
 * VERIFIED 2026-09-07 (live walk of mutualfund.adityabirlacapital.com)
 * ===========================================================================
 *
 * WHAT WAS PROVEN
 *  - Discovery is a Sitecore accordion API — `ENDPOINTS.monthlyPortfolioApi`.
 *    Its `&month= &year=0` parameters are MANDATORY: drop them and it answers
 *    HTTP 500 / "404 ERROR" rather than defaulting to the latest month.
 *  - ⚠ THE API RETURNS A DEAD HOST. Each record's `pdfUrl` points at
 *    `https://abcscprod.azureedge.net/…` — Azure CDN classic has been retired
 *    and that hostname no longer resolves. Swap the HOST for
 *    `mutualfund.adityabirlacapital.com` and KEEP THE PATH and it is 200 OK.
 *    This is the single least obvious fact in this file; see
 *    `rewriteDeadCdnHost`.
 *  - The July-2026 download worked:
 *      https://mutualfund.adityabirlacapital.com/-/media/bsl/files/resources/monthly-portfolio/2026/absl_monthly_portfolio_report_july--2026.zip
 *    Note the DOUBLE hyphen before the year; other months use entirely
 *    different filenames, so this is not a template.
 *  - The zip holds exactly ONE file, `ABSL_Monthly_Portfolio_Report_July
 *    2026.xls`, which is a legacy OLE2/BIFF8 workbook (magic
 *    `D0CF11E0A1B11AE1`), NOT an xlsx-in-a-zip. SheetJS reads it fine, so no
 *    special handling is needed once it is out of the archive.
 *  - 106 sheets: an `Index` sheet (`Scheme Code | Scheme Short code | Scheme
 *    Name`) plus 105 scheme sheets keyed by SHORT CODE (`BSL95F`, `ADVG`, …).
 *
 * WHAT IS NOT IMPLEMENTED
 *  - Both the discovery call and the unzip. This adapter family has neither, so
 *    `fetchPortfolio` returns a typed failure naming them rather than guessing
 *    a URL — see the comment on the failure itself.
 *
 * Everything checkable without the network lives in `absl.parse.ts` and is
 * covered by fixtures.
 */

import {
  parseAbslPortfolio,
  parseAbslSchemeFacts,
  ABSL_ADAPTER_ID,
  ABSL_ADAPTER_VERSION,
  ABSL_AMC_CODE,
} from './absl.parse.js';
import { factsheetFail } from './types.js';
import { fetchAndParsePortfolioWorkbook } from './v1Support.js';
import type {
  FactsheetFetchContext,
  MfFactsheetAdapter,
  MfFactsheetResult,
  PortfolioRaw,
  SchemeFactsRaw,
} from './types.js';

/** The host ABSL's own API still advertises, and which no longer resolves. */
const DEAD_CDN_HOST = 'abcscprod.azureedge.net';
/** The host that serves the same paths today. */
const LIVE_HOST = 'mutualfund.adityabirlacapital.com';

/** Live endpoints as observed on 2026-09-07. */
export const ENDPOINTS = {
  /**
   * VERIFIED and AUTHORITATIVE: the Monthly Portfolio accordion. GET.
   *
   * `id` is the accordion GUID (Monthly Portfolio); `ctype` is a URL-encoded
   * Sitecore content path; `month=%20` (a single space) and `year=0` are
   * required placeholders — omitting either returns HTTP 500 / "404 ERROR".
   */
  monthlyPortfolioApi:
    'https://mutualfund.adityabirlacapital.com/postlogin/CustomApi/Resources/FactsheetAccordionById' +
    '?id=3ccab227-9de5-4494-b78d-2b4f7c0c054a' +
    '&ctype=%2Fsitecore%2Fcontent%2FRoot%2FBSL%2FLibrary%2FLists%2FFAQ%2FCustomer%20Types%2FIndividual' +
    '&month=%20&year=0',

  /** Accordion GUID for the Monthly Portfolio list. */
  monthlyPortfolioAccordionId: '3ccab227-9de5-4494-b78d-2b4f7c0c054a',

  /**
   * The "Empower" factsheet uses the SAME API with a different accordion GUID —
   * one per year. Only 2026's was observed. Note also that ABSL's factsheet
   * FILENAME month is off by one: `absl-factsheet_aug-2026.pdf` holds the
   * 31-July data.
   */
  factsheetAccordionIdByYear: { '2026': '12cd6fed-904e-4380-879e-4d5407a78b41' } as Readonly<
    Record<string, string>
  >,

  /** VERIFIED: the July-2026 zip. One observation — the naming is not a rule. */
  observedPortfolioZip:
    'https://mutualfund.adityabirlacapital.com/-/media/bsl/files/resources/monthly-portfolio/2026/' +
    'absl_monthly_portfolio_report_july--2026.zip',

  /** The zip's single member, for reference. Legacy OLE2/BIFF8 despite the era. */
  observedZipMember: 'ABSL_Monthly_Portfolio_Report_July 2026.xls (OLE2/BIFF8)',

  deadCdnHost: `${DEAD_CDN_HOST} (Azure CDN classic, retired — NXDOMAIN)`,
} as const;

/**
 * Repair a URL the ABSL API hands back.
 *
 * Exported because every caller of `monthlyPortfolioApi` needs it and it is the
 * kind of fix that gets rediscovered painfully: the API's `pdfUrl` is not
 * merely stale, its host does not resolve at all, so the failure arrives as a
 * DNS error rather than a 404 and reads like a network outage.
 */
export function rewriteDeadCdnHost(url: string): string {
  return url.replace(`://${DEAD_CDN_HOST}/`, `://${LIVE_HOST}/`);
}

/**
 * Supplied by the caller once a discovery + unzip client exists. It must return
 * the URL of the EXTRACTED `.xls` (the zip's single member), not the zip.
 */
export type PortfolioUrlResolver = (asOf: Date, schemeCode: string) => Promise<string | null>;

/** Supplied by the caller once PDF text extraction exists. */
export type FactsheetTextResolver = (schemeCode: string) => Promise<string | null>;

let portfolioUrlResolver: PortfolioUrlResolver | null = null;
let factsheetTextResolver: FactsheetTextResolver | null = null;

/** Install (or, with `null`, remove) the extracted-workbook URL resolver. */
export function setAbslPortfolioUrlResolver(resolver: PortfolioUrlResolver | null): void {
  portfolioUrlResolver = resolver;
}

/** Install (or, with `null`, remove) the factsheet PDF-text resolver. */
export function setAbslFactsheetTextResolver(resolver: FactsheetTextResolver | null): void {
  factsheetTextResolver = resolver;
}

export const abslFactsheetAdapter: MfFactsheetAdapter = {
  amcCode: ABSL_AMC_CODE,
  id: ABSL_ADAPTER_ID,
  version: ABSL_ADAPTER_VERSION,

  async fetchSchemeFacts(
    schemeCode: string,
    _ctx: FactsheetFetchContext,
  ): Promise<MfFactsheetResult<SchemeFactsRaw>> {
    const text = factsheetTextResolver === null ? null : await factsheetTextResolver(schemeCode);
    if (text === null || text.trim().length === 0) {
      return factsheetFail(
        'PORTAL_CHANGED',
        'ABSL exposes its "Empower" factsheet through the same Sitecore accordion ' +
          `API as the portfolio (${ENDPOINTS.monthlyPortfolioApi}), with a ` +
          'per-YEAR accordion GUID in place of the id — 2026 is ' +
          `${ENDPOINTS.factsheetAccordionIdByYear['2026'] ?? 'unknown'}. The pdfUrl ` +
          `it returns points at the dead host ${ENDPOINTS.deadCdnHost}; swap the ` +
          'host for mutualfund.adityabirlacapital.com and keep the path (see ' +
          'rewriteDeadCdnHost). The result is a PDF and this adapter has no text ' +
          'extractor. Install a resolver via setAbslFactsheetTextResolver(). Note ' +
          'the filename month is off by one: absl-factsheet_aug-2026.pdf holds the ' +
          '31-July data.',
      );
    }
    return parseAbslSchemeFacts({ schemeCode, text });
  },

  async fetchPortfolio(
    schemeCode: string,
    asOf: Date,
    ctx: FactsheetFetchContext,
  ): Promise<MfFactsheetResult<PortfolioRaw>> {
    const url = portfolioUrlResolver === null ? null : await portfolioUrlResolver(asOf, schemeCode);

    // DELIBERATE typed failure. ABSL's filenames vary month to month (July's
    // carries a double hyphen no other month has), so a constructed URL is a
    // guess; and even the right URL is a zip nothing here can open. Failing
    // with the recipe beats a 404 that reads as a transient fetch fault.
    if (url === null) {
      return factsheetFail(
        'PORTAL_CHANGED',
        'ABSL needs a discovery call and an unzip, neither of which this adapter ' +
          `implements. Required: GET ${ENDPOINTS.monthlyPortfolioApi} — the ` +
          '"&month= &year=0" placeholders are MANDATORY, without them it returns ' +
          'HTTP 500 / "404 ERROR". Then repair the returned pdfUrl: its host ' +
          `${ENDPOINTS.deadCdnHost} no longer resolves, so swap it for ` +
          `${LIVE_HOST} keeping the path (rewriteDeadCdnHost does exactly this). ` +
          `Download the zip (e.g. ${ENDPOINTS.observedPortfolioZip}), extract its ` +
          `single member (${ENDPOINTS.observedZipMember}) and hand that URL back ` +
          'via setAbslPortfolioUrlResolver(). The scheme then lives on a sheet ' +
          'named with ABSL\'s SHORT code; the workbook\'s `Index` sheet maps ' +
          `Scheme Code | Scheme Short code | Scheme Name. Requested: ${schemeCode}.`,
      );
    }

    // Consolidated workbook, 106 sheets, keyed by ABSL's short code.
    return fetchAndParsePortfolioWorkbook({
      adapterId: ABSL_ADAPTER_ID,
      url,
      schemeCode,
      sheetName: schemeCode,
      asOf,
      ctx,
      parse: parseAbslPortfolio,
    });
  },
};
