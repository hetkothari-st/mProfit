/**
 * §6.8 + §6.11 MonitoredSender CRUD.
 *
 * Senders are the user's allow-list for Gmail ingestion: the poller
 * (§6.7) only fetches mail matching `from:(a OR b OR ...)` over the
 * active senders. A sender can carry a `displayLabel` ("HDFC Bank
 * alerts") that the review UI shows, and two independent flags:
 *
 *   - `autoCommitAfter`: integer threshold the review flow reads when
 *     deciding whether to offer the auto-commit banner. Ships at 5.
 *   - `autoCommitEnabled`: once the user accepts the banner, set true.
 *     The pipeline checks this flag to decide between PARSED (auto) and
 *     PENDING_REVIEW (manual) on every incoming event.
 *
 * The CRUD surface here is intentionally narrow: create, list, edit
 * display/threshold, toggle active, toggle auto-commit, delete. We do
 * not let the user edit `confirmedEventCount` or `address` — those are
 * system-managed state.
 */

import { prisma } from '../lib/prisma.js';
import { BadRequestError, ForbiddenError, NotFoundError } from '../lib/errors.js';
import { findSeedForAddress } from './templateSeeds.service.js';

export interface CreateMonitoredSenderInput {
  address: string;
  displayLabel?: string | null;
  autoCommitAfter?: number;
  autoCommitEnabled?: boolean;
}

export interface UpdateMonitoredSenderInput {
  displayLabel?: string | null;
  autoCommitAfter?: number;
  isActive?: boolean;
  autoCommitEnabled?: boolean;
}

function normalizeAddress(raw: string): string {
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) throw new BadRequestError('sender address is required');
  // Permit either a full email "alerts@hdfcbank.net" or a domain-scoped
  // form "@hdfcbank.net" so users can whitelist an institution rather
  // than every one of its notification addresses. Reject anything else
  // — Gmail's query parser is happy with both forms.
  const looksLikeEmail = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(trimmed);
  const looksLikeDomain = /^@[^@\s]+\.[^@\s]+$/.test(trimmed);
  if (!looksLikeEmail && !looksLikeDomain) {
    throw new BadRequestError(
      `Invalid sender address "${raw}". Expected "user@host" or "@host".`,
    );
  }
  return trimmed;
}

export async function listMonitoredSenders(userId: string) {
  return prisma.monitoredSender.findMany({
    where: { userId },
    orderBy: [{ isActive: 'desc' }, { address: 'asc' }],
  });
}

export async function getMonitoredSender(userId: string, id: string) {
  const row = await prisma.monitoredSender.findUnique({ where: { id } });
  if (!row) throw new NotFoundError('Monitored sender not found');
  if (row.userId !== userId) throw new ForbiddenError();
  return row;
}

export async function createMonitoredSender(
  userId: string,
  input: CreateMonitoredSenderInput,
) {
  const address = normalizeAddress(input.address);
  const autoCommitAfter = input.autoCommitAfter ?? 5;
  if (autoCommitAfter < 1 || autoCommitAfter > 100) {
    throw new BadRequestError('autoCommitAfter must be between 1 and 100');
  }
  const existing = await prisma.monitoredSender.findUnique({
    where: { userId_address: { userId, address } },
  });
  if (existing) {
    throw new BadRequestError(`Sender ${address} is already monitored`);
  }

  // §6.10 auto-fill: if the user adopted a pre-seeded institution
  // without specifying a label, lift the seed's suggested label. A
  // label the user *did* supply always wins — we never overwrite
  // intent.
  let displayLabel = input.displayLabel ?? null;
  if (displayLabel === null) {
    const seed = await findSeedForAddress(address);
    if (seed) displayLabel = seed.suggestedDisplayLabel;
  }

  // Per Phase B UX: when the user explicitly approves a sender, treat it as
  // "trusted from now on". Future events from this sender skip the per-event
  // review queue and auto-project. Caller can override via `autoCommitEnabled`.
  const autoCommitEnabled = input.autoCommitEnabled ?? true;

  return prisma.monitoredSender.create({
    data: {
      userId,
      address,
      displayLabel,
      autoCommitAfter,
      autoCommitEnabled,
    },
  });
}

export async function updateMonitoredSender(
  userId: string,
  id: string,
  patch: UpdateMonitoredSenderInput,
) {
  await getMonitoredSender(userId, id);
  if (
    patch.autoCommitAfter !== undefined &&
    (patch.autoCommitAfter < 1 || patch.autoCommitAfter > 100)
  ) {
    throw new BadRequestError('autoCommitAfter must be between 1 and 100');
  }
  return prisma.monitoredSender.update({
    where: { id },
    data: {
      displayLabel: patch.displayLabel === undefined ? undefined : patch.displayLabel,
      autoCommitAfter:
        patch.autoCommitAfter === undefined ? undefined : patch.autoCommitAfter,
      isActive: patch.isActive === undefined ? undefined : patch.isActive,
      autoCommitEnabled:
        patch.autoCommitEnabled === undefined ? undefined : patch.autoCommitEnabled,
    },
  });
}

export async function deleteMonitoredSender(userId: string, id: string) {
  await getMonitoredSender(userId, id);
  await prisma.monitoredSender.delete({ where: { id } });
}
