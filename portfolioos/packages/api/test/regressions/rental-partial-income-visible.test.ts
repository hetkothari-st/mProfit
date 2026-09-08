import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { markReceiptReceived, propertyPnL } from '../../src/services/rental.service.js';
import { createTestScope, prisma, type TestScope } from '../helpers/db.js';

/**
 * REGRESSION (whole-branch review, FIX 1): a partly-paid month must still
 * count as rental income.
 *
 * `RentReceipt.receivedOn` is a projection written only by
 * `recomputeTenancyLedger`. It was briefly driven from `allocateCredits`'s
 * `settledOn` — the date a receipt became FULLY paid — which is null for a
 * PARTIAL receipt. Two pre-existing consumers filter on it:
 *
 *   - `dashboard.service.ts` — YTD rental income
 *   - `rental.service.ts` `propertyPnL`
 *
 * Both select `status IN ('RECEIVED','PARTIAL') AND receivedOn >= <date>`,
 * so a null date silently excluded every partly-paid month: a tenant who
 * paid ₹20,000 of ₹45,000 contributed ₹0 to the dashboard and ₹0 to the
 * property P&L, and the `'PARTIAL'` clause in both queries became dead code.
 *
 * `receivedOn` is now projected from the FIRST contributing credit, which
 * restores the column's pre-ledger meaning. This test pins that.
 */
describe('regression: a partly-paid receipt still shows up as rental income', () => {
  let scope: TestScope;
  let propertyId: string;
  let receiptId: string;

  beforeAll(async () => {
    scope = await createTestScope('rental-partial-income');
    await scope.runAs(async () => {
      const property = await prisma.rentalProperty.create({
        data: { userId: scope.userId, name: 'Partial Income Flat', propertyType: 'RESIDENTIAL' },
      });
      propertyId = property.id;
      const tenancy = await prisma.tenancy.create({
        data: {
          propertyId,
          tenantName: 'Part Payer',
          startDate: new Date('2026-07-01T00:00:00.000Z'),
          monthlyRent: '45000',
          rentDueDay: 1,
        },
      });
      const receipt = await prisma.rentReceipt.create({
        data: {
          tenancyId: tenancy.id,
          forMonth: '2026-07',
          expectedAmount: '45000',
          dueDate: new Date('2026-07-01T00:00:00.000Z'),
          status: 'EXPECTED',
        },
      });
      receiptId = receipt.id;
    });
  });

  afterAll(async () => {
    await scope.cleanup();
  });

  it('carries receivedOn and its partial amount into propertyPnL', async () => {
    await scope.runAs(async () => {
      await markReceiptReceived(scope.userId, receiptId, {
        receivedAmount: '20000',
        receivedOn: '2026-07-05',
      });

      const row = await prisma.rentReceipt.findUniqueOrThrow({ where: { id: receiptId } });
      expect(row.status).toBe('PARTIAL');
      expect(row.receivedAmount?.toString()).toBe('20000');
      // The load-bearing assertion: not null.
      expect(row.receivedOn?.toISOString()).toBe('2026-07-05T00:00:00.000Z');

      const pnl = await propertyPnL(scope.userId, propertyId, '2026-04-01', '2027-03-31');
      expect(pnl.rentReceived).toBe('20000.00');
      expect(pnl.receiptCount).toBe(1);
    });
  });

  it('keeps the FIRST payment date once a second instalment settles the month', async () => {
    await scope.runAs(async () => {
      await markReceiptReceived(scope.userId, receiptId, {
        receivedAmount: '25000',
        receivedOn: '2026-07-19',
      });

      const row = await prisma.rentReceipt.findUniqueOrThrow({ where: { id: receiptId } });
      expect(row.status).toBe('RECEIVED');
      expect(row.receivedAmount?.toString()).toBe('45000');
      // First credit, not the settling one — the pre-ledger meaning.
      expect(row.receivedOn?.toISOString()).toBe('2026-07-05T00:00:00.000Z');

      const pnl = await propertyPnL(scope.userId, propertyId, '2026-04-01', '2027-03-31');
      expect(pnl.rentReceived).toBe('45000.00');
    });
  });
});
