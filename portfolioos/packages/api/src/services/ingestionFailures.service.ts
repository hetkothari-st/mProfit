import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';
import { NotFoundError, ForbiddenError, BadRequestError } from '../lib/errors.js';
import type { IngestionFailure } from '@prisma/client';

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
  adapter?: string;
  since?: Date;
  cursor?: string;
  limit?: number;
}

export interface ListIngestionFailuresResult {
  data: IngestionFailure[];
  nextCursor: string | null;
}

export async function listIngestionFailures(
  userId: string,
  q: ListIngestionFailuresQuery = {},
): Promise<ListIngestionFailuresResult> {
  const take = Math.min(q.limit ?? 50, 200);

  const where: Prisma.IngestionFailureWhereInput = { userId };
  if (q.resolved === true) where.resolvedAt = { not: null };
  if (q.resolved === false) where.resolvedAt = null;
  if (q.adapter) where.sourceAdapter = q.adapter;
  if (q.since) where.createdAt = { gte: q.since };

  const rows = await prisma.ingestionFailure.findMany({
    where,
    orderBy: [
      // Unresolved first, newest within each bucket.
      { resolvedAt: { sort: 'asc', nulls: 'first' } },
      { createdAt: 'desc' },
    ],
    take: take + 1,  // fetch one extra to determine if there is a next page
    ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
  });

  const hasNext = rows.length > take;
  const data = hasNext ? rows.slice(0, take) : rows;
  const nextCursor = hasNext ? (data[data.length - 1]?.id ?? null) : null;

  return { data, nextCursor };
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
  'fixed_externally',
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

// ---------------------------------------------------------------------------
// Retry — attempt to re-parse the stored raw payload via the same adapter.
// Returns the number of canonical events successfully created, or throws on
// adapter error (without modifying the failure row on failure).
// ---------------------------------------------------------------------------

export interface RetryIngestionFailureResult {
  eventsInserted: number;
}

/**
 * Retry parsing a failure row using its stored rawPayload.
 *
 * Supported adapters (those that store enough in rawPayload to re-parse):
 *   - pf.*      — re-scrape via pfFetchSessions flow — NOT supported here;
 *                  these require a live browser session. Users must use the
 *                  PF refresh UI instead.
 *   - vehicle.* — rawPayload has {attempts, mode}; not re-parseable without
 *                  a live scraping run.
 *   - gmail.*   — rawPayload contains the email body; re-parseable.
 *
 * For adapters that cannot be retried, this function throws BadRequestError
 * so the UI can surface "Retry not available for this failure type."
 *
 * On success: marks the failure row resolved with action='retry_succeeded'.
 * On parse failure: returns { ok: false, error } without touching the row.
 */
export async function retryIngestionFailure(
  userId: string,
  id: string,
): Promise<RetryIngestionFailureResult> {
  const row = await getIngestionFailure(userId, id);

  if (!row.rawPayload) {
    throw new BadRequestError('No raw payload stored — retry not available for this failure.');
  }

  const adapter = row.sourceAdapter;

  // Gmail adapters store the email body in rawPayload — re-run through LLM pipeline.
  if (adapter.startsWith('gmail.') || adapter.startsWith('email.')) {
    // Lazy-import to avoid circular deps
    const { retryGmailFailure } = await import('../ingestion/gmail/pipeline.js');
    const result = await retryGmailFailure(userId, row);
    if (result.ok) {
      await prisma.ingestionFailure.update({
        where: { id: row.id },
        data: { resolvedAt: new Date(), resolvedAction: 'retry_succeeded' },
      });
      return { eventsInserted: result.eventsInserted };
    }
    // Return the parse error without modifying the row
    throw new BadRequestError(`Retry failed: ${result.error}`);
  }

  // PF, vehicle, valuation adapters — cannot be retried without live sessions
  if (
    adapter.startsWith('pf.') ||
    adapter.startsWith('vehicle.') ||
    adapter.startsWith('valuation.')
  ) {
    throw new BadRequestError(
      `Retry not available for adapter "${adapter}". Use the dedicated refresh UI for this asset type.`,
    );
  }

  // Unknown adapter
  throw new BadRequestError(`Retry not implemented for adapter "${adapter}".`);
}
