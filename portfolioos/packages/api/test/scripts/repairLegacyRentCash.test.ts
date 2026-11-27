import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parseRepairArgs, repairLegacyRentCash, repairSourceHash } from '../../scripts/repairLegacyRentCash.js';
import { runAsSystem } from '../../src/lib/requestContext.js';
import { createTestScope, prisma, type TestScope } from '../helpers/db.js';

/**
 * Launch review B7 repair: "Rent received" cash written before the rent ledger
 * existed, orphaned when the overdue job recomputed the receipts from an
 * empty ledger. Synthetic property, tenant and amounts.
 */
const day = (iso: string) => new Date(`${iso}T00:00:00Z`);
const PRE_LEDGER = day('2026-05-05');
const TODAY = day('2026-11-27');

describe('repairLegacyRentCash', () => {
  let scope: TestScope;
  let tenancyId: string;

  beforeEach(async () => {
    scope = await createTestScope('rent-repair');
    await runAsSystem(async () => {
      const property = await prisma.rentalProperty.create({
        data: { userId: scope.userId, name: 'Test Flat', propertyType: 'RESIDENTIAL', portfolioId: scope.portfolioId },
      });
      const tenancy = await prisma.tenancy.create({
        data: { propertyId: property.id, tenantName: 'TEST TENANT', startDate: day('2025-01-01'), monthlyRent: '20000' },
      });
      tenancyId = tenancy.id;
      for (const m of ['2025-01', '2025-02', '2025-03', '2025-04']) {
        await prisma.rentReceipt.create({
          data: { tenancyId, forMonth: m, expectedAmount: '20000', dueDate: day(`${m}-01`), status: 'OVERDUE' },
        });
      }
    });
  });
  afterEach(async () => {
    await runAsSystem(async () => {
      await prisma.cashFlow.deleteMany({ where: { portfolioId: scope.portfolioId } });
      await prisma.rentalProperty.deleteMany({ where: { userId: scope.userId } });
    });
    await scope.cleanup();
  });

  const orphan = (month: string, amount = '20000', name = 'Test Flat') =>
    runAsSystem(() =>
      prisma.cashFlow.create({
        data: {
          portfolioId: scope.portfolioId, date: PRE_LEDGER, type: 'INFLOW', amount,
          description: `Rent received — ${name} / TEST TENANT (${month})`, createdAt: PRE_LEDGER,
        },
      }),
    );
  const status = (month: string) =>
    runAsSystem(async () => (await prisma.rentReceipt.findFirstOrThrow({ where: { tenancyId, forMonth: month } })).status);
  const counts = () =>
    runAsSystem(async () => ({
      entries: await prisma.rentLedgerEntry.count({ where: { tenancyId } }),
      cash: await prisma.cashFlow.count({ where: { portfolioId: scope.portfolioId } }),
    }));

  it('links an orphan rent cash row to its month and settles the receipt', async () => {
    const cf = await orphan('2025-02');
    const r = await repairLegacyRentCash({ userId: scope.userId, apply: true, today: TODAY });
    expect(r.linked.map((l) => [l.forMonth, l.amount, l.matchedBy])).toEqual([['2025-02', '20000.00', 'description']]);
    expect(r.statusChanges).toEqual([expect.objectContaining({ forMonth: '2025-02', before: 'OVERDUE', after: 'RECEIVED' })]);
    expect(await status('2025-02')).toBe('RECEIVED');
    const entry = await runAsSystem(() => prisma.rentLedgerEntry.findUniqueOrThrow({ where: { sourceHash: repairSourceHash(cf.id) } }));
    expect(entry).toMatchObject({ entryType: 'PAYMENT', forMonth: '2025-02', cashFlowId: cf.id });
    expect(entry.entryDate.toISOString().slice(0, 10)).toBe('2026-05-05');
  });

  it('deletes an orphan only when the ledger already has that month at the same amount', async () => {
    // The month was marked received again later, through the ledger.
    await runAsSystem(() =>
      prisma.rentLedgerEntry.create({ data: { tenancyId, entryType: 'PAYMENT', amount: '20000', entryDate: day('2026-11-02'), forMonth: '2025-03' } }),
    );
    const dup = await orphan('2025-03');
    const keep = await orphan('2025-04');
    const r = await repairLegacyRentCash({ userId: scope.userId, apply: true, today: TODAY });
    expect(r.duplicates.map((d) => [d.forMonth, d.amount])).toEqual([['2025-03', '20000.00']]);
    expect(r.linked.map((l) => l.forMonth)).toEqual(['2025-04']);
    const left = await runAsSystem(() => prisma.cashFlow.findMany({ where: { portfolioId: scope.portfolioId }, select: { id: true } }));
    expect(left.map((c) => c.id)).toEqual([keep.id]);
    expect(left.map((c) => c.id)).not.toContain(dup.id);
  });

  it('a re-run inserts and deletes nothing', async () => {
    await orphan('2025-02');
    await repairLegacyRentCash({ userId: scope.userId, apply: true, today: TODAY });
    const before = await counts();
    const again = await repairLegacyRentCash({ userId: scope.userId, apply: true, today: TODAY });
    expect(again.orphanRows).toBe(0);
    expect(again.linked).toHaveLength(0);
    expect(await counts()).toEqual(before);
  });

  it('skips what it cannot place: wrong amount, unknown name with two candidates, a month with a different payment', async () => {
    await orphan('2025-01', '15000'); // partial: not that month's rent
    await runAsSystem(async () => {
      // A second ₹20,000 tenancy with a 2025-02 receipt makes the amount+month fallback ambiguous.
      const p2 = await prisma.rentalProperty.create({ data: { userId: scope.userId, name: 'Other Flat', propertyType: 'RESIDENTIAL' } });
      const t2 = await prisma.tenancy.create({ data: { propertyId: p2.id, tenantName: 'OTHER TENANT', startDate: day('2025-01-01'), monthlyRent: '20000' } });
      await prisma.rentReceipt.create({ data: { tenancyId: t2.id, forMonth: '2025-02', expectedAmount: '20000', dueDate: day('2025-02-01'), status: 'OVERDUE' } });
      await prisma.rentLedgerEntry.create({ data: { tenancyId, entryType: 'PAYMENT', amount: '10000', entryDate: day('2026-11-02'), forMonth: '2025-03' } });
    });
    await orphan('2025-02', '20000', 'Renamed Flat');
    await orphan('2025-03');
    const r = await repairLegacyRentCash({ userId: scope.userId, apply: true, today: TODAY });
    expect(r.linked).toHaveLength(0);
    expect(r.duplicates).toHaveLength(0);
    expect(r.skipped.map((s) => [s.forMonth, s.reason.split(' (')[0]])).toEqual([
      ['2025-01', "amount differs from that month's rent"],
      ['2025-02', 'two or more candidate tenancies by amount and month'],
      ['2025-03', 'the month already has a ledger payment of a different amount'],
    ]);
  });

  it('matches a renamed property by amount and month when only one tenancy fits, and says so', async () => {
    await orphan('2025-02', '20000', 'Old Name');
    const r = await repairLegacyRentCash({ userId: scope.userId, apply: false, today: TODAY });
    expect(r.linked.map((l) => [l.forMonth, l.matchedBy])).toEqual([['2025-02', 'amount+month']]);
  });

  it('a dry run writes nothing and still reports the status changes', async () => {
    await orphan('2025-02');
    const before = await counts();
    const r = await repairLegacyRentCash({ userId: scope.userId, apply: false, today: TODAY });
    expect(r.dryRun).toBe(true);
    expect(r.statusChanges.map((s) => [s.forMonth, s.before, s.after])).toEqual([['2025-02', 'OVERDUE', 'RECEIVED']]);
    expect(await counts()).toEqual(before);
    expect(await status('2025-02')).toBe('OVERDUE');
  });

  it('never runs without a user', async () => {
    expect(() => parseRepairArgs([])).toThrow(/--userId/);
    expect(() => parseRepairArgs(['--apply'])).toThrow(/--userId/);
    expect(() => parseRepairArgs(['--userId', '--apply'])).toThrow(/--userId/);
    expect(parseRepairArgs(['--userId', 'u1', '--apply'])).toEqual({ userId: 'u1', apply: true });
    await expect(repairLegacyRentCash({ userId: '', apply: false })).rejects.toThrow(/never runs unscoped/);
  });
});
