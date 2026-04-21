import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Prisma, type CanonicalEventType } from '@prisma/client';
import { prisma } from '../../src/lib/prisma.js';
import { runAsSystem } from '../../src/lib/requestContext.js';
import { createTestScope, type TestScope } from '../helpers/db.js';
import { projectCanonicalEvent } from '../../src/ingestion/projection.js';
import {
  GMAIL_LLM_ADAPTER_ID,
  GMAIL_LLM_ADAPTER_VER,
} from '../../src/ingestion/gmail/pipeline.js';

/**
 * §6.9 projection. We exercise the real DB — Prisma + the RLS wrapper
 * from `lib/prisma` — because projection crosses three models
 * (CanonicalEvent, Transaction/CashFlow, HoldingProjection) and we want
 * to verify the FK wiring and status transition, not just the
 * call-site.
 */

interface EventFactoryOpts {
  sourceRef?: string;
  eventType: CanonicalEventType;
  status?: 'CONFIRMED' | 'PENDING_REVIEW' | 'PARSED' | 'PROJECTED' | 'REJECTED';
  amount?: string | null;
  quantity?: string | null;
  price?: string | null;
  instrumentIsin?: string | null;
  instrumentSymbol?: string | null;
  instrumentName?: string | null;
  counterparty?: string | null;
  eventDate?: Date;
  portfolioId?: string | null;
}

async function makeEvent(
  scope: TestScope,
  opts: EventFactoryOpts,
  seq = 0,
): Promise<string> {
  const ref = opts.sourceRef ?? `msg-${seq}-${Date.now()}`;
  return runAsSystem(async () => {
    const row = await prisma.canonicalEvent.create({
      data: {
        userId: scope.userId,
        portfolioId: opts.portfolioId === undefined ? null : opts.portfolioId,
        sourceAdapter: GMAIL_LLM_ADAPTER_ID,
        sourceAdapterVer: GMAIL_LLM_ADAPTER_VER,
        sourceRef: ref,
        sourceHash: `${ref}-hash`,
        eventType: opts.eventType,
        eventDate: opts.eventDate ?? new Date('2026-04-15T00:00:00.000Z'),
        amount: opts.amount ?? null,
        quantity: opts.quantity ?? null,
        price: opts.price ?? null,
        instrumentIsin: opts.instrumentIsin ?? null,
        instrumentSymbol: opts.instrumentSymbol ?? null,
        instrumentName: opts.instrumentName ?? null,
        counterparty: opts.counterparty ?? null,
        currency: 'INR',
        confidence: 0.95,
        status: opts.status ?? 'CONFIRMED',
      },
      select: { id: true },
    });
    return row.id;
  });
}

describe('projectCanonicalEvent', () => {
  let scope: TestScope;

  beforeEach(async () => {
    scope = await createTestScope('projection');
  });

  afterEach(async () => {
    await runAsSystem(async () => {
      await prisma.cashFlow.deleteMany({ where: { portfolioId: scope.portfolioId } });
      await prisma.canonicalEvent.deleteMany({ where: { userId: scope.userId } });
    });
    await scope.cleanup();
  });

  it('projects a BUY event into a Transaction and flips status to PROJECTED', async () => {
    const eventId = await makeEvent(scope, {
      eventType: 'BUY',
      amount: '100000',
      quantity: '10',
      price: '10000',
      instrumentName: 'RELIANCE',
      instrumentSymbol: 'RELIANCE',
      instrumentIsin: 'INE002A01018',
    });

    const outcome = await scope.runAs(() => projectCanonicalEvent(eventId));

    expect(outcome.kind).toBe('projected_transaction');
    if (outcome.kind !== 'projected_transaction') return;

    const event = await runAsSystem(() =>
      prisma.canonicalEvent.findUnique({ where: { id: eventId } }),
    );
    expect(event?.status).toBe('PROJECTED');
    expect(event?.projectedTransactionId).toBe(outcome.transactionId);
    expect(event?.portfolioId).toBe(scope.portfolioId);

    const tx = await runAsSystem(() =>
      prisma.transaction.findUnique({ where: { id: outcome.transactionId } }),
    );
    expect(tx).not.toBeNull();
    expect(tx?.transactionType).toBe('BUY');
    expect(tx?.portfolioId).toBe(scope.portfolioId);
    expect(tx?.canonicalEventId).toBe(eventId);
    expect(tx?.assetKey).not.toBeNull();
    expect(tx?.assetName).toBe('RELIANCE');
    expect(new Prisma.Decimal(tx!.quantity).toString()).toBe('10');
    expect(new Prisma.Decimal(tx!.netAmount).toString()).toBe('100000');
  });

  it('projects a SELL event and triggers HoldingProjection recompute', async () => {
    // First, a prior BUY to seed the holding.
    const buyId = await makeEvent(scope, {
      eventType: 'BUY',
      amount: '100000',
      quantity: '10',
      price: '10000',
      instrumentIsin: 'INE002A01018',
      instrumentName: 'RELIANCE',
      eventDate: new Date('2026-01-10T00:00:00.000Z'),
    }, 1);
    await scope.runAs(() => projectCanonicalEvent(buyId));

    // Then a SELL of 4 units.
    const sellId = await makeEvent(scope, {
      eventType: 'SELL',
      amount: '50000',
      quantity: '4',
      price: '12500',
      instrumentIsin: 'INE002A01018',
      instrumentName: 'RELIANCE',
      eventDate: new Date('2026-04-15T00:00:00.000Z'),
    }, 2);

    const outcome = await scope.runAs(() => projectCanonicalEvent(sellId));
    expect(outcome.kind).toBe('projected_transaction');

    const hp = await runAsSystem(() =>
      prisma.holdingProjection.findFirst({
        where: { portfolioId: scope.portfolioId },
      }),
    );
    expect(hp).not.toBeNull();
    // 10 bought - 4 sold = 6 remaining
    expect(new Prisma.Decimal(hp!.quantity).toString()).toBe('6');
    expect(hp!.assetClass).toBe('EQUITY');
  });

  it('projects a UPI_CREDIT into a CashFlow INFLOW', async () => {
    const eventId = await makeEvent(scope, {
      eventType: 'UPI_CREDIT',
      amount: '45000',
      counterparty: 'Rajesh Kumar',
    });

    const outcome = await scope.runAs(() => projectCanonicalEvent(eventId));
    expect(outcome.kind).toBe('projected_cashflow');
    if (outcome.kind !== 'projected_cashflow') return;

    const cf = await runAsSystem(() =>
      prisma.cashFlow.findUnique({ where: { id: outcome.cashFlowId } }),
    );
    expect(cf).not.toBeNull();
    expect(cf?.type).toBe('INFLOW');
    expect(new Prisma.Decimal(cf!.amount).toString()).toBe('45000');
    expect(cf?.description).toBe('Rajesh Kumar');
    expect(cf?.portfolioId).toBe(scope.portfolioId);

    const event = await runAsSystem(() =>
      prisma.canonicalEvent.findUnique({ where: { id: eventId } }),
    );
    expect(event?.status).toBe('PROJECTED');
    expect(event?.projectedCashFlowId).toBe(outcome.cashFlowId);
  });

  it('projects an EMI_DEBIT into a CashFlow OUTFLOW', async () => {
    const eventId = await makeEvent(scope, {
      eventType: 'EMI_DEBIT',
      amount: '25000',
      counterparty: 'HDFC Home Loan',
    });

    const outcome = await scope.runAs(() => projectCanonicalEvent(eventId));
    expect(outcome.kind).toBe('projected_cashflow');
    if (outcome.kind !== 'projected_cashflow') return;

    const cf = await runAsSystem(() =>
      prisma.cashFlow.findUnique({ where: { id: outcome.cashFlowId } }),
    );
    expect(cf?.type).toBe('OUTFLOW');
  });

  it('marks deferred event types as PROJECTED without creating a domain row', async () => {
    const eventId = await makeEvent(scope, {
      eventType: 'PREMIUM_PAID',
      amount: '18000',
      counterparty: 'LIC of India',
    });

    const outcome = await scope.runAs(() => projectCanonicalEvent(eventId));
    expect(outcome.kind).toBe('projected_no_op');
    if (outcome.kind !== 'projected_no_op') return;
    expect(outcome.reason).toBe('premium_paid_deferred');

    const event = await runAsSystem(() =>
      prisma.canonicalEvent.findUnique({ where: { id: eventId } }),
    );
    expect(event?.status).toBe('PROJECTED');
    expect(event?.projectedTransactionId).toBeNull();
    expect(event?.projectedCashFlowId).toBeNull();
  });

  it('returns no-op for already-projected events (idempotent on retry)', async () => {
    const eventId = await makeEvent(scope, {
      eventType: 'OTHER',
    });
    await scope.runAs(() => projectCanonicalEvent(eventId));
    const second = await scope.runAs(() => projectCanonicalEvent(eventId));
    expect(second.kind).toBe('projected_no_op');
    if (second.kind !== 'projected_no_op') return;
    expect(second.reason).toBe('already_projected');
  });

  it('refuses to project events that are not CONFIRMED', async () => {
    const eventId = await makeEvent(scope, {
      eventType: 'UPI_CREDIT',
      amount: '1000',
      status: 'PENDING_REVIEW',
    });
    const outcome = await scope.runAs(() => projectCanonicalEvent(eventId));
    expect(outcome.kind).toBe('failed');
    if (outcome.kind !== 'failed') return;
    expect(outcome.reason).toBe('wrong_status');

    // Event must not have been mutated.
    const event = await runAsSystem(() =>
      prisma.canonicalEvent.findUnique({ where: { id: eventId } }),
    );
    expect(event?.status).toBe('PENDING_REVIEW');
  });

  it('fails cleanly when a BUY event is missing amount/quantity', async () => {
    const eventId = await makeEvent(scope, {
      eventType: 'BUY',
      amount: null,
      quantity: null,
    });
    const outcome = await scope.runAs(() => projectCanonicalEvent(eventId));
    expect(outcome.kind).toBe('failed');
    if (outcome.kind !== 'failed') return;
    expect(outcome.reason).toBe('missing_amount_or_quantity');
  });

  it('infers MUTUAL_FUND assetClass from an INF-prefixed ISIN', async () => {
    const eventId = await makeEvent(scope, {
      eventType: 'BUY',
      amount: '10000',
      quantity: '123.456',
      price: '81.0',
      instrumentIsin: 'INF204KB1XM2',
      instrumentName: 'Nippon India Large Cap Fund',
    });

    const outcome = await scope.runAs(() => projectCanonicalEvent(eventId));
    expect(outcome.kind).toBe('projected_transaction');
    if (outcome.kind !== 'projected_transaction') return;

    const tx = await runAsSystem(() =>
      prisma.transaction.findUnique({ where: { id: outcome.transactionId } }),
    );
    expect(tx?.assetClass).toBe('MUTUAL_FUND');
  });

  it('returns failed when the user has no portfolio', async () => {
    // Delete the default portfolio the test scope created.
    await runAsSystem(() =>
      prisma.portfolio.delete({ where: { id: scope.portfolioId } }),
    );
    const eventId = await makeEvent(scope, {
      eventType: 'UPI_CREDIT',
      amount: '100',
    });
    const outcome = await scope.runAs(() => projectCanonicalEvent(eventId));
    expect(outcome.kind).toBe('failed');
    if (outcome.kind !== 'failed') return;
    expect(outcome.reason).toBe('no_portfolio');
  });
});
