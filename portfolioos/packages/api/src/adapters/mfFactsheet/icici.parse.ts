/**
 * ICICI Prudential Mutual Fund — PURE parser for the monthly portfolio
 * disclosure and the scheme factsheet.
 *
 * No Prisma, no network, no filesystem. `icici.v1.ts` owns the outside world.
 *
 * ===========================================================================
 * ASSUMED INPUT SHAPE  —  READ THIS BEFORE TRUSTING ANY OUTPUT
 * ===========================================================================
 *
 * ⚠ Written from the documented/published SHAPE of a SEBI monthly portfolio
 * disclosure, not from a scraped live file. Fixtures under
 * `test/fixtures/mf/factsheet/icici/` are synthetic-but-representative (see
 * that folder's README). Validate against a real download before enabling in
 * production; when the real file differs, bump `ICICI_ADAPTER_VERSION` rather
 * than editing tested behaviour in place (`CONTEXT.md §3.4`).
 *
 * ── 1. Portfolio (`parseIciciPortfolio`) ────────────────────────────────────
 *
 *   ICICI Prudential Mutual Fund                             <- preamble
 *   Monthly Portfolio Statement as on 31-Mar-2026            <- as-of
 *   Scheme: ICICI Prudential Bluechip Fund
 *   (blank)
 *   Company/Issuer/Instrument Name | ISIN | Industry^/Rating | Quantity |
 *     Exposure/Market Value(Rs.Lakh) | % to Nav | Yield to Call/Maturity |
 *     Maturity Date                                          <- header
 *   Equity Shares                                            <- section heading
 *   ICICI Bank Ltd. | INE090A01021 | Banks | 2,10,000 | 18,420.00 | 8.05 | |
 *   ...
 *   Sub Total | | | | | 94.10 | |                            <- IGNORED
 *   Debt Instruments                                         <- section heading
 *   7.18% GOI 2037 | IN0020230119 | SOV | 1,00,00,000 | 9,950.00 | 4.35 | 7.21 | 24-Jul-2037
 *   Cash, Cash Equivalents and Net Current Assets            <- section heading
 *   TREPS | | | | 3,400.00 | 1.55 | |
 *   Net Current Assets | | | | -95.00 | -0.04 | |
 *   Grand Total | | | | | 100.00 | |                         <- IGNORED
 *
 * Key assumptions:
 *   - Market values are in LAKHS ("Rs.Lakh") → ×1e5.
 *   - ICICI decorates its industry header with a caret ("Industry^/Rating");
 *     `headerKey` strips it, which is exactly why header matching is done on
 *     the stripped key rather than the literal string.
 *   - "% to Nav" is the weight column.
 *
 * ── 2. Factsheet (`parseIciciSchemeFacts`) ──────────────────────────────────
 *
 *   Data as on 31-Mar-2026
 *   Fund Managers : Anish Tawakley (Managing this fund since Sep 2018) and
 *     Vaibhav Dusad (Managing this fund since Jan 2021)
 *   Monthly AAUM as on 31-Mar-26 : Rs. 63,412.55 crores
 *   Closing AUM as on 31-Mar-26 : Rs. 63,988.10 crores
 *   Total Expense Ratio @@ : Other than Direct 1.51% p. a. | Direct 0.86% p. a.
 *   Exit load for Redemption / Switch out :- Upto 1 Year from allotment - 1% of
 *     applicable NAV, more than 1 Year - Nil
 *   Riskometer : Very High
 *   Minimum SIP Amount : Rs. 100
 *
 * The TER line is the delicate one. "Other than Direct 1.51%" is the REGULAR
 * plan, and a naive /Direct\s+([\d.]+)%/ would match it and report the regular
 * plan's TER as the direct plan's — a ~0.65pp error in the single largest input
 * to the cost pillar, in the direction that makes the fund look cheaper. The
 * direct-plan pattern therefore requires a separator immediately before
 * "Direct", which "Other than Direct" does not have.
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

export const ICICI_AMC_CODE = 'ICICI_PRU';
export const ICICI_ADAPTER_ID = 'mf.factsheet.iciciPru';
export const ICICI_ADAPTER_VERSION = '1.1.0';

export const ICICI_TABLE_SPEC: AmcTableSpec = {
  amcCode: ICICI_AMC_CODE,
  // VERIFIED 2026-09-07: "Exposure/Market Value(Rs.Lakh)".
  marketValueUnit: 'LAKH',
  columns: {
    // VERIFIED: ICICI Pru does not use "Name of the Instrument" at all.
    name: ['companyissuerinstrumentname', 'nameoftheinstrument', 'nameofinstrument'],
    isin: ['isin'],
    industryOrRating: ['industryrating', 'ratingindustry', 'industry', 'rating'],
    quantity: ['quantity', 'qty'],
    // VERIFIED: "Exposure/Market Value(Rs.Lakh)" -> "exposuremarketvaluerslakh".
    marketValue: ['exposuremarketvalue', 'marketvalue', 'marketfairvalue'],
    // VERIFIED: "% to Nav".
    weight: ['tonav', 'tonetassets', 'toaum'],
    // VERIFIED: "Yield of the instrument".
    ytm: ['yieldoftheinstrument', 'ytm', 'yield'],
    maturity: ['maturitydate', 'maturity'],
  },
  ignoreNameRe: SHARED_IGNORE_NAME_RE,
  // ICICI Pru prints every section's subtotal ON the heading row, so the
  // "a name and no numbers" rule cannot see these. Counted as holdings they
  // push the weights sum to roughly 200% and the file is rejected whole.
  //
  // TREPS, "Cash Margin - Derivatives" and "Net Current Assets" are
  // deliberately ABSENT from this list: they are leaf CASH holdings, and
  // treating them as headings would silently zero cashPct.
  sectionNameRe:
    /^(equity\s*&\s*equity\s*related|listed\s*\/\s*awaiting\s*listing|unlisted|privately\s*placed|units of (real estate|infrastructure|an alternative)|compulsory convertible debenture|non-?convertible debentures?|debt instruments|government securities|securiti[sz]ed debt|term deposits|deposits\s*\(|money market instruments|certificate of deposits|commercial papers?|reverse repo$|treasury bills|others$|interest rate swaps|details of stock future)/i,
  /**
   * VERIFIED on the Jul-2026 liquid-fund workbook: the table ends at
   * "Total Net Assets" (100.00%) and continues with a numbered Notes block
   * whose rows land under the mapped columns. Without this, the grand total is
   * itself parsed as a holding and contributes a clean extra 100% to the
   * weights sum — which reads as a parser that cannot add up, rather than one
   * that walked past the end of the table.
   */
  endOfTableRe: /^(total net assets|grand total)/i,
  asOfPatterns: [
    // VERIFIED: "Portfolio as on Jul 31,2026" — no space after the comma.
    /Portfolio as on\s+([A-Za-z]{3,9}\.? \d{1,2},?\s*\d{2,4})/i,
    /Portfolio as on\s+(\d{1,2}[-/ ][A-Za-z]{3,9}[-/ ]\d{2,4})/i,
  ],
};

export const ICICI_FACTS_SPEC: AmcFactsSpec = {
  amcCode: ICICI_AMC_CODE,
  asOfPatterns: [
    /Data as on\s+(\d{1,2}[-/ ][A-Za-z]{3,9}[-/ ]\d{2,4})/i,
    /Factsheet as on\s+(\d{1,2}[-/ ][A-Za-z]{3,9}[-/ ]\d{2,4})/i,
  ],
  // The separator class before "Direct" is what keeps "Other than Direct" out.
  terDirectPatterns: [/Total Expense Ratio[^\n]*?[|/,;–-]\s*Direct\s*:?\s*([\d.]+)\s*%/i],
  terRegularPatterns: [
    /Total Expense Ratio[^\n]*?Other than Direct\s*:?\s*([\d.]+)\s*%/i,
    /Total Expense Ratio[^\n]*?Regular\s*:?\s*([\d.]+)\s*%/i,
  ],
  terSinglePatterns: [/Total Expense Ratio[^\n:]*:\s*([\d.]+)\s*%/i],
  aumPatterns: [
    {
      re: /Closing AUM as on[^\n:]*:\s*(?:Rs\.?|₹)?\s*([\d,.]+)\s*crore/i,
      unit: 'CRORE',
      basis: 'MONTH_END',
    },
    {
      re: /Monthly AAUM as on[^\n:]*:\s*(?:Rs\.?|₹)?\s*([\d,.]+)\s*crore/i,
      unit: 'CRORE',
      basis: 'MONTHLY_AVERAGE',
    },
  ],
  managerPatterns: [/Fund Managers?\s*\**\s*:\s*([^\n]+)/i],
  exitLoadPatterns: [/Exit load[^\n:]*:-?\s*([^\n]+)/i],
  riskometerPatterns: [/Riskometer\s*:\s*([^\n]+)/i],
  minSipPatterns: [/Min(?:imum)?\.?\s*SIP[^\n:]*:\s*(?:Rs\.?|₹)?\s*([\d,.]+)/i],
};

export function parseIciciPortfolio(
  input: PortfolioParseInput,
): MfFactsheetResult<PortfolioRaw> {
  return assemblePortfolio(input, ICICI_TABLE_SPEC, {
    adapterId: ICICI_ADAPTER_ID,
    adapterVersion: ICICI_ADAPTER_VERSION,
  });
}

export function parseIciciSchemeFacts(
  input: SchemeFactsParseInput,
): MfFactsheetResult<SchemeFactsRaw> {
  return assembleFacts(input, ICICI_FACTS_SPEC, {
    adapterId: ICICI_ADAPTER_ID,
    adapterVersion: ICICI_ADAPTER_VERSION,
  });
}
