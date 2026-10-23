import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  applyAutoMatch,
  undoAutoMatch,
  unmarkReceived,
  markReceiptReceived,
  deleteProperty,
  deleteTenancy,
} from '../../src/services/rental/rental.service.js';
import { createLedgerEntry, deleteLedgerEntry } from '../../src/services/rental/rentalLedger.service.js';
import {
  enqueuePendingReminders,
  rejectReminder,
} from '../../src/services/rental/rental.reminders.service.js';
import { unlinkFromRental } from '../../src/services/realEstate/realEstate.service.js';
import { Prisma } from '@prisma/client';
import { AppError } from '../../src/lib/errors.js';
import { createTestScope, prisma, type TestScope } from '../helpers/db.js';

/**
 * REGRESSIONS for the property / rental defect group:
 *  1. undoing an auto-match deleted the bank credit's own CashFlow;
 *  2. a rejected rent reminder was revived by the next scan;
 *  3. "Remove from rentals" with children threw a plain Error (500);
 *  4. deleting a property / tenancy left its rent + deposit CashFlows behind.
 */

function isoDay(offsetDays: number): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d;
}

describe('regression: property / rental defects', () => {
  let scope: TestScope;
  let propertyId: string;
  let tenancyId: string;
  let receiptId: string;

  beforeEach(async () => {
    scope = await createTestScope('property-rental-defects');
    await scope.runAs(async () => {
      const property = await prisma.rentalProperty.create({
        data: {
          userId: scope.userId,
          name: 'Andheri Flat',
          propertyType: 'RESIDENTIAL',
          portfolioId: scope.portfolioId,
        },
      });
      propertyId = property.id;
      const tenancy = await prisma.tenancy.create({
        data: {
          propertyId,
          tenantName: 'Rajesh Kumar',
          startDate: new Date('2026-05-01T00:00:00.000Z'),
          monthlyRent: '45000',
          rentDueDay: 1,
        },
      });
      tenancyId = tenancy.id;
      const receipt = await prisma.rentReceipt.create({
        data: {
          tenancyId,
          forMonth: '2026-05',
          expectedAmount: '45000',
          dueDate: new Date('2026-05-01T00:00:00.000Z'),
          status: 'EXPECTED',
        },
      });
      receiptId = receipt.id;
    });
  });

  afterEach(async () => {
    await scope.cleanup();
  });

  /** A bank credit already projected into its own CashFlow, as projection.ts leaves it. */
  async function projectedBankCredit() {
    return scope.runAs(async () => {
      const cf = await prisma.cashFlow.create({
        data: {
          portfolioId: scope.portfolioId,
          date: new Date('2026-05-02T00:00:00.000Z'),
          type: 'INFLOW',
          amount: '45000',
          description: 'UPI credit from RAJESH KUMAR',
        },
      });
      const event = await prisma.canonicalEvent.create({
        data: {
          userId: scope.userId,
          portfolioId: scope.portfolioId,
          sourceAdapter: 'test.bank',
          sourceAdapterVer: '1',
          sourceRef: `ref-${cf.id}`,
          sourceHash: `hash-${cf.id}`,
          eventType: 'UPI_CREDIT',
          eventDate: new Date('2026-05-02T00:00:00.000Z'),
          amount: '45000',
          counterparty: 'RAJESH KUMAR',
          status: 'PROJECTED',
          projectedCashFlowId: cf.id,
        },
      });
      return { cashFlowId: cf.id, eventId: event.id };
    });
  }

  async function autoMatch() {
    const credit = await projectedBankCredit();
    await scope.runAs(() =>
      applyAutoMatch(
        scope.userId,
        receiptId,
        {
          id: credit.eventId,
          userId: scope.userId,
          eventDate: new Date('2026-05-02T00:00:00.000Z'),
          amount: new Prisma.Decimal('45000'),
          counterparty: 'RAJESH KUMAR',
        },
        credit.cashFlowId,
      ),
    );
    return credit;
  }

  // ── Defect 1 ──────────────────────────────────────────────────────
  it('undoing an auto-match keeps the bank credit cash flow and leaves the event consistent', async () => {
    const credit = await autoMatch();
    await scope.runAs(async () => {
      const matched = await prisma.rentReceipt.findUniqueOrThrow({ where: { id: receiptId } });
      expect(matched.status).toBe('RECEIVED');

      const after = await undoAutoMatch(scope.userId, receiptId);
      expect(after.status).not.toBe('RECEIVED');

      const cf = await prisma.cashFlow.findUnique({ where: { id: credit.cashFlowId } });
      expect(cf).not.toBeNull();
      const event = await prisma.canonicalEvent.findUniqueOrThrow({ where: { id: credit.eventId } });
      expect(event.status).toBe('PROJECTED');
      expect(event.projectedCashFlowId).toBe(credit.cashFlowId);
      expect(
        await prisma.rentLedgerEntry.count({ where: { tenancyId, canonicalEventId: credit.eventId } }),
      ).toBe(0);
    });
  });

  it('"unmark received" on an auto-matched month also keeps the bank credit cash flow', async () => {
    const credit = await autoMatch();
    await scope.runAs(async () => {
      await unmarkReceived(scope.userId, receiptId);
      expect(await prisma.cashFlow.findUnique({ where: { id: credit.cashFlowId } })).not.toBeNull();
    });
  });

  it('deleting the auto-matched khata entry keeps the bank credit cash flow', async () => {
    const credit = await autoMatch();
    await scope.runAs(async () => {
      const entry = await prisma.rentLedgerEntry.findFirstOrThrow({
        where: { tenancyId, canonicalEventId: credit.eventId },
      });
      await deleteLedgerEntry(scope.userId, entry.id);
      expect(await prisma.cashFlow.findUnique({ where: { id: credit.cashFlowId } })).not.toBeNull();
    });
  });

  it('undo still deletes a cash flow the rental code created itself', async () => {
    await scope.runAs(async () => {
      await markReceiptReceived(scope.userId, receiptId, {
        receivedAmount: '45000',
        receivedOn: '2026-05-03',
      });
      const before = await prisma.cashFlow.count({ where: { portfolioId: scope.portfolioId } });
      expect(before).toBe(1);
      await unmarkReceived(scope.userId, receiptId);
      expect(await prisma.cashFlow.count({ where: { portfolioId: scope.portfolioId } })).toBe(0);
    });
  });

  // ── Defect 4 ──────────────────────────────────────────────────────
  async function seedRentAndDeposit() {
    await scope.runAs(async () => {
      await markReceiptReceived(scope.userId, receiptId, {
        receivedAmount: '45000',
        receivedOn: '2026-05-03',
      });
      await createLedgerEntry(scope.userId, tenancyId, {
        entryType: 'DEPOSIT',
        amount: '90000',
        entryDate: '2026-05-01',
      });
    });
  }

  it('deleting a property removes its rent and deposit cash flows, but keeps imported bank credits', async () => {
    await seedRentAndDeposit();
    const credit = await projectedBankCredit();
    await scope.runAs(async () => {
      // Attach the bank credit to a second month so the property owns it via a ledger entry.
      await prisma.rentLedgerEntry.create({
        data: {
          tenancyId,
          entryType: 'PAYMENT',
          amount: '45000',
          entryDate: new Date('2026-05-02T00:00:00.000Z'),
          forMonth: '2026-06',
          cashFlowId: credit.cashFlowId,
          canonicalEventId: credit.eventId,
        },
      });
      expect(await prisma.cashFlow.count({ where: { portfolioId: scope.portfolioId } })).toBe(3);

      await deleteProperty(scope.userId, propertyId);

      const left = await prisma.cashFlow.findMany({ where: { portfolioId: scope.portfolioId } });
      expect(left.map((c) => c.id)).toEqual([credit.cashFlowId]);
    });
  });

  it('deleting a tenancy removes its rent and deposit cash flows', async () => {
    await seedRentAndDeposit();
    await scope.runAs(async () => {
      expect(await prisma.cashFlow.count({ where: { portfolioId: scope.portfolioId } })).toBe(2);
      await deleteTenancy(scope.userId, tenancyId);
      expect(await prisma.cashFlow.count({ where: { portfolioId: scope.portfolioId } })).toBe(0);
    });
  });

  // ── Defect 2 ──────────────────────────────────────────────────────
  it('a rejected overdue reminder stays rejected across scans', async () => {
    await scope.runAs(async () => {
      await prisma.rentReceipt.update({
        where: { id: receiptId },
        data: { dueDate: isoDay(-20), status: 'OVERDUE' },
      });
      await enqueuePendingReminders(scope.userId);
      const pending = await prisma.rentReminder.findFirstOrThrow({ where: { receiptId } });
      expect(pending.status).toBe('PENDING_APPROVAL');
      await rejectReminder(scope.userId, pending.id);

      await enqueuePendingReminders(scope.userId);
      const rows = await prisma.rentReminder.findMany({ where: { receiptId } });
      expect(rows.map((r) => r.status)).toEqual(['REJECTED']);
    });
  });

  it('rejecting one reminder for a month stops later lead-day reminders for that month', async () => {
    await scope.runAs(async () => {
      await prisma.rentReceipt.update({
        where: { id: receiptId },
        data: { dueDate: isoDay(3), status: 'EXPECTED' },
      });
      await prisma.rentReminder.create({
        data: {
          receiptId,
          tenancyId,
          leadDays: 5,
          status: 'REJECTED',
          channels: { email: false, sms: false },
          subject: 's',
          body: 'b',
          smsBody: 'b',
        },
      });
      await enqueuePendingReminders(scope.userId);
      const rows = await prisma.rentReminder.findMany({ where: { receiptId } });
      expect(rows.map((r) => r.status)).toEqual(['REJECTED']);
    });
  });

  // ── Defect 3 ──────────────────────────────────────────────────────
  it('"Remove from rentals" with tenancies is a 409 with a clear message, not a 500', async () => {
    await scope.runAs(async () => {
      const owned = await prisma.ownedProperty.create({
        data: {
          userId: scope.userId,
          name: 'Andheri Flat',
          propertyType: 'APARTMENT',
          status: 'RENTED_OUT',
          rentalPropertyId: propertyId,
        },
      });
      const err = await unlinkFromRental(scope.userId, owned.id).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).statusCode).toBe(409);
      expect((err as AppError).message).toMatch(/1 tenancy/);
      expect((err as AppError).message).toMatch(/Rentals/);
    });
  });
});
