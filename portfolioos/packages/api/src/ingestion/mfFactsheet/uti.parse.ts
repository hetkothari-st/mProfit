/**
 * UTI Mutual Fund — PURE parser for the monthly portfolio disclosure and the
 * scheme factsheet.
 *
 * No Prisma, no network, no filesystem. `uti.v1.ts` owns the outside world.
 *
 * ===========================================================================
 * ASSUMED INPUT SHAPE  —  READ THIS BEFORE TRUSTING ANY OUTPUT
 * ===========================================================================
 *
 * ⚠ Written from the documented/published SHAPE of a SEBI monthly portfolio
 * disclosure, not from a scraped live file. Fixtures under
 * `test/fixtures/mf/factsheet/uti/` are synthetic-but-representative (see that
 * folder's README). Validate against a real download before enabling in
 * production; when the real file differs, bump `UTI_ADAPTER_VERSION` rather
 * than editing tested behaviour in place (`CONTEXT.md §3.4`).
 *
 * ── 1. Portfolio (`parseUtiPortfolio`) ──────────────────────────────────────
 *
 *   UTI Mutual Fund                                          <- preamble
 *   Portfolio Statement as on 31-03-2026                     <- as-of, NUMERIC
 *   Scheme Name: UTI Large Cap Fund
 *   (blank)
 *   Name of the Instrument | ISIN | Industry / Rating | Quantity |
 *     Market/Fair Value (Rs. In Lakhs) | % to NAV | YTM (%) | Maturity Date
 *   Equity Shares                                            <- section heading
 *   Listed / Awaiting Listing                                 <- section heading
 *   HDFC Bank Limited | INE040A01034 | Banks | 1,20,000 | 2,345.67 | 12.40 | |
 *   ...
 *   Sub Total | | | | | 95.20 | |                            <- IGNORED
 *   Cash & Cash Equivalent                                   <- section heading
 *   TREPS / Reverse Repo | | | | 1,200.00 | 4.95 | |
 *   Net Receivables / (Payables) | | | | (95.00) | -0.15 | |
 *   Grand Total | | | | | 100.00 | |                         <- IGNORED
 *
 * Key assumptions:
 *   - Market values are in LAKHS ("Rs. In Lakhs", capital "In") → ×1e5.
 *     `headerKey` lowercases, so the capitalisation is irrelevant — which is
 *     precisely why header matching goes through it rather than comparing the
 *     literal string.
 *   - The as-of is ALL-NUMERIC and day-first ("31-03-2026"). Read as 31 March,
 *     never 3 November: `parseFactsheetDate` is day-first by policy because
 *     Indian documents are never month-first, and a month-swapped snapshot is
 *     filed under the wrong month without ever looking wrong.
 *   - The YTM header carries a unit ("YTM (%)"). `headerKey` strips the
 *     parentheses and the percent sign, leaving `ytm`.
 *
 * ── 2. Factsheet (`parseUtiSchemeFacts`) ────────────────────────────────────
 *
 *   Factsheet as on 31-03-2026
 *   Fund Manager: Mr. Ajay Tyagi (w.e.f. 01-Feb-2016)
 *   Fund Size (AUM) as on 31-03-2026: ₹ 3,456.78 Crore
 *   Monthly Average AUM: ₹ 3,400.00 Crore
 *   Total Expense Ratio (TER) : Regular: 1.29% Direct: 0.99%
 *   Exit Load: Redemption / Switch out within 12 months ... - 1.00% of applicable NAV
 *   Riskometer: Very High
 *   SIP Minimum Amount: ₹ 500
 *
 * Two UTI-specific wordings:
 *   - The AUM is labelled "Fund Size (AUM) as on ...", not "AUM as on ...". A
 *     pattern anchored on the latter finds nothing and the fund's size — the
 *     input to the size percentile in `02 §8` — comes back null.
 *   - The manager's start date is introduced by "w.e.f.", which
 *     `parseManagerClause` already handles alongside "since" / "managing this
 *     fund since". Nothing per-AMC is needed for it, and nothing per-AMC should
 *     be added: a second copy of that clause splitter is how two adapters end up
 *     disagreeing about the same manager's tenure.
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

export const UTI_AMC_CODE = 'UTI';
export const UTI_ADAPTER_ID = 'mf.factsheet.uti';
export const UTI_ADAPTER_VERSION = '1.0.0';

export const UTI_TABLE_SPEC: AmcTableSpec = {
  amcCode: UTI_AMC_CODE,
  // VERIFIED 2026-09-07: the preamble says "(Market value in Lacs)"; the
  // column itself is headed only "MARKET-VALUE", with no unit on it at all.
  marketValueUnit: 'LAKH',
  columns: {
    // VERIFIED: "NAME OF THE INSTRUMENT " — all caps, trailing space.
    name: ['nameoftheinstrument', 'nameofinstrument'],
    isin: ['isin'],
    // VERIFIED: "RATING/INDUSTRY" — rating first.
    industryOrRating: ['ratingindustry', 'industryrating', 'industry', 'rating'],
    quantity: ['quantity', 'qty'],
    // VERIFIED: "MARKET-VALUE" -> "marketvalue".
    marketValue: ['marketvalue', 'marketfairvalue'],
    // VERIFIED: "% TO NAV".
    weight: ['tonav', 'tonetassets', 'toaum'],
    ytm: ['yield', 'ytm'],
    maturity: ['maturitydate', 'maturity'],
  },
  // UTI writes subtotals as "TOTAL:(a) Listed...", "TOTAL :  Others" and ends
  // each scheme block with "TOTAL : <scheme name>" — all caught by the shared
  // leading-"total" rule.
  ignoreNameRe: SHARED_IGNORE_NAME_RE,
  /**
   * UTI is the one AMC of the ten with NO "Grand Total" row, so the shared
   * default end-marker never fires and the walk runs on into the footnotes.
   *
   * That matters more here than anywhere else, because UTI's footnote block is
   * "(a) Details of Default beyond Maturity Date (Fig. in Lakhs)" — a table
   * whose own columns are NAME | ISIN NO | VALUE AS PER NCA | %AGE TO NAV |
   * TOTAL AMT DUE. Its fifth column lands under the mapped "% TO NAV" position,
   * so two defaulted securities were read as holdings weighing 1,724% and
   * 9,992% of NAV. The file was rejected at a weights sum of 11,816%.
   *
   * Three independent stops, because none alone is comfortable:
   *   - "TOTAL : <scheme>" — the real end. Every UTI scheme name begins "UTI",
   *     which distinguishes it from the section subtotals ("TOTAL: EQUITY AND
   *     EQUITY RELATED", "TOTAL : Others") that share the prefix.
   *   - the default-disclosure heading itself.
   *   - "SCHEME CODEnnnENDS", the sentinel that closes each scheme's block in
   *     the single all-schemes sheet.
   */
  endOfTableRe: /^(total\s*:\s*uti\b|\(a\)\s*details of default|scheme\s*code\d+ends)/i,
  asOfPatterns: [
    // VERIFIED: "PROVISIONAL AND UNAUDITED PORTFOLIO DISCLOSURE AS OF
    // 31/07/2026 (Market value in Lacs)" — day-first numeric.
    /PORTFOLIO DISCLOSURE AS OF\s+(\d{1,2}[-/]\d{1,2}[-/]\d{2,4})/i,
    /AS OF\s+(\d{1,2}[-/]\d{1,2}[-/]\d{2,4})/i,
  ],
};

export const UTI_FACTS_SPEC: AmcFactsSpec = {
  amcCode: UTI_AMC_CODE,
  asOfPatterns: [
    /Factsheet as on\s+(\d{1,2}[-/]\d{1,2}[-/]\d{2,4})/i,
    /Data as on\s+(\d{1,2}[-/]\d{1,2}[-/]\d{2,4})/i,
    /Factsheet as on\s+(\d{1,2}[-/ ][A-Za-z]{3,9}[-/ ]\d{2,4})/i,
  ],
  // UTI separates the two plans with nothing but a space, so the direct pattern
  // requires the COLON that UTI puts after the plan name; the `other than`
  // guard is carried anyway (see `kotak.parse.ts` for why on every adapter).
  terDirectPatterns: [/Total Expense Ratio[^\n]*?(?<!other than )\bDirect\s*:\s*([\d.]+)\s*%/i],
  terRegularPatterns: [/Total Expense Ratio[^\n]*?\bRegular\s*:\s*([\d.]+)\s*%/i],
  terSinglePatterns: [/Total Expense Ratio(?:\s*\(TER\))?\s*:\s*([\d.]+)\s*%/i],
  aumPatterns: [
    // "Fund Size (AUM) as on ..." — UTI's own label.
    {
      re: /Fund Size\s*\(AUM\)\s*as on[^\n:]*:\s*(?:Rs\.?|₹)?\s*([\d,.]+)\s*Crore/i,
      unit: 'CRORE',
      basis: 'MONTH_END',
    },
    {
      re: /\bAUM as on[^\n:]*:\s*(?:Rs\.?|₹)?\s*([\d,.]+)\s*Crore/i,
      unit: 'CRORE',
      basis: 'MONTH_END',
    },
    {
      re: /Monthly Average AUM[^\n:]*:\s*(?:Rs\.?|₹)?\s*([\d,.]+)\s*Crore/i,
      unit: 'CRORE',
      basis: 'MONTHLY_AVERAGE',
    },
  ],
  managerPatterns: [/Fund Managers?\s*[¤†‡*^#]*\s*:\s*([^\n]+)/i],
  exitLoadPatterns: [/Exit Load\s*:\s*([^\n]+)/i],
  riskometerPatterns: [/Riskometer\s*:\s*([^\n]+)/i],
  minSipPatterns: [
    /SIP Minimum Amount\s*:\s*(?:Rs\.?|₹)?\s*([\d,.]+)/i,
    /Minimum SIP[^\n:]*:\s*(?:Rs\.?|₹)?\s*([\d,.]+)/i,
  ],
};

export function parseUtiPortfolio(
  input: PortfolioParseInput,
): MfFactsheetResult<PortfolioRaw> {
  return assemblePortfolio(input, UTI_TABLE_SPEC, {
    adapterId: UTI_ADAPTER_ID,
    adapterVersion: UTI_ADAPTER_VERSION,
  });
}

export function parseUtiSchemeFacts(
  input: SchemeFactsParseInput,
): MfFactsheetResult<SchemeFactsRaw> {
  return assembleFacts(input, UTI_FACTS_SPEC, {
    adapterId: UTI_ADAPTER_ID,
    adapterVersion: UTI_ADAPTER_VERSION,
  });
}
