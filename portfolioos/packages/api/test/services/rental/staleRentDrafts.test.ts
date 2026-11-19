import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

const gmail = vi.hoisted(() => ({
  sendViaGmailApi: vi.fn(async () => ({ sent: true })),
  getGmailSendAccount: vi.fn(async () => ({ email: 'landlord@example.com' })),
}));
vi.mock('../../../src/services/notifications/gmailSender.service.js', () => gmail);

import { prisma } from '../../../src/lib/prisma.js';
import { runAsSystem } from '../../../src/lib/requestContext.js';
import {
  approveAndSendReminder,
  enqueuePendingReminders,
} from '../../../src/services/rental/rental.reminders.service.js';
import { createTestScope, type TestScope } from '../../helpers/db.js';

const DAY = 86_400_000;
const utcDay = (offsetDays: number) => {
  const d = new Date(Date.now() + offsetDays * DAY);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
};
const monthOf = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;

/**
 * "Rent is due in 3 days" is only true until the due date. These drafts used to stay waiting for approval
 * forever (only paying the rent cleared them), so the queue showed "DUE TODAY" for months already past,
 * and approving one would have emailed the tenant a false reminder.
 */
describe('pre-due rent reminders go stale once the due date has passed (DB)', () => {
  let scope: TestScope;
  let staleReminderId = '';
  let upcomingReminderId = '';
  let overdueReceiptId = '';

  beforeAll(async () => {
    scope = await createTestScope('rent-stale-drafts');
    await runAsSystem(async () => {
      const property = await prisma.rentalProperty.create({
        data: { userId: scope.userId, name: 'Stale Draft Flat', propertyType: 'RESIDENTIAL' },
      });
      const tenancy = await prisma.tenancy.create({
        data: {
          propertyId: property.id, tenantName: 'Draft Tenant', tenantEmail: 'tenant@example.com',
          startDate: utcDay(-200), monthlyRent: '20000', rentDueDay: 1,
        },
      });
      const pastDue = utcDay(-30);
      const futureDue = utcDay(10);
      const overdue = await prisma.rentReceipt.create({
        data: { tenancyId: tenancy.id, forMonth: monthOf(pastDue), expectedAmount: '20000', dueDate: pastDue, status: 'OVERDUE' },
      });
      const upcoming = await prisma.rentReceipt.create({
        data: { tenancyId: tenancy.id, forMonth: monthOf(futureDue), expectedAmount: '20000', dueDate: futureDue, status: 'EXPECTED' },
      });
      overdueReceiptId = overdue.id;
      const draft = (receiptId: string, leadDays: number) =>
        prisma.rentReminder.create({
          data: {
            receiptId, tenancyId: tenancy.id, leadDays, status: 'PENDING_APPROVAL',
            channels: { email: true }, subject: 'Rent reminder', body: 'is due in 3 days', smsBody: 'm',
          },
        });
      staleReminderId = (await draft(overdue.id, 3)).id; // a due-in-3-days draft for a month 30 days past
      upcomingReminderId = (await draft(upcoming.id, 5)).id; // a genuine one: due in 10 days, lead 5 (not yet its day)
    });
  });

  afterAll(async () => {
    await runAsSystem(() => prisma.rentalProperty.deleteMany({ where: { userId: scope.userId } }));
    await scope.cleanup();
  });

  const status = (id: string) =>
    runAsSystem(async () => (await prisma.rentReminder.findUniqueOrThrow({ where: { id } })).status);

  it('refuses to send a stale "due in N days" draft, withdraws it, and sends nothing', async () => {
    gmail.sendViaGmailApi.mockClear();
    await expect(scope.runAs(() => approveAndSendReminder(scope.userId, staleReminderId))).rejects.toMatchObject({
      statusCode: 400,
      message: expect.stringContaining('out of date'),
    });
    expect(gmail.sendViaGmailApi).not.toHaveBeenCalled();
    expect(await status(staleReminderId)).toBe('SUPERSEDED');
  });

  it('the scan withdraws stale pre-due drafts, leaves upcoming ones, and drafts the overdue reminder instead', async () => {
    // Put the stale draft back so the scan, not the approve guard, is what is under test.
    await runAsSystem(() => prisma.rentReminder.update({ where: { id: staleReminderId }, data: { status: 'PENDING_APPROVAL' } }));
    await runAsSystem(() => enqueuePendingReminders(scope.userId));

    expect(await status(staleReminderId)).toBe('SUPERSEDED');
    expect(await status(upcomingReminderId)).toBe('PENDING_APPROVAL');
    const overdueDrafts = await runAsSystem(() =>
      prisma.rentReminder.findMany({ where: { receiptId: overdueReceiptId, leadDays: -1 } }),
    );
    expect(overdueDrafts).toHaveLength(1);
    expect(overdueDrafts[0]!.status).toBe('PENDING_APPROVAL');
  });
});
