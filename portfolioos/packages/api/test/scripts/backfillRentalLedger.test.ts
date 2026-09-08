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
  let receivedReceiptId: string;
  let partialReceiptId: string;

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
      const received = await prisma.rentReceipt.create({
        data: {
          tenancyId, forMonth: '2026-01', expectedAmount: '30000',
          dueDate: new Date('2026-01-01T00:00:00.000Z'),
          status: 'RECEIVED', receivedAmount: '30000',
          receivedOn: new Date('2026-01-04T00:00:00.000Z'),
        },
      });
      receivedReceiptId = received.id;
      const partial = await prisma.rentReceipt.create({
        data: {
          tenancyId, forMonth: '2026-02', expectedAmount: '30000',
          dueDate: new Date('2026-02-01T00:00:00.000Z'),
          status: 'PARTIAL', receivedAmount: '10000',
          receivedOn: new Date('2026-02-06T00:00:00.000Z'),
        },
      });
      partialReceiptId = partial.id;
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

    // FIX 1: the PARTIAL receipt's pinned credit never fully settles its
    // charge, so `receivedOn` legitimately clears to null. That's a real
    // column change the migration must surface — just not as `drift`,
    // because the money (status/receivedAmount) didn't move.
    expect(report.semanticChanges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          receiptId: partialReceiptId,
          field: 'receivedOn',
          before: '2026-02-06T00:00:00.000Z',
          after: null,
        }),
      ]),
    );
    // The fully-RECEIVED receipt settles immediately, so its receivedOn is
    // untouched — no semantic change should be reported for it.
    expect(
      report.semanticChanges.some((c) => c.receiptId === receivedReceiptId),
    ).toBe(false);
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

/**
 * FIX 4: a skipped receipt that still carries a legacy `receivedAmount` is
 * an edge case a one-way migration must not get wrong. This test asserts
 * whatever the real post-recompute outcome is — it does not assume the
 * outcome in advance.
 */
describe('backfillRentalLedger — skipped receipt with legacy receivedAmount', () => {
  let scope: TestScope;
  let skippedReceiptId: string;

  beforeAll(async () => {
    scope = await createTestScope('rental-ledger-backfill-skipped');
    await scope.runAs(async () => {
      const property = await prisma.rentalProperty.create({
        data: { userId: scope.userId, name: 'Backfill Skipped Test', propertyType: 'RESIDENTIAL' },
      });
      const tenancy = await prisma.tenancy.create({
        data: {
          propertyId: property.id,
          tenantName: 'Skipped Legacy Tenant',
          startDate: new Date('2026-03-01T00:00:00.000Z'),
          monthlyRent: '20000',
          rentDueDay: 1,
        },
      });
      const receipt = await prisma.rentReceipt.create({
        data: {
          tenancyId: tenancy.id, forMonth: '2026-03', expectedAmount: '20000',
          dueDate: new Date('2026-03-01T00:00:00.000Z'),
          // Legacy state: someone recorded this month as received before it
          // was later marked skipped, and nothing ever cleared the stale
          // receivedAmount.
          status: 'RECEIVED', receivedAmount: '20000',
          receivedOn: new Date('2026-03-03T00:00:00.000Z'),
          isSkipped: true,
        },
      });
      skippedReceiptId = receipt.id;
    });
  });

  afterAll(async () => {
    await scope.cleanup();
  });

  it('records the real outcome instead of assuming one', async () => {
    const report = await backfillRentalLedger();

    // Observed behaviour: recomputeTenancyLedger excludes isSkipped receipts
    // from the charge set entirely (rentalLedger.service.ts), so this
    // receipt never receives an allocation regardless of its stale legacy
    // receivedAmount, and deriveReceiptStatus forces status to SKIPPED
    // whenever isSkipped is true. The legacy receivedAmount is discarded.
    await scope.runAs(async () => {
      const row = await prisma.rentReceipt.findUniqueOrThrow({ where: { id: skippedReceiptId } });
      expect(row.status).toBe('SKIPPED');
      expect(row.receivedAmount).toBeNull();
    });

    // This is exactly the kind of one-way, money-changing outcome `drift`
    // exists to surface — it must appear there, not be silently dropped.
    expect(
      report.drift.some(
        (d) => d.receiptId === skippedReceiptId && d.before === 'RECEIVED|20000' && d.after === 'SKIPPED|',
      ),
    ).toBe(true);
  });
});
