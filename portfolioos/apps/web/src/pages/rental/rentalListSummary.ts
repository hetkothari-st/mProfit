import type { RentalPropertyDTO } from '@/api/rental/rental.api';

/**
 * What a property card on the Rental list shows about rent: the receipts of
 * the CURRENT tenancy only.
 *
 * A property keeps every tenancy it ever had, and each has its own receipt
 * for a month. Mixing them made a card lie: an ended tenancy's unpaid month
 * painted the strip red over the same month just marked received for the
 * current tenant, and its overdue count kept the card red however much was
 * collected. An ended tenancy's arrears still show on the property's own page
 * and in Collections; the list is about the tenancy running now.
 */

type Tenancy = NonNullable<RentalPropertyDTO['tenancies']>[number];
type Receipt = NonNullable<Tenancy['rentReceipts']>[number];
export type ReceiptStatus = 'RECEIVED' | 'EXPECTED' | 'PARTIAL' | 'OVERDUE' | 'SKIPPED';

/** Worst first: with two tenants on one property, one unpaid month is still unpaid. */
const SEVERITY: Record<ReceiptStatus, number> = { OVERDUE: 4, PARTIAL: 3, EXPECTED: 2, RECEIVED: 1, SKIPPED: 0 };

/**
 * The tenancies a card reports on: the active ones, or — for a vacant
 * property — the most recent one, whose history the strip still shows.
 */
function currentTenancies(property: RentalPropertyDTO): Tenancy[] {
  const all = property.tenancies ?? [];
  const active = all.filter((t) => t.isActive);
  if (active.length > 0) return active;
  const latest = [...all].sort((a, b) => String(b.startDate).localeCompare(String(a.startDate)))[0];
  return latest ? [latest] : [];
}

export function getPropertySummary(property: RentalPropertyDTO) {
  const activeTenancy = property.tenancies?.find((t) => t.isActive);
  const activeReceipts: Receipt[] = (property.tenancies ?? [])
    .filter((t) => t.isActive)
    .flatMap((t) => t.rentReceipts ?? []);
  const overdueCount = activeReceipts.filter((r) => r.status === 'OVERDUE').length;
  const expectedCount = activeReceipts.filter((r) => r.status === 'EXPECTED').length;
  const nextDue = activeReceipts
    .filter((r) => r.status === 'EXPECTED')
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];
  // The strip: the current tenancy's receipts (the latest one's, if vacant).
  const stripReceipts = currentTenancies(property).flatMap((t) => t.rentReceipts ?? []);
  return { activeTenancy, overdueCount, expectedCount, nextDue, stripReceipts };
}

/** Overdue receipts across the list, current tenancies only (the summary at the top). */
export function totalOverdue(properties: RentalPropertyDTO[]): number {
  return properties.reduce((sum, p) => sum + getPropertySummary(p).overdueCount, 0);
}

/** The trailing 12 months, one status each; months with two receipts show the worse. */
export function buildLast12(receipts: Array<{ forMonth: string; status: string }>, now = new Date()) {
  const byMonth = new Map<string, ReceiptStatus>();
  for (const r of receipts) {
    const s = r.status as ReceiptStatus;
    if (!(s in SEVERITY)) continue;
    const prev = byMonth.get(r.forMonth);
    if (prev === undefined || SEVERITY[s] > SEVERITY[prev]) byMonth.set(r.forMonth, s);
  }
  const cells: Array<{ month: string; label: string; status: ReceiptStatus | null }> = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    cells.push({
      month: key,
      label: d.toLocaleString('en-IN', { month: 'short' }).slice(0, 1),
      status: byMonth.get(key) ?? null,
    });
  }
  return cells;
}
