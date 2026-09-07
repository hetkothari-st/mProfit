/**
 * Aditya Birla Sun Life Mutual Fund (ABSL) — PURE parser for the monthly
 * portfolio disclosure and the scheme factsheet.
 *
 * No Prisma, no network, no filesystem. `absl.v1.ts` owns the outside world.
 *
 * ===========================================================================
 * ASSUMED INPUT SHAPE  —  READ THIS BEFORE TRUSTING ANY OUTPUT
 * ===========================================================================
 *
 * ⚠ Written from the documented/published SHAPE of a SEBI monthly portfolio
 * disclosure, not from a scraped live file. Fixtures under
 * `test/fixtures/mf/factsheet/absl/` are synthetic-but-representative (see that
 * folder's README). Validate against a real download before enabling in
 * production; when the real file differs, bump `ABSL_ADAPTER_VERSION` rather
 * than editing tested behaviour in place (`CONTEXT.md §3.4`).
 *
 * ── 1. Portfolio (`parseAbslPortfolio`) ─────────────────────────────────────
 *
 *   Aditya Birla Sun Life Mutual Fund                        <- preamble
 *   Monthly Portfolio Statement as on 31-Mar-2026            <- as-of
 *   Scheme Name: Aditya Birla Sun Life Frontline Equity Fund
 *   (blank)
 *   Name of the Instrument | ISIN | Issuer | Rating / Industry | Quantity |
 *     Market Value (Rs. in Lacs) | % to Net Assets | YTM (%) | Maturity Date
 *   Equity & Equity Related                                  <- section heading
 *   Listed / Awaiting listing on Stock Exchanges              <- section heading
 *   HDFC Bank Limited | INE040A01034 | | Banks | 1,20,000 | 2,345.67 | 12.40 | |
 *   ...
 *   Sub Total | | | | | | 95.20 | |                          <- IGNORED
 *   Cash & Cash Equivalents                                  <- section heading
 *   TREPS / Reverse Repo | | | | | 1,200.00 | 4.95 | |
 *   Net Receivables / (Payables) | | | | | (95.00) | -0.15 | |
 *   Grand Total | | | | | | 100.00 | |                       <- IGNORED
 *
 * The ABSL-specific things:
 *
 *   - **There is a dedicated `Issuer` column**, which none of the other nine
 *     AMCs publish. `holdingsTable.ts` already supports one via the optional
 *     `issuer` alias, and prefers it over `deriveIssuer(securityName)` when
 *     present. That preference matters: `topIssuerPct` (`02 §7`) has to group
 *     two tranches of the same issuer's paper together, and the AMC's own
 *     issuer string does that correctly by construction, whereas the derived
 *     one is a best-effort strip of a coupon prefix and a trailing year. Any
 *     issuer string that splits one issuer in two understates exactly the
 *     concentration risk the metric exists to show.
 *   - **The Industry/Rating column is written the other way round**, "Rating /
 *     Industry". `headerKey` reduces it to `ratingindustry`, which is a
 *     different key from the `industryrating` the other adapters alias — so the
 *     reversed form is aliased explicitly. It is still ONE column doing two
 *     jobs, and which job it is doing is decided by the row's kind, not by the
 *     header's word order.
 *
 * ── 2. Factsheet (`parseAbslSchemeFacts`) ───────────────────────────────────
 *
 *   Factsheet as on 31-Mar-2026
 *   Fund Managers: Mr. Kunal Sangoi (since Jan 2014); Mr. Dhaval Gala (since Aug 2019)
 *   AUM as on 31-Mar-2026: ₹ 9,900.12 Crores
 *   Monthly Average AUM: ₹ 9,876.54 Crores
 *   Total Expense Ratio (TER) Regular 1.85% Direct 0.95%
 *   Exit Load: For redemption/switch-out of units within 365 days ... : 1.00% of applicable NAV
 *   Riskometer: Very High
 *   Minimum SIP Amount: ₹ 500
 *
 * The two managers are separated by a SEMICOLON here rather than "and" or "&".
 * `splitManagerClauses` in `factsText.ts` already splits on `,` `;` `and` `&`
 * while refusing to split inside a parenthesised "(since …)" clause, so nothing
 * per-AMC is required — and nothing per-AMC should be added, for the same
 * reason as UTI's "w.e.f.".
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

export const ABSL_AMC_CODE = 'ABSL';
export const ABSL_ADAPTER_ID = 'mf.factsheet.absl';
export const ABSL_ADAPTER_VERSION = '1.0.0';

export const ABSL_TABLE_SPEC: AmcTableSpec = {
  amcCode: ABSL_AMC_CODE,
  marketValueUnit: 'LAKH',
  columns: {
    name: ['nameoftheinstrument', 'instrumentname', 'nameofinstrument'],
    isin: ['isin'],
    // Longest-first: `ratingindustry` (ABSL's reversed wording) before the
    // bare `rating`, so the prefix match cannot steal the longer key.
    industryOrRating: ['ratingindustry', 'industryrating', 'industry', 'rating'],
    quantity: ['quantity', 'qty'],
    marketValue: ['marketvalue', 'marketfairvalue', 'fairvalue'],
    weight: ['tonetassets', 'tonav', 'toaum'],
    ytm: ['ytm', 'yieldtomaturity'],
    maturity: ['maturitydate', 'maturity'],
    // ⚠ ABSL-only. See the header note on why the disclosed issuer beats the
    // derived one.
    issuer: ['issuer'],
  },
  ignoreNameRe:
    /^(sub[\s-]*total|total|grand\s*total|net\s+assets?\b|notes?\b|footnote|disclaimer|\(?[a-z]\)?$)/i,
  asOfPatterns: [
    /Portfolio Statement as on\s+(\d{1,2}[-/ ][A-Za-z]{3,9}[-/ ]\d{2,4})/i,
    /as on\s+(\d{1,2}[-/ ][A-Za-z]{3,9}[-/ ]\d{2,4})/i,
  ],
};

export const ABSL_FACTS_SPEC: AmcFactsSpec = {
  amcCode: ABSL_AMC_CODE,
  asOfPatterns: [
    /Factsheet as on\s+(\d{1,2}[-/ ][A-Za-z]{3,9}[-/ ]\d{2,4})/i,
    /Data as on\s+(\d{1,2}[-/ ][A-Za-z]{3,9}[-/ ]\d{2,4})/i,
  ],
  // ABSL puts no colon and no separator between the plan name and its number,
  // so both patterns are plain word-anchored. The `other than` guard is what
  // keeps the direct pattern honest if ABSL ever adopts ICICI's phrasing.
  terDirectPatterns: [/Total Expense Ratio[^\n]*?(?<!other than )\bDirect\s*:?\s*([\d.]+)\s*%/i],
  terRegularPatterns: [/Total Expense Ratio[^\n]*?\bRegular\s*:?\s*([\d.]+)\s*%/i],
  terSinglePatterns: [/Total Expense Ratio(?:\s*\(TER\))?\s*:\s*([\d.]+)\s*%/i],
  aumPatterns: [
    {
      re: /\bAUM as on[^\n:]*:\s*(?:Rs\.?|₹)?\s*([\d,.]+)\s*Crores?/i,
      unit: 'CRORE',
      basis: 'MONTH_END',
    },
    {
      re: /Monthly Average AUM[^\n:]*:\s*(?:Rs\.?|₹)?\s*([\d,.]+)\s*Crores?/i,
      unit: 'CRORE',
      basis: 'MONTHLY_AVERAGE',
    },
  ],
  managerPatterns: [/Fund Managers?\s*[¤†‡*^#]*\s*:\s*([^\n]+)/i],
  exitLoadPatterns: [/Exit Load\s*:\s*([^\n]+)/i],
  riskometerPatterns: [/Riskometer\s*:\s*([^\n]+)/i],
  minSipPatterns: [/Minimum SIP[^\n:]*:\s*(?:Rs\.?|₹)?\s*([\d,.]+)/i],
};

export function parseAbslPortfolio(
  input: PortfolioParseInput,
): MfFactsheetResult<PortfolioRaw> {
  return assemblePortfolio(input, ABSL_TABLE_SPEC, {
    adapterId: ABSL_ADAPTER_ID,
    adapterVersion: ABSL_ADAPTER_VERSION,
  });
}

export function parseAbslSchemeFacts(
  input: SchemeFactsParseInput,
): MfFactsheetResult<SchemeFactsRaw> {
  return assembleFacts(input, ABSL_FACTS_SPEC, {
    adapterId: ABSL_ADAPTER_ID,
    adapterVersion: ABSL_ADAPTER_VERSION,
  });
}
