import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { backfillRentalLedger } from '../../scripts/backfillRentalLedger.js';
import { createTestScope, prisma, type TestScope } from '../helpers/db.js';

/**
 * INVARIANT: backfilling a legacy tenancy must not move a single receipt.
 * Statuses and received amounts recorded before the ledger existed have to
 * survive the migration byte-for-byte.
 */
describe('backfillRentalLedger parity', () => {
  let scope: TestScope;
  let tenancyId: string;

  beforeAll(async () => {
    scope = await createTestScope('rental-ledger-backfill');
    await scope.runAs(async () => {
      const property = await prisma.rentalProperty.create({
        data: { userId: scope.userId, name: 'Backfill Test', propertyType: 'RESIDENTIAL' },
      });
      const tenancy = await prisma.tenancy.create({
        data: {
          propertyId: property.id,
          tenantName: 'Legacy Tenant',
          startDate: new Date('2026-01-01T00:00:00.000Z'),
          monthlyRent: '30000',
          securityDeposit: '60000',
          rentDueDay: 1,
        },
      });
      tenancyId = tenancy.id;
      await prisma.rentReceipt.create({
        data: {
          tenancyId, forMonth: '2026-01', expectedAmount: '30000',
          dueDate: new Date('2026-01-01T00:00:00.000Z'),
          status: 'RECEIVED', receivedAmount: '30000',
          receivedOn: new Date('2026-01-04T00:00:00.000Z'),
        },
      });
      await prisma.rentReceipt.create({
        data: {
          tenancyId, forMonth: '2026-02', expectedAmount: '30000',
          dueDate: new Date('2026-02-01T00:00:00.000Z'),
          status: 'PARTIAL', receivedAmount: '10000',
          receivedOn: new Date('2026-02-06T00:00:00.000Z'),
        },
      });
    });
  });

  afterAll(async () => {
    await scope.cleanup();
  });

  it('creates entries and reports zero drift', async () => {
    const report = await backfillRentalLedger();
    expect(report.drift).toEqual([]);
    expect(report.paymentsCreated).toBeGreaterThanOrEqual(2);
    expect(report.depositsCreated).toBeGreaterThanOrEqual(1);
  });

  it('preserves every receipt status and amount', async () => {
    await scope.runAs(async () => {
      const rows = await prisma.rentReceipt.findMany({
        where: { tenancyId }, orderBy: { dueDate: 'asc' },
      });
      expect(rows.map((r) => [r.forMonth, r.status, r.receivedAmount?.toString()])).toEqual([
        ['2026-01', 'RECEIVED', '30000'],
        ['2026-02', 'PARTIAL', '10000'],
      ]);
      const tenancy = await prisma.tenancy.findUniqueOrThrow({ where: { id: tenancyId } });
      expect(tenancy.depositHeld.toString()).toBe('60000');
      expect(tenancy.balanceDue.toString()).toBe('20000');
    });
  });

  it('is idempotent — a second run creates nothing new', async () => {
    const report = await backfillRentalLedger();
    expect(report.paymentsCreated).toBe(0);
    expect(report.depositsCreated).toBe(0);
    expect(report.drift).toEqual([]);
  });
});
