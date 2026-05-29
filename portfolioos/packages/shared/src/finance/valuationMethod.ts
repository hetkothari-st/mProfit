/**
 * How a holding's current value is derived. Single source of truth shared by
 * the API (response tagging) and the web (UI labeling):
 *   MARKET  → live price feed (qty × price). Show daily move + price freshness.
 *   ACCRUAL → interest compounds into the value (FD/RD/NSC/KVP/SSY/PO-TD).
 *             Show "accrued" return; never a daily/MTM delta.
 *   PAYOUT  → interest paid out; principal flat (SCSS/PO-MIS/PO-Savings).
 *   COST    → carried at cost/appraisal (real estate, insurance, other).
 */
export type ValuationMethod = 'MARKET' | 'ACCRUAL' | 'PAYOUT' | 'COST';

const ACCRUAL = new Set<string>([
  'FIXED_DEPOSIT', 'RECURRING_DEPOSIT', 'NSC', 'KVP', 'POST_OFFICE_TD', 'SSY', 'POST_OFFICE_RD',
]);
const PAYOUT = new Set<string>([
  'SCSS', 'POST_OFFICE_MIS', 'POST_OFFICE_SAVINGS',
]);
const MARKET = new Set<string>([
  'EQUITY', 'ETF', 'MUTUAL_FUND', 'CRYPTOCURRENCY', 'PHYSICAL_GOLD', 'PHYSICAL_SILVER',
  'GOLD_ETF', 'GOLD_BOND', 'REIT', 'INVIT', 'FOREIGN_EQUITY', 'FOREX_PAIR',
]);

export function valuationMethodFor(assetClass: string): ValuationMethod {
  if (MARKET.has(assetClass)) return 'MARKET';
  if (ACCRUAL.has(assetClass)) return 'ACCRUAL';
  if (PAYOUT.has(assetClass)) return 'PAYOUT';
  return 'COST';
}
