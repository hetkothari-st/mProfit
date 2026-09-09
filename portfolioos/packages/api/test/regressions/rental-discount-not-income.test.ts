import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { propertyPnL } from '../../src/services/rental.service.js';
import { createLedgerEntry } from '../../src/services/rentalLedger.service.js';
import { createTestScope, prisma, type TestScope } from '../helpers/db.js';

/**
 * REGRESSION: a DISCOUNT settles a month without any money arriving, so it
 * must not be reported as rental income.
 *
 * Both consumers historically summed `RentReceipt.receivedAmount`. Before the
 * ledger that column only ever moved when cash arrived, so the two meanings
 * were the same thing. The ledger widened it to "amount settled against this
 * month", which a waiver also does — so waiving rent started inflating the
 * dashboard's YTD rental income and the property P&L by the waived amount.
 *
 * Income is now summed from PAYMENT ledger entries, which is what actually
 * arrived. Deposits are excluded too: a security deposit is money held, not
 * rent earned.
 */
describe('regression: a discount is not rental income', () => {
  let scope: TestScope;
  let propertyId: string;
  let tenancyId: string;

  beforeAll(async () => {
    scope = await createTestScope('rental-discount-not-income');
    await scope.runAs(async () => {
      const property = await prisma.rentalProperty.create({
        data: { userId: scope.userId, name: 'Discount Test', propertyType: 'RESIDENTIAL' },
      });
      propertyId = property.id;
      const tenancy = await prisma.tenancy.create({
        data: {
          propertyId,
          tenantName: 'Waiver Tenant',
          startDate: new Date('2026-04-01T00:00:00.000Z'),
          monthlyRent: '30000',
          rentDueDay: 1,
        },
      });
      tenancyId = tenancy.id;
      await prisma.rentReceipt.create({
        data: {
          tenancyId,
          forMonth: '2026-04',
          expectedAmount: '30000',
          dueDate: new Date('2026-04-01T00:00:00.000Z'),
          status: 'EXPECTED',
        },
      });
    });
  });

  afterAll(async () => {
    await scope.cleanup();
  });

  it('counts a payment but not the waiver that settles the rest', async () => {
    await scope.runAs(async () => {
      await createLedgerEntry(scope.userId, tenancyId, {
        entryType: 'PAYMENT',
        amount: '25000',
        entryDate: '2026-04-10',
      });
      await createLedgerEntry(scope.userId, tenancyId, {
        entryType: 'DISCOUNT',
        amount: '5000',
        entryDate: '2026-04-11',
        note: 'goodwill waiver',
      });

      // The receipt is fully settled — 25,000 paid plus 5,000 waived.
      const receipt = await prisma.rentReceipt.findFirstOrThrow({ where: { tenancyId } });
      expect(receipt.status).toBe('RECEIVED');
      expect(receipt.receivedAmount?.toString()).toBe('30000');

      // But only 25,000 actually arrived.
      const pnl = await propertyPnL(scope.userId, propertyId, '2026-04-01', '2027-03-31');
      expect(pnl.rentReceived).toBe('25000.00');
      expect(pnl.netPnL).toBe('25000.00');
    });
  });

  it('excludes a security deposit from rental income', async () => {
    await scope.runAs(async () => {
      await createLedgerEntry(scope.userId, tenancyId, {
        entryType: 'DEPOSIT',
        amount: '60000',
        entryDate: '2026-04-12',
      });
      const pnl = await propertyPnL(scope.userId, propertyId, '2026-04-01', '2027-03-31');
      expect(pnl.rentReceived).toBe('25000.00');
    });
  });

  it('dates income by when the money arrived, not by the month it settles', async () => {
    await scope.runAs(async () => {
      // A payment outside the window must not be counted, even though the
      // receipt it settles sits inside it.
      const before = await propertyPnL(scope.userId, propertyId, '2026-04-01', '2026-04-10');
      expect(before.rentReceived).toBe('25000.00');

      const narrow = await propertyPnL(scope.userId, propertyId, '2026-04-11', '2026-04-30');
      expect(narrow.rentReceived).toBe('0.00');
    });
  });
});
