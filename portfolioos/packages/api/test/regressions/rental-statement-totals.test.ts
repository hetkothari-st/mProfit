import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Prisma } from '@prisma/client';
import { getTenancyLedger, createLedgerEntry } from '../../src/services/rentalLedger.service.js';
import { buildStatementTotals } from '../../src/controllers/rental.controller.js';
import { createTestScope, prisma, type TestScope } from '../helpers/db.js';

/**
 * REGRESSION: a naive statement totals row is actively misleading.
 *
 * Charged (rent charges only) minus Paid (payments + deposits, since a
 * deposit is money that genuinely moved) does NOT equal the closing
 * balance — the gap is exactly the deposit, which is tracked separately
 * and deliberately excluded from the rent balance. This test pins down
 * that both totals are the honest sum of their own column's cells, that
 * the Balance cell is the actual closing balance (not a sum of a running
 * balance, which would be meaningless), and that the three reconcile via
 * Charged − Paid + depositIn − depositOut = balance.
 */
describe('regression: rent statement totals reconcile around the deposit gap', () => {
  let scope: TestScope;
  let tenancyId: string;

  beforeAll(async () => {
    scope = await createTestScope('rental-statement-totals');
    await scope.runAs(async () => {
      const property = await prisma.rentalProperty.create({
        data: { userId: scope.userId, name: 'Totals Test', propertyType: 'RESIDENTIAL' },
      });
      const tenancy = await prisma.tenancy.create({
        data: {
          propertyId: property.id,
          tenantName: 'Totals Tenant',
          startDate: new Date('2026-01-01T00:00:00.000Z'),
          monthlyRent: '40000',
          rentDueDay: 1,
        },
      });
      tenancyId = tenancy.id;

      // Two months of rent charged (80,000 total).
      await prisma.rentReceipt.create({
        data: {
          tenancyId, forMonth: '2026-01', expectedAmount: '40000',
          dueDate: new Date('2026-01-01T00:00:00.000Z'), status: 'EXPECTED',
        },
      });
      await prisma.rentReceipt.create({
        data: {
          tenancyId, forMonth: '2026-02', expectedAmount: '40000',
          dueDate: new Date('2026-02-01T00:00:00.000Z'), status: 'EXPECTED',
        },
      });
    });
  });

  afterAll(async () => {
    await scope.cleanup();
  });

  it('reconciles Charged, Paid, and the closing Balance around the deposit', async () => {
    await scope.runAs(async () => {
      // One rent payment (40,000) and one security deposit (1,00,000) —
      // both are money that arrived, so both land in "Paid".
      await createLedgerEntry(scope.userId, tenancyId, {
        entryType: 'PAYMENT', amount: '40000', entryDate: '2026-01-05',
      });
      await createLedgerEntry(scope.userId, tenancyId, {
        entryType: 'DEPOSIT', amount: '100000', entryDate: '2026-01-05',
      });

      const ledger = await getTenancyLedger(scope.userId, tenancyId);
      const oldestFirst = [...ledger.rows].reverse();
      const { totals, note } = buildStatementTotals(oldestFirst, ledger.balanceDue);

      // Charged = 40,000 + 40,000 rent charges only.
      expect(new Prisma.Decimal(totals.youGave as string).toString()).toBe('80000');
      // Paid = 40,000 payment + 1,00,000 deposit.
      expect(new Prisma.Decimal(totals.youGot as string).toString()).toBe('140000');
      // Balance cell is the actual closing balance, not a sum of the
      // (meaningless) running-balance column: 80,000 charged − 40,000 paid
      // toward rent = 40,000 still owed. The deposit never touches this.
      expect(new Prisma.Decimal(totals.runningBalance as string).toString()).toBe('40000');
      expect(ledger.balanceDue).toBe('40000');

      // The naive Charged − Paid does NOT equal the balance...
      const charged = new Prisma.Decimal(totals.youGave as string);
      const paid = new Prisma.Decimal(totals.youGot as string);
      const balance = new Prisma.Decimal(totals.runningBalance as string);
      expect(charged.minus(paid).toString()).not.toBe(balance.toString());

      // ...but Charged − Paid + depositIn − depositOut does.
      const depositIn = new Prisma.Decimal('100000');
      const depositOut = new Prisma.Decimal('0');
      expect(charged.minus(paid).plus(depositIn).minus(depositOut).toString()).toBe(balance.toString());

      // The reconciliation note explains the gap, with the real figure.
      expect(note).toBeDefined();
      expect(note).toContain('1,00,000.00');
      expect(note).toContain('held separately');
    });
  });
});
