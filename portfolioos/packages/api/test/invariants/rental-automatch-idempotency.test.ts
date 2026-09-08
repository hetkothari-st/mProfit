import { describe, it, expect } from 'vitest';
import { Prisma } from '@prisma/client';
import {
  applyAutoMatch,
  hookAutoMatchRentalCredit,
  type AutoMatchCandidateEvent,
} from '../../src/services/rental.service.js';
import { createTestScope, prisma } from '../helpers/db.js';

/**
 * INVARIANT: applyAutoMatch's ledger entry carries a deterministic
 * `sourceHash` (`rentledger:automatch:<eventId>:<receiptId>`) so a replayed
 * canonical event never double-credits a receipt.
 *
 * Both tests below are deterministic — no `Promise.all`, no timing
 * dependency. A prior version of this file drove the duplicate through two
 * concurrent `hookAutoMatchRentalCredit` calls; that could not distinguish
 * "the sourceHash constraint stopped the duplicate" from "the two calls
 * never actually raced and the second one found no candidate at all" — both
 * produce identical passing assertions, so the test could silently prove
 * nothing depending on scheduling. These two replace it.
 */
describe('invariant: auto-match idempotency', () => {
  async function seedTenancyWithReceipt(label: string, expectedAmount: string) {
    const scope = await createTestScope(label);
    let tenancyId = '';
    let receiptId = '';
    await scope.runAs(async () => {
      const property = await prisma.rentalProperty.create({
        data: {
          userId: scope.userId,
          name: label,
          propertyType: 'RESIDENTIAL',
          portfolioId: scope.portfolioId,
        },
      });
      const tenancy = await prisma.tenancy.create({
        data: {
          propertyId: property.id,
          tenantName: 'Idempotency Tenant',
          startDate: new Date('2026-07-01T00:00:00.000Z'),
          monthlyRent: expectedAmount,
          rentDueDay: 1,
        },
      });
      tenancyId = tenancy.id;
      const receipt = await prisma.rentReceipt.create({
        data: {
          tenancyId, forMonth: '2026-07', expectedAmount,
          dueDate: new Date('2026-07-01T00:00:00.000Z'), status: 'EXPECTED',
        },
      });
      receiptId = receipt.id;
    });
    return { scope, tenancyId, receiptId };
  }

  /**
   * TEST A: the sourceHash unique constraint itself, driven deterministically
   * through applyAutoMatch — no candidate lookup, no timing.
   *
   * The receipt's expectedAmount (45000) is kept larger than the event's
   * amount (20000) specifically so the first call leaves the receipt PARTIAL
   * rather than RECEIVED — applyAutoMatch's own
   * `if (existing.status === RECEIPT_STATUS.RECEIVED) return existing;`
   * early-return only fires on RECEIVED, so a second call with the identical
   * event does NOT short-circuit there and actually reaches
   * `tx.rentLedgerEntry.create(...)`, which must then collide on the
   * deterministic `sourceHash`.
   */
  it('applyAutoMatch rejects a duplicate call with the same event on the sourceHash constraint', async () => {
    const { scope, tenancyId, receiptId } = await seedTenancyWithReceipt(
      'rental-automatch-sourcehash',
      '45000',
    );
    try {
      await scope.runAs(async () => {
        const event: AutoMatchCandidateEvent = {
          id: 'canonical-event-sourcehash',
          userId: scope.userId,
          eventDate: new Date('2026-07-03T00:00:00.000Z'),
          amount: new Prisma.Decimal('20000'),
          counterparty: null,
        };

        const first = await applyAutoMatch(scope.userId, receiptId, event, null);
        expect(first.status).toBe('PARTIAL');
        expect(first.receivedAmount?.toString()).toBe('20000');

        // Second call, identical event: the receipt is PARTIAL (not
        // RECEIVED), so applyAutoMatch's early-return does not fire and it
        // proceeds to insert a second RentLedgerEntry with the same
        // deterministic sourceHash as the first — this must be what
        // rejects the call, not any other guard.
        let caught: unknown;
        try {
          await applyAutoMatch(scope.userId, receiptId, event, null);
        } catch (err) {
          caught = err;
        }
        expect(caught).toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
        expect((caught as Prisma.PrismaClientKnownRequestError).code).toBe('P2002');

        const entries = await prisma.rentLedgerEntry.findMany({
          where: { tenancyId, entryType: 'PAYMENT' },
        });
        expect(entries).toHaveLength(1);

        const cashFlowIds = entries.map((e) => e.cashFlowId).filter((v): v is string => !!v);
        const flows = await prisma.cashFlow.findMany({ where: { id: { in: cashFlowIds } } });
        expect(flows).toHaveLength(1);

        const receipt = await prisma.rentReceipt.findUniqueOrThrow({ where: { id: receiptId } });
        expect(receipt.status).toBe('PARTIAL');
        expect(receipt.receivedAmount?.toString()).toBe('20000');
      });
    } finally {
      await scope.cleanup();
    }
  });

  /**
   * TEST B: the realistic production replay — a duplicate canonical-event
   * delivery landing sequentially, well after the first has fully committed
   * (e.g. a queue redelivery after a lost ack). The second
   * `hookAutoMatchRentalCredit` call only starts once the first has fully
   * resolved, so there is nothing timing-dependent here either.
   *
   * The event amount equals the full expectedAmount here, so the first call
   * settles the receipt to RECEIVED. Which mechanism stops the second call
   * is left to the code, not asserted directly — RECEIVED puts the receipt
   * outside `tryAutoMatchRentReceipt`'s EXPECTED/OVERDUE candidate filter,
   * so in practice the second call never reaches `applyAutoMatch` at all and
   * returns `no_match` from the candidate lookup, not from a caught
   * `sourceHash` collision. That is a valid, expected way to be idempotent
   * — the assertion below only pins the observable end state.
   */
  it('hookAutoMatchRentalCredit is idempotent under a sequential replay of the same event', async () => {
    const { scope, tenancyId, receiptId } = await seedTenancyWithReceipt(
      'rental-automatch-sequential',
      '20000',
    );
    try {
      await scope.runAs(async () => {
        const event: AutoMatchCandidateEvent = {
          id: 'canonical-event-sequential-replay',
          userId: scope.userId,
          eventDate: new Date('2026-07-03T00:00:00.000Z'),
          amount: new Prisma.Decimal('20000'),
          counterparty: null,
        };

        const first = await hookAutoMatchRentalCredit(event, null);
        expect(first.kind).toBe('matched');

        const second = await hookAutoMatchRentalCredit(event, null);
        expect(second.kind).not.toBe('matched');

        const entries = await prisma.rentLedgerEntry.findMany({
          where: { tenancyId, entryType: 'PAYMENT' },
        });
        expect(entries).toHaveLength(1);

        const cashFlowIds = entries.map((e) => e.cashFlowId).filter((v): v is string => !!v);
        const flows = await prisma.cashFlow.findMany({ where: { id: { in: cashFlowIds } } });
        expect(flows).toHaveLength(1);

        const receipt = await prisma.rentReceipt.findUniqueOrThrow({ where: { id: receiptId } });
        expect(receipt.status).toBe('RECEIVED');
        expect(receipt.receivedAmount?.toString()).toBe('20000');
      });
    } finally {
      await scope.cleanup();
    }
  });
});
