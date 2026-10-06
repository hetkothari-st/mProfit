import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { recomputeTenancyLedger } from '../../src/services/rentalLedger.service.js';
import { runInTransaction } from '../../src/lib/prisma.js';
import { createTestScope, prisma, type TestScope } from '../helpers/db.js';

/**
 * INVARIANT (whole-branch review, FIX 7): two concurrent recomputes of one
 * tenancy must not lose a payment.
 *
 * `recomputeTenancyLedger` reads every receipt and every entry, then writes
 * the whole projection back. Under READ COMMITTED, two writers on the same
 * tenancy — a user recording a payment while the auto-match hook projects a
 * bank credit is the realistic pairing — each read a snapshot missing the
 * other's row, and the later commit overwrites `balanceDue` and the receipt
 * projection with a total that omits one payment. Nothing self-heals it.
 *
 * The fix is a `SELECT … FOR UPDATE` on the Tenancy row as the first
 * statement of the recompute. These tests pin two things:
 *   1. the locking select works under RLS as the app role (NOSUPERUSER,
 *      NOBYPASSRLS) — the owner-join policy does not filter the row out;
 *   2. it actually serialises — a second recompute blocks until the first
 *      transaction commits, then reads the committed state.
 */
describe('recomputeTenancyLedger serialises per tenancy', () => {
  let scope: TestScope;
  let tenancyId: string;

  beforeAll(async () => {
    scope = await createTestScope('rental-ledger-concurrency');
    await scope.runAs(async () => {
      const property = await prisma.rentalProperty.create({
        data: { userId: scope.userId, name: 'Concurrency Flat', propertyType: 'RESIDENTIAL' },
      });
      const tenancy = await prisma.tenancy.create({
        data: {
          propertyId: property.id,
          tenantName: 'Race Tenant',
          startDate: new Date('2026-06-01T00:00:00.000Z'),
          monthlyRent: '45000',
          rentDueDay: 1,
        },
      });
      tenancyId = tenancy.id;
      await prisma.rentReceipt.create({
        data: {
          tenancyId, forMonth: '2026-06', expectedAmount: '45000',
          dueDate: new Date('2026-06-01T00:00:00.000Z'), status: 'EXPECTED',
        },
      });
    });
  });

  afterAll(async () => {
    await scope.cleanup();
  });

  it('the locking select returns the row under RLS as the app role', async () => {
    await scope.runAs(async () => {
      const rows = await runInTransaction(
        (tx) => tx.$queryRaw<Array<{ id: string }>>`
          SELECT id FROM "Tenancy" WHERE id = ${tenancyId} FOR UPDATE
        `,
      );
      // If the tenancy_owner policy blocked FOR UPDATE, this would be empty
      // and the recompute would silently stop locking anything.
      expect(rows.map((r) => r.id)).toEqual([tenancyId]);
    });
  });

  it('a second recompute waits for the first transaction and sees its payment', async () => {
    await scope.runAs(async () => {
      let releaseFirst!: () => void;
      const held = new Promise<void>((resolve) => { releaseFirst = resolve; });
      let firstHasLock!: () => void;
      const locked = new Promise<void>((resolve) => { firstHasLock = resolve; });

      const first = runInTransaction(async (tx) => {
        // Takes the row lock as its first statement.
        await recomputeTenancyLedger(tx, tenancyId);
        firstHasLock();
        await held;
        await tx.rentLedgerEntry.create({
          data: {
            tenancyId,
            entryType: 'PAYMENT',
            amount: '20000',
            entryDate: new Date('2026-06-05T00:00:00.000Z'),
            forMonth: '2026-06',
            note: 'writer A',
          },
        });
        await recomputeTenancyLedger(tx, tenancyId);
      });

      await locked;

      let secondDone = false;
      const second = runInTransaction(async (tx) => {
        await tx.rentLedgerEntry.create({
          data: {
            tenancyId,
            entryType: 'PAYMENT',
            amount: '15000',
            entryDate: new Date('2026-06-06T00:00:00.000Z'),
            forMonth: '2026-06',
            note: 'writer B',
          },
        });
        await recomputeTenancyLedger(tx, tenancyId);
      }).then(() => { secondDone = true; });

      // Give the second writer real time to run. It must be parked on the
      // row lock; without the lock it would have read a snapshot without
      // writer A's payment and finished by now.
      await new Promise((r) => setTimeout(r, 500));
      expect(secondDone).toBe(false);

      releaseFirst();
      await first;
      await second;

      // Neither payment was lost: 45000 - 20000 - 15000.
      const tenancy = await prisma.tenancy.findUniqueOrThrow({ where: { id: tenancyId } });
      expect(tenancy.balanceDue.toString()).toBe('10000');

      const receipt = await prisma.rentReceipt.findFirstOrThrow({ where: { tenancyId } });
      expect(receipt.status).toBe('PARTIAL');
      expect(receipt.receivedAmount?.toString()).toBe('35000');
    });
  });
});
