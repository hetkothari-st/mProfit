import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';
import { NotFoundError, ForbiddenError, BadRequestError } from '../lib/errors.js';

/**
 * Dead-letter queue for ingestion — §3.5, §5.1 task 8. Any ingestion path
 * (file import, Gmail, future adapters) that fails to produce a
 * CanonicalEvent writes one IngestionFailure row here so (a) the job
 * doesn't crash, (b) the raw payload survives for manual review, and (c)
 * the user has a single place (/imports/failures) to inspect and retry.
 *
 * Scope for Phase 4.5: write path + list/detail/resolve + row-level
 * failures from the file-import pipeline. Retry requires the source
 * bytes to still exist; we only support it when the originating
 * ImportJob still has its filePath on disk.
 */

export interface WriteIngestionFailureInput {
  userId: string;
  sourceAdapter: string;
  adapterVersion: string;
  sourceRef: string;
  error: Error | string;
  rawPayload?: unknown;
}

export async function writeIngestionFailure(input: WriteIngestionFailureInput) {
  const isError = input.error instanceof Error;
  const errorMessage = isError ? (input.error as Error).message : String(input.error);
  const errorStack = isError ? (input.error as Error).stack ?? null : null;

  try {
    const row = await prisma.ingestionFailure.create({
      data: {
        userId: input.userId,
        sourceAdapter: input.sourceAdapter,
        adapterVersion: input.adapterVersion,
        sourceRef: input.sourceRef,
        errorMessage,
        errorStack,
        rawPayload:
          input.rawPayload === undefined || input.rawPayload === null
            ? Prisma.JsonNull
            : (input.rawPayload as Prisma.InputJsonValue),
      },
    });
    logger.warn(
      { failureId: row.id, sourceAdapter: input.sourceAdapter, sourceRef: input.sourceRef },
      '[ingestion] failure written to DLQ',
    );
    return row;
  } catch (err) {
    // DLQ write itself failed — this is catastrophic. Log loudly but don't
    // shadow the original parse error by throwing; the caller already has
    // the real error in hand.
    logger.error({ err, input }, '[ingestion] DLQ write failed');
    return null;
  }
}

export interface ListIngestionFailuresQuery {
  resolved?: boolean;
  limit?: number;
}

export async function listIngestionFailures(userId: string, q: ListIngestionFailuresQuery = {}) {
  const where: Prisma.IngestionFailureWhereInput = { userId };
  if (q.resolved === true) where.resolvedAt = { not: null };
  if (q.resolved === false) where.resolvedAt = null;

  return prisma.ingestionFailure.findMany({
    where,
    orderBy: [
      // Unresolved first, newest within each bucket.
      { resolvedAt: { sort: 'asc', nulls: 'first' } },
      { createdAt: 'desc' },
    ],
    take: Math.min(q.limit ?? 100, 500),
  });
}

export async function getIngestionFailure(userId: string, id: string) {
  const row = await prisma.ingestionFailure.findUnique({ where: { id } });
  if (!row) throw new NotFoundError('Ingestion failure not found');
  if (row.userId !== userId) throw new ForbiddenError();
  return row;
}

const ALLOWED_RESOLVE_ACTIONS = [
  'manual_entry',
  'retry_succeeded',
  'ignored',
  'data_corrected',
] as const;
export type ResolveAction = (typeof ALLOWED_RESOLVE_ACTIONS)[number];

export async function resolveIngestionFailure(
  userId: string,
  id: string,
  action: ResolveAction,
) {
  if (!ALLOWED_RESOLVE_ACTIONS.includes(action)) {
    throw new BadRequestError(
      `Invalid resolve action. Allowed: ${ALLOWED_RESOLVE_ACTIONS.join(', ')}`,
    );
  }

  const existing = await getIngestionFailure(userId, id);
  if (existing.resolvedAt) return existing;

  return prisma.ingestionFailure.update({
    where: { id },
    data: { resolvedAt: new Date(), resolvedAction: action },
  });
}
