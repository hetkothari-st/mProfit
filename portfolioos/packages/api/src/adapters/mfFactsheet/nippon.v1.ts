/**
 * Nippon India Mutual Fund factsheet/holdings adapter — the side-effecting half.
 *
 * ⚠⚠ THE URLS BELOW ARE **UNVERIFIED**. ⚠⚠
 *
 * They were written from the documented shape of an AMC disclosure site, NOT
 * from a live session against nipponindiaim.com, and AMCs move these files without
 * notice. Walk the real site and correct `ENDPOINTS` before enabling this
 * adapter in production. This is the same posture — and the same explicit
 * warning — carried by `sbi.v1.ts` and `adapters/pf/epf/uanLookup.v1.ts`, for
 * the same reason: an unverified selector that LOOKS confirmed is worse than
 * one that says so, because nobody re-checks it.
 *
 * Everything that can be checked without the network lives in `nippon.parse.ts`
 * and is covered by fixtures. This file is deliberately thin: build a URL, fetch
 * it, hand the bytes to the parser. The less judgement here, the less breaks
 * when the site moves.
 *
 * Until the URLs are verified, the honest outcome of calling this against the
 * real site is `FETCH_FAILED` or `PORTAL_CHANGED` — both typed failures that
 * the DLQ records, neither of which corrupts a single row. It never throws and
 * it never fabricates a holding.
 */

import {
  parseNipponPortfolio,
  parseNipponSchemeFacts,
  NIPPON_ADAPTER_ID,
  NIPPON_ADAPTER_VERSION,
  NIPPON_AMC_CODE,
} from './nippon.parse.js';
import { fetchAndParseFacts, fetchAndParsePortfolioCsv, monthKey } from './v1Support.js';
import type {
  FactsheetFetchContext,
  MfFactsheetAdapter,
  MfFactsheetResult,
  PortfolioRaw,
  SchemeFactsRaw,
} from './types.js';

/**
 * ⚠ UNVERIFIED. Every one of these is a guess at the published shape.
 * Correct them against the live site, then bump `NIPPON_ADAPTER_VERSION`.
 */
export const ENDPOINTS = {
  /** Monthly portfolio disclosure, per scheme, per month. UNVERIFIED. */
  portfolioCsv: (schemeCode: string, month: string): string =>
    `https://mf.nipponindiaim.com/investor-service/downloads/monthly-portfolio/${month}/${schemeCode}.csv`,
  /** Scheme factsheet page. UNVERIFIED. */
  factsheet: (schemeCode: string): string =>
    `https://mf.nipponindiaim.com/funds/scheme/${schemeCode}/factsheet`,
} as const;

export const nipponFactsheetAdapter: MfFactsheetAdapter = {
  amcCode: NIPPON_AMC_CODE,
  id: NIPPON_ADAPTER_ID,
  version: NIPPON_ADAPTER_VERSION,

  async fetchSchemeFacts(
    schemeCode: string,
    ctx: FactsheetFetchContext,
  ): Promise<MfFactsheetResult<SchemeFactsRaw>> {
    return fetchAndParseFacts({
      adapterId: NIPPON_ADAPTER_ID,
      url: ENDPOINTS.factsheet(schemeCode),
      schemeCode,
      ctx,
      parse: parseNipponSchemeFacts,
    });
  },

  async fetchPortfolio(
    schemeCode: string,
    asOf: Date,
    ctx: FactsheetFetchContext,
  ): Promise<MfFactsheetResult<PortfolioRaw>> {
    return fetchAndParsePortfolioCsv({
      adapterId: NIPPON_ADAPTER_ID,
      url: ENDPOINTS.portfolioCsv(schemeCode, monthKey(asOf)),
      schemeCode,
      asOf,
      ctx,
      parse: parseNipponPortfolio,
    });
  },
};
