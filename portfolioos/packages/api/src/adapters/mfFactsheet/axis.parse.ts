/**
 * Axis Mutual Fund — PURE parser for the monthly portfolio disclosure and the
 * scheme factsheet.
 *
 * No Prisma, no network, no filesystem. `axis.v1.ts` owns the outside world.
 *
 * ===========================================================================
 * ASSUMED INPUT SHAPE  —  READ THIS BEFORE TRUSTING ANY OUTPUT
 * ===========================================================================
 *
 * ⚠ Written from the documented/published SHAPE of a SEBI monthly portfolio
 * disclosure, not from a scraped live file. Fixtures under
 * `test/fixtures/mf/factsheet/axis/` are synthetic-but-representative (see that
 * folder's README). Validate against a real download before enabling in
 * production; when the real file differs, bump `AXIS_ADAPTER_VERSION` rather
 * than editing tested behaviour in place (`CONTEXT.md §3.4`).
 *
 * ── 1. Portfolio (`parseAxisPortfolio`) ─────────────────────────────────────
 *
 *   Axis Mutual Fund                                         <- preamble
 *   Portfolio Statement as on March 31, 2026                 <- as-of, MONTH-NAME
 *   Scheme Name: Axis Bluechip Fund
 *   (blank)
 *   Name of the Instrument | ISIN | Industry/Rating | Quantity |
 *     Market Value (Rs.) | % to NAV | YTM | Maturity Date     <- header
 *   EQUITY & EQUITY RELATED                                  <- section heading
 *   Listed / Awaiting listing on Stock Exchanges              <- section heading
 *   HDFC Bank Limited | INE040A01034 | Banks | 1,20,000 | 23,45,67,000 | 12.40 | |
 *   ...
 *   Sub Total | | | | | 95.20 | |                            <- IGNORED
 *   NET CURRENT ASSETS                                       <- section heading
 *   TREPS / Reverse Repo | | | | 12,00,00,000 | 4.95 | |
 *   Net Receivables / (Payables) | | | | (95,00,000) | -0.15 | |
 *   Grand Total | | | | | 100.00 | |                         <- IGNORED
 *
 * The two Axis-specific things:
 *
 *   - **Market values are in PLAIN RUPEES** ("Market Value (Rs.)"), so
 *     `marketValueUnit` is `RUPEE` and NO scaling is applied. This is the unit
 *     that is easiest to get wrong in the expensive direction: applying the
 *     lakh multiplier that SBI/ICICI/HDFC need would store every Axis position
 *     at 100,000× its real value, and — exactly as with Kotak's crore — no
 *     downstream check would notice, because the weights would still be right
 *     and the weights-sum gate would still pass at 100.00%.
 *   - **The as-of is written month-name-first with a comma** ("March 31, 2026").
 *     In the CSV that means the preamble cell has to be quoted or it splits in
 *     two; `csvToGrid` honours the quoting, which is why the shared reader is
 *     not a `split(',')`.
 *
 * ── 2. Factsheet (`parseAxisSchemeFacts`) ───────────────────────────────────
 *
 *   Factsheet Data as on March 31, 2026
 *   Fund Manager: Shreyash Devalkar (since 23-Nov-2016) and Ashish Naik (since 03-Aug-2023)
 *   AUM as on March 31, 2026: ₹ 21,345.60 Cr.
 *   Monthly Average AUM: ₹ 21,100.20 Cr.
 *   Expense Ratio: Regular 1.68% | Direct 0.61%
 *   Exit Load: 1% if redeemed within 365 days from the date of allotment
 *   Riskometer: Very High
 *   Minimum SIP Amount: ₹ 100
 *
 * Axis writes "Expense Ratio", NOT "Total Expense Ratio", so the patterns must
 * anchor on the shorter phrase. Anchoring on "Total Expense Ratio" — the wording
 * the first three adapters use — matches nothing here, and the fund's TER comes
 * back `null`: not a wrong number, but an `INSUFFICIENT_DATA` on the cost pillar
 * for every Axis fund, which is a silent loss of a whole pillar rather than a
 * visible failure.
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

export const AXIS_AMC_CODE = 'AXIS';
export const AXIS_ADAPTER_ID = 'mf.factsheet.axis';
export const AXIS_ADAPTER_VERSION = '1.0.0';

export const AXIS_TABLE_SPEC: AmcTableSpec = {
  amcCode: AXIS_AMC_CODE,
  // ⚠ RUPEE — no scaling. See the header note.
  marketValueUnit: 'RUPEE',
  columns: {
    name: ['nameoftheinstrument', 'instrumentname', 'nameofinstrument'],
    isin: ['isin'],
    industryOrRating: ['industryrating', 'industry', 'rating'],
    quantity: ['quantity', 'qty'],
    marketValue: ['marketvalue', 'marketfairvalue', 'fairvalue'],
    weight: ['tonav', 'tonetassets', 'toaum'],
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

export const AXIS_FACTS_SPEC: AmcFactsSpec = {
  amcCode: AXIS_AMC_CODE,
  asOfPatterns: [
    /Factsheet Data as on\s+([A-Za-z]{3,9}\.? \d{1,2},? \d{4})/i,
    /Data as on\s+([A-Za-z]{3,9}\.? \d{1,2},? \d{4})/i,
    /as on\s+(\d{1,2}[-/ ][A-Za-z]{3,9}[-/ ]\d{2,4})/i,
  ],
  // A separator class immediately before "Direct" plus the `other than` guard:
  // belt and braces, because this is the single largest input to the cost
  // pillar and the failure is silent (see `icici.parse.ts` for the live trap).
  terDirectPatterns: [/Expense Ratio[^\n]*?[|/,;–-]\s*(?<!other than )Direct\s*:?\s*([\d.]+)\s*%/i],
  terRegularPatterns: [/Expense Ratio[^\n]*?\bRegular\s*:?\s*([\d.]+)\s*%/i],
  terSinglePatterns: [/Expense Ratio\s*:\s*([\d.]+)\s*%/i],
  aumPatterns: [
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
  riskometerPatterns: [/Riskometer\s*:\s*([^\n]+)/i],
  minSipPatterns: [/Minimum SIP[^\n:]*:\s*(?:Rs\.?|₹)?\s*([\d,.]+)/i],
};

export function parseAxisPortfolio(
  input: PortfolioParseInput,
): MfFactsheetResult<PortfolioRaw> {
  return assemblePortfolio(input, AXIS_TABLE_SPEC, {
    adapterId: AXIS_ADAPTER_ID,
    adapterVersion: AXIS_ADAPTER_VERSION,
  });
}

export function parseAxisSchemeFacts(
  input: SchemeFactsParseInput,
): MfFactsheetResult<SchemeFactsRaw> {
  return assembleFacts(input, AXIS_FACTS_SPEC, {
    adapterId: AXIS_ADAPTER_ID,
    adapterVersion: AXIS_ADAPTER_VERSION,
  });
}
