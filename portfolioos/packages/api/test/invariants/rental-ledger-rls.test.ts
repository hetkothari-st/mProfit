import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestScope, prisma, type TestScope } from '../helpers/db.js';

/**
 * INVARIANT: RentLedgerEntry rows are visible only to the user who owns the
 * property the tenancy hangs off. A second user's session must see zero rows
 * even when it queries by the exact entry id.
 */
describe('invariant: RentLedgerEntry RLS isolation', () => {
  let alice: TestScope;
  let bob: TestScope;
  let entryId: string;

  beforeAll(async () => {
    alice = await createTestScope('rental-ledger-rls-a');
    bob = await createTestScope('rental-ledger-rls-b');

    await alice.runAs(async () => {
      const property = await prisma.rentalProperty.create({
        data: {
          userId: alice.userId,
          name: 'RLS Test Property',
          propertyType: 'RESIDENTIAL',
        },
      });
      const tenancy = await prisma.tenancy.create({
        data: {
          propertyId: property.id,
          tenantName: 'RLS Tenant',
          startDate: new Date('2026-01-01T00:00:00.000Z'),
          monthlyRent: '10000',
          rentDueDay: 1,
        },
      });
      const entry = await prisma.rentLedgerEntry.create({
        data: {
          tenancyId: tenancy.id,
          entryType: 'PAYMENT',
          amount: '10000',
          entryDate: new Date('2026-01-05T00:00:00.000Z'),
        },
      });
      entryId = entry.id;
    });
  });

  afterAll(async () => {
    await alice.cleanup();
    await bob.cleanup();
  });

  it('lets the owner read the entry', async () => {
    await alice.runAs(async () => {
      const row = await prisma.rentLedgerEntry.findUnique({ where: { id: entryId } });
      expect(row).not.toBeNull();
    });
  });

  it('hides the entry from another user', async () => {
    await bob.runAs(async () => {
      const row = await prisma.rentLedgerEntry.findUnique({ where: { id: entryId } });
      expect(row).toBeNull();
    });
  });
});
