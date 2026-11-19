import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../../../src/lib/prisma.js';
import { runAsSystem } from '../../../src/lib/requestContext.js';
import { enqueuePendingReminders } from '../../../src/services/rental/rental.reminders.service.js';
import { generateRentOverdueAlerts } from '../../../src/services/notifications/alerts.service.js';
import {
  RENT_CHASE_WINDOW_DAYS,
  formatRentMonth,
  rentChaseCutoff,
} from '../../../src/services/rental/rentalLedgerMath.js';
import { createTestScope, type TestScope } from '../../helpers/db.js';

const DAY = 86_400_000;
const utcDay = (offsetDays: number) => {
  const d = new Date(Date.now() + offsetDays * DAY);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
};
const monthOf = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;

describe('rentChaseCutoff / formatRentMonth', () => {
  it('goes back the chase window from a UTC-midnight day', () => {
    const today = new Date('2026-11-19T00:00:00Z');
    expect(rentChaseCutoff(today).toISOString().slice(0, 10)).toBe('2026-08-21');
    expect(RENT_CHASE_WINDOW_DAYS).toBe(90);
  });

  it('writes months as "Sep 2025", never the locale\'s "Sept"', () => {
    expect(formatRentMonth('2025-09')).toBe('Sep 2025');
    expect(formatRentMonth('2027-01')).toBe('Jan 2027');
    expect(formatRentMonth('garbage')).toBe('garbage');
  });
});

describe('overdue rent is chased only while it is recent (DB)', () => {
  let scope: TestScope;
  let recentId = '';
  let oldId = '';
  let oldAlertId = '';
  let oldReminderId = '';

  beforeAll(async () => {
    scope = await createTestScope('rent-chase');
    await runAsSystem(async () => {
      const property = await prisma.rentalProperty.create({
        data: { userId: scope.userId, name: 'Chase Test Flat', propertyType: 'RESIDENTIAL' },
      });
      const tenancy = await prisma.tenancy.create({
        data: {
          propertyId: property.id, tenantName: 'Chase Tenant', startDate: utcDay(-400), monthlyRent: '20000', rentDueDay: 1,
        },
      });
      const recentDue = utcDay(-20);
      const oldDue = utcDay(-300);
      const recent = await prisma.rentReceipt.create({
        data: { tenancyId: tenancy.id, forMonth: monthOf(recentDue), expectedAmount: '20000', dueDate: recentDue, status: 'OVERDUE' },
      });
      const old = await prisma.rentReceipt.create({
        data: { tenancyId: tenancy.id, forMonth: monthOf(oldDue), expectedAmount: '20000', dueDate: oldDue, status: 'OVERDUE' },
      });
      recentId = recent.id;
      oldId = old.id;

      // What earlier scans left behind: a draft tenant reminder and an owner alert for the OLD month.
      const reminder = await prisma.rentReminder.create({
        data: {
          receiptId: old.id, tenancyId: tenancy.id, leadDays: -1, status: 'PENDING_APPROVAL',
          channels: { email: true }, subject: 's', body: 'b', smsBody: 'm',
        },
      });
      oldReminderId = reminder.id;
      const alert = await prisma.alert.create({
        data: {
          userId: scope.userId, type: 'CUSTOM', title: 'Rent overdue - Chase Test Flat', triggerDate: new Date(),
          description: 'old', metadata: { key: `rent_overdue:${old.id}`, receiptId: old.id, forMonth: old.forMonth },
        },
      });
      oldAlertId = alert.id;
    });
  });

  afterAll(async () => {
    await runAsSystem(async () => {
      await prisma.alert.deleteMany({ where: { userId: scope.userId } });
      await prisma.rentalProperty.deleteMany({ where: { userId: scope.userId } });
    });
    await scope.cleanup();
  });

  it('drafts tenant reminders only for recent months and withdraws the old pending draft', async () => {
    await runAsSystem(() => enqueuePendingReminders(scope.userId));
    const reminders = await runAsSystem(() =>
      prisma.rentReminder.findMany({ where: { tenancy: { property: { userId: scope.userId } } } }),
    );
    expect(reminders.some((r) => r.receiptId === recentId && r.leadDays === -1)).toBe(true);
    // No new draft for the old month, and the one already waiting is withdrawn.
    expect(reminders.filter((r) => r.receiptId === oldId && r.id !== oldReminderId)).toHaveLength(0);
    expect(reminders.find((r) => r.id === oldReminderId)?.status).toBe('SUPERSEDED');
  });

  it('alerts the owner for recent months only, closing (not deleting) the old alert, with readable text', async () => {
    await runAsSystem(() => generateRentOverdueAlerts(scope.userId));
    const alerts = await runAsSystem(() => prisma.alert.findMany({ where: { userId: scope.userId } }));

    const forRecent = alerts.filter((a) => (a.metadata as { receiptId?: string } | null)?.receiptId === recentId);
    expect(forRecent).toHaveLength(1);
    expect(forRecent[0]!.isActive).toBe(true);
    expect(forRecent[0]!.description).toMatch(/^[A-Z][a-z]{2} \d{4} rent of ₹20,000\.00 is overdue$/);

    const old = alerts.find((a) => a.id === oldAlertId);
    expect(old).toBeDefined(); // kept as a record
    expect(old!.isActive).toBe(false);
    expect(alerts.filter((a) => (a.metadata as { receiptId?: string } | null)?.receiptId === oldId)).toHaveLength(1);
  });

  it('leaves the old receipt overdue: it is still counted and still on the property page', async () => {
    const old = await runAsSystem(() => prisma.rentReceipt.findUniqueOrThrow({ where: { id: oldId } }));
    expect(old.status).toBe('OVERDUE');
  });
});
