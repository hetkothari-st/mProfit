import { Decimal } from 'decimal.js';
import type { CanonicalEventType } from '@prisma/client';
import { prisma } from '../../../lib/prisma.js';
import type { NormalisedTxn, SpendDirection, SpendMode, SpendSource } from '../spendTypes.js';

/**
 * Bank and card alert emails, as parsed into CanonicalEvent by the Gmail
 * pipeline. Only events the user has approved (CONFIRMED, or PROJECTED onward)
 * count: anything still waiting in review, rejected or failed is left out,
 * and drops out of the store if it is later rejected.
 */

const EVENT_SHAPE: Partial<Record<CanonicalEventType, { direction: SpendDirection; mode: SpendMode }>> = {
  UPI_CREDIT: { direction: 'CREDIT', mode: 'UPI' },
  NEFT_CREDIT: { direction: 'CREDIT', mode: 'NEFT' },
  RENT_RECEIVED: { direction: 'CREDIT', mode: 'OTHER' },
  UPI_DEBIT: { direction: 'DEBIT', mode: 'UPI' },
  NEFT_DEBIT: { direction: 'DEBIT', mode: 'NEFT' },
  CARD_PURCHASE: { direction: 'DEBIT', mode: 'CARD' },
  // Not spending (card bill, EMI, SIP), but kept so later steps can tell them
  // apart from the purchases they would otherwise double-count.
  CARD_PAYMENT: { direction: 'DEBIT', mode: 'OTHER' },
  EMI_DEBIT: { direction: 'DEBIT', mode: 'ECS' },
  SIP_INSTALLMENT: { direction: 'DEBIT', mode: 'ECS' },
  RENT_PAID: { direction: 'DEBIT', mode: 'OTHER' },
  PREMIUM_PAID: { direction: 'DEBIT', mode: 'OTHER' },
};

export const CANONICAL_SPEND_TYPES = Object.keys(EVENT_SHAPE) as CanonicalEventType[];
const COUNTED_STATUSES = ['CONFIRMED', 'PROJECTED'] as const;

const IMPS = /\bimps\b/i;

export const canonicalEventSource: SpendSource = {
  kind: 'canonical_event',
  async fetch(userId: string): Promise<NormalisedTxn[]> {
    const events = await prisma.canonicalEvent.findMany({
      where: {
        userId,
        eventType: { in: CANONICAL_SPEND_TYPES },
        status: { in: [...COUNTED_STATUSES] },
        amount: { gt: 0 },
      },
      select: {
        id: true, sourceAdapter: true, eventType: true, eventDate: true, amount: true,
        counterparty: true, parserNotes: true, accountLast4: true, currency: true,
      },
    });
    return events.map((e) => {
      const shape = EVENT_SHAPE[e.eventType]!;
      const narration = e.parserNotes?.trim() || null;
      const mode = shape.mode === 'NEFT' && narration && IMPS.test(narration) ? 'IMPS' : shape.mode;
      return {
        source: 'canonical_event',
        sourceAdapter: e.sourceAdapter,
        sourceRef: e.id,
        accountKey: e.accountLast4?.replace(/\D/g, '').slice(-4) || null,
        txnDate: e.eventDate,
        amount: new Decimal(e.amount!.toString()),
        direction: shape.direction,
        mode,
        narration,
        counterparty: e.counterparty?.trim() || null,
        currency: e.currency,
        eventType: e.eventType,
      };
    });
  },
};
