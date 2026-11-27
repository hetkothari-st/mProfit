import type { AssetClass } from '@prisma/client';
import { EQUITY_CLOSE_AVAILABLE_IST, NAV_AVAILABLE_IST, isSessionPriceStale } from '@everypaisa/shared';

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

/** Priced off an Indian exchange's end-of-day close. */
const EXCHANGE_SESSION: ReadonlySet<AssetClass> = new Set<AssetClass>([
  'EQUITY', 'ETF', 'GOLD_ETF', 'REIT', 'INVIT', 'GOLD_BOND',
]);

/**
 * Max age before a market price is considered stale, by class.
 *
 * `asOf` is the date the price is FOR (a trading day or NAV date, stored at
 * midnight UTC), not when we fetched it. So a Friday close read on Monday
 * evening IST is already ~3.6 days "old" without anything being wrong. The
 * budget is a weekend + one market holiday + the day itself: 5 days. Crypto
 * prices are daily rows too, so one missed day plus the day itself: 2.
 */
function maxAgeDays(assetClass: AssetClass): number {
  return assetClass === 'CRYPTOCURRENCY' ? 2 : 5;
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
  // Exchange-traded prices and fund NAVs are judged by trading sessions, so a
  // Friday close on Sunday is current and the same price on Tuesday evening
  // is not (shared/marketSession.ts).
  if (EXCHANGE_SESSION.has(assetClass)) return isSessionPriceStale(asOf, now, EQUITY_CLOSE_AVAILABLE_IST);
  if (assetClass === 'MUTUAL_FUND') return isSessionPriceStale(asOf, now, NAV_AVAILABLE_IST);
  return now.getTime() - asOf.getTime() > maxAgeDays(assetClass) * DAY;
}

/** True for classes valued off a market price feed (so a missing price is a gap). */
export function hasMarketPrice(assetClass: AssetClass): boolean {
  return !NON_MARKET.has(assetClass);
}
