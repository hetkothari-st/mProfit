import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Prisma } from '@prisma/client';
import { recomputeTenancy } from '../../src/services/rentalLedger.service.js';
import { createTestScope, prisma, type TestScope } from '../helpers/db.js';

/**
 * INVARIANT: RentReceipt.status / receivedAmount / receivedOn are a
 * projection of RentLedgerEntry. Recomputing twice changes nothing, deposits
 * never touch balanceDue, and deleting a payment restores the prior state
 * exactly.
 */
describe('invariant: tenancy ledger recompute', () => {
  let scope: TestScope;
  let tenancyId: string;
  let aprId: string;
  let mayId: string;

  beforeAll(async () => {
    scope = await createTestScope('rental-ledger-recompute');
    await scope.runAs(async () => {
      const property = await prisma.rentalProperty.create({
        data: { userId: scope.userId, name: 'Khata Test', propertyType: 'RESIDENTIAL' },
      });
      const tenancy = await prisma.tenancy.create({
        data: {
          propertyId: property.id,
          tenantName: 'Ledger Tenant',
          startDate: new Date('2026-04-01T00:00:00.000Z'),
          monthlyRent: '45000',
          rentDueDay: 1,
        },
      });
      tenancyId = tenancy.id;
      const apr = await prisma.rentReceipt.create({
        data: {
          tenancyId, forMonth: '2026-04', expectedAmount: '45000',
          dueDate: new Date('2026-04-01T00:00:00.000Z'), status: 'EXPECTED',
        },
      });
      const may = await prisma.rentReceipt.create({
        data: {
          tenancyId, forMonth: '2026-05', expectedAmount: '45000',
          dueDate: new Date('2026-05-01T00:00:00.000Z'), status: 'EXPECTED',
        },
      });
      aprId = apr.id;
      mayId = may.id;
    });
  });

  afterAll(async () => {
    await scope.cleanup();
  });

  it('splits one payment FIFO across two arrears', async () => {
    await scope.runAs(async () => {
      await prisma.rentLedgerEntry.create({
        data: {
          tenancyId, entryType: 'PAYMENT', amount: '60000',
          entryDate: new Date('2026-05-10T00:00:00.000Z'),
        },
      });
      await recomputeTenancy(tenancyId);

      const apr = await prisma.rentReceipt.findUniqueOrThrow({ where: { id: aprId } });
      const may = await prisma.rentReceipt.findUniqueOrThrow({ where: { id: mayId } });
      expect(apr.status).toBe('RECEIVED');
      expect(apr.receivedAmount?.toString()).toBe('45000');
      expect(may.status).toBe('PARTIAL');
      expect(may.receivedAmount?.toString()).toBe('15000');

      const tenancy = await prisma.tenancy.findUniqueOrThrow({ where: { id: tenancyId } });
      expect(tenancy.balanceDue.toString()).toBe('30000');
    });
  });

  it('is idempotent — a second recompute changes nothing', async () => {
    await scope.runAs(async () => {
      const before = await prisma.rentReceipt.findMany({
        where: { tenancyId }, orderBy: { dueDate: 'asc' },
      });
      const tenancyBefore = await prisma.tenancy.findUniqueOrThrow({ where: { id: tenancyId } });
      await recomputeTenancy(tenancyId);
      const after = await prisma.rentReceipt.findMany({
        where: { tenancyId }, orderBy: { dueDate: 'asc' },
      });
      expect(after.map((r) => [r.status, r.receivedAmount?.toString() ?? null]))
        .toEqual(before.map((r) => [r.status, r.receivedAmount?.toString() ?? null]));

      // Regression guard for the idempotency fix: a recompute that changes
      // nothing must not touch balanceComputedAt either.
      const tenancyAfter = await prisma.tenancy.findUniqueOrThrow({ where: { id: tenancyId } });
      expect(tenancyAfter.balanceComputedAt?.getTime()).toBe(tenancyBefore.balanceComputedAt?.getTime());
    });
  });

  it('keeps deposits out of balanceDue and in depositHeld', async () => {
    await scope.runAs(async () => {
      await prisma.rentLedgerEntry.create({
        data: {
          tenancyId, entryType: 'DEPOSIT', amount: '90000',
          entryDate: new Date('2026-04-01T00:00:00.000Z'),
        },
      });
      await recomputeTenancy(tenancyId);
      const tenancy = await prisma.tenancy.findUniqueOrThrow({ where: { id: tenancyId } });
      expect(tenancy.balanceDue.toString()).toBe('30000');
      expect(tenancy.depositHeld.toString()).toBe('90000');
    });
  });

  it('restores prior state when the payment is deleted', async () => {
    await scope.runAs(async () => {
      await prisma.rentLedgerEntry.deleteMany({ where: { tenancyId, entryType: 'PAYMENT' } });
      await recomputeTenancy(tenancyId);

      const apr = await prisma.rentReceipt.findUniqueOrThrow({ where: { id: aprId } });
      expect(apr.receivedAmount).toBeNull();
      expect(apr.receivedOn).toBeNull();
      expect(['EXPECTED', 'OVERDUE']).toContain(apr.status);

      const tenancy = await prisma.tenancy.findUniqueOrThrow({ where: { id: tenancyId } });
      expect(tenancy.balanceDue.toString()).toBe('90000');
    });
  });

  it('releases credit held by a month that gets skipped', async () => {
    await scope.runAs(async () => {
      await prisma.rentReceipt.update({ where: { id: aprId }, data: { isSkipped: true } });
      await prisma.rentLedgerEntry.create({
        data: {
          tenancyId, entryType: 'PAYMENT', amount: '45000',
          entryDate: new Date('2026-05-05T00:00:00.000Z'),
        },
      });
      await recomputeTenancy(tenancyId);

      const apr = await prisma.rentReceipt.findUniqueOrThrow({ where: { id: aprId } });
      const may = await prisma.rentReceipt.findUniqueOrThrow({ where: { id: mayId } });
      expect(apr.status).toBe('SKIPPED');
      expect(may.status).toBe('RECEIVED');
    });
  });

  it('LATE_FEE raises balanceDue, DISCOUNT lowers it, and the fee competes for allocation as a charge', async () => {
    await scope.runAs(async () => {
      // Baseline after the state left by earlier tests (apr SKIPPED, may
      // RECEIVED, a deposit held). Measure deltas off this rather than an
      // absolute figure so this test doesn't depend on the exact numbers
      // produced by every test that ran before it.
      const baseline = await recomputeTenancy(tenancyId);

      const feeAmount = new Prisma.Decimal('500');
      await prisma.rentLedgerEntry.create({
        data: {
          tenancyId, entryType: 'LATE_FEE', amount: feeAmount.toString(),
          entryDate: new Date('2026-06-15T00:00:00.000Z'),
        },
      });
      const afterFee = await recomputeTenancy(tenancyId);
      expect(afterFee.balanceDue.minus(baseline.balanceDue).toString()).toBe(feeAmount.toString());

      // Prove the fee is a real charge in the allocator, not just a total: add
      // a brand-new open rent charge due AFTER the fee, then pay exactly the
      // fee amount. The fee (due 2026-06-15) is older than the June rent
      // charge (due 2026-06-20), so FIFO must settle the fee first and leave
      // the June receipt completely untouched.
      const jun = await prisma.rentReceipt.create({
        data: {
          tenancyId, forMonth: '2026-06', expectedAmount: '45000',
          dueDate: new Date('2026-06-20T00:00:00.000Z'), status: 'EXPECTED',
        },
      });
      await prisma.rentLedgerEntry.create({
        data: {
          tenancyId, entryType: 'PAYMENT', amount: feeAmount.toString(),
          entryDate: new Date('2026-06-25T00:00:00.000Z'),
        },
      });
      const afterPayment = await recomputeTenancy(tenancyId);

      const junReceipt = await prisma.rentReceipt.findUniqueOrThrow({ where: { id: jun.id } });
      // Unsettled either way — EXPECTED or OVERDUE depending on how far the
      // fixed due date sits from whenever this suite happens to run — but
      // never RECEIVED/PARTIAL: it must have received zero allocation.
      expect(['EXPECTED', 'OVERDUE']).toContain(junReceipt.status);
      expect(junReceipt.receivedAmount).toBeNull();
      // The fee's own 500 due is now fully covered by the 500 payment, so the
      // only balance left is June's untouched 45000 charge.
      expect(afterPayment.balanceDue.toString()).toBe('45000');

      const discountAmount = new Prisma.Decimal('200');
      await prisma.rentLedgerEntry.create({
        data: {
          tenancyId, entryType: 'DISCOUNT', amount: discountAmount.toString(),
          entryDate: new Date('2026-06-26T00:00:00.000Z'),
        },
      });
      const afterDiscount = await recomputeTenancy(tenancyId);
      expect(afterPayment.balanceDue.minus(afterDiscount.balanceDue).toString())
        .toBe(discountAmount.toString());
    });
  });
});
