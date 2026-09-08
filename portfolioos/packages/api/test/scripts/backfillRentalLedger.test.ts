import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { backfillRentalLedger } from '../../scripts/backfillRentalLedger.js';
import { createTestScope, prisma, type TestScope } from '../helpers/db.js';

/**
 * INVARIANT: backfilling a legacy tenancy must not move a single receipt.
 * Statuses and received amounts recorded before the ledger existed have to
 * survive the migration byte-for-byte.
 */
describe('backfillRentalLedger parity', () => {
  let scope: TestScope;
  let tenancyId: string;
  let receivedReceiptId: string;
  let partialReceiptId: string;

  beforeAll(async () => {
    scope = await createTestScope('rental-ledger-backfill');
    await scope.runAs(async () => {
      const property = await prisma.rentalProperty.create({
        data: { userId: scope.userId, name: 'Backfill Test', propertyType: 'RESIDENTIAL' },
      });
      const tenancy = await prisma.tenancy.create({
        data: {
          propertyId: property.id,
          tenantName: 'Legacy Tenant',
          startDate: new Date('2026-01-01T00:00:00.000Z'),
          monthlyRent: '30000',
          securityDeposit: '60000',
          rentDueDay: 1,
        },
      });
      tenancyId = tenancy.id;
      const received = await prisma.rentReceipt.create({
        data: {
          tenancyId, forMonth: '2026-01', expectedAmount: '30000',
          dueDate: new Date('2026-01-01T00:00:00.000Z'),
          status: 'RECEIVED', receivedAmount: '30000',
          receivedOn: new Date('2026-01-04T00:00:00.000Z'),
        },
      });
      receivedReceiptId = received.id;
      const partial = await prisma.rentReceipt.create({
        data: {
          tenancyId, forMonth: '2026-02', expectedAmount: '30000',
          dueDate: new Date('2026-02-01T00:00:00.000Z'),
          status: 'PARTIAL', receivedAmount: '10000',
          receivedOn: new Date('2026-02-06T00:00:00.000Z'),
        },
      });
      partialReceiptId = partial.id;
    });
  });

  afterAll(async () => {
    await scope.cleanup();
  });

  it('creates entries and reports zero drift', async () => {
    const report = await backfillRentalLedger();
    expect(report.drift).toEqual([]);
    expect(report.paymentsCreated).toBeGreaterThanOrEqual(2);
    expect(report.depositsCreated).toBeGreaterThanOrEqual(1);

    // `receivedOn` is projected from the FIRST credit allocated to a
    // receipt, and this script dates each synthetic PAYMENT at the
    // receipt's own legacy `receivedOn` — so BOTH receipts keep the date
    // they already had, and neither shows up as a semantic change. The
    // PARTIAL one especially: nulling it would drop partly-paid months out
    // of the dashboard's YTD rental income and of propertyPnL, which both
    // filter `status IN ('RECEIVED','PARTIAL') AND receivedOn >= <date>`.
    expect(
      report.semanticChanges.filter(
        (c) => c.field === 'receivedOn'
          && (c.receiptId === partialReceiptId || c.receiptId === receivedReceiptId),
      ),
    ).toEqual([]);
    expect(
      report.semanticChanges.some((c) => c.receiptId === receivedReceiptId),
    ).toBe(false);
  });

  it('keeps receivedOn on a partly-paid receipt so income reports still see it', async () => {
    await scope.runAs(async () => {
      const partial = await prisma.rentReceipt.findUniqueOrThrow({
        where: { id: partialReceiptId },
      });
      expect(partial.status).toBe('PARTIAL');
      expect(partial.receivedOn?.toISOString()).toBe('2026-02-06T00:00:00.000Z');

      const received = await prisma.rentReceipt.findUniqueOrThrow({
        where: { id: receivedReceiptId },
      });
      expect(received.receivedOn?.toISOString()).toBe('2026-01-04T00:00:00.000Z');
    });
  });

  it('preserves every receipt status and amount', async () => {
    await scope.runAs(async () => {
      const rows = await prisma.rentReceipt.findMany({
        where: { tenancyId }, orderBy: { dueDate: 'asc' },
      });
      expect(rows.map((r) => [r.forMonth, r.status, r.receivedAmount?.toString()])).toEqual([
        ['2026-01', 'RECEIVED', '30000'],
        ['2026-02', 'PARTIAL', '10000'],
      ]);
      const tenancy = await prisma.tenancy.findUniqueOrThrow({ where: { id: tenancyId } });
      expect(tenancy.depositHeld.toString()).toBe('60000');
      expect(tenancy.balanceDue.toString()).toBe('20000');
    });
  });

  it('is idempotent — a second run creates nothing new', async () => {
    const report = await backfillRentalLedger();
    expect(report.paymentsCreated).toBe(0);
    expect(report.depositsCreated).toBe(0);
    expect(report.drift).toEqual([]);
  });
});

/**
 * FIX 4: a skipped receipt that still carries a legacy `receivedAmount` is
 * an edge case a one-way migration must not get wrong. This test asserts
 * whatever the real post-recompute outcome is — it does not assume the
 * outcome in advance.
 */
describe('backfillRentalLedger — skipped receipt with legacy receivedAmount', () => {
  let scope: TestScope;
  let skippedReceiptId: string;

  beforeAll(async () => {
    scope = await createTestScope('rental-ledger-backfill-skipped');
    await scope.runAs(async () => {
      const property = await prisma.rentalProperty.create({
        data: { userId: scope.userId, name: 'Backfill Skipped Test', propertyType: 'RESIDENTIAL' },
      });
      const tenancy = await prisma.tenancy.create({
        data: {
          propertyId: property.id,
          tenantName: 'Skipped Legacy Tenant',
          startDate: new Date('2026-03-01T00:00:00.000Z'),
          monthlyRent: '20000',
          rentDueDay: 1,
        },
      });
      const receipt = await prisma.rentReceipt.create({
        data: {
          tenancyId: tenancy.id, forMonth: '2026-03', expectedAmount: '20000',
          dueDate: new Date('2026-03-01T00:00:00.000Z'),
          // Legacy state: someone recorded this month as received before it
          // was later marked skipped, and nothing ever cleared the stale
          // receivedAmount.
          status: 'RECEIVED', receivedAmount: '20000',
          receivedOn: new Date('2026-03-03T00:00:00.000Z'),
          isSkipped: true,
        },
      });
      skippedReceiptId = receipt.id;
    });
  });

  afterAll(async () => {
    await scope.cleanup();
  });

  it('records the real outcome instead of assuming one', async () => {
    const report = await backfillRentalLedger();

    // Observed behaviour: recomputeTenancyLedger excludes isSkipped receipts
    // from the charge set entirely (rentalLedger.service.ts), so this
    // receipt never receives an allocation regardless of its stale legacy
    // receivedAmount, and deriveReceiptStatus forces status to SKIPPED
    // whenever isSkipped is true. The legacy receivedAmount is discarded.
    await scope.runAs(async () => {
      const row = await prisma.rentReceipt.findUniqueOrThrow({ where: { id: skippedReceiptId } });
      expect(row.status).toBe('SKIPPED');
      expect(row.receivedAmount).toBeNull();
    });

    // This is exactly the kind of one-way, money-changing outcome `drift`
    // exists to surface — it must appear there, not be silently dropped.
    expect(
      report.drift.some(
        (d) => d.receiptId === skippedReceiptId && d.before === 'RECEIVED|20000' && d.after === 'SKIPPED|',
      ),
    ).toBe(true);
  });
});

/**
 * FIX 2: the guard against double-counting a receipt that is already backed
 * by a genuine, live (non-backfill) RentLedgerEntry — the entry the normal
 * app payment flow would have created after go-live. This is the
 * highest-consequence line in the script: if it doesn't fire, a re-run
 * after cutover creates a second synthetic payment and double-counts real
 * money in `allocateCredits`.
 *
 * Two separate tenancies so "the entry count for that tenancy stays at
 * one" is a literal, unambiguous check for each:
 *   - `tenancyLive`  — one receipt already backed by a genuine live PAYMENT
 *                      entry. The guard must skip it: no synthetic entry.
 *   - `tenancyLegacy` — a sibling receipt with a legacy receivedAmount and
 *                       NO live entry. This is the contrast case: it must
 *                       still get backfilled normally, otherwise a guard
 *                       that skips everything would pass this test too.
 */
describe('backfillRentalLedger — post-cutover double-count guard', () => {
  let scope: TestScope;
  let tenancyLiveId: string;
  let tenancyLegacyId: string;
  let liveReceiptId: string;
  let legacyReceiptId: string;
  const LIVE_SOURCE_HASH = 'live-app-entry:test-manual-2026-04';

  beforeAll(async () => {
    scope = await createTestScope('rental-ledger-backfill-guard');
    await scope.runAs(async () => {
      const property = await prisma.rentalProperty.create({
        data: { userId: scope.userId, name: 'Backfill Guard Test', propertyType: 'RESIDENTIAL' },
      });

      const tenancyLive = await prisma.tenancy.create({
        data: {
          propertyId: property.id,
          tenantName: 'Live Payment Tenant',
          startDate: new Date('2026-04-01T00:00:00.000Z'),
          monthlyRent: '25000',
          rentDueDay: 1,
        },
      });
      tenancyLiveId = tenancyLive.id;
      const liveReceipt = await prisma.rentReceipt.create({
        data: {
          tenancyId: tenancyLiveId, forMonth: '2026-04', expectedAmount: '25000',
          dueDate: new Date('2026-04-01T00:00:00.000Z'),
          status: 'RECEIVED', receivedAmount: '25000',
          receivedOn: new Date('2026-04-02T00:00:00.000Z'),
        },
      });
      liveReceiptId = liveReceipt.id;
      // The genuine, post-cutover entry the real app payment flow would
      // have created — non-null sourceHash that does NOT carry the
      // backfill prefix.
      await prisma.rentLedgerEntry.create({
        data: {
          tenancyId: tenancyLiveId,
          entryType: 'PAYMENT',
          amount: '25000',
          entryDate: new Date('2026-04-02T00:00:00.000Z'),
          forMonth: '2026-04',
          note: 'Live app payment (post-cutover)',
          sourceHash: LIVE_SOURCE_HASH,
        },
      });

      const tenancyLegacy = await prisma.tenancy.create({
        data: {
          propertyId: property.id,
          tenantName: 'Legacy No-Live-Entry Tenant',
          startDate: new Date('2026-05-01T00:00:00.000Z'),
          monthlyRent: '25000',
          rentDueDay: 1,
        },
      });
      tenancyLegacyId = tenancyLegacy.id;
      const legacyReceipt = await prisma.rentReceipt.create({
        data: {
          tenancyId: tenancyLegacyId, forMonth: '2026-05', expectedAmount: '25000',
          dueDate: new Date('2026-05-01T00:00:00.000Z'),
          status: 'RECEIVED', receivedAmount: '25000',
          receivedOn: new Date('2026-05-03T00:00:00.000Z'),
        },
      });
      legacyReceiptId = legacyReceipt.id;
    });
  });

  afterAll(async () => {
    await scope.cleanup();
  });

  it('skips the receipt already backed by a live entry, but still backfills its sibling', async () => {
    const report = await backfillRentalLedger();

    await scope.runAs(async () => {
      // The live-backed tenancy must still have exactly one entry: the
      // live one. No synthetic duplicate.
      const liveEntries = await prisma.rentLedgerEntry.findMany({
        where: { tenancyId: tenancyLiveId },
      });
      expect(liveEntries).toHaveLength(1);
      expect(liveEntries[0]!.sourceHash).toBe(LIVE_SOURCE_HASH);
      expect(liveEntries[0]!.sourceHash?.startsWith('backfill:payment:')).toBe(false);

      const liveReceiptRow = await prisma.rentReceipt.findUniqueOrThrow({
        where: { id: liveReceiptId },
      });
      expect(liveReceiptRow.status).toBe('RECEIVED');
      expect(liveReceiptRow.receivedAmount?.toString()).toBe('25000');

      // Contrast: the sibling with no live entry must still be backfilled
      // normally — exactly one entry, and it IS the synthetic one.
      const legacyEntries = await prisma.rentLedgerEntry.findMany({
        where: { tenancyId: tenancyLegacyId },
      });
      expect(legacyEntries).toHaveLength(1);
      expect(legacyEntries[0]!.sourceHash?.startsWith('backfill:payment:')).toBe(true);

      const legacyReceiptRow = await prisma.rentReceipt.findUniqueOrThrow({
        where: { id: legacyReceiptId },
      });
      expect(legacyReceiptRow.status).toBe('RECEIVED');
      expect(legacyReceiptRow.receivedAmount?.toString()).toBe('25000');
    });

    // Neither receipt should register as drift — the live one was left
    // alone, and the legacy one was faithfully reconstructed.
    expect(
      report.drift.filter(
        (d) => d.receiptId === liveReceiptId || d.receiptId === legacyReceiptId,
      ),
    ).toEqual([]);
  });
});

/**
 * FIX 2: the deposit loop's mirror of the payment guard.
 *
 * `createTenancy` seeds a DEPOSIT entry with a null `sourceHash` for every
 * tenancy created after cutover. A backfill run that checked only its own
 * deposit hash would find nothing, insert a second DEPOSIT, and double
 * `depositHeld` — invisibly, because `report.drift` only inspects
 * `RentReceipt` columns.
 *
 * Two tenancies, same shape as the payment guard's test:
 *   - `tenancySeeded` — already carries a live (null-sourceHash) DEPOSIT.
 *     The guard must skip it: still exactly one entry, depositHeld
 *     unchanged.
 *   - `tenancyBare`   — securityDeposit but no entry at all. The contrast
 *     case: it must still get its deposit backfilled, otherwise a guard
 *     that skipped everything would pass this test too.
 */
describe('backfillRentalLedger — deposit double-count guard', () => {
  let scope: TestScope;
  let tenancySeededId: string;
  let tenancyBareId: string;

  beforeAll(async () => {
    scope = await createTestScope('rental-ledger-backfill-deposit');
    await scope.runAs(async () => {
      const property = await prisma.rentalProperty.create({
        data: { userId: scope.userId, name: 'Deposit Guard Test', propertyType: 'RESIDENTIAL' },
      });

      const seeded = await prisma.tenancy.create({
        data: {
          propertyId: property.id,
          tenantName: 'Post-Cutover Tenant',
          startDate: new Date('2026-08-01T00:00:00.000Z'),
          monthlyRent: '30000',
          securityDeposit: '60000',
          rentDueDay: 1,
        },
      });
      tenancySeededId = seeded.id;
      // Exactly what createTenancy writes: no sourceHash.
      await prisma.rentLedgerEntry.create({
        data: {
          tenancyId: tenancySeededId,
          entryType: 'DEPOSIT',
          amount: '60000',
          entryDate: new Date('2026-08-01T00:00:00.000Z'),
          note: 'Security deposit',
        },
      });

      const bare = await prisma.tenancy.create({
        data: {
          propertyId: property.id,
          tenantName: 'Legacy No-Deposit-Entry Tenant',
          startDate: new Date('2026-08-01T00:00:00.000Z'),
          monthlyRent: '30000',
          securityDeposit: '60000',
          rentDueDay: 1,
        },
      });
      tenancyBareId = bare.id;
    });
  });

  afterAll(async () => {
    await scope.cleanup();
  });

  it('skips a tenancy that already has a live DEPOSIT, but still backfills a bare one', async () => {
    await backfillRentalLedger();

    await scope.runAs(async () => {
      const seededEntries = await prisma.rentLedgerEntry.findMany({
        where: { tenancyId: tenancySeededId, entryType: 'DEPOSIT' },
      });
      expect(seededEntries).toHaveLength(1);
      expect(seededEntries[0]!.sourceHash).toBeNull();

      const seededTenancy = await prisma.tenancy.findUniqueOrThrow({
        where: { id: tenancySeededId },
      });
      // The bug this guards: 120000 instead of 60000.
      expect(seededTenancy.depositHeld.toString()).toBe('60000');

      const bareEntries = await prisma.rentLedgerEntry.findMany({
        where: { tenancyId: tenancyBareId, entryType: 'DEPOSIT' },
      });
      expect(bareEntries).toHaveLength(1);
      expect(bareEntries[0]!.sourceHash?.startsWith('backfill:deposit:')).toBe(true);

      const bareTenancy = await prisma.tenancy.findUniqueOrThrow({
        where: { id: tenancyBareId },
      });
      expect(bareTenancy.depositHeld.toString()).toBe('60000');
    });
  });

  it('stays at one deposit after a second run', async () => {
    await backfillRentalLedger();
    await scope.runAs(async () => {
      for (const id of [tenancySeededId, tenancyBareId]) {
        const entries = await prisma.rentLedgerEntry.findMany({
          where: { tenancyId: id, entryType: 'DEPOSIT' },
        });
        expect(entries).toHaveLength(1);
        const tenancy = await prisma.tenancy.findUniqueOrThrow({ where: { id } });
        expect(tenancy.depositHeld.toString()).toBe('60000');
      }
    });
  });
});

/**
 * FIX 3: `--dry-run` used to return before both the recompute and the parity
 * pass, so it produced counts only. The operator's choices were "learn
 * nothing" or "commit irreversibly, then find out" — and the spec's section 9
 * step 5 ("report any delta and abort") was not achievable.
 *
 * The fixture is engineered to drift in both of the ways the review
 * identified:
 *   - `overTenancy` — a legacy over-payment (receivedAmount > expectedAmount
 *     was reachable before the ledger). Backfilled as a credit pinned to its
 *     own month, it fills that month and spills FIFO onto the older arrear,
 *     so TWO receipts move. Genuine money drift.
 *   - `catchupTenancy` — an EXPECTED receipt long past the grace window that
 *     the overdue cron never flipped. Recompute flips it to OVERDUE: benign
 *     catch-up, tagged `OVERDUE_CATCHUP` so it reads differently in the
 *     report.
 */
describe('backfillRentalLedger — dry run reports drift and writes nothing', () => {
  let scope: TestScope;
  let arrearReceiptId: string;
  let overpaidReceiptId: string;
  let catchupReceiptId: string;
  let overTenancyId: string;
  let catchupTenancyId: string;

  beforeAll(async () => {
    scope = await createTestScope('rental-ledger-backfill-dryrun');
    await scope.runAs(async () => {
      const property = await prisma.rentalProperty.create({
        data: { userId: scope.userId, name: 'Dry Run Test', propertyType: 'RESIDENTIAL' },
      });

      const over = await prisma.tenancy.create({
        data: {
          propertyId: property.id,
          tenantName: 'Over Payer',
          startDate: new Date('2025-01-01T00:00:00.000Z'),
          monthlyRent: '25000',
          rentDueDay: 1,
        },
      });
      overTenancyId = over.id;
      const arrear = await prisma.rentReceipt.create({
        data: {
          tenancyId: overTenancyId, forMonth: '2025-01', expectedAmount: '25000',
          dueDate: new Date('2025-01-01T00:00:00.000Z'),
          // Deliberately EXPECTED despite being long past due: the legacy
          // cron never ran on it.
          status: 'EXPECTED',
        },
      });
      arrearReceiptId = arrear.id;
      const overpaid = await prisma.rentReceipt.create({
        data: {
          tenancyId: overTenancyId, forMonth: '2025-02', expectedAmount: '25000',
          dueDate: new Date('2025-02-01T00:00:00.000Z'),
          status: 'RECEIVED', receivedAmount: '40000',
          receivedOn: new Date('2025-02-03T00:00:00.000Z'),
        },
      });
      overpaidReceiptId = overpaid.id;

      const catchup = await prisma.tenancy.create({
        data: {
          propertyId: property.id,
          tenantName: 'Never Flipped Tenant',
          startDate: new Date('2025-03-01T00:00:00.000Z'),
          monthlyRent: '25000',
          rentDueDay: 1,
        },
      });
      catchupTenancyId = catchup.id;
      const stale = await prisma.rentReceipt.create({
        data: {
          tenancyId: catchupTenancyId, forMonth: '2025-03', expectedAmount: '25000',
          dueDate: new Date('2025-03-01T00:00:00.000Z'),
          status: 'EXPECTED',
        },
      });
      catchupReceiptId = stale.id;
    });
  });

  afterAll(async () => {
    await scope.cleanup();
  });

  it('reports the full drift a real run would produce', async () => {
    const report = await backfillRentalLedger({ dryRun: true });

    expect(report.dryRun).toBe(true);
    expect(report.tenanciesRecomputed).toBeGreaterThanOrEqual(2);
    expect(report.paymentsCreated).toBeGreaterThanOrEqual(1);

    const byReceipt = new Map(report.drift.map((d) => [d.receiptId, d]));

    // The over-payment's spillover moves the older arrear too.
    expect(byReceipt.get(arrearReceiptId)).toMatchObject({
      before: 'EXPECTED|', after: 'PARTIAL|15000', kind: 'MONEY',
    });
    expect(byReceipt.get(overpaidReceiptId)).toMatchObject({
      before: 'RECEIVED|40000', after: 'RECEIVED|25000', kind: 'MONEY',
    });
    // Benign catch-up, distinguishable from the above.
    expect(byReceipt.get(catchupReceiptId)).toMatchObject({
      before: 'EXPECTED|', after: 'OVERDUE|', kind: 'OVERDUE_CATCHUP',
    });
  });

  it('writes nothing — no entries, no moved receipts, no touched tenancy', async () => {
    await scope.runAs(async () => {
      const entries = await prisma.rentLedgerEntry.findMany({
        where: { tenancyId: { in: [overTenancyId, catchupTenancyId] } },
      });
      expect(entries).toEqual([]);

      const receipts = await prisma.rentReceipt.findMany({
        where: { id: { in: [arrearReceiptId, overpaidReceiptId, catchupReceiptId] } },
        orderBy: { dueDate: 'asc' },
      });
      expect(receipts.map((r) => [r.status, r.receivedAmount?.toString() ?? null])).toEqual([
        ['EXPECTED', null],
        ['RECEIVED', '40000'],
        ['EXPECTED', null],
      ]);

      for (const id of [overTenancyId, catchupTenancyId]) {
        const t = await prisma.tenancy.findUniqueOrThrow({ where: { id } });
        expect(t.balanceDue.toString()).toBe('0');
        expect(t.balanceComputedAt).toBeNull();
      }
    });
  });
});
