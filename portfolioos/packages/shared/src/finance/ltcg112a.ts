/**
 * Section 112A LTCG exemption on listed equity / equity-oriented mutual funds.
 *
 * The allowance is **not a fixed number** — the Finance Act 2024 raised it
 * from ₹1,00,000 to ₹1,25,000 with effect from 23 July 2024, alongside the
 * rate change from 10% to 12.5%. A report for FY 2022-23 that applies the
 * ₹1.25 lakh figure understates the tax; a report for FY 2025-26 that applies
 * ₹1 lakh overstates it. Both were live in this codebase at once, which is
 * exactly the drift `CII_BY_FY` exists to prevent for indexation — so this
 * table sits beside it, in `shared`, and every consumer reads from here.
 *
 * Source: Income-tax Act §112A, as amended by the Finance (No. 2) Act 2024.
 *
 * ⚠ The rate change is keyed on a **date** (23-Jul-2024), not a financial
 * year, so FY 2024-25 straddles it. The statute applies the higher exemption
 * to the whole of FY 2024-25 (the exemption is an annual aggregate, unlike
 * the rate, which splits on transfer date), which is why the FY table below
 * shows ₹1,25,000 for 2024-25 while `ratesForDate` in the API still splits
 * the *rate* mid-year. Those two behaviours are both correct and must not be
 * "reconciled".
 */

import { Decimal } from 'decimal.js';

/** The date §112A's exemption and rate were revised. */
export const LTCG_112A_REVISION_DATE_ISO = '2024-07-23';

/**
 * Exemption by financial year, as decimal strings (never JS numbers — §3.1).
 * Add a row per Finance Act; do not interpolate.
 */
export const LTCG_112A_EXEMPTION_BY_FY: Record<string, string> = {
  '2018-19': '100000',
  '2019-20': '100000',
  '2020-21': '100000',
  '2021-22': '100000',
  '2022-23': '100000',
  '2023-24': '100000',
  '2024-25': '125000',
  '2025-26': '125000',
  '2026-27': '125000',
};

/**
 * The allowance for the most recent FY we have on file. Used only as the
 * fallback for a future FY not yet in the table — a new financial year should
 * not make every report silently return ₹0 of exemption before someone
 * remembers to add a row.
 */
const LATEST_KNOWN_EXEMPTION = '125000';

/**
 * §112A exemption for a financial year in `YYYY-YY` form (the same key shape
 * `CII_BY_FY` and `financialYearOf()` use).
 *
 * Returns `null` for a year **before** §112A existed (it was introduced by
 * the Finance Act 2018, effective FY 2018-19; LTCG on listed equity was
 * wholly exempt under the old §10(38) before that). `null` means "this
 * concept did not apply", which a caller must render differently from a ₹0
 * allowance — the same distinction `cii_unavailable` draws.
 */
export function ltcg112aExemptionForFy(fy: string): Decimal | null {
  const known = LTCG_112A_EXEMPTION_BY_FY[fy];
  if (known) return new Decimal(known);

  const startYear = Number.parseInt(fy.slice(0, 4), 10);
  if (!Number.isFinite(startYear)) return null;
  // Pre-§112A: LTCG on listed equity was exempt under §10(38) entirely.
  if (startYear < 2018) return null;
  // A year past the end of the table: carry the latest known allowance
  // forward rather than returning null, and let the annual Finance Act
  // review add the real row.
  return new Decimal(LATEST_KNOWN_EXEMPTION);
}

/** Same, keyed on a date. Indian FY runs April–March. */
export function ltcg112aExemptionForDate(d: Date): Decimal | null {
  const y = d.getUTCFullYear();
  const startYear = d.getUTCMonth() >= 3 ? y : y - 1;
  const fy = `${startYear}-${String((startYear + 1) % 100).padStart(2, '0')}`;
  return ltcg112aExemptionForFy(fy);
}
