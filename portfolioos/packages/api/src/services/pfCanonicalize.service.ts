import { pfEventHash } from './sourceHash.js';
import { CanonicalEventType } from '@prisma/client';
import type { PfCanonicalEventInput } from '../adapters/pf/types.js';

export interface CanonicalizeInput {
  userId: string;
  account: {
    id: string;
    institution: string;
    type: string;
    identifierPlain: string;
  };
  adapterId: string;
  adapterVersion: string;
  events: PfCanonicalEventInput[];
}

export interface BuiltCanonicalEvent {
  userId: string;
  sourceAdapter: string;
  sourceAdapterVer: string;
  sourceRef: string;
  sourceHash: string;
  eventType: CanonicalEventType;
  eventDate: Date;
  amount: string;
  metadata: Record<string, unknown>;
  status: 'CONFIRMED';
}

export function buildCanonicalEvents(input: CanonicalizeInput): BuiltCanonicalEvent[] {
  return input.events.map((ev) => ({
    userId: input.userId,
    sourceAdapter: input.adapterId,
    sourceAdapterVer: input.adapterVersion,
    sourceRef: input.account.id,
    sourceHash: pfEventHash({
      userId: input.userId,
      institution: input.account.institution,
      identifier: input.account.identifierPlain,
      eventDate: ev.eventDate,
      amount: ev.amount,
      type: ev.type,
      sequence: ev.sequence,
    }),
    eventType: ev.type as CanonicalEventType,
    eventDate: new Date(ev.eventDate),
    amount: ev.amount,
    metadata: {
      memberIdLast4: ev.memberIdLast4 ?? null,
      notes: ev.notes ?? null,
      sequence: ev.sequence,
    },
    status: 'CONFIRMED' as const,
  }));
}
