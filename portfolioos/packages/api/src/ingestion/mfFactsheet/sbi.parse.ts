/**
 * SBI Mutual Fund — PURE parser for the monthly portfolio disclosure and the
 * scheme factsheet.
 *
 * No Prisma, no network, no filesystem. Everything that touches the outside
 * world is in `sbi.v1.ts`.
 *
 * ===========================================================================
 * ASSUMED INPUT SHAPE  —  READ THIS BEFORE TRUSTING ANY OUTPUT
 * ===========================================================================
 *
 * ⚠ These assumptions were written from the documented/published SHAPE of a
 * SEBI monthly portfolio disclosure, not from a scraped live file. The fixtures
 * under `test/fixtures/mf/factsheet/sbi/` are synthetic-but-representative and
 * are labelled as such in that folder's README. Validate against a real
 * download before enabling this adapter in production, and when the real file
 * differs, bump `SBI_ADAPTER_VERSION` rather than editing the tested behaviour
 * in place (`CONTEXT.md §3.4`).
 *
 * ── 1. Portfolio (`parseSbiPortfolio`) ──────────────────────────────────────
 *
 * Input: the monthly portfolio workbook flattened to a grid of trimmed cells
 * (one inner array per row; ragged rows allowed). Assumed layout:
 *
 *   SBI Mutual Fund                                          <- preamble
 *   Portfolio Statement as on 31-Mar-2026                    <- as-of lives here
 *   Scheme Name: SBI Bluechip Fund
 *   (blank)
 *   Name of the Instrument | ISIN | Industry/Rating | Quantity |
 *     Market value (Rs. in Lakhs) | % to AUM | YTM % | Maturity Date   <- header
 *   EQUITY & EQUITY RELATED                                  <- section heading
 *   Listed / awaiting listing on Stock Exchanges              <- section heading
 *   HDFC Bank Limited | INE040A01034 | Banks | 1,20,000 | 2,345.67 | 5.12 | |
 *   ...
 *   Sub Total | | | | | 95.20 | |                            <- IGNORED
 *   DEBT INSTRUMENTS                                         <- section heading
 *   7.26% GOI 2033 | IN0020230028 | SOV | 50,00,000 | 4,980.10 | 2.40 | 7.11 | 22-Aug-2033
 *   CASH & CASH EQUIVALENTS                                  <- section heading
 *   TREPS / Reverse Repo | | | | 1,200.00 | 2.40 | |
 *   Net Receivables / (Payables) | | | | -95.00 | -0.19 | |
 *   Grand Total | | | | | 100.00 | |                         <- IGNORED
 *
 * Key assumptions:
 *   - Market values are quoted in LAKHS ("Rs. in Lakhs"), so they are
 *     multiplied by 1e5 before storage.
 *   - "% to AUM" is SBI's wording for what other AMCs call "% to NAV".
 *   - Section headings are rows with a name and no numbers.
 *   - Sub Total / Grand Total rows carry a weight and MUST be skipped.
 *
 * ── 2. Factsheet (`parseSbiSchemeFacts`) ────────────────────────────────────
 *
 * Input: the scheme's factsheet page as extracted text (PDF → text). Assumed
 * label wording:
 *
 *   Factsheet as on 31-Mar-2026
 *   Fund Manager: Mr. Saurabh Pant (since Sep 2016)
 *   AUM as on March 31, 2026: Rs. 45,678.90 Cr
 *   Monthly AAUM as on March 31, 2026: Rs. 45,102.33 Cr
 *   Total Expense Ratio: Regular Plan 1.45% | Direct Plan 0.75%
 *   Exit Load: 1.00% if redeemed within 365 days from the date of allotment
 *   Riskometer: Very High
 *   Minimum SIP Amount: Rs. 500
 */

import { assembleFacts } from './factsText.js';
import type { AmcFactsSpec } from './factsText.js';
import { assemblePortfolio, SHARED_IGNORE_NAME_RE } from './holdingsTable.js';
import type { AmcTableSpec } from './holdingsTable.js';
import type {
  MfFactsheetResult,
  PortfolioParseInput,
  PortfolioRaw,
  SchemeFactsParseInput,
  SchemeFactsRaw,
} from './types.js';

/** Canonical AMC code. Must match the registry key. */
export const SBI_AMC_CODE = 'SBI';
export const SBI_ADAPTER_ID = 'mf.factsheet.sbi';
/**
 * Bumped whenever SBI's format changes. The version is mixed into every
 * artefact's `sourceHash`, so a bump forces every affected row to be re-parsed
 * and rewritten instead of leaving rows produced by the old parser in place.
 */
export const SBI_ADAPTER_VERSION = '1.0.0';

export const SBI_TABLE_SPEC: AmcTableSpec = {
  amcCode: SBI_AMC_CODE,
  // VERIFIED 2026-09-07: "Market value (Rs. in Lakhs)".
  marketValueUnit: 'LAKH',
  columns: {
    // VERIFIED: "Name of the Instrument / Issuer" -> "nameoftheinstrumentissuer".
    name: ['nameoftheinstrumentissuer', 'nameoftheinstrument', 'nameofinstrument'],
    isin: ['isin'],
    // VERIFIED: SBI writes "Rating / Industry^" — rating FIRST.
    industryOrRating: ['ratingindustry', 'industryrating', 'industry', 'rating'],
    quantity: ['quantity', 'qty'],
    marketValue: ['marketvalue', 'marketfairvalue'],
    // VERIFIED: "% to AUM". headerKey strips the "%", leaving "toaum".
    weight: ['toaum', 'tonav', 'tonetassets'],
    ytm: ['ytm', 'yieldtomaturity'],
    maturity: ['maturitydate', 'maturity'],
  },
  ignoreNameRe: SHARED_IGNORE_NAME_RE,
  asOfPatterns: [
    // VERIFIED: "PORTFOLIO STATEMENT AS ON :" with "July 31, 2026" in the NEXT
    // CELL, which the walker joins with a space.
    /PORTFOLIO STATEMENT AS ON\s*:?\s*([A-Za-z]{3,9}\.? \d{1,2},?\s*\d{2,4})/i,
    /PORTFOLIO STATEMENT AS ON\s*:?\s*(\d{1,2}[-/ ][A-Za-z]{3,9}[-/ ]\d{2,4})/i,
    /as on\s+([A-Za-z]{3,9}\.? \d{1,2},?\s*\d{2,4})/i,
  ],
};

export const SBI_FACTS_SPEC: AmcFactsSpec = {
  amcCode: SBI_AMC_CODE,
  asOfPatterns: [
    /Factsheet as on\s+(\d{1,2}[-/ ][A-Za-z]{3,9}[-/ ]\d{2,4})/i,
    /Data as on\s+(\d{1,2}[-/ ][A-Za-z]{3,9}[-/ ]\d{2,4})/i,
  ],
  terDirectPatterns: [/Total Expense Ratio[^\n]*?Direct Plan\s*:?\s*([\d.]+)\s*%/i],
  terRegularPatterns: [/Total Expense Ratio[^\n]*?Regular Plan\s*:?\s*([\d.]+)\s*%/i],
  terSinglePatterns: [/Total Expense Ratio\s*:?\s*([\d.]+)\s*%/i],
  aumPatterns: [
    // `\bAUM` does not match inside "AAUM" (no word boundary between the two
    // A's), so the month-end pattern cannot steal the average-AUM line.
    {
      re: /\bAUM as on[^\n:]*:\s*(?:Rs\.?|₹)?\s*([\d,.]+)\s*Cr/i,
      unit: 'CRORE',
      basis: 'MONTH_END',
    },
    {
      re: /Monthly AAUM[^\n:]*:\s*(?:Rs\.?|₹)?\s*([\d,.]+)\s*Cr/i,
      unit: 'CRORE',
      basis: 'MONTHLY_AVERAGE',
    },
  ],
  managerPatterns: [/Fund Managers?\s*:\s*([^\n]+)/i],
  exitLoadPatterns: [/Exit Load\s*:\s*([^\n]+)/i],
  riskometerPatterns: [/Riskometer\s*:\s*([^\n]+)/i],
  minSipPatterns: [/Minimum SIP[^\n:]*:\s*(?:Rs\.?|₹)?\s*([\d,.]+)/i],
};

export function parseSbiPortfolio(
  input: PortfolioParseInput,
): MfFactsheetResult<PortfolioRaw> {
  return assemblePortfolio(input, SBI_TABLE_SPEC, {
    adapterId: SBI_ADAPTER_ID,
    adapterVersion: SBI_ADAPTER_VERSION,
  });
}

export function parseSbiSchemeFacts(
  input: SchemeFactsParseInput,
): MfFactsheetResult<SchemeFactsRaw> {
  return assembleFacts(input, SBI_FACTS_SPEC, {
    adapterId: SBI_ADAPTER_ID,
    adapterVersion: SBI_ADAPTER_VERSION,
  });
}
