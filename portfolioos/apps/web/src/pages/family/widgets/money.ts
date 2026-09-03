import { toDecimal } from '@portfolioos/shared';

/**
 * Money helpers for the family dashboard widgets.
 *
 * Every money field on the family dashboard contract (`@portfolioos/shared`,
 * types/familyDashboard.ts) is a decimal STRING — `netWorth`, `invested`,
 * `shortfall`, `lifeCover`, `amount`, and the rest. These three functions are
 * the only places a widget is allowed to look inside one:
 * `Number(x)` / `parseFloat(x)` on money is banned by
 * `portfolioos/no-money-coercion` (§3.2), and rightly so — a float round-trip
 * on a ₹4-crore household total is a visible error.
 *
 * `toDecimal` throws on null/undefined, so each guard is explicit rather than
 * relying on a try/catch.
 */

/** Money → chart geometry only. Nullish/empty collapses to 0. */
export function moneyToNumber(value: string | null | undefined): number {
  if (value === null || value === undefined || value === '') return 0;
  return toDecimal(value).toNumber();
}

/** True when the decimal string is strictly greater than zero. */
export function isPositiveMoney(value: string | null | undefined): boolean {
  if (value === null || value === undefined || value === '') return false;
  return toDecimal(value).greaterThan(0);
}

/**
 * -1 / 0 / 1 for a money string, without ever building a new numeric literal
 * out of it. Used to pick the positive/negative ink on a P&L cell.
 */
export function moneySign(value: string | null | undefined): -1 | 0 | 1 {
  if (value === null || value === undefined || value === '') return 0;
  const d = toDecimal(value);
  if (d.greaterThan(0)) return 1;
  if (d.lessThan(0)) return -1;
  return 0;
}

/** "1 member" / "3 members" — used in the partial-data copy. */
export function pluralMembers(n: number): string {
  return n === 1 ? '1 member' : `${n} members`;
}
