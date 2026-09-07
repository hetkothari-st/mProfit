/**
 * HDFC Mutual Fund — PURE parser for the monthly portfolio disclosure and the
 * scheme factsheet.
 *
 * No Prisma, no network, no filesystem. `hdfc.v1.ts` owns the outside world.
 *
 * ===========================================================================
 * ASSUMED INPUT SHAPE  —  READ THIS BEFORE TRUSTING ANY OUTPUT
 * ===========================================================================
 *
 * ⚠ Written from the documented/published SHAPE of a SEBI monthly portfolio
 * disclosure, not from a scraped live file. Fixtures under
 * `test/fixtures/mf/factsheet/hdfc/` are synthetic-but-representative (see that
 * folder's README). Validate against a real download before enabling in
 * production; when the real file differs, bump `HDFC_ADAPTER_VERSION` rather
 * than editing tested behaviour in place (`CONTEXT.md §3.4`).
 *
 * ── 1. Portfolio (`parseHdfcPortfolio`) ─────────────────────────────────────
 *
 *   HDFC Mutual Fund                                         <- preamble
 *   Portfolio Statement as on 31-Mar-2026                    <- as-of
 *   HDFC Flexi Cap Fund
 *   (blank)
 *   Name of the Instrument | ISIN | Industry+ / Rating | Quantity |
 *     Market/Fair Value (Rs. in Lacs) | % to NAV | YTM | Maturity Date  <- header
 *   EQUITY & EQUITY RELATED                                  <- section heading
 *   Listed / Awaiting listing on the Stock Exchanges          <- section heading
 *   HDFC Bank Ltd. | INE040A01034 | Banks | 3,10,000 | 60,140.00 | 9.42 | |
 *   ...
 *   Sub Total | | | | | 96.30 | |                            <- IGNORED
 *   Cash, Cash Equivalents and Net Current Assets            <- section heading
 *   TREPS - Tri-party Repo | | | | 21,500.00 | 3.37 | |
 *   Net Current Assets | | | | -1,900.00 | -0.30 | |
 *   Grand Total | | | | | 100.00 | |                         <- IGNORED
 *
 * Key assumptions:
 *   - Market values are in LACS ("Rs. in Lacs") → ×1e5. HDFC spells it "Lacs";
 *     `parseIndianDecimal` and the header aliases both cover that spelling.
 *   - "% to NAV" is the weight column.
 *   - The "+" and "¤" footnote markers HDFC sprinkles through its headers and
 *     labels are stripped by `headerKey` / the manager-name cleanup.
 *
 * ── 2. Factsheet (`parseHdfcSchemeFacts`) ───────────────────────────────────
 *
 *   Factsheet — March 31, 2026
 *   Fund Manager ¤ : Roshi Jain (since July 29, 2022)
 *   AUM as on March 31, 2026 : ₹ 64,120.44 Cr.
 *   Average AUM for the month : ₹ 63,880.02 Cr.
 *   #Total Expense Ratio: Regular: 1.44% Direct: 0.77%
 *   Exit Load: In respect of each purchase of Units, 1.00% is payable if Units
 *     are redeemed within 365 days from the date of allotment.
 *   Riskometer: Very High
 *   Minimum SIP Amount: ₹ 100
 *
 * Note the month-name date form ("March 31, 2026") rather than "31-Mar-2026".
 * `parseFactsheetDate` handles both; the as-of patterns here are written for
 * HDFC's form first so a stray "31-Mar" elsewhere on the page cannot win.
 */

import { assembleFacts } from './factsText.js';
import type { AmcFactsSpec } from './factsText.js';
import { assemblePortfolio } from './holdingsTable.js';
import type { AmcTableSpec } from './holdingsTable.js';
import type {
  MfFactsheetResult,
  PortfolioParseInput,
  PortfolioRaw,
  SchemeFactsParseInput,
  SchemeFactsRaw,
} from './types.js';

export const HDFC_AMC_CODE = 'HDFC';
export const HDFC_ADAPTER_ID = 'mf.factsheet.hdfc';
export const HDFC_ADAPTER_VERSION = '1.0.0';

export const HDFC_TABLE_SPEC: AmcTableSpec = {
  amcCode: HDFC_AMC_CODE,
  marketValueUnit: 'LAKH',
  columns: {
    name: ['nameoftheinstrument', 'instrumentname', 'nameofinstrument'],
    isin: ['isin'],
    industryOrRating: ['industryrating', 'industry', 'rating'],
    quantity: ['quantity', 'qty'],
    marketValue: ['marketfairvalue', 'marketvalue', 'fairvalue'],
    weight: ['tonav', 'tonetassets', 'toaum'],
    ytm: ['ytm', 'yieldtomaturity'],
    maturity: ['maturitydate', 'maturity'],
  },
  ignoreNameRe:
    /^(sub[\s-]*total|total|grand\s*total|net\s+assets?\b|notes?\b|footnote|disclaimer|\(?[a-z]\)?$)/i,
  asOfPatterns: [
    /Portfolio Statement as on\s+(\d{1,2}[-/ ][A-Za-z]{3,9}[-/ ]\d{2,4})/i,
    /as on\s+([A-Za-z]{3,9}\.? \d{1,2},? \d{4})/i,
    /as on\s+(\d{1,2}[-/ ][A-Za-z]{3,9}[-/ ]\d{2,4})/i,
  ],
};

export const HDFC_FACTS_SPEC: AmcFactsSpec = {
  amcCode: HDFC_AMC_CODE,
  asOfPatterns: [
    /Factsheet\s*[—–:-]?\s*([A-Za-z]{3,9}\.? \d{1,2},? \d{4})/i,
    /Factsheet as on\s+(\d{1,2}[-/ ][A-Za-z]{3,9}[-/ ]\d{2,4})/i,
  ],
  terDirectPatterns: [/Total Expense Ratio[^\n]*?Direct\s*:?\s*([\d.]+)\s*%/i],
  terRegularPatterns: [/Total Expense Ratio[^\n]*?Regular\s*:?\s*([\d.]+)\s*%/i],
  terSinglePatterns: [/Total Expense Ratio\s*:?\s*([\d.]+)\s*%/i],
  aumPatterns: [
    {
      re: /\bAUM as on[^\n:]*:\s*(?:Rs\.?|₹)?\s*([\d,.]+)\s*Cr/i,
      unit: 'CRORE',
      basis: 'MONTH_END',
    },
    {
      re: /Average AUM[^\n:]*:\s*(?:Rs\.?|₹)?\s*([\d,.]+)\s*Cr/i,
      unit: 'CRORE',
      basis: 'MONTHLY_AVERAGE',
    },
  ],
  managerPatterns: [/Fund Managers?\s*[¤†‡*^#]*\s*:\s*([^\n]+)/i],
  exitLoadPatterns: [/Exit Load\s*:\s*([^\n]+)/i],
  riskometerPatterns: [/Riskometer\s*:\s*([^\n]+)/i],
  minSipPatterns: [/Minimum SIP[^\n:]*:\s*(?:Rs\.?|₹)?\s*([\d,.]+)/i],
};

export function parseHdfcPortfolio(
  input: PortfolioParseInput,
): MfFactsheetResult<PortfolioRaw> {
  return assemblePortfolio(input, HDFC_TABLE_SPEC, {
    adapterId: HDFC_ADAPTER_ID,
    adapterVersion: HDFC_ADAPTER_VERSION,
  });
}

export function parseHdfcSchemeFacts(
  input: SchemeFactsParseInput,
): MfFactsheetResult<SchemeFactsRaw> {
  return assembleFacts(input, HDFC_FACTS_SPEC, {
    adapterId: HDFC_ADAPTER_ID,
    adapterVersion: HDFC_ADAPTER_VERSION,
  });
}
