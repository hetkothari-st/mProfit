import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { markReceiptReceived } from '../../src/services/rental.service.js';
import { createTestScope, prisma, type TestScope } from '../helpers/db.js';

/**
 * REGRESSION: markReceiptReceived used to return early when a receipt was
 * already RECEIVED, so a tenant could never pay one month in two parts.
 * With the ledger, each call appends a PAYMENT entry and the receipt is
 * recomputed from the sum.
 */
describe('regression: a receipt accepts more than one payment', () => {
  let scope: TestScope;
  let receiptId: string;
  let tenancyId: string;

  beforeAll(async () => {
    scope = await createTestScope('rental-second-payment');
    await scope.runAs(async () => {
      const property = await prisma.rentalProperty.create({
        data: { userId: scope.userId, name: 'Second Payment', propertyType: 'RESIDENTIAL' },
      });
      const tenancy = await prisma.tenancy.create({
        data: {
          propertyId: property.id,
          tenantName: 'Split Payer',
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

  it('sums two part-payments into RECEIVED', async () => {
    await scope.runAs(async () => {
      await markReceiptReceived(scope.userId, receiptId, {
        receivedAmount: '20000', receivedOn: '2026-06-03',
      });
      let row = await prisma.rentReceipt.findUniqueOrThrow({ where: { id: receiptId } });
      expect(row.status).toBe('PARTIAL');

      await markReceiptReceived(scope.userId, receiptId, {
        receivedAmount: '25000', receivedOn: '2026-06-14',
      });
      row = await prisma.rentReceipt.findUniqueOrThrow({ where: { id: receiptId } });
      expect(row.status).toBe('RECEIVED');
      expect(row.receivedAmount?.toString()).toBe('45000');

      const entries = await prisma.rentLedgerEntry.findMany({
        where: { tenancyId, entryType: 'PAYMENT' },
      });
      expect(entries).toHaveLength(2);

      const flows = await prisma.cashFlow.findMany({
        where: { id: { in: entries.map((e) => e.cashFlowId!).filter(Boolean) } },
      });
      expect(flows).toHaveLength(2);
    });
  });
});
