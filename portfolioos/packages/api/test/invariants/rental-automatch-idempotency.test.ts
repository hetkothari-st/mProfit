import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Prisma } from '@prisma/client';
import {
  hookAutoMatchRentalCredit,
  type AutoMatchCandidateEvent,
} from '../../src/services/rental.service.js';
import { createTestScope, prisma, type TestScope } from '../helpers/db.js';

/**
 * INVARIANT: applyAutoMatch's ledger entry carries a deterministic
 * `sourceHash` (`rentledger:automatch:<eventId>:<receiptId>`) so a replayed
 * canonical event never double-credits a receipt.
 *
 * The realistic replay is two *concurrent* deliveries of the same canonical
 * event (e.g. a duplicate webhook / at-least-once queue redelivery) landing
 * before either has committed — a sequential retry can't exercise this path
 * at all, because once the first attempt commits, the receipt leaves the
 * EXPECTED/OVERDUE candidate pool `tryAutoMatchRentReceipt` selects from, so
 * `hookAutoMatchRentalCredit` short-circuits to `no_match` before ever
 * calling `applyAutoMatch` again. Only two callers racing each other — both
 * reading the receipt as still EXPECTED before either has written — reach
 * `applyAutoMatch` a second time and hit the `sourceHash` unique constraint,
 * which is exactly what `hookAutoMatchRentalCredit`'s catch is for.
 */
describe('invariant: auto-match idempotency under concurrent replay', () => {
  let scope: TestScope;
  let tenancyId: string;
  let receiptId: string;
  let event: AutoMatchCandidateEvent;

  beforeAll(async () => {
    scope = await createTestScope('rental-automatch-idempotency');
    await scope.runAs(async () => {
      const property = await prisma.rentalProperty.create({
        data: {
          userId: scope.userId,
          name: 'Automatch Idempotency',
          propertyType: 'RESIDENTIAL',
          portfolioId: scope.portfolioId,
        },
      });
      const tenancy = await prisma.tenancy.create({
        data: {
          propertyId: property.id,
          tenantName: 'Race Tenant',
          startDate: new Date('2026-07-01T00:00:00.000Z'),
          monthlyRent: '20000',
          rentDueDay: 1,
        },
      });
      tenancyId = tenancy.id;
      const receipt = await prisma.rentReceipt.create({
        data: {
          tenancyId, forMonth: '2026-07', expectedAmount: '20000',
          dueDate: new Date('2026-07-01T00:00:00.000Z'), status: 'EXPECTED',
        },
      });
      receiptId = receipt.id;
    });

    event = {
      id: 'canonical-event-automatch-race',
      userId: scope.userId,
      eventDate: new Date('2026-07-03T00:00:00.000Z'),
      amount: new Prisma.Decimal('20000'),
      counterparty: null,
    };
  });

  afterAll(async () => {
    await scope.cleanup();
  });

  it('two concurrent deliveries of the same event produce exactly one payment', async () => {
    await scope.runAs(async () => {
      const [first, second] = await Promise.all([
        hookAutoMatchRentalCredit(event, null),
        hookAutoMatchRentalCredit(event, null),
      ]);

      // Exactly one of the two racers actually matched; the other lost the
      // sourceHash race (caught as a P2002 inside hookAutoMatchRentalCredit,
      // surfaced as no_match) — or, if the loser's SELECT happened to run
      // after the winner had already committed, it never found a candidate
      // in the first place. Either way, never two matches.
      const outcomes = [first, second];
      const matchedCount = outcomes.filter((o) => o.kind === 'matched').length;
      expect(matchedCount).toBe(1);
      expect(outcomes.some((o) => o.kind === 'no_match')).toBe(true);

      const entries = await prisma.rentLedgerEntry.findMany({
        where: { tenancyId, entryType: 'PAYMENT' },
      });
      expect(entries).toHaveLength(1);
      expect(entries[0]!.canonicalEventId).toBe(event.id);
      expect(entries[0]!.sourceHash).toBe(
        `rentledger:automatch:${event.id}:${receiptId}`,
      );

      const cashFlowIds = entries.map((e) => e.cashFlowId).filter((v): v is string => !!v);
      const flows = await prisma.cashFlow.findMany({
        where: { id: { in: cashFlowIds } },
      });
      expect(flows).toHaveLength(1);

      // A single full-amount payment settles the receipt exactly the way
      // one `markReceiptReceived` call for the same amount would.
      const receipt = await prisma.rentReceipt.findUniqueOrThrow({ where: { id: receiptId } });
      expect(receipt.status).toBe('RECEIVED');
      expect(receipt.receivedAmount?.toString()).toBe('20000');
    });
  });
});
