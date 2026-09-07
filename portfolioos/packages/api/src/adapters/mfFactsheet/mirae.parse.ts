/**
 * Mirae Asset Mutual Fund — PURE parser for the monthly portfolio disclosure
 * and the scheme factsheet.
 *
 * No Prisma, no network, no filesystem. `mirae.v1.ts` owns the outside world.
 *
 * ===========================================================================
 * ASSUMED INPUT SHAPE  —  READ THIS BEFORE TRUSTING ANY OUTPUT
 * ===========================================================================
 *
 * ⚠ Written from the documented/published SHAPE of a SEBI monthly portfolio
 * disclosure, not from a scraped live file. Fixtures under
 * `test/fixtures/mf/factsheet/mirae/` are synthetic-but-representative (see
 * that folder's README). Validate against a real download before enabling in
 * production; when the real file differs, bump `MIRAE_ADAPTER_VERSION` rather
 * than editing tested behaviour in place (`CONTEXT.md §3.4`).
 *
 * ── 1. Portfolio (`parseMiraePortfolio`) ────────────────────────────────────
 *
 *   Mirae Asset Mutual Fund                                  <- preamble
 *   Monthly Portfolio Statement as on March 31, 2026         <- as-of, MONTH-NAME
 *   Scheme Name: Mirae Asset Large Cap Fund
 *   (blank)
 *   Name of the Instrument | ISIN Code | Industry/Rating | Quantity/Units |
 *     Market Value (Rs. Lakh) | % of Net Assets | YTM | Maturity Date
 *   Equity Shares                                            <- section heading
 *   Listed / awaiting listing on the stock exchanges          <- section heading
 *   HDFC Bank Limited | INE040A01034 | Banks | 1,20,000 | 2,345.67 | 12.40 | |
 *   ...
 *   Sub Total | | | | | 95.20 | |                            <- IGNORED
 *   Cash & Other Receivables                                 <- section heading
 *   TREPS / Reverse Repo | | | | 1,200.00 | 4.95 | |
 *   Net Receivables / (Payables) | | | | (95.00) | -0.15 | |
 *   Grand Total | | | | | 100.00 | |                         <- IGNORED
 *
 * Key assumptions:
 *   - Three headers are worded differently from every other AMC in the
 *     registry: "ISIN Code" (not "ISIN"), "Quantity/Units" (not "Quantity"),
 *     and "% of Net Assets" (not "% to Net Assets"). The first two are handled
 *     by the shared walker's prefix matching — `isincode` starts with `isin`,
 *     `quantityunits` starts with `quantity` — but the third is NOT: `ofnetassets`
 *     does not start with `tonetassets`, so it has to be aliased explicitly.
 *     Missing it would leave the weight column unmapped and reject every Mirae
 *     snapshot as `NO_HOLDINGS`.
 *   - Market values are in LAKH ("Rs. Lakh") → ×1e5.
 *   - The as-of is month-name-first with a comma ("March 31, 2026"), so the
 *     preamble cell is quoted in the CSV; `csvToGrid` honours the quoting.
 *
 * ── 2. Factsheet (`parseMiraeSchemeFacts`) ──────────────────────────────────
 *
 *   Factsheet as on March 31, 2026
 *   Fund Managers: Neelesh Surana (since May 2008) & Ankit Jain (since Jan 2019)
 *   Closing AUM as on March 31, 2026: ₹ 45,210.30 Cr.
 *   Monthly Average AUM: ₹ 45,000.10 Cr.
 *   Expense Ratio: Regular Plan – 1.55% | Direct Plan – 0.54%
 *   Exit Load: 1% if redeemed within 365 days from the date of allotment; Nil thereafter
 *   Risk-o-meter: Very High
 *   Minimum SIP Amount: ₹ 99
 *
 * Two wording traps:
 *   - The riskometer is hyphenated, "Risk-o-meter". A pattern anchored on the
 *     unhyphenated spelling silently returns null for every Mirae fund.
 *   - The TER numbers are separated from the plan names by an EN DASH (–), not
 *     a hyphen or a colon. It is the character that looks like a hyphen in a
 *     diff and is not one, so the separator class below lists both explicitly.
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

export const MIRAE_AMC_CODE = 'MIRAE';
export const MIRAE_ADAPTER_ID = 'mf.factsheet.mirae';
export const MIRAE_ADAPTER_VERSION = '1.0.0';

export const MIRAE_TABLE_SPEC: AmcTableSpec = {
  amcCode: MIRAE_AMC_CODE,
  marketValueUnit: 'LAKH',
  columns: {
    name: ['nameoftheinstrument', 'instrumentname', 'nameofinstrument'],
    // `isincode` is matched by the `isin` prefix; listed for the reader.
    isin: ['isin'],
    industryOrRating: ['industryrating', 'industry', 'rating'],
    quantity: ['quantity', 'qty'],
    marketValue: ['marketvalue', 'marketfairvalue', 'fairvalue'],
    // ⚠ `ofnetassets` FIRST — Mirae's own wording, and NOT a prefix of any of
    // the others. See the header note.
    weight: ['ofnetassets', 'tonetassets', 'tonav', 'toaum', 'ofnav'],
    ytm: ['ytm', 'yieldtomaturity'],
    maturity: ['maturitydate', 'maturity'],
  },
  ignoreNameRe:
    /^(sub[\s-]*total|total|grand\s*total|net\s+assets?\b|notes?\b|footnote|disclaimer|\(?[a-z]\)?$)/i,
  asOfPatterns: [
    /Portfolio Statement as on\s+([A-Za-z]{3,9}\.? \d{1,2},? \d{4})/i,
    /as on\s+([A-Za-z]{3,9}\.? \d{1,2},? \d{4})/i,
    /as on\s+(\d{1,2}[-/ ][A-Za-z]{3,9}[-/ ]\d{2,4})/i,
  ],
};

export const MIRAE_FACTS_SPEC: AmcFactsSpec = {
  amcCode: MIRAE_AMC_CODE,
  asOfPatterns: [
    /Factsheet as on\s+([A-Za-z]{3,9}\.? \d{1,2},? \d{4})/i,
    /Data as on\s+([A-Za-z]{3,9}\.? \d{1,2},? \d{4})/i,
    /as on\s+(\d{1,2}[-/ ][A-Za-z]{3,9}[-/ ]\d{2,4})/i,
  ],
  // `[–—:-]` — en dash, em dash, colon, hyphen. Mirae uses the en dash.
  terDirectPatterns: [
    /Expense Ratio[^\n]*?(?<!other than )Direct Plan\s*[–—:-]?\s*([\d.]+)\s*%/i,
  ],
  terRegularPatterns: [/Expense Ratio[^\n]*?Regular Plan\s*[–—:-]?\s*([\d.]+)\s*%/i],
  terSinglePatterns: [/Expense Ratio\s*[–—:-]\s*([\d.]+)\s*%/i],
  aumPatterns: [
    {
      re: /Closing AUM as on[^\n:]*:\s*(?:Rs\.?|₹)?\s*([\d,.]+)\s*Cr/i,
      unit: 'CRORE',
      basis: 'MONTH_END',
    },
    {
      re: /\bAUM as on[^\n:]*:\s*(?:Rs\.?|₹)?\s*([\d,.]+)\s*Cr/i,
      unit: 'CRORE',
      basis: 'MONTH_END',
    },
    {
      re: /Monthly Average AUM[^\n:]*:\s*(?:Rs\.?|₹)?\s*([\d,.]+)\s*Cr/i,
      unit: 'CRORE',
      basis: 'MONTHLY_AVERAGE',
    },
  ],
  managerPatterns: [/Fund Managers?\s*[¤†‡*^#]*\s*:\s*([^\n]+)/i],
  exitLoadPatterns: [/Exit Load\s*:\s*([^\n]+)/i],
  // Hyphenated spelling first; the plain one kept as a fallback.
  riskometerPatterns: [/Risk-?o-?meter\s*:\s*([^\n]+)/i, /Riskometer\s*:\s*([^\n]+)/i],
  minSipPatterns: [/Minimum SIP[^\n:]*:\s*(?:Rs\.?|₹)?\s*([\d,.]+)/i],
};

export function parseMiraePortfolio(
  input: PortfolioParseInput,
): MfFactsheetResult<PortfolioRaw> {
  return assemblePortfolio(input, MIRAE_TABLE_SPEC, {
    adapterId: MIRAE_ADAPTER_ID,
    adapterVersion: MIRAE_ADAPTER_VERSION,
  });
}

export function parseMiraeSchemeFacts(
  input: SchemeFactsParseInput,
): MfFactsheetResult<SchemeFactsRaw> {
  return assembleFacts(input, MIRAE_FACTS_SPEC, {
    adapterId: MIRAE_ADAPTER_ID,
    adapterVersion: MIRAE_ADAPTER_VERSION,
  });
}
