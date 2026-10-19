/**
 * Nippon India Mutual Fund — PURE parser for the monthly portfolio disclosure
 * and the scheme factsheet.
 *
 * No Prisma, no network, no filesystem. `nippon.v1.ts` owns the outside world.
 *
 * ===========================================================================
 * ASSUMED INPUT SHAPE  —  READ THIS BEFORE TRUSTING ANY OUTPUT
 * ===========================================================================
 *
 * ⚠ Written from the documented/published SHAPE of a SEBI monthly portfolio
 * disclosure, not from a scraped live file. Fixtures under
 * `test/fixtures/mf/factsheet/nippon/` are synthetic-but-representative (see
 * that folder's README). Validate against a real download before enabling in
 * production; when the real file differs, bump `NIPPON_ADAPTER_VERSION` rather
 * than editing tested behaviour in place (`CONTEXT.md §3.4`).
 *
 * ── 1. Portfolio (`parseNipponPortfolio`) ───────────────────────────────────
 *
 *   Nippon India Mutual Fund                                 <- preamble
 *   Portfolio Statement as on 31-Mar-2026                    <- as-of
 *   Scheme Name: Nippon India Large Cap Fund
 *   (blank)
 *   Name of the Instrument | ISIN | Industry / Rating | Quantity |
 *     Market/Fair Value (Rs. in Lacs) | % of AUM | YTM | Maturity Date  <- header
 *   Equity & Equity related                                  <- section heading
 *   Listed / awaiting listing on the Stock Exchanges          <- section heading
 *   HDFC Bank Limited | INE040A01034 | Banks | 1,20,000 | 2,345.67 | 12.40 | |
 *   ...
 *   Sub Total | | | | | 95.20 | |                            <- IGNORED
 *   Cash & Cash Equivalents                                  <- section heading
 *   TREPS / Reverse Repo | | | | 1,200.00 | 4.95 | |
 *   Net Receivables / (Payables) | | | | (95.00) | -0.15 | |
 *   Grand Total | | | | | 100.00 | |                         <- IGNORED
 *
 * Key assumptions, i.e. the things that differ from SBI/ICICI/HDFC and are the
 * entire reason this is a separate adapter rather than a shared one:
 *   - The weight column is headed **"% of AUM"** — "of", not "to". `headerKey`
 *     reduces that to `ofaum`, which is a DIFFERENT key from SBI's `toaum`.
 *     Aliasing only `toaum` here would leave the weight column unmapped, the
 *     header row would score 3/4 instead of 4/4, and every weight would come
 *     back unparseable — the whole snapshot rejected as `NO_HOLDINGS`.
 *   - Market values are in LACS ("Rs. in Lacs") → ×1e5.
 *
 * ── 2. Factsheet (`parseNipponSchemeFacts`) ─────────────────────────────────
 *
 *   Factsheet as on 31-Mar-2026
 *   Fund Manager: Sailesh Raj Bhan (Managing this fund since Jan 2017)
 *   AUM as on 31-Mar-2026: ₹ 34,567.89 Crs
 *   Monthly Average AUM: ₹ 34,120.55 Crs
 *   TER (Regular / Direct): 1.62% / 0.78%
 *   Exit Load: 1% if redeemed or switched out within 365 days ...
 *   Riskometer: Very High
 *   Minimum SIP Amount: ₹ 100
 *
 * The TER line is the delicate one HERE. Nippon writes both plans' numbers on
 * ONE line as a "a% / b%" pair with the plan names only in the label. There is
 * no "Direct" token next to the direct number to anchor on, so the direct
 * pattern anchors on POSITION: it consumes the regular number, the slash, and
 * then captures. Matching `([\d.]+)%` after the word "Direct" — the shape every
 * other AMC's pattern uses — would capture nothing here, and a looser
 * `/Direct[^\n]*?([\d.]+)\s*%/` would capture the REGULAR plan's 1.62%,
 * reporting the direct plan as ~0.84pp more expensive than it is. Wrong in the
 * direction that makes the cheap plan look dear, which is the direction that
 * flips a cost-pillar recommendation.
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

export const NIPPON_AMC_CODE = 'NIPPON';
export const NIPPON_ADAPTER_ID = 'mf.factsheet.nippon';
export const NIPPON_ADAPTER_VERSION = '1.0.0';

export const NIPPON_TABLE_SPEC: AmcTableSpec = {
  amcCode: NIPPON_AMC_CODE,
  // VERIFIED 2026-09-07: "Market/Fair Value ( Rs. in Lacs)".
  marketValueUnit: 'LAKH',
  columns: {
    name: ['nameoftheinstrument', 'nameofinstrument'],
    isin: ['isin'],
    // VERIFIED: "Industry / Rating".
    industryOrRating: ['industryrating', 'ratingindustry', 'industry', 'rating'],
    quantity: ['quantity', 'qty'],
    marketValue: ['marketfairvalue', 'marketvalue'],
    // VERIFIED: "% to NAV" — NOT the "% of AUM" the synthetic fixture assumed.
    weight: ['tonav', 'tonetassets', 'toaum'],
    ytm: ['yield', 'ytm'],
    maturity: ['maturitydate', 'maturity'],
  },
  ignoreNameRe: SHARED_IGNORE_NAME_RE,
  asOfPatterns: [
    // VERIFIED: "Monthly Portfolio Statement as on July 31,2026" — no space
    // after the comma.
    /Portfolio Statement as on\s+([A-Za-z]{3,9}\.? \d{1,2},?\s*\d{2,4})/i,
    /as on\s+(\d{1,2}[-/ ][A-Za-z]{3,9}[-/ ]\d{2,4})/i,
  ],
};

export const NIPPON_FACTS_SPEC: AmcFactsSpec = {
  amcCode: NIPPON_AMC_CODE,
  asOfPatterns: [
    /Factsheet as on\s+(\d{1,2}[-/ ][A-Za-z]{3,9}[-/ ]\d{2,4})/i,
    /Data as on\s+(\d{1,2}[-/ ][A-Za-z]{3,9}[-/ ]\d{2,4})/i,
  ],
  // Positional, not label-anchored — see the header note. The regular number is
  // consumed explicitly so the capture cannot slide back onto it.
  terDirectPatterns: [
    /TER\s*\(\s*Regular\s*\/\s*Direct\s*\)\s*:?\s*[\d.]+\s*%\s*\/\s*([\d.]+)\s*%/i,
  ],
  terRegularPatterns: [/TER\s*\(\s*Regular\s*\/\s*Direct\s*\)\s*:?\s*([\d.]+)\s*%/i],
  terSinglePatterns: [/\bTER\s*:\s*([\d.]+)\s*%/i],
  aumPatterns: [
    // Month-end first so it wins over the average line on the same page. The
    // "as on" is load-bearing: without it this pattern also matches the
    // "Monthly Average AUM:" line and the two figures get conflated, which
    // silently corrupts `aumGrowth12mPct` (`02 §8`).
    {
      re: /\bAUM as on[^\n:]*:\s*(?:Rs\.?|₹)?\s*([\d,.]+)\s*Crs?\b/i,
      unit: 'CRORE',
      basis: 'MONTH_END',
    },
    {
      re: /Monthly Average AUM[^\n:]*:\s*(?:Rs\.?|₹)?\s*([\d,.]+)\s*Crs?\b/i,
      unit: 'CRORE',
      basis: 'MONTHLY_AVERAGE',
    },
  ],
  managerPatterns: [/Fund Managers?\s*[¤†‡*^#]*\s*:\s*([^\n]+)/i],
  exitLoadPatterns: [/Exit Load\s*:\s*([^\n]+)/i],
  riskometerPatterns: [/Riskometer\s*:\s*([^\n]+)/i],
  minSipPatterns: [/Minimum SIP[^\n:]*:\s*(?:Rs\.?|₹)?\s*([\d,.]+)/i],
};

export function parseNipponPortfolio(
  input: PortfolioParseInput,
): MfFactsheetResult<PortfolioRaw> {
  return assemblePortfolio(input, NIPPON_TABLE_SPEC, {
    adapterId: NIPPON_ADAPTER_ID,
    adapterVersion: NIPPON_ADAPTER_VERSION,
  });
}

export function parseNipponSchemeFacts(
  input: SchemeFactsParseInput,
): MfFactsheetResult<SchemeFactsRaw> {
  return assembleFacts(input, NIPPON_FACTS_SPEC, {
    adapterId: NIPPON_ADAPTER_ID,
    adapterVersion: NIPPON_ADAPTER_VERSION,
  });
}
