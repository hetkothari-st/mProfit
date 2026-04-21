import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { CanonicalEventType } from '@prisma/client';
import { prisma } from '../../src/lib/prisma.js';
import { runAsSystem } from '../../src/lib/requestContext.js';
import { createTestScope, type TestScope } from '../helpers/db.js';
import {
  approveCanonicalEvent,
  rejectCanonicalEvent,
  updateCanonicalEvent,
  listCanonicalEvents,
  bulkApproveFromSender,
} from '../../src/services/canonicalEvents.service.js';
import {
  GMAIL_LLM_ADAPTER_ID,
  GMAIL_LLM_ADAPTER_VER,
} from '../../src/ingestion/gmail/pipeline.js';

/**
 * §6.8 review-flow integration tests. We exercise the service layer
 * directly against the real DB because the critical guarantees —
 * status transitions, projection rollback on failure, sender counter
 * bumping, RLS cross-tenant refusal — all straddle Prisma and the
 * projection call-site. Mocking either side here would stop testing
 * anything meaningful.
 */

interface MakeEventOpts {
  senderAddress?: string;
  eventType?: CanonicalEventType;
  amount?: string | null;
  quantity?: string | null;
  price?: string | null;
  counterparty?: string | null;
  instrumentIsin?: string | null;
  instrumentName?: string | null;
  status?: 'PARSED' | 'PENDING_REVIEW';
  eventDate?: Date;
  confidence?: number;
}

async function makeEvent(scope: TestScope, opts: MakeEventOpts = {}): Promise<string> {
  const ref = `msg-${randomUUID().slice(0, 8)}`;
  return runAsSystem(async () => {
    const row = await prisma.canonicalEvent.create({
      data: {
        userId: scope.userId,
        sourceAdapter: GMAIL_LLM_ADAPTER_ID,
        sourceAdapterVer: GMAIL_LLM_ADAPTER_VER,
        sourceRef: ref,
        sourceHash: `${ref}-hash`,
        senderAddress: opts.senderAddress ?? null,
        eventType: opts.eventType ?? 'UPI_CREDIT',
        eventDate: opts.eventDate ?? new Date('2026-04-15T00:00:00.000Z'),
        amount: opts.amount ?? '1000',
        quantity: opts.quantity ?? null,
        price: opts.price ?? null,
        counterparty: opts.counterparty ?? 'Test Counterparty',
        instrumentIsin: opts.instrumentIsin ?? null,
        instrumentName: opts.instrumentName ?? null,
        currency: 'INR',
        confidence: opts.confidence ?? 0.95,
        status: opts.status ?? 'PENDING_REVIEW',
      },
      select: { id: true },
    });
    return row.id;
  });
}

async function seedSender(
  scope: TestScope,
  address: string,
  overrides: { confirmedEventCount?: number; autoCommitAfter?: number } = {},
): Promise<string> {
  return runAsSystem(async () => {
    const row = await prisma.monitoredSender.create({
      data: {
        userId: scope.userId,
        address: address.toLowerCase(),
        displayLabel: `Seed ${address}`,
        confirmedEventCount: overrides.confirmedEventCount ?? 0,
        autoCommitAfter: overrides.autoCommitAfter ?? 5,
      },
      select: { id: true },
    });
    return row.id;
  });
}

describe('canonicalEvents review flow', () => {
  let scope: TestScope;

  beforeEach(async () => {
    scope = await createTestScope('canreview');
  });

  afterEach(async () => {
    await runAsSystem(async () => {
      await prisma.cashFlow.deleteMany({ where: { portfolioId: scope.portfolioId } });
      await prisma.canonicalEvent.deleteMany({ where: { userId: scope.userId } });
      await prisma.monitoredSender.deleteMany({ where: { userId: scope.userId } });
    });
    await scope.cleanup();
  });

  it('listCanonicalEvents filters by status and senderAddress', async () => {
    await makeEvent(scope, {
      senderAddress: 'alerts@bank-a.test',
      status: 'PARSED',
    });
    await makeEvent(scope, {
      senderAddress: 'alerts@bank-b.test',
      status: 'PENDING_REVIEW',
    });

    const pending = await scope.runAs(() =>
      listCanonicalEvents(scope.userId, { status: 'PENDING_REVIEW' }),
    );
    expect(pending).toHaveLength(1);
    expect(pending[0]?.senderAddress).toBe('alerts@bank-b.test');

    const bySender = await scope.runAs(() =>
      listCanonicalEvents(scope.userId, { senderAddress: 'ALERTS@BANK-A.test' }),
    );
    expect(bySender).toHaveLength(1);
    expect(bySender[0]?.status).toBe('PARSED');
  });

  it('updateCanonicalEvent patches amount/counterparty for reviewable events', async () => {
    const id = await makeEvent(scope, {
      amount: '100',
      counterparty: 'Old Name',
    });

    const updated = await scope.runAs(() =>
      updateCanonicalEvent(scope.userId, id, {
        amount: '250',
        counterparty: 'New Name',
      }),
    );
    expect(updated.amount?.toString()).toBe('250');
    expect(updated.counterparty).toBe('New Name');
  });

  it('updateCanonicalEvent refuses to patch a PROJECTED event', async () => {
    const id = await makeEvent(scope);
    await runAsSystem(() =>
      prisma.canonicalEvent.update({
        where: { id },
        data: { status: 'PROJECTED' },
      }),
    );
    await expect(
      scope.runAs(() =>
        updateCanonicalEvent(scope.userId, id, { amount: '999' }),
      ),
    ).rejects.toThrow(/cannot be edited/);
  });

  it('approveCanonicalEvent projects UPI_CREDIT into a CashFlow and flips PROJECTED', async () => {
    const id = await makeEvent(scope, {
      eventType: 'UPI_CREDIT',
      amount: '45000',
      counterparty: 'Rajesh',
      senderAddress: 'alerts@hdfc.test',
    });

    const outcome = await scope.runAs(() => approveCanonicalEvent(scope.userId, id));
    expect(outcome.projection.kind).toBe('projected_cashflow');

    const row = await runAsSystem(() =>
      prisma.canonicalEvent.findUnique({ where: { id } }),
    );
    expect(row?.status).toBe('PROJECTED');
    expect(row?.reviewedById).toBe(scope.userId);
    expect(row?.projectedCashFlowId).not.toBeNull();
  });

  it('approve bumps monitoredSender.confirmedEventCount by one', async () => {
    await seedSender(scope, 'alerts@hdfc.test', { confirmedEventCount: 2 });
    const id = await makeEvent(scope, {
      senderAddress: 'alerts@hdfc.test',
      eventType: 'UPI_CREDIT',
      amount: '1000',
    });

    const outcome = await scope.runAs(() => approveCanonicalEvent(scope.userId, id));
    expect(outcome.senderReachedAutoCommit).toBe(false);

    const sender = await runAsSystem(() =>
      prisma.monitoredSender.findFirst({
        where: { userId: scope.userId, address: 'alerts@hdfc.test' },
      }),
    );
    expect(sender?.confirmedEventCount).toBe(3);
  });

  it('approve signals senderReachedAutoCommit when crossing the threshold', async () => {
    await seedSender(scope, 'alerts@hdfc.test', {
      confirmedEventCount: 4,
      autoCommitAfter: 5,
    });
    const id = await makeEvent(scope, {
      senderAddress: 'alerts@hdfc.test',
      amount: '500',
    });

    const outcome = await scope.runAs(() => approveCanonicalEvent(scope.userId, id));
    expect(outcome.senderReachedAutoCommit).toBe(true);

    // Approving another event after crossing shouldn't keep flagging the banner.
    const id2 = await makeEvent(scope, {
      senderAddress: 'alerts@hdfc.test',
      amount: '600',
    });
    const outcome2 = await scope.runAs(() => approveCanonicalEvent(scope.userId, id2));
    expect(outcome2.senderReachedAutoCommit).toBe(false);
  });

  it('rolls back status when projection fails (BUY missing quantity)', async () => {
    const id = await makeEvent(scope, {
      eventType: 'BUY',
      amount: null,
      quantity: null,
      status: 'PARSED',
    });
    const outcome = await scope.runAs(() => approveCanonicalEvent(scope.userId, id));
    expect(outcome.projection.kind).toBe('failed');

    const row = await runAsSystem(() =>
      prisma.canonicalEvent.findUnique({ where: { id } }),
    );
    // Status is back to the pre-approval state so the user can edit and retry.
    expect(row?.status).toBe('PARSED');
    expect(row?.reviewedById).toBeNull();
    expect(row?.reviewedAt).toBeNull();
  });

  it('rejectCanonicalEvent marks event REJECTED with a reason', async () => {
    const id = await makeEvent(scope);
    const rejected = await scope.runAs(() =>
      rejectCanonicalEvent(scope.userId, id, 'duplicate of import'),
    );
    expect(rejected.status).toBe('REJECTED');
    expect(rejected.rejectionReason).toBe('duplicate of import');
    expect(rejected.reviewedById).toBe(scope.userId);
  });

  it('bulkApproveFromSender approves every pending event for one sender', async () => {
    const sender = 'alerts@hdfc.test';
    await seedSender(scope, sender);
    const ids = await Promise.all([
      makeEvent(scope, {
        senderAddress: sender,
        eventType: 'UPI_CREDIT',
        amount: '100',
      }),
      makeEvent(scope, {
        senderAddress: sender,
        eventType: 'UPI_CREDIT',
        amount: '200',
      }),
      makeEvent(scope, {
        senderAddress: 'alerts@other.test',
        eventType: 'UPI_CREDIT',
        amount: '300',
      }),
    ]);

    const outcome = await scope.runAs(() => bulkApproveFromSender(scope.userId, sender));
    expect(outcome.requested).toBe(2);
    expect(outcome.approved).toBe(2);
    expect(outcome.failed).toBe(0);

    const otherSenderEvent = await runAsSystem(() =>
      prisma.canonicalEvent.findUnique({ where: { id: ids[2] } }),
    );
    expect(otherSenderEvent?.status).toBe('PENDING_REVIEW');
  });
});
