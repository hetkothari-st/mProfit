/**
 * §6.9 canonical-event projection.
 *
 * Converts a `CONFIRMED` CanonicalEvent into the concrete domain row(s)
 * that power the rest of the app — Transaction for BUY/SELL, CashFlow
 * for money-in/money-out events — then advances the event's status to
 * `PROJECTED` and stores a back-reference FK. Once projected, the event
 * is the lineage record; holdings and dashboards read from the
 * derived rows.
 *
 * What this function is NOT:
 *   - It is not a parser. `pipeline.ts` does extraction.
 *   - It is not a review UI. `canonicalEvents.service` handles the
 *     approve/reject flow and calls us.
 *   - It is not a recompute engine. We delegate the ripple effect to
 *     `recomputeForAsset` (§3.1, §4.4): projection writes the
 *     Transaction row, then tells the projection service "this asset
 *     changed, redo the FIFO." That keeps the source-of-truth
 *     invariant.
 *
 * Phase 5-A scope:
 *   - BUY, SELL                               → Transaction
 *   - DIVIDEND, INTEREST_CREDIT, MATURITY_CREDIT, UPI_CREDIT, NEFT_CREDIT
 *                                             → CashFlow INFLOW
 *   - INTEREST_DEBIT, EMI_DEBIT, CARD_PURCHASE,
 *     CARD_PAYMENT, UPI_DEBIT, NEFT_DEBIT     → CashFlow OUTFLOW
 *   - PREMIUM_PAID, RENT_RECEIVED, RENT_PAID,
 *     VEHICLE_CHALLAN, FD_*, SIP_INSTALLMENT,
 *     VALUATION_SNAPSHOT                      → deferred (mark PROJECTED
 *                                                with no domain row; the
 *                                                relevant Phase 5-x
 *                                                sub-feature handles it)
 *   - OTHER                                   → no-op PROJECTED
 *
 * Every write runs inside one `prisma.$transaction` so the domain-row
 * create + status flip + FK back-reference either all land or none do
 * (§5.1 task 12 — no DB transaction crossing network I/O). The ripple
 * recompute fires *after* the transaction commits; if the recompute
 * throws, the projection is still durable and the caller can retry.
 */

import { Prisma, type AssetClass, type CanonicalEvent, type TransactionType } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';
import { recomputeForAsset } from '../services/holdingsProjection.js';
import { computeAssetKey } from '../services/assetKey.js';
import { hookAutoMatchRentalCredit } from '../services/rental.service.js';
import { hookAutoMatchPremiumPayment } from '../services/insurance.service.js';

export type ProjectionOutcome =
  | { kind: 'projected_transaction'; eventId: string; transactionId: string }
  | { kind: 'projected_cashflow'; eventId: string; cashFlowId: string }
  | { kind: 'projected_no_op'; eventId: string; reason: string }
  | { kind: 'failed'; eventId: string; reason: string; message: string };

interface ResolvedPortfolio {
  portfolioId: string;
}

/**
 * Resolve which portfolio a projected row should land in. Preference:
 *   1. The event's own `portfolioId` (set at ingestion time or during
 *      Review-UI edit).
 *   2. The user's `isDefault: true` portfolio.
 *   3. Any portfolio owned by the user (fallback).
 * Returns null if the user has no portfolios at all — projection fails
 * cleanly in that case rather than creating a phantom portfolio.
 */
async function resolveTargetPortfolio(
  event: CanonicalEvent,
): Promise<ResolvedPortfolio | null> {
  if (event.portfolioId) return { portfolioId: event.portfolioId };
  const def = await prisma.portfolio.findFirst({
    where: { userId: event.userId, isDefault: true },
    select: { id: true },
  });
  if (def) return { portfolioId: def.id };
  const any = await prisma.portfolio.findFirst({
    where: { userId: event.userId },
    select: { id: true },
  });
  return any ? { portfolioId: any.id } : null;
}

/**
 * Best-guess asset class for a parsed BUY/SELL event. ISINs follow the
 * Indian registrar convention where `INF` = mutual fund and `INE/IN*`
 * = listed equity. If neither applies we default to EQUITY — users can
 * always correct via the Review UI before approval. Bonds, FDs, etc.
 * aren't auto-projected from Gmail in Phase 5-A; manual entry is the
 * path for those until their sub-phase lands.
 */
function inferAssetClass(event: CanonicalEvent): AssetClass {
  const isin = event.instrumentIsin?.trim().toUpperCase() ?? '';
  if (isin.startsWith('INF')) return 'MUTUAL_FUND';
  return 'EQUITY';
}

/**
 * Convert our canonical event-type verb into a Prisma TransactionType.
 * Kept narrow — any event we don't recognize at this layer would have
 * been filtered out by the projection dispatcher already.
 */
function txTypeFor(eventType: CanonicalEvent['eventType']): TransactionType {
  return eventType === 'BUY' ? 'BUY' : 'SELL';
}

async function projectBuySell(event: CanonicalEvent): Promise<ProjectionOutcome> {
  if (!event.amount || !event.quantity) {
    return {
      kind: 'failed',
      eventId: event.id,
      reason: 'missing_amount_or_quantity',
      message: `${event.eventType} requires amount and quantity to project`,
    };
  }
  const portfolio = await resolveTargetPortfolio(event);
  if (!portfolio) {
    return {
      kind: 'failed',
      eventId: event.id,
      reason: 'no_portfolio',
      message: 'User has no portfolio to project this event into',
    };
  }

  const assetClass = inferAssetClass(event);
  const assetName =
    event.instrumentName ?? event.instrumentSymbol ?? event.counterparty ?? 'Unknown';
  const assetKey = computeAssetKey({
    isin: event.instrumentIsin,
    assetName,
  });
  const qty = event.quantity;
  const amount = event.amount;
  const price = event.price ?? new Prisma.Decimal(amount.toString()).div(qty.toString());

  const result = await prisma.$transaction(async (tx) => {
    const created = await tx.transaction.create({
      data: {
        portfolioId: portfolio.portfolioId,
        assetClass,
        transactionType: txTypeFor(event.eventType),
        assetName,
        isin: event.instrumentIsin ?? null,
        tradeDate: event.eventDate,
        quantity: qty,
        price,
        grossAmount: amount,
        netAmount: amount,
        sourceAdapter: event.sourceAdapter,
        sourceAdapterVer: event.sourceAdapterVer,
        sourceHash: event.sourceHash,
        assetKey,
        canonicalEventId: event.id,
      },
      select: { id: true, portfolioId: true, assetKey: true },
    });
    await tx.canonicalEvent.update({
      where: { id: event.id },
      data: {
        status: 'PROJECTED',
        projectedTransactionId: created.id,
        portfolioId: portfolio.portfolioId,
      },
    });
    return created;
  });

  // Fire the holding recompute outside the transaction — it issues its
  // own queries and we don't want one asset's ripple to hold a write
  // lock on the CanonicalEvent row.
  try {
    await recomputeForAsset(result.portfolioId, result.assetKey!);
  } catch (err) {
    // Projection is durable even if recompute fails; log loudly so the
    // dashboard drift shows up in alerts, and let the ops runbook call
    // `recomputeForPortfolio` to heal.
    logger.error(
      { err, eventId: event.id, portfolioId: result.portfolioId, assetKey: result.assetKey },
      'projection.recompute_failed',
    );
  }

  return { kind: 'projected_transaction', eventId: event.id, transactionId: result.id };
}

async function projectCashFlow(
  event: CanonicalEvent,
  direction: 'INFLOW' | 'OUTFLOW',
): Promise<ProjectionOutcome> {
  if (!event.amount) {
    return {
      kind: 'failed',
      eventId: event.id,
      reason: 'missing_amount',
      message: `${event.eventType} requires amount to project`,
    };
  }
  const portfolio = await resolveTargetPortfolio(event);
  if (!portfolio) {
    return {
      kind: 'failed',
      eventId: event.id,
      reason: 'no_portfolio',
      message: 'User has no portfolio to project this event into',
    };
  }

  const description =
    event.counterparty ??
    event.instrumentName ??
    event.parserNotes ??
    `${event.eventType} via gmail`;

  const created = await prisma.$transaction(async (tx) => {
    const cf = await tx.cashFlow.create({
      data: {
        portfolioId: portfolio.portfolioId,
        date: event.eventDate,
        type: direction,
        amount: event.amount!,
        description,
      },
      select: { id: true },
    });
    await tx.canonicalEvent.update({
      where: { id: event.id },
      data: {
        status: 'PROJECTED',
        projectedCashFlowId: cf.id,
        portfolioId: portfolio.portfolioId,
      },
    });
    return cf;
  });

  // §8.2 rental auto-match: for inbound credits, check if the amount +
  // date + counterparty matches an expected rent receipt. Never throws —
  // the projection is already durable at this point.
  if (
    direction === 'INFLOW' &&
    (event.eventType === 'UPI_CREDIT' || event.eventType === 'NEFT_CREDIT')
  ) {
    void hookAutoMatchRentalCredit(
      {
        id: event.id,
        userId: event.userId,
        eventDate: event.eventDate,
        amount: event.amount
          ? new Prisma.Decimal(event.amount.toString())
          : null,
        counterparty: event.counterparty,
      },
      created.id,
    );
  }

  return { kind: 'projected_cashflow', eventId: event.id, cashFlowId: created.id };
}

async function markProjectedNoOp(event: CanonicalEvent, reason: string): Promise<ProjectionOutcome> {
  await prisma.canonicalEvent.update({
    where: { id: event.id },
    data: { status: 'PROJECTED' },
  });
  return { kind: 'projected_no_op', eventId: event.id, reason };
}

/**
 * Project a single confirmed CanonicalEvent. Safe to re-run — an event
 * already in `PROJECTED` state returns a no-op outcome instead of
 * duplicating the domain row (§3.3 idempotency extends to projection).
 */
export async function projectCanonicalEvent(eventId: string): Promise<ProjectionOutcome> {
  const event = await prisma.canonicalEvent.findUnique({ where: { id: eventId } });
  if (!event) {
    return {
      kind: 'failed',
      eventId,
      reason: 'event_not_found',
      message: `CanonicalEvent ${eventId} not found`,
    };
  }
  if (event.status === 'PROJECTED') {
    return { kind: 'projected_no_op', eventId: event.id, reason: 'already_projected' };
  }
  if (event.status !== 'CONFIRMED') {
    return {
      kind: 'failed',
      eventId: event.id,
      reason: 'wrong_status',
      message: `CanonicalEvent ${eventId} is in status ${event.status}; only CONFIRMED events may be projected`,
    };
  }

  switch (event.eventType) {
    case 'BUY':
    case 'SELL':
      return projectBuySell(event);

    case 'DIVIDEND':
    case 'INTEREST_CREDIT':
    case 'MATURITY_CREDIT':
    case 'UPI_CREDIT':
    case 'NEFT_CREDIT':
      return projectCashFlow(event, 'INFLOW');

    case 'INTEREST_DEBIT':
    case 'EMI_DEBIT':
    case 'CARD_PURCHASE':
    case 'CARD_PAYMENT':
    case 'UPI_DEBIT':
    case 'NEFT_DEBIT':
      return projectCashFlow(event, 'OUTFLOW');

    case 'PREMIUM_PAID': {
      // §9.1 — project as OUTFLOW cashflow then attempt to link to a
      // matching InsurancePolicy via the auto-match hook.
      const outcome = await projectCashFlow(event, 'OUTFLOW');
      if (outcome.kind === 'projected_cashflow') {
        void hookAutoMatchPremiumPayment(
          {
            id: event.id,
            userId: event.userId,
            amount: event.amount ? new Prisma.Decimal(event.amount.toString()) : null,
            counterparty: event.counterparty,
            metadata: event.metadata as Record<string, unknown> | null,
          },
          outcome.cashFlowId,
        );
      }
      return outcome;
    }

    case 'RENT_RECEIVED':
    case 'RENT_PAID':
    case 'VEHICLE_CHALLAN':
    case 'FD_CREATION':
    case 'FD_MATURITY':
    case 'SIP_INSTALLMENT':
    case 'VALUATION_SNAPSHOT':
      // Domain-specific projection belongs to the respective Phase 5
      // sub-feature. Flip to PROJECTED so the event leaves the review
      // queue — the original CanonicalEvent row is the audit trail.
      return markProjectedNoOp(event, `${event.eventType.toLowerCase()}_deferred`);

    case 'OTHER':
      return markProjectedNoOp(event, 'other_no_projection');

    default: {
      // Exhaustiveness: if a new CanonicalEventType is added and we
      // forgot to handle it, TypeScript flags this branch at compile
      // time.
      const _exhaustive: never = event.eventType;
      return {
        kind: 'failed',
        eventId: event.id,
        reason: 'unhandled_event_type',
        message: `No projection rule for ${String(_exhaustive)}`,
      };
    }
  }
}
