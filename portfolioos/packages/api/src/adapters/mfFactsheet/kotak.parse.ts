/**
 * Kotak Mahindra Mutual Fund — PURE parser for the monthly portfolio
 * disclosure and the scheme factsheet.
 *
 * No Prisma, no network, no filesystem. `kotak.v1.ts` owns the outside world.
 *
 * ===========================================================================
 * ASSUMED INPUT SHAPE  —  READ THIS BEFORE TRUSTING ANY OUTPUT
 * ===========================================================================
 *
 * ⚠ Written from the documented/published SHAPE of a SEBI monthly portfolio
 * disclosure, not from a scraped live file. Fixtures under
 * `test/fixtures/mf/factsheet/kotak/` are synthetic-but-representative (see
 * that folder's README). Validate against a real download before enabling in
 * production; when the real file differs, bump `KOTAK_ADAPTER_VERSION` rather
 * than editing tested behaviour in place (`CONTEXT.md §3.4`).
 *
 * ── 1. Portfolio (`parseKotakPortfolio`) ────────────────────────────────────
 *
 *   Kotak Mahindra Mutual Fund                               <- preamble
 *   Portfolio Statement as on 31/03/2026                     <- as-of, NUMERIC
 *   Scheme Name: Kotak Bluechip Fund
 *   (blank)
 *   Name of the Instrument | ISIN | Industry/Rating | Quantity |
 *     Market Value (Rs. in Crore) | % to Net Assets | YTM | Maturity Date
 *   Equity & Equity Related                                  <- section heading
 *   Listed/Awaiting Listing on Stock Exchange                 <- section heading
 *   HDFC Bank Limited | INE040A01034 | Banks | 1,20,000 | 23.4567 | 12.40 | |
 *   ...
 *   Sub Total | | | | | 95.20 | |                            <- IGNORED
 *   TREPS / Reverse Repo / Net Current Assets                <- section heading
 *   TREPS / Reverse Repo | | | | 12.0000 | 4.95 | |
 *   Net Receivables / (Payables) | | | | (0.9500) | -0.15 | |
 *   Grand Total | | | | | 100.00 | |                         <- IGNORED
 *
 * Two things differ from every adapter shipped in Task 1.5, and both are the
 * kind of difference that produces a plausible-looking wrong number rather than
 * an error:
 *
 *   - **Market values are quoted in CRORE, not lakh.** `marketValueUnit` is
 *     therefore `CRORE` (×1e7). Leaving it at the `LAKH` default that the first
 *     three adapters use would store every Kotak position at 1/100th of its
 *     real value. NOTHING downstream would catch it: the weights — which every
 *     metric in `02` actually uses — would still be exactly right, and the
 *     weights-sum gate would still pass at 100.00%. Only `MfPortfolioHolding.
 *     marketValue`, read by the reconciliation report, would be wrong, and it
 *     would be wrong consistently enough to look deliberate.
 *   - **The as-of is numeric and DAY-FIRST** ("31/03/2026"). `parseFactsheetDate`
 *     reads `d/m/y` because Indian documents are never month-first; the as-of
 *     patterns below therefore have to admit an all-numeric date, which SBI's
 *     and HDFC's do not.
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

export const KOTAK_AMC_CODE = 'KOTAK';
export const KOTAK_ADAPTER_ID = 'mf.factsheet.kotak';
export const KOTAK_ADAPTER_VERSION = '1.0.0';

export const KOTAK_TABLE_SPEC: AmcTableSpec = {
  amcCode: KOTAK_AMC_CODE,
  // VERIFIED 2026-09-07: "Market Value (Rs.in Lacs)".
  //
  // The synthetic fixture assumed CRORE. That is a 100x error on every stored
  // market value, and exactly the kind no downstream check catches: weights,
  // which every metric in 02 actually uses, stay correct either way.
  marketValueUnit: 'LAKH',
  columns: {
    // VERIFIED: "Name of Instrument", in a header cell MERGED across A:C while
    // the values sit in column C. `nameCell` in holdingsTable.ts resolves that.
    name: ['nameofinstrument', 'nameoftheinstrument'],
    // VERIFIED: "ISIN Code".
    isin: ['isincode', 'isin'],
    industryOrRating: ['industryrating', 'ratingindustry', 'industry', 'rating'],
    quantity: ['quantity', 'qty'],
    marketValue: ['marketvalue', 'marketfairvalue'],
    // VERIFIED: "% to Net Assets".
    weight: ['tonetassets', 'tonav', 'toaum'],
    ytm: ['yield', 'ytm'],
    maturity: ['maturitydate', 'maturity'],
  },
  ignoreNameRe: SHARED_IGNORE_NAME_RE,
  asOfPatterns: [
    // VERIFIED: "Portfolio of Kotak <scheme> as on 31-Jul-2026" — the scheme
    // name sits INSIDE the sentence.
    /Portfolio of .+? as on\s+(\d{1,2}[-/ ][A-Za-z]{3,9}[-/ ]\d{2,4})/i,
    /as on\s+(\d{1,2}[-/ ][A-Za-z]{3,9}[-/ ]\d{2,4})/i,
  ],
};

export const KOTAK_FACTS_SPEC: AmcFactsSpec = {
  amcCode: KOTAK_AMC_CODE,
  asOfPatterns: [
    /Factsheet as on\s+(\d{1,2}[-/]\d{1,2}[-/]\d{2,4})/i,
    /Data as on\s+(\d{1,2}[-/]\d{1,2}[-/]\d{2,4})/i,
    /Factsheet as on\s+(\d{1,2}[-/ ][A-Za-z]{3,9}[-/ ]\d{2,4})/i,
  ],
  // The `(?<!other than )` guard is carried on EVERY adapter's direct-plan
  // pattern, including the ones whose current wording does not need it. The
  // failure it prevents (reporting the regular plan's TER as the direct plan's)
  // is silent, and the wording an AMC uses next year is not knowable now.
  terDirectPatterns: [/Total Expense Ratio[^\n]*?(?<!other than )Direct Plan\s*:?\s*([\d.]+)\s*%/i],
  terRegularPatterns: [/Total Expense Ratio[^\n]*?Regular Plan\s*:?\s*([\d.]+)\s*%/i],
  terSinglePatterns: [/Total Expense Ratio\s*:\s*([\d.]+)\s*%/i],
  aumPatterns: [
    // "AAUM (Monthly Average)" contains the letters A-U-M but not the token
    // "AUM as on", so the month-end pattern cannot steal it.
    {
      re: /\bAUM as on[^\n:]*:\s*(?:Rs\.?|₹)?\s*([\d,.]+)\s*crore/i,
      unit: 'CRORE',
      basis: 'MONTH_END',
    },
    {
      re: /\bAAUM[^\n:]*:\s*(?:Rs\.?|₹)?\s*([\d,.]+)\s*crore/i,
      unit: 'CRORE',
      basis: 'MONTHLY_AVERAGE',
    },
  ],
  managerPatterns: [/Fund Managers?\s*[¤†‡*^#]*\s*:\s*([^\n]+)/i],
  exitLoadPatterns: [/Exit Load\s*:\s*([^\n]+)/i],
  riskometerPatterns: [/Riskometer\s*:\s*([^\n]+)/i],
  minSipPatterns: [/Minimum SIP[^\n:]*:\s*(?:Rs\.?|₹)?\s*([\d,.]+)/i],
};

export function parseKotakPortfolio(
  input: PortfolioParseInput,
): MfFactsheetResult<PortfolioRaw> {
  return assemblePortfolio(input, KOTAK_TABLE_SPEC, {
    adapterId: KOTAK_ADAPTER_ID,
    adapterVersion: KOTAK_ADAPTER_VERSION,
  });
}

export function parseKotakSchemeFacts(
  input: SchemeFactsParseInput,
): MfFactsheetResult<SchemeFactsRaw> {
  return assembleFacts(input, KOTAK_FACTS_SPEC, {
    adapterId: KOTAK_ADAPTER_ID,
    adapterVersion: KOTAK_ADAPTER_VERSION,
  });
}
