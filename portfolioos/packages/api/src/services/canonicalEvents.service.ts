/**
 * §6.8 Review flow over CanonicalEvents.
 *
 * The ingestion pipeline writes rows in `PARSED` (auto-commit sender)
 * or `PENDING_REVIEW` (unknown / low-confidence sender) state. This
 * service is the user-facing side: list them, edit the extracted
 * fields, approve them (which triggers projection via §6.9), reject
 * them, or bulk-approve every pending row from one sender.
 *
 * A sender earns auto-commit after the §12 threshold — five confirmed
 * events by default, configurable per `MonitoredSender`. We increment
 * the `confirmedEventCount` on every approval; the review UI checks
 * whether the count has crossed the sender's `autoCommitAfter` and
 * shows the "trust this sender?" banner. The actual flip to
 * `autoCommitEnabled = true` is explicit (user click), not automatic.
 *
 * All projection writes fire inside the approve call so a successful
 * "approve" is indivisible from "projected" — the user doesn't get a
 * two-step UI where an event can linger in CONFIRMED without a domain
 * row. If projection fails (e.g. missing amount), the event rolls
 * back to its previous status so the user can edit and retry.
 */

import { Prisma, type CanonicalEvent, type CanonicalEventStatus } from '@prisma/client';
import { prisma } from '../lib/prisma.js';

/**
 * Transaction client type as handed to $transaction callbacks on our
 * extended Prisma client. The extension's `$allOperations` hook changes
 * the inferred type away from `Prisma.TransactionClient`, so we extract
 * it structurally.
 */
type ExtendedTx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];
import { logger } from '../lib/logger.js';
import {
  BadRequestError,
  ForbiddenError,
  NotFoundError,
} from '../lib/errors.js';
import {
  projectCanonicalEvent,
  type ProjectionOutcome,
} from '../ingestion/projection.js';

const REVIEWABLE_STATUSES: ReadonlySet<CanonicalEventStatus> = new Set([
  'PARSED',
  'PENDING_REVIEW',
]);

export interface ListEventsQuery {
  status?: CanonicalEventStatus;
  senderAddress?: string;
  limit?: number;
}

export async function listCanonicalEvents(userId: string, q: ListEventsQuery = {}) {
  const where: Prisma.CanonicalEventWhereInput = { userId };
  if (q.status) where.status = q.status;
  if (q.senderAddress) where.senderAddress = q.senderAddress.toLowerCase();
  return prisma.canonicalEvent.findMany({
    where,
    orderBy: [{ status: 'asc' }, { eventDate: 'desc' }, { createdAt: 'desc' }],
    take: Math.min(q.limit ?? 100, 500),
  });
}

export async function getCanonicalEvent(userId: string, id: string) {
  const row = await prisma.canonicalEvent.findUnique({ where: { id } });
  if (!row) throw new NotFoundError('Canonical event not found');
  if (row.userId !== userId) throw new ForbiddenError();
  return row;
}

export interface EditEventPatch {
  eventType?: CanonicalEvent['eventType'];
  eventDate?: Date;
  amount?: string | null;
  quantity?: string | null;
  price?: string | null;
  counterparty?: string | null;
  instrumentIsin?: string | null;
  instrumentSymbol?: string | null;
  instrumentName?: string | null;
  portfolioId?: string | null;
}

/**
 * Patch a reviewable event in place. Deliberately limited to fields the
 * user can fix by eyeballing the source email — we don't let them
 * rewrite `sourceHash` or `userId`. Only PARSED/PENDING_REVIEW rows are
 * editable so projected/archived history stays immutable.
 */
export async function updateCanonicalEvent(
  userId: string,
  id: string,
  patch: EditEventPatch,
) {
  const existing = await getCanonicalEvent(userId, id);
  if (!REVIEWABLE_STATUSES.has(existing.status)) {
    throw new BadRequestError(
      `Canonical event in status ${existing.status} cannot be edited`,
    );
  }
  if (patch.portfolioId) {
    const owned = await prisma.portfolio.findFirst({
      where: { id: patch.portfolioId, userId },
      select: { id: true },
    });
    if (!owned) throw new BadRequestError('portfolioId does not belong to user');
  }
  return prisma.canonicalEvent.update({
    where: { id },
    data: {
      eventType: patch.eventType,
      eventDate: patch.eventDate,
      amount: patch.amount === undefined ? undefined : patch.amount,
      quantity: patch.quantity === undefined ? undefined : patch.quantity,
      price: patch.price === undefined ? undefined : patch.price,
      counterparty: patch.counterparty === undefined ? undefined : patch.counterparty,
      instrumentIsin:
        patch.instrumentIsin === undefined ? undefined : patch.instrumentIsin,
      instrumentSymbol:
        patch.instrumentSymbol === undefined ? undefined : patch.instrumentSymbol,
      instrumentName:
        patch.instrumentName === undefined ? undefined : patch.instrumentName,
      portfolioId: patch.portfolioId === undefined ? undefined : patch.portfolioId,
    },
  });
}

/**
 * Increment the sender's confirmedEventCount and return whether we
 * crossed the auto-commit threshold on this approval. The UI uses the
 * returned `justCrossedThreshold` to decide whether to offer the "trust
 * this sender?" banner. We never flip `autoCommitEnabled` here — that's
 * a user decision.
 */
async function bumpSenderConfirmedCount(
  tx: ExtendedTx,
  userId: string,
  senderAddress: string | null,
): Promise<{ justCrossedThreshold: boolean }> {
  if (!senderAddress) return { justCrossedThreshold: false };
  const sender = await tx.monitoredSender.findUnique({
    where: { userId_address: { userId, address: senderAddress.toLowerCase() } },
    select: { id: true, confirmedEventCount: true, autoCommitAfter: true },
  });
  if (!sender) return { justCrossedThreshold: false };
  const nextCount = sender.confirmedEventCount + 1;
  await tx.monitoredSender.update({
    where: { id: sender.id },
    data: { confirmedEventCount: nextCount },
  });
  const justCrossedThreshold =
    sender.confirmedEventCount < sender.autoCommitAfter &&
    nextCount >= sender.autoCommitAfter;
  return { justCrossedThreshold };
}

export interface ApproveOutcome {
  event: CanonicalEvent;
  projection: ProjectionOutcome;
  /** True if this approval crossed the sender's auto-commit threshold. */
  senderReachedAutoCommit: boolean;
}

/**
 * Flip an event to CONFIRMED and immediately project. If projection
 * fails the event rolls back so the user can edit and retry — we never
 * leave a row stranded in CONFIRMED-without-projection, because that
 * would mean "user said yes, we said ok, nothing happened."
 */
export async function approveCanonicalEvent(
  userId: string,
  id: string,
): Promise<ApproveOutcome> {
  const existing = await getCanonicalEvent(userId, id);
  if (!REVIEWABLE_STATUSES.has(existing.status)) {
    throw new BadRequestError(
      `Canonical event in status ${existing.status} cannot be approved`,
    );
  }

  // Step 1: mark CONFIRMED + bump sender counter inside one tx.
  const previousStatus = existing.status;
  const { senderCrossed } = await prisma.$transaction(async (tx) => {
    await tx.canonicalEvent.update({
      where: { id },
      data: {
        status: 'CONFIRMED',
        reviewedById: userId,
        reviewedAt: new Date(),
      },
    });
    const { justCrossedThreshold } = await bumpSenderConfirmedCount(
      tx,
      userId,
      existing.senderAddress,
    );
    return { senderCrossed: justCrossedThreshold };
  });

  // Step 2: project outside the tx — projection has its own atomic
  // write and a ripple recompute we don't want to hold a lock during.
  const projection = await projectCanonicalEvent(id);

  if (projection.kind === 'failed') {
    // Roll back the status so the user can edit and retry. The sender
    // count stays incremented — the approval *intent* was real, and
    // we'd rather be slightly generous with the auto-commit threshold
    // than make users chase phantom counts.
    await prisma.canonicalEvent.update({
      where: { id },
      data: {
        status: previousStatus,
        reviewedById: null,
        reviewedAt: null,
      },
    });
    logger.warn(
      { eventId: id, reason: projection.reason, message: projection.message },
      'canonicalEvents.approve.projection_failed',
    );
  }

  const refreshed = await getCanonicalEvent(userId, id);
  return {
    event: refreshed,
    projection,
    senderReachedAutoCommit: senderCrossed,
  };
}

export async function rejectCanonicalEvent(
  userId: string,
  id: string,
  reason?: string,
) {
  const existing = await getCanonicalEvent(userId, id);
  if (!REVIEWABLE_STATUSES.has(existing.status)) {
    throw new BadRequestError(
      `Canonical event in status ${existing.status} cannot be rejected`,
    );
  }
  return prisma.canonicalEvent.update({
    where: { id },
    data: {
      status: 'REJECTED',
      rejectionReason: reason ?? null,
      reviewedById: userId,
      reviewedAt: new Date(),
    },
  });
}

export interface BulkApproveOutcome {
  requested: number;
  approved: number;
  failed: number;
  outcomes: ApproveOutcome[];
}

/**
 * Bulk-approve every reviewable event whose originating sender matches
 * `senderAddress`. Matched via the `senderAddress` column the pipeline
 * stamps (not `counterparty`, which is the merchant/payee extracted by
 * the parser). Failures don't stop the batch — each event gets its own
 * approve + project call, and we tally how many succeeded.
 */
export async function bulkApproveFromSender(
  userId: string,
  senderAddress: string,
): Promise<BulkApproveOutcome> {
  const address = senderAddress.toLowerCase();
  const events = await prisma.canonicalEvent.findMany({
    where: {
      userId,
      status: { in: ['PARSED', 'PENDING_REVIEW'] },
      senderAddress: address,
    },
    select: { id: true },
  });

  const outcomes: ApproveOutcome[] = [];
  let approved = 0;
  let failed = 0;
  for (const { id } of events) {
    try {
      const outcome = await approveCanonicalEvent(userId, id);
      outcomes.push(outcome);
      if (outcome.projection.kind === 'failed') failed += 1;
      else approved += 1;
    } catch (err) {
      failed += 1;
      logger.warn(
        { err, userId, eventId: id },
        'canonicalEvents.bulkApprove.event_failed',
      );
    }
  }

  return {
    requested: events.length,
    approved,
    failed,
    outcomes,
  };
}
