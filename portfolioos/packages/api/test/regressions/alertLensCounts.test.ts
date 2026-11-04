import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestScope, prisma, type TestScope } from '../helpers/db.js';
import { runAsSystem } from '../../src/lib/requestContext.js';
import { getUnreadCount, listAlerts } from '../../src/services/notifications/alerts.service.js';

/**
 * The Alerts page's filter chips counted only the 30 alerts on the loaded page,
 * so the page's Unread count fell short of the bell's once alerts passed 30. The API
 * now counts every lens across the whole inbox and filters by lens itself.
 */

const NOW = new Date('2026-11-04T06:30:00Z'); // 12:00 IST, 4 Nov
const day = (offset: number) => new Date(Date.UTC(2026, 10, 4 + offset));

let scope: TestScope;

beforeAll(async () => {
  scope = await createTestScope('alert-lens');
  const rows: Array<{ type: 'CUSTOM' | 'LOAN_REFINANCE' | 'INSURANCE_PREMIUM'; offset: number; isRead: boolean }> = [
    // 35 overdue custom reminders: more than one page.
    ...Array.from({ length: 35 }, (_, i) => ({ type: 'CUSTOM' as const, offset: -1 - i, isRead: i % 5 === 0 })),
    { type: 'LOAN_REFINANCE', offset: -3, isRead: false }, // news: "this week", never overdue
    { type: 'INSURANCE_PREMIUM', offset: 0, isRead: false }, // today: due soon
    { type: 'INSURANCE_PREMIUM', offset: 7, isRead: true }, // 7 days out: due soon
    { type: 'INSURANCE_PREMIUM', offset: 8, isRead: false }, // 8 days out: not soon
  ];
  await runAsSystem(() =>
    prisma.alert.createMany({
      data: rows.map((r, i) => ({
        userId: scope.userId,
        type: r.type,
        title: `alert ${i}`,
        triggerDate: day(r.offset),
        isRead: r.isRead,
      })),
    }),
  );
});

afterAll(async () => {
  await runAsSystem(() => prisma.alert.deleteMany({ where: { userId: scope.userId } }));
  await scope.cleanup();
});

describe('alert lenses', () => {
  it('counts every lens across the whole inbox, not the loaded page', async () => {
    const res = await scope.runAs(() => listAlerts(scope.userId, { limit: 30 }, NOW));
    expect(res.alerts).toHaveLength(30);
    // 35 custom (7 read) + news + 3 premiums (1 read) = 39 alerts, 31 unread.
    expect(res.counts).toEqual({ all: 39, overdue: 35, soon: 3, unread: 31 });
    // "Unread" with no type filter is the bell's number.
    expect(res.counts.unread).toBe(await scope.runAs(() => getUnreadCount(scope.userId)));
  });

  it('filters by lens on the server and pages within it', async () => {
    const overdue = await scope.runAs(() => listAlerts(scope.userId, { lens: 'overdue', limit: 30, page: 2 }, NOW));
    expect(overdue.total).toBe(35);
    expect(overdue.alerts).toHaveLength(5);
    expect(overdue.alerts.every((a) => a.type === 'CUSTOM')).toBe(true);

    const soon = await scope.runAs(() => listAlerts(scope.userId, { lens: 'soon' }, NOW));
    expect(soon.alerts.map((a) => a.type).sort()).toEqual(['INSURANCE_PREMIUM', 'INSURANCE_PREMIUM', 'LOAN_REFINANCE']);

    const unread = await scope.runAs(() => listAlerts(scope.userId, { lens: 'unread', limit: 200 }, NOW));
    expect(unread.alerts.every((a) => !a.isRead)).toBe(true);
    expect(unread.total).toBe(31);
  });

  it('keeps lens counts within a type filter', async () => {
    const res = await scope.runAs(() => listAlerts(scope.userId, { type: 'INSURANCE_PREMIUM' }, NOW));
    expect(res.counts).toEqual({ all: 3, overdue: 0, soon: 2, unread: 2 });
  });
});
