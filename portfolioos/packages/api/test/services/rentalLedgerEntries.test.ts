import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  createLedgerEntry,
  deleteLedgerEntry,
  getTenancyLedger,
  listCollections,
  buildReminderMessage,
} from '../../src/services/rentalLedger.service.js';
import { createTestScope, prisma, type TestScope } from '../helpers/db.js';

describe('rental ledger entries', () => {
  let scope: TestScope;
  let tenancyId: string;

  beforeAll(async () => {
    scope = await createTestScope('rental-ledger-entries');
    await scope.runAs(async () => {
      const property = await prisma.rentalProperty.create({
        data: {
          userId: scope.userId,
          name: 'Andheri East flat',
          propertyType: 'RESIDENTIAL',
          landlordName: 'Test Landlord',
          paymentInstructions: 'UPI: test@upi',
        },
      });
      const tenancy = await prisma.tenancy.create({
        data: {
          propertyId: property.id,
          tenantName: 'Rajesh Kumar',
          tenantPhone: '9876543210',
          startDate: new Date('2026-04-01T00:00:00.000Z'),
          monthlyRent: '45000',
          rentDueDay: 1,
        },
      });
      tenancyId = tenancy.id;
      await prisma.rentReceipt.create({
        data: {
          tenancyId, forMonth: '2026-04', expectedAmount: '45000',
          dueDate: new Date('2026-04-01T00:00:00.000Z'), status: 'EXPECTED',
        },
      });
    });
  });

  afterAll(async () => {
    await scope.cleanup();
  });

  it('creates a payment entry, a CashFlow, and moves the balance', async () => {
    await scope.runAs(async () => {
      await createLedgerEntry(scope.userId, tenancyId, {
        entryType: 'PAYMENT', amount: '20000', entryDate: '2026-04-05', note: 'part 1',
      });
      const ledger = await getTenancyLedger(scope.userId, tenancyId);
      expect(ledger.balanceDue).toBe('25000');
      expect(ledger.rows.some((r) => r.entryType === 'PAYMENT' && r.amount === '20000')).toBe(true);
    });
  });

  it('rejects a non-positive amount', async () => {
    await scope.runAs(async () => {
      await expect(
        createLedgerEntry(scope.userId, tenancyId, {
          entryType: 'PAYMENT', amount: '0', entryDate: '2026-04-05',
        }),
      ).rejects.toThrow(/positive/i);
    });
  });

  it('rejects an unknown entry type', async () => {
    await scope.runAs(async () => {
      await expect(
        createLedgerEntry(scope.userId, tenancyId, {
          // @ts-expect-error deliberately invalid
          entryType: 'BRIBE', amount: '100', entryDate: '2026-04-05',
        }),
      ).rejects.toThrow(/entryType/i);
    });
  });

  it('lists the tenancy in collections with the oldest unpaid month', async () => {
    await scope.runAs(async () => {
      const rows = await listCollections(scope.userId);
      const row = rows.find((r) => r.tenancyId === tenancyId);
      expect(row?.balanceDue).toBe('25000');
      expect(row?.oldestUnpaidMonth).toBe('2026-04');
    });
  });

  it('builds a wa.me link with the amount and payment instructions', async () => {
    await scope.runAs(async () => {
      const msg = await buildReminderMessage(scope.userId, tenancyId);
      expect(msg.waUrl).toMatch(/^https:\/\/wa\.me\/919876543210\?text=/);
      expect(msg.text).toContain('Rajesh Kumar');
      expect(msg.text).toContain('25,000');
      expect(msg.text).toContain('test@upi');
    });
  });

  it('deleting the entry restores the balance', async () => {
    await scope.runAs(async () => {
      const ledger = await getTenancyLedger(scope.userId, tenancyId);
      const payment = ledger.rows.find((r) => r.entryType === 'PAYMENT')!;
      await deleteLedgerEntry(scope.userId, payment.id);
      const after = await getTenancyLedger(scope.userId, tenancyId);
      expect(after.balanceDue).toBe('45000');
    });
  });
});
