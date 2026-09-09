import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { markReceiptReceived } from '../../src/services/rental.service.js';
import { createLedgerEntry, deleteLedgerEntry } from '../../src/services/rentalLedger.service.js';
import { createTestScope, prisma, type TestScope } from '../helpers/db.js';

/**
 * REGRESSION: the same money must produce the same CashFlow whichever screen
 * records it.
 *
 * `markReceiptReceived` (the property page's "Received" button) resolves a
 * portfolio with a fallback chain — the property's own, else the user's
 * default, else any. `createLedgerEntry` (the khata's "You got") originally
 * used only `property.portfolioId`, so on a property not linked to a
 * portfolio it silently wrote no CashFlow: the payment appeared in the khata
 * and the balance moved, but Cash Activity never saw a rupee of it.
 */
describe('regression: khata entries reach Cash Activity', () => {
  let scope: TestScope;
  let propertyId: string;
  let tenancyId: string;
  let receiptId: string;

  beforeAll(async () => {
    scope = await createTestScope('rental-khata-cashflow');
    await scope.runAs(async () => {
      // Deliberately NOT linked to a portfolio — the case that broke.
      const property = await prisma.rentalProperty.create({
        data: { userId: scope.userId, name: 'Unlinked Property', propertyType: 'RESIDENTIAL' },
      });
      propertyId = property.id;
      const tenancy = await prisma.tenancy.create({
        data: {
          propertyId,
          tenantName: 'Cash Tenant',
          startDate: new Date('2026-05-01T00:00:00.000Z'),
          monthlyRent: '40000',
          rentDueDay: 1,
        },
      });
      tenancyId = tenancy.id;
      const receipt = await prisma.rentReceipt.create({
        data: {
          tenancyId,
          forMonth: '2026-05',
          expectedAmount: '40000',
          dueDate: new Date('2026-05-01T00:00:00.000Z'),
          status: 'EXPECTED',
        },
      });
      receiptId = receipt.id;
    });
  });

  afterAll(async () => {
    await scope.cleanup();
  });

  const cashFlows = () =>
    prisma.cashFlow.findMany({
      where: { portfolio: { userId: scope.userId } },
      orderBy: { date: 'asc' },
    });

  it('a khata payment creates a CashFlow even when the property has no portfolio', async () => {
    await scope.runAs(async () => {
      const { id } = await createLedgerEntry(scope.userId, tenancyId, {
        entryType: 'PAYMENT',
        amount: '15000',
        entryDate: '2026-05-04',
      });

      const entry = await prisma.rentLedgerEntry.findUniqueOrThrow({ where: { id } });
      expect(entry.cashFlowId).not.toBeNull();

      const flows = await cashFlows();
      expect(flows).toHaveLength(1);
      expect(flows[0]!.amount.toString()).toBe('15000');
      expect(flows[0]!.type).toBe('INFLOW');
    });
  });

  it('a deposit is an inflow and a refund is an outflow', async () => {
    await scope.runAs(async () => {
      await createLedgerEntry(scope.userId, tenancyId, {
        entryType: 'DEPOSIT',
        amount: '80000',
        entryDate: '2026-05-05',
      });
      await createLedgerEntry(scope.userId, tenancyId, {
        entryType: 'DEPOSIT_REFUND',
        amount: '10000',
        entryDate: '2026-05-06',
      });
      const flows = await cashFlows();
      expect(flows.map((f) => `${f.type}:${f.amount.toString()}`)).toEqual([
        'INFLOW:15000',
        'INFLOW:80000',
        'OUTFLOW:10000',
      ]);
    });
  });

  it('a waiver moves no cash', async () => {
    await scope.runAs(async () => {
      const before = (await cashFlows()).length;
      await createLedgerEntry(scope.userId, tenancyId, {
        entryType: 'DISCOUNT',
        amount: '5000',
        entryDate: '2026-05-07',
      });
      expect((await cashFlows()).length).toBe(before);
    });
  });

  it('deleting a khata entry removes its CashFlow', async () => {
    await scope.runAs(async () => {
      const { id } = await createLedgerEntry(scope.userId, tenancyId, {
        entryType: 'PAYMENT',
        amount: '7000',
        entryDate: '2026-05-08',
      });
      const withEntry = (await cashFlows()).length;
      await deleteLedgerEntry(scope.userId, id);
      expect((await cashFlows()).length).toBe(withEntry - 1);
    });
  });

  it('records the same CashFlow whichever screen took the payment', async () => {
    await scope.runAs(async () => {
      const before = (await cashFlows()).length;
      await markReceiptReceived(scope.userId, receiptId, {
        receivedAmount: '9000',
        receivedOn: '2026-05-09',
      });
      const after = await cashFlows();
      expect(after.length).toBe(before + 1);
      expect(after.at(-1)!.amount.toString()).toBe('9000');
    });
  });
});
