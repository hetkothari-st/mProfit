import type { QueryClient } from '@tanstack/react-query';

/**
 * Every cached read that reflects rent money.
 *
 * Rent state is now a projection: one payment recomputes a receipt's status,
 * the tenancy's balance, the collections list, the property P&L, the dashboard
 * and any overdue alerts. Before this existed each mutation site kept its own
 * list of keys to invalidate, and the lists disagreed — marking a month
 * received on the property page left the tenant's khata showing the old
 * balance, and adding a payment in the khata left the property page showing
 * the month still unpaid. Both were the same defect pointing opposite ways.
 *
 * Keys are prefixes: TanStack Query matches by prefix, so 'tenancy-ledger'
 * covers every ['tenancy-ledger', id] and 'rental-pnl' covers every date
 * range. Invalidating a little more than strictly necessary is the right
 * trade here — rent mutations are infrequent and these payloads are small,
 * whereas a stale money figure is the bug this whole feature exists to avoid.
 */
const RENTAL_QUERY_PREFIXES = [
  'rental-property',
  'rental-properties',
  'tenancy-ledger',
  'rental-collections',
  'rental-pnl',
  'rental-receipts',
  'rental-reminders',
  // Rent money lands in the portfolio as a CashFlow, so the Cash Activity
  // page and any bank-account view showing it are downstream of a khata entry
  // just as much as the khata is.
  'cashflows',
  'bank-accounts',
  'dashboard',
  'alerts',
  'alerts-unread',
  'notifications',
] as const;

/**
 * Call after ANY mutation that moves rent money — a payment, a ledger entry,
 * mark/unmark received, skip/unskip, an undone auto-match, or a tenancy edit.
 * Add to the list above rather than invalidating ad hoc at a call site.
 */
export function invalidateRentalCaches(qc: QueryClient): void {
  for (const prefix of RENTAL_QUERY_PREFIXES) {
    qc.invalidateQueries({ queryKey: [prefix] });
  }
}
