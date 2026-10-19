import type { AssetClass } from '@prisma/client';

/**
 * Accrual / cost / appraisal classes carry no market price feed, so the
 * concept of a "stale price" does not apply — their value is derived from
 * interest accrual or a user-set appraisal, not a live quote.
 */
const NON_MARKET: ReadonlySet<AssetClass> = new Set<AssetClass>([
  'FIXED_DEPOSIT', 'RECURRING_DEPOSIT', 'NSC', 'KVP', 'SCSS', 'SSY',
  'POST_OFFICE_MIS', 'POST_OFFICE_RD', 'POST_OFFICE_TD', 'POST_OFFICE_SAVINGS',
  'PPF', 'EPF', 'NPS', 'PMS', 'AIF', 'INSURANCE', 'ULIP',
  'REAL_ESTATE', 'PRIVATE_EQUITY', 'ART_COLLECTIBLES', 'CASH', 'OTHER',
  'BOND', 'GOVT_BOND', 'CORPORATE_BOND',
]);

const DAY = 24 * 60 * 60 * 1000;

/** Max age before a market price is considered stale, by class. */
function maxAgeDays(assetClass: AssetClass): number {
  // Crypto trades 24x7; equities/MF/commodity refresh on trading sessions
  // (allow a weekend + a holiday → 3 days).
  return assetClass === 'CRYPTOCURRENCY' ? 1 : 3;
}

/**
 * True when a holding's market price is older than its class tolerance. A
 * missing `asOf` on a market asset counts as stale (we never priced it);
 * non-market classes are never stale.
 */
export function isPriceStale(
  assetClass: AssetClass,
  asOf: Date | null,
  now: Date = new Date(),
): boolean {
  if (NON_MARKET.has(assetClass)) return false;
  if (!asOf) return true;
  return now.getTime() - asOf.getTime() > maxAgeDays(assetClass) * DAY;
}
