/**
 * DSP Mutual Fund — PURE parser for the monthly portfolio disclosure and the
 * scheme factsheet.
 *
 * No Prisma, no network, no filesystem. `dsp.v1.ts` owns the outside world.
 *
 * ===========================================================================
 * ASSUMED INPUT SHAPE  —  READ THIS BEFORE TRUSTING ANY OUTPUT
 * ===========================================================================
 *
 * ⚠ Written from the documented/published SHAPE of a SEBI monthly portfolio
 * disclosure, not from a scraped live file. Fixtures under
 * `test/fixtures/mf/factsheet/dsp/` are synthetic-but-representative (see that
 * folder's README). Validate against a real download before enabling in
 * production; when the real file differs, bump `DSP_ADAPTER_VERSION` rather
 * than editing tested behaviour in place (`CONTEXT.md §3.4`).
 *
 * ── 1. Portfolio (`parseDspPortfolio`) ──────────────────────────────────────
 *
 *   DSP Mutual Fund                                          <- preamble
 *   Portfolio Statement as on 31-Mar-2026                    <- as-of
 *   Scheme Name: DSP Top 100 Equity Fund
 *   (blank)
 *   Name of Instrument | ISIN | Industry/Rating | Quantity |
 *     Market Value (Rs. in Lakh) | % to Net Assets | YTM | Maturity Date
 *   EQUITY & EQUITY RELATED                                  <- section heading
 *   Listed / Awaiting Listing on the Stock Exchanges          <- section heading
 *   HDFC Bank Limited | INE040A01034 | Banks | 1,20,000 | 2,345.67 | 12.40 | |
 *   ...
 *   Sub Total | | | | | 95.20 | |                            <- IGNORED
 *   Cash & Cash Equivalents                                  <- section heading
 *   TREPS / Reverse Repo | | | | 1,200.00 | 4.95 | |
 *   Net Receivables / (Payables) | | | | (95.00) | -0.15 | |
 *   Grand Total | | | | | 100.00 | |                         <- IGNORED
 *
 * Key assumptions:
 *   - The name header is "Name of Instrument" — no "the". `headerKey` gives
 *     `nameofinstrument`, a different key from the `nameoftheinstrument` most
 *     AMCs use, so both are aliased. An unmapped NAME column is the worst of
 *     the header failures: `looksLikeSection` reads the name cell, so without
 *     it every row looks like a data row with an empty name and the whole file
 *     lands in `rowFailures` as `MISSING_NAME`.
 *   - Market values are in LAKH ("Rs. in Lakh", singular) → ×1e5.
 *
 * ── 2. Factsheet (`parseDspSchemeFacts`) ────────────────────────────────────
 *
 *   Factsheet as on 31-Mar-2026
 *   Fund Manager: Atul Bhole (since Jun 2016)
 *   AUM as on 31-Mar-2026: ₹ 15,432.10 Cr
 *   Monthly Average AUM (AAUM): ₹ 15,300.00 Cr
 *   Total Expense Ratio: 1.71% (Regular) / 0.71% (Direct)
 *   Exit Load: 1% if redeemed or switched out within 12 months from the date of allotment
 *   Riskometer: Very High
 *   Minimum SIP Amount: ₹ 100
 *
 * DSP writes the NUMBER BEFORE THE PLAN NAME — "1.71% (Regular)" — which is the
 * mirror image of every other AMC in the registry. The patterns therefore
 * capture what precedes the plan label rather than what follows it. A pattern of
 * the usual `Direct[^\n]*?([\d.]+)%` shape would find nothing after "(Direct)"
 * on this line and fall through to `null`; worse, a lazily-written
 * `/Regular[^\n]*?([\d.]+)\s*%/` would run PAST "(Regular)" and capture the
 * DIRECT plan's 0.71% as the regular TER — understating the regular plan's cost
 * by a full percentage point, in the direction that makes an expensive plan look
 * cheap.
 *
 * The exit load is stated in MONTHS ("within 12 months"), which `parseExitLoad`
 * converts at the conventional 30 days/month → `daysUpTo: 360`, not 365. That is
 * the shared converter's documented behaviour and is deliberately not
 * special-cased here: one ladder, one converter.
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

export const DSP_AMC_CODE = 'DSP';
export const DSP_ADAPTER_ID = 'mf.factsheet.dsp';
export const DSP_ADAPTER_VERSION = '1.0.0';

export const DSP_TABLE_SPEC: AmcTableSpec = {
  amcCode: DSP_AMC_CODE,
  // VERIFIED 2026-09-07: "Market value (Rs. In lakhs)" — capital "I" in "In".
  marketValueUnit: 'LAKH',
  columns: {
    // VERIFIED: "Name of Instrument", without "the".
    name: ['nameofinstrument', 'nameoftheinstrument'],
    isin: ['isin'],
    // VERIFIED: "Rating/Industry" — rating first.
    industryOrRating: ['ratingindustry', 'industryrating', 'industry', 'rating'],
    quantity: ['quantity', 'qty'],
    marketValue: ['marketvalue', 'marketfairvalue'],
    // VERIFIED: "% to Net Assets".
    weight: ['tonetassets', 'tonav', 'toaum'],
    // VERIFIED: "YTM (%)" and a real "Maturity Date" column — DSP is the only
    // one of the ten that discloses maturity in the monthly portfolio itself.
    ytm: ['ytm', 'yield'],
    maturity: ['maturitydate', 'maturity'],
  },
  ignoreNameRe: SHARED_IGNORE_NAME_RE,
  asOfPatterns: [
    // VERIFIED: "Portfolio as on July 31, 2026".
    /Portfolio as on\s+([A-Za-z]{3,9}\.? \d{1,2},?\s*\d{2,4})/i,
    /as on\s+(\d{1,2}[-/ ][A-Za-z]{3,9}[-/ ]\d{2,4})/i,
  ],
};

export const DSP_FACTS_SPEC: AmcFactsSpec = {
  amcCode: DSP_AMC_CODE,
  asOfPatterns: [
    /Factsheet as on\s+(\d{1,2}[-/ ][A-Za-z]{3,9}[-/ ]\d{2,4})/i,
    /Data as on\s+(\d{1,2}[-/ ][A-Za-z]{3,9}[-/ ]\d{2,4})/i,
  ],
  // ⚠ Percent-BEFORE-plan. The plan label is the anchor at the END of the
  // match, not the start. See the header note for the failure this avoids.
  terDirectPatterns: [/Total Expense Ratio[^\n]*?([\d.]+)\s*%\s*\(\s*Direct\s*\)/i],
  terRegularPatterns: [/Total Expense Ratio[^\n]*?([\d.]+)\s*%\s*\(\s*Regular\s*\)/i],
  terSinglePatterns: [/Total Expense Ratio\s*:\s*([\d.]+)\s*%\s*$/im],
  aumPatterns: [
    // "Monthly Average AUM (AAUM)" has no "as on", so it cannot be picked up by
    // the month-end pattern.
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

export function parseDspPortfolio(
  input: PortfolioParseInput,
): MfFactsheetResult<PortfolioRaw> {
  return assemblePortfolio(input, DSP_TABLE_SPEC, {
    adapterId: DSP_ADAPTER_ID,
    adapterVersion: DSP_ADAPTER_VERSION,
  });
}

export function parseDspSchemeFacts(
  input: SchemeFactsParseInput,
): MfFactsheetResult<SchemeFactsRaw> {
  return assembleFacts(input, DSP_FACTS_SPEC, {
    adapterId: DSP_ADAPTER_ID,
    adapterVersion: DSP_ADAPTER_VERSION,
  });
}
