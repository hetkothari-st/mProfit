import { describe, it, expect } from 'vitest';
import type { RentalPropertyDTO } from '@/api/rental/rental.api';
import { buildLast12, getPropertySummary, totalOverdue } from './rentalListSummary';

// A property card on the Rental list reports on the CURRENT tenancy. Mixing
// in an ended tenancy kept cards red after the current month was marked
// received: the old tenant's unpaid receipt for the same month won the strip,
// and its overdue count never went away.

const receipt = (forMonth: string, status: string) => ({
  id: `${forMonth}-${status}`,
  forMonth,
  status,
  dueDate: `${forMonth}-05`,
  expectedAmount: '25000',
  receivedAmount: status === 'RECEIVED' ? '25000' : null,
});

function property(tenancies: Array<{ isActive: boolean; startDate: string; receipts: ReturnType<typeof receipt>[] }>): RentalPropertyDTO {
  return {
    id: 'p1',
    name: 'Andheri flat',
    tenancies: tenancies.map((t, i) => ({
      id: `t${i}`,
      isActive: t.isActive,
      startDate: t.startDate,
      monthlyRent: '25000',
      rentReceipts: t.receipts,
    })),
  } as unknown as RentalPropertyDTO;
}

const NOW = new Date(2026, 10, 2); // November 2026

describe('Rental list cards', () => {
  const p = property([
    { isActive: true, startDate: '2026-09-01', receipts: [receipt('2026-10', 'RECEIVED'), receipt('2026-09', 'RECEIVED')] },
    // The previous tenant left owing September and October.
    { isActive: false, startDate: '2025-01-01', receipts: [receipt('2026-10', 'OVERDUE'), receipt('2026-09', 'OVERDUE')] },
  ]);

  it('shows the current tenant’s month as received, not an old tenant’s unpaid one', () => {
    const { stripReceipts } = getPropertySummary(p);
    const cells = buildLast12(stripReceipts, NOW);
    expect(cells.find((c) => c.month === '2026-10')?.status).toBe('RECEIVED');
    expect(cells.find((c) => c.month === '2026-09')?.status).toBe('RECEIVED');
  });

  it('counts overdue months of the current tenancy only, on the card and in the total', () => {
    expect(getPropertySummary(p).overdueCount).toBe(0);
    expect(totalOverdue([p])).toBe(0);
  });

  it('turns green as soon as the current tenant’s overdue month is marked received', () => {
    const before = property([{ isActive: true, startDate: '2026-01-01', receipts: [receipt('2026-10', 'OVERDUE')] }]);
    const after = property([{ isActive: true, startDate: '2026-01-01', receipts: [receipt('2026-10', 'RECEIVED')] }]);
    expect(getPropertySummary(before).overdueCount).toBe(1);
    expect(getPropertySummary(after).overdueCount).toBe(0);
    expect(buildLast12(getPropertySummary(after).stripReceipts, NOW).at(-2)?.status).toBe('RECEIVED');
  });

  it('with two current tenants, a month either still owes stays red', () => {
    const shared = property([
      { isActive: true, startDate: '2026-01-01', receipts: [receipt('2026-10', 'RECEIVED')] },
      { isActive: true, startDate: '2026-01-01', receipts: [receipt('2026-10', 'OVERDUE')] },
    ]);
    expect(buildLast12(getPropertySummary(shared).stripReceipts, NOW).find((c) => c.month === '2026-10')?.status).toBe('OVERDUE');
    expect(getPropertySummary(shared).overdueCount).toBe(1);
  });

  it('a vacant property still shows its last tenancy’s history, but nothing overdue', () => {
    const vacant = property([
      { isActive: false, startDate: '2026-01-01', receipts: [receipt('2026-06', 'OVERDUE'), receipt('2026-05', 'RECEIVED')] },
    ]);
    const { stripReceipts, overdueCount } = getPropertySummary(vacant);
    expect(buildLast12(stripReceipts, NOW).find((c) => c.month === '2026-05')?.status).toBe('RECEIVED');
    expect(overdueCount).toBe(0);
  });
});
