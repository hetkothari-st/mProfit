import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  createLedgerEntry,
  getTenancyLedger,
  buildReminderMessage,
  recomputeTenancy,
} from '../../src/services/rentalLedger.service.js';
import {
  updateTenancy,
  markReceiptReceived,
  unmarkReceived,
  undoAutoMatch,
} from '../../src/services/rental.service.js';
import { createTestScope, prisma, type TestScope } from '../helpers/db.js';

/**
 * FIX 5: `DEPOSIT_REFUND` is money leaving the landlord. The spec's §4 table
 * puts it in the "You Gave" column and the entry dialog files it under GAVE,
 * but the DTO derived `kind` from the ALLOCATION charge set (`LATE_FEE` /
 * `OTHER_CHARGE`) alone, so it fell through to `CREDIT` and rendered in
 * green under "You got" — and under "Paid" in the statement PDF.
 *
 * The display set is now separate from the allocation set. `runningBalance`
 * must be untouched by that, because deposits are excluded from the rent
 * balance on both sides.
 */
describe('DEPOSIT_REFUND displays as a charge without touching the balance', () => {
  let scope: TestScope;
  let tenancyId: string;

  beforeAll(async () => {
    scope = await createTestScope('rental-deposit-refund-direction');
    await scope.runAs(async () => {
      const property = await prisma.rentalProperty.create({
        data: {
          userId: scope.userId,
          portfolioId: scope.portfolioId,
          name: 'Refund Direction Flat',
          propertyType: 'RESIDENTIAL',
        },
      });
      const tenancy = await prisma.tenancy.create({
        data: {
          propertyId: property.id,
          tenantName: 'Refunded Tenant',
          startDate: new Date('2026-04-01T00:00:00.000Z'),
          monthlyRent: '30000',
          rentDueDay: 1,
        },
      });
      tenancyId = tenancy.id;
      await prisma.rentReceipt.create({
        data: {
          tenancyId, forMonth: '2026-04', expectedAmount: '30000',
          dueDate: new Date('2026-04-01T00:00:00.000Z'), status: 'EXPECTED',
        },
      });
    });
  });

  afterAll(async () => {
    await scope.cleanup();
  });

  it('shows a DEPOSIT as a credit and a DEPOSIT_REFUND as a charge', async () => {
    await scope.runAs(async () => {
      await createLedgerEntry(scope.userId, tenancyId, {
        entryType: 'DEPOSIT', amount: '50000', entryDate: '2026-04-02',
      });
      await createLedgerEntry(scope.userId, tenancyId, {
        entryType: 'DEPOSIT_REFUND', amount: '20000', entryDate: '2026-04-20',
      });

      const ledger = await getTenancyLedger(scope.userId, tenancyId);
      const deposit = ledger.rows.find((r) => r.entryType === 'DEPOSIT')!;
      const refund = ledger.rows.find((r) => r.entryType === 'DEPOSIT_REFUND')!;
      expect(deposit.kind).toBe('CREDIT');
      expect(refund.kind).toBe('CHARGE');
    });
  });

  it('leaves runningBalance and balanceDue untouched by either deposit row', async () => {
    await scope.runAs(async () => {
      const ledger = await getTenancyLedger(scope.userId, tenancyId);
      // Only the 30000 rent charge moves the rent balance.
      expect(ledger.balanceDue).toBe('30000');
      expect(ledger.depositHeld).toBe('30000');
      // Every row carries the same running balance: the rent charge set it,
      // and neither deposit row is allowed to change it — the refund reading
      // as a CHARGE must not start subtracting from the rent balance.
      for (const row of ledger.rows) {
        expect(row.runningBalance).toBe('30000');
      }
    });
  });
});

/**
 * FIX 6: `updateTenancy` wrote `Tenancy.securityDeposit` but never touched
 * the `DEPOSIT` ledger entry `createTenancy` seeds, so editing a deposit
 * from 50,000 to 60,000 left the khata showing 50,000 held forever —
 * `depositHeld` is derived purely from entries.
 */
describe('editing securityDeposit keeps depositHeld in step', () => {
  let scope: TestScope;
  let tenancyId: string;

  beforeAll(async () => {
    scope = await createTestScope('rental-deposit-sync');
    await scope.runAs(async () => {
      const property = await prisma.rentalProperty.create({
        data: { userId: scope.userId, name: 'Deposit Sync Flat', propertyType: 'RESIDENTIAL' },
      });
      const tenancy = await prisma.tenancy.create({
        data: {
          propertyId: property.id,
          tenantName: 'Deposit Editor',
          startDate: new Date('2026-04-01T00:00:00.000Z'),
          monthlyRent: '30000',
          securityDeposit: '50000',
          rentDueDay: 1,
        },
      });
      tenancyId = tenancy.id;
      await prisma.rentLedgerEntry.create({
        data: {
          tenancyId,
          entryType: 'DEPOSIT',
          amount: '50000',
          entryDate: new Date('2026-04-01T00:00:00.000Z'),
          note: 'Security deposit',
        },
      });
      await recomputeTenancy(tenancyId);
    });
  });

  afterAll(async () => {
    await scope.cleanup();
  });

  it('raising the deposit updates the seeded entry, not just the column', async () => {
    await scope.runAs(async () => {
      let tenancy = await prisma.tenancy.findUniqueOrThrow({ where: { id: tenancyId } });
      expect(tenancy.depositHeld.toString()).toBe('50000');

      await updateTenancy(scope.userId, tenancyId, { securityDeposit: '60000' });

      const entries = await prisma.rentLedgerEntry.findMany({
        where: { tenancyId, entryType: 'DEPOSIT' },
      });
      // Updated in place — not a second entry.
      expect(entries).toHaveLength(1);
      expect(entries[0]!.amount.toString()).toBe('60000');

      tenancy = await prisma.tenancy.findUniqueOrThrow({ where: { id: tenancyId } });
      expect(tenancy.securityDeposit?.toString()).toBe('60000');
      expect(tenancy.depositHeld.toString()).toBe('60000');
    });
  });

  it('creates the entry when a tenancy had no deposit before', async () => {
    await scope.runAs(async () => {
      const property = await prisma.rentalProperty.create({
        data: { userId: scope.userId, name: 'No Deposit Flat', propertyType: 'RESIDENTIAL' },
      });
      const bare = await prisma.tenancy.create({
        data: {
          propertyId: property.id,
          tenantName: 'Late Depositor',
          startDate: new Date('2026-04-01T00:00:00.000Z'),
          monthlyRent: '30000',
          rentDueDay: 1,
        },
      });

      await updateTenancy(scope.userId, bare.id, { securityDeposit: '25000' });

      const entries = await prisma.rentLedgerEntry.findMany({
        where: { tenancyId: bare.id, entryType: 'DEPOSIT' },
      });
      expect(entries).toHaveLength(1);
      expect(entries[0]!.amount.toString()).toBe('25000');
      const tenancy = await prisma.tenancy.findUniqueOrThrow({ where: { id: bare.id } });
      expect(tenancy.depositHeld.toString()).toBe('25000');
    });
  });

  it('clearing the deposit removes the entry so depositHeld goes to zero', async () => {
    await scope.runAs(async () => {
      await updateTenancy(scope.userId, tenancyId, { securityDeposit: null });

      const entries = await prisma.rentLedgerEntry.findMany({
        where: { tenancyId, entryType: 'DEPOSIT' },
      });
      expect(entries).toEqual([]);
      const tenancy = await prisma.tenancy.findUniqueOrThrow({ where: { id: tenancyId } });
      expect(tenancy.depositHeld.toString()).toBe('0');
    });
  });
});

/**
 * FIX 9: `unmarkReceived` and `undoAutoMatch` each delete ledger entries AND
 * their CashFlow rows in bulk and had no direct coverage. These pin both
 * halves of the deletion plus the recomputed projection.
 */
describe('unmarkReceived removes the payment entries and their CashFlows', () => {
  let scope: TestScope;
  let tenancyId: string;
  let receiptId: string;

  beforeAll(async () => {
    scope = await createTestScope('rental-unmark-received');
    await scope.runAs(async () => {
      const property = await prisma.rentalProperty.create({
        data: {
          userId: scope.userId,
          portfolioId: scope.portfolioId,
          name: 'Unmark Flat',
          propertyType: 'RESIDENTIAL',
        },
      });
      const tenancy = await prisma.tenancy.create({
        data: {
          propertyId: property.id,
          tenantName: 'Unmark Tenant',
          startDate: new Date('2026-06-01T00:00:00.000Z'),
          monthlyRent: '45000',
          rentDueDay: 1,
        },
      });
      tenancyId = tenancy.id;
      const receipt = await prisma.rentReceipt.create({
        data: {
          tenancyId, forMonth: '2026-06', expectedAmount: '45000',
          dueDate: new Date('2026-06-01T00:00:00.000Z'), status: 'EXPECTED',
        },
      });
      receiptId = receipt.id;
    });
  });

  afterAll(async () => {
    await scope.cleanup();
  });

  it('deletes both part-payments, both CashFlows, and resets the projection', async () => {
    await scope.runAs(async () => {
      await markReceiptReceived(scope.userId, receiptId, {
        receivedAmount: '20000', receivedOn: '2026-06-03',
      });
      await markReceiptReceived(scope.userId, receiptId, {
        receivedAmount: '25000', receivedOn: '2026-06-14',
      });

      const entriesBefore = await prisma.rentLedgerEntry.findMany({ where: { tenancyId } });
      expect(entriesBefore).toHaveLength(2);
      const cashFlowIds = entriesBefore.map((e) => e.cashFlowId!).filter(Boolean);
      expect(cashFlowIds).toHaveLength(2);
      await expect(
        prisma.cashFlow.count({ where: { id: { in: cashFlowIds } } }),
      ).resolves.toBe(2);

      await unmarkReceived(scope.userId, receiptId);

      await expect(
        prisma.rentLedgerEntry.count({ where: { tenancyId } }),
      ).resolves.toBe(0);
      // The CashFlow rows go with them — no orphans.
      await expect(
        prisma.cashFlow.count({ where: { id: { in: cashFlowIds } } }),
      ).resolves.toBe(0);

      const receipt = await prisma.rentReceipt.findUniqueOrThrow({ where: { id: receiptId } });
      expect(receipt.receivedAmount).toBeNull();
      expect(receipt.receivedOn).toBeNull();
      expect(receipt.cashFlowId).toBeNull();
      // Long past the 7-day grace window, so the derived status is OVERDUE.
      expect(receipt.status).toBe('OVERDUE');

      const tenancy = await prisma.tenancy.findUniqueOrThrow({ where: { id: tenancyId } });
      expect(tenancy.balanceDue.toString()).toBe('45000');
    });
  });

  it('refuses when nothing is pinned to the month', async () => {
    await scope.runAs(async () => {
      await expect(unmarkReceived(scope.userId, receiptId)).rejects.toThrow(/No payment is pinned/i);
    });
  });
});

describe('undoAutoMatch removes the matched entry and its CashFlow', () => {
  let scope: TestScope;
  let tenancyId: string;
  let receiptId: string;
  let matchedEntryId: string;
  let matchedCashFlowId: string;
  let manualEntryId: string;

  beforeAll(async () => {
    scope = await createTestScope('rental-undo-automatch');
    await scope.runAs(async () => {
      const property = await prisma.rentalProperty.create({
        data: {
          userId: scope.userId,
          portfolioId: scope.portfolioId,
          name: 'Auto-match Flat',
          propertyType: 'RESIDENTIAL',
        },
      });
      const tenancy = await prisma.tenancy.create({
        data: {
          propertyId: property.id,
          tenantName: 'Matched Tenant',
          startDate: new Date('2026-06-01T00:00:00.000Z'),
          monthlyRent: '45000',
          rentDueDay: 1,
        },
      });
      tenancyId = tenancy.id;
      const receipt = await prisma.rentReceipt.create({
        data: {
          tenancyId, forMonth: '2026-06', expectedAmount: '45000',
          dueDate: new Date('2026-06-01T00:00:00.000Z'), status: 'EXPECTED',
        },
      });
      receiptId = receipt.id;

      // A manual part-payment that must SURVIVE the undo — only the
      // auto-matched entry is the user's to reject.
      const manual = await markReceiptReceived(scope.userId, receiptId, {
        receivedAmount: '5000', receivedOn: '2026-06-02',
      });
      expect(manual.status).toBe('PARTIAL');
      const manualEntry = await prisma.rentLedgerEntry.findFirstOrThrow({
        where: { tenancyId, canonicalEventId: null },
      });
      manualEntryId = manualEntry.id;

      // The auto-matched credit, shaped exactly as applyAutoMatch leaves it:
      // a PAYMENT entry carrying both a CashFlow and a canonicalEventId.
      const cf = await prisma.cashFlow.create({
        data: {
          portfolioId: scope.portfolioId,
          date: new Date('2026-06-04T00:00:00.000Z'),
          type: 'INFLOW',
          amount: '40000',
          description: 'Auto-matched bank credit',
        },
      });
      matchedCashFlowId = cf.id;
      const matched = await prisma.rentLedgerEntry.create({
        data: {
          tenancyId,
          entryType: 'PAYMENT',
          amount: '40000',
          entryDate: new Date('2026-06-04T00:00:00.000Z'),
          forMonth: '2026-06',
          cashFlowId: cf.id,
          canonicalEventId: 'canonical-event-test-1',
        },
      });
      matchedEntryId = matched.id;
      await recomputeTenancy(tenancyId);
    });
  });

  afterAll(async () => {
    await scope.cleanup();
  });

  it('deletes only the matched entry and its CashFlow, then recomputes', async () => {
    await scope.runAs(async () => {
      let receipt = await prisma.rentReceipt.findUniqueOrThrow({ where: { id: receiptId } });
      expect(receipt.status).toBe('RECEIVED');
      expect(receipt.receivedAmount?.toString()).toBe('45000');

      await undoAutoMatch(scope.userId, receiptId);

      await expect(
        prisma.rentLedgerEntry.findUnique({ where: { id: matchedEntryId } }),
      ).resolves.toBeNull();
      await expect(
        prisma.cashFlow.findUnique({ where: { id: matchedCashFlowId } }),
      ).resolves.toBeNull();

      // The manual payment is untouched.
      const survivor = await prisma.rentLedgerEntry.findUniqueOrThrow({
        where: { id: manualEntryId },
      });
      expect(survivor.amount.toString()).toBe('5000');

      receipt = await prisma.rentReceipt.findUniqueOrThrow({ where: { id: receiptId } });
      expect(receipt.status).toBe('PARTIAL');
      expect(receipt.receivedAmount?.toString()).toBe('5000');
      expect(receipt.autoMatchedFromEventId).toBeNull();

      const tenancy = await prisma.tenancy.findUniqueOrThrow({ where: { id: tenancyId } });
      expect(tenancy.balanceDue.toString()).toBe('40000');
    });
  });

  it('refuses a second undo', async () => {
    await scope.runAs(async () => {
      await expect(undoAutoMatch(scope.userId, receiptId)).rejects.toThrow(/not auto-matched/i);
    });
  });
});

/**
 * FIX 10: two cheap correctness bugs in the reminder path.
 */
describe('reminder message', () => {
  let scope: TestScope;
  let owingTenancyId: string;
  let advanceTenancyId: string;
  let settledTenancyId: string;

  beforeAll(async () => {
    scope = await createTestScope('rental-reminder-guards');
    await scope.runAs(async () => {
      const property = await prisma.rentalProperty.create({
        data: {
          userId: scope.userId,
          name: 'Reminder Flat',
          propertyType: 'RESIDENTIAL',
          paymentInstructions: 'UPI: test@upi',
        },
      });

      // Leading-zero phone — the commonest written form.
      const owing = await prisma.tenancy.create({
        data: {
          propertyId: property.id,
          tenantName: 'Owing Tenant',
          tenantPhone: '09876543210',
          startDate: new Date('2026-04-01T00:00:00.000Z'),
          monthlyRent: '30000',
          rentDueDay: 1,
        },
      });
      owingTenancyId = owing.id;
      await prisma.rentReceipt.create({
        data: {
          tenancyId: owingTenancyId, forMonth: '2026-04', expectedAmount: '30000',
          dueDate: new Date('2026-04-01T00:00:00.000Z'), status: 'EXPECTED',
        },
      });
      await recomputeTenancy(owingTenancyId);

      const advance = await prisma.tenancy.create({
        data: {
          propertyId: property.id,
          tenantName: 'Advance Tenant',
          tenantPhone: '9876543211',
          startDate: new Date('2026-04-01T00:00:00.000Z'),
          monthlyRent: '30000',
          rentDueDay: 1,
        },
      });
      advanceTenancyId = advance.id;
      await prisma.rentLedgerEntry.create({
        data: {
          tenancyId: advanceTenancyId,
          entryType: 'PAYMENT',
          amount: '5000',
          entryDate: new Date('2026-04-05T00:00:00.000Z'),
        },
      });
      await recomputeTenancy(advanceTenancyId);

      const settled = await prisma.tenancy.create({
        data: {
          propertyId: property.id,
          tenantName: 'Settled Tenant',
          tenantPhone: '9876543212',
          startDate: new Date('2026-04-01T00:00:00.000Z'),
          monthlyRent: '30000',
          rentDueDay: 1,
        },
      });
      settledTenancyId = settled.id;
      await recomputeTenancy(settledTenancyId);
    });
  });

  afterAll(async () => {
    await scope.cleanup();
  });

  it('strips a leading zero from an 11-digit Indian mobile', async () => {
    await scope.runAs(async () => {
      const msg = await buildReminderMessage(scope.userId, owingTenancyId);
      // "09876543210" used to pass through unchanged, producing a dead
      // wa.me/09876543210 link.
      expect(msg.waUrl).toMatch(/^https:\/\/wa\.me\/919876543210\?text=/);
      expect(msg.text).toContain('30,000');
      expect(msg.text).toContain('test@upi');
    });
  });

  it('never quotes a negative balance as outstanding', async () => {
    await scope.runAs(async () => {
      const msg = await buildReminderMessage(scope.userId, advanceTenancyId);
      // The bug: "This is a reminder that -₹5,000.00 is outstanding".
      expect(msg.text).not.toMatch(/-\s*₹/);
      expect(msg.text).not.toContain('is outstanding on');
      expect(msg.text).toContain('in advance');
      expect(msg.text).toContain('5,000');
      // Nothing to pay, so no payment instructions.
      expect(msg.text).not.toContain('test@upi');
    });
  });

  it('says settled rather than asking for zero', async () => {
    await scope.runAs(async () => {
      const msg = await buildReminderMessage(scope.userId, settledTenancyId);
      expect(msg.text).not.toContain('is outstanding on');
      expect(msg.text).toContain('fully settled');
    });
  });
});
