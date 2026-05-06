import { prisma } from '../lib/prisma.js';
import { sseHub } from '../lib/sseHub.js';
import type { PfFetchSource, PfFetchStatus } from '@prisma/client';

export async function startSession(opts: {
  userId: string;
  accountId: string;
  source: PfFetchSource;
}) {
  return prisma.pfFetchSession.create({
    data: {
      userId: opts.userId,
      providentFundAccountId: opts.accountId,
      source: opts.source,
      status: 'INITIATED',
    },
  });
}

export async function transition(
  sessionId: string,
  status: PfFetchStatus,
  info: Record<string, unknown> = {},
): Promise<void> {
  await prisma.pfFetchSession.update({ where: { id: sessionId }, data: { status } });
  sseHub.publish(sessionId, { type: 'status', data: { status, ...info } });
}

export async function complete(sessionId: string, eventsCreated: number): Promise<void> {
  await prisma.pfFetchSession.update({
    where: { id: sessionId },
    data: { status: 'COMPLETED', completedAt: new Date(), eventsCreated },
  });
  sseHub.publish(sessionId, { type: 'completed', data: { eventsCreated } });
}

export async function fail(
  sessionId: string,
  errorMessage: string,
  ingestionFailureId?: string,
): Promise<void> {
  await prisma.pfFetchSession.update({
    where: { id: sessionId },
    data: { status: 'FAILED', completedAt: new Date(), errorMessage, ingestionFailureId },
  });
  sseHub.publish(sessionId, { type: 'failed', data: { errorMessage } });
}
