/**
 * Ingestion that heals itself.
 *
 * Before this, a failed email or file was a dead end. The Gmail poller logged
 * a warning; the IMAP poller logged a warning and moved its date cursor past
 * the message, so it was never looked at again; a FAILED import stayed failed
 * until someone pressed Reprocess. When the upload directory became
 * unwritable (2026-09-16 → #275) that meant weeks of statements silently
 * missing from every report.
 *
 * Three rules now:
 *  1. Every message that fails is recorded (IngestionFailure, one unresolved
 *     row per message) and resolved automatically when a later poll
 *     processes it — so the data-quality banner shows exactly what is still
 *     missing, and nothing else.
 *  2. A failed import is retried automatically, a bounded number of times,
 *     from its stored copy. Retrying is safe: every imported row carries a
 *     deterministic sourceHash, so a re-run adds only what was missing.
 *  3. Recovery from a known outage runs once (AppSetting marker), not on
 *     every boot.
 */

import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { logger } from '../../lib/logger.js';
import { runAsSystem, runAsUser } from '../../lib/requestContext.js';
import { writeIngestionFailure } from './ingestionFailures.service.js';
import { processImportJob } from './import.service.js';

export const IMPORT_AUTO_RETRY_LIMIT = 3;
const RETRY_TIMEOUT_MS = 5 * 60_000;
/** Leave a just-failed job alone for a while: the user may be fixing it. */
const RETRY_MIN_AGE_MS = 60 * 60_000;

// ─── Message-level failures (Gmail, IMAP) ──────────────────────────────

/**
 * Record that one source message could not be processed. Idempotent: a
 * message that keeps failing has one unresolved row, not one per poll.
 */
export async function recordSourceFailure(input: {
  userId: string;
  sourceAdapter: string;
  sourceRef: string;
  error: unknown;
  rawPayload?: Record<string, unknown>;
}): Promise<void> {
  const existing = await prisma.ingestionFailure.findFirst({
    where: { userId: input.userId, sourceRef: input.sourceRef, resolvedAt: null },
    select: { id: true },
  });
  if (existing) return;
  await writeIngestionFailure({
    userId: input.userId,
    sourceAdapter: input.sourceAdapter,
    adapterVersion: '1',
    sourceRef: input.sourceRef,
    error: input.error instanceof Error ? input.error : String(input.error),
    rawPayload: input.rawPayload,
  });
}

/** Unresolved failure refs with this prefix, for a poll to check against. */
export async function unresolvedSourceRefs(userId: string, refPrefix: string): Promise<Set<string>> {
  const rows = await prisma.ingestionFailure.findMany({
    where: { userId, resolvedAt: null, sourceRef: { startsWith: refPrefix } },
    select: { sourceRef: true },
  });
  return new Set(rows.map((r) => r.sourceRef));
}

/** Mark a previously failed message as recovered. */
export async function resolveSourceFailure(userId: string, sourceRef: string): Promise<void> {
  await prisma.ingestionFailure.updateMany({
    where: { userId, sourceRef, resolvedAt: null },
    data: { resolvedAt: new Date(), resolvedAction: 'retry_succeeded' },
  });
}

// ─── Import retries ────────────────────────────────────────────────────

function autoRetriesOf(errorLog: Prisma.JsonValue | null): number {
  const n = (errorLog as { autoRetries?: unknown } | null)?.autoRetries;
  return typeof n === 'number' ? n : 0;
}

export interface ImportRetrySummary {
  attempted: number;
  recovered: number;
  stillFailing: number;
}

/**
 * Re-run failed imports from their stored copy, up to IMPORT_AUTO_RETRY_LIMIT
 * times each. A job recovers when the cause was environmental (the upload
 * directory, a deploy mid-run) or when a parser has since been fixed; one
 * that fails for good stops after the limit and stays visible on the banner.
 */
export async function retryFailedImports(now: Date = new Date()): Promise<ImportRetrySummary> {
  const jobs = await runAsSystem(() =>
    prisma.importJob.findMany({
      where: {
        status: { in: ['FAILED', 'COMPLETED_WITH_ERRORS'] },
        blobKey: { not: null },
        OR: [{ completedAt: null }, { completedAt: { lt: new Date(now.getTime() - RETRY_MIN_AGE_MS) } }],
      },
      select: { id: true, userId: true, filePath: true, errorLog: true },
      orderBy: { createdAt: 'asc' },
    }),
  );

  const summary: ImportRetrySummary = { attempted: 0, recovered: 0, stillFailing: 0 };
  for (const job of jobs) {
    const attempts = autoRetriesOf(job.errorLog);
    if (attempts >= IMPORT_AUTO_RETRY_LIMIT) continue;
    summary.attempted++;
    let failedRows = -1;
    try {
      const result = await runAsUser(job.userId, () =>
        Promise.race([
          processImportJob(job.id),
          new Promise<never>((_resolve, reject) =>
            setTimeout(() => reject(new Error('auto-retry timed out')), RETRY_TIMEOUT_MS).unref(),
          ),
        ]),
      );
      failedRows = result.failed;
    } catch (err) {
      logger.warn({ err, importJobId: job.id }, '[recovery] import auto-retry failed');
    }

    await runAsUser(job.userId, async () => {
      const after = await prisma.importJob.findUnique({
        where: { id: job.id },
        select: { status: true, errorLog: true },
      });
      const base = (after?.errorLog ?? {}) as Record<string, unknown>;
      await prisma.importJob.update({
        where: { id: job.id },
        data: { errorLog: { ...base, autoRetries: attempts + 1 } as Prisma.InputJsonValue },
      });
      if (after?.status === 'COMPLETED' && failedRows === 0) {
        summary.recovered++;
        // Row failures from earlier runs of this job are now imported.
        await prisma.ingestionFailure.updateMany({
          where: { userId: job.userId, resolvedAt: null, sourceRef: { startsWith: `${job.filePath}#row-` } },
          data: { resolvedAt: new Date(), resolvedAction: 'retry_succeeded' },
        });
      } else {
        summary.stillFailing++;
      }
    });
  }
  if (summary.attempted > 0) logger.info(summary, '[recovery] import auto-retry done');
  return summary;
}

// ─── One-time recovery from the upload-directory outage ─────────────────

/** When the API started running as a user that could not write UPLOAD_DIR. */
export const UPLOAD_OUTAGE_START = new Date('2026-09-16T00:00:00Z');
export const UPLOAD_OUTAGE_RECOVERY_KEY = 'ingestion.recover.2026-10-upload-dir';

/**
 * IMAP accounts moved their date cursor past every message that failed
 * during the outage. Wind it back once so those messages are fetched again;
 * successfully processed ones are already marked \Seen and are skipped, and
 * attachments are de-duplicated by content hash. Gmail needs nothing: it
 * re-lists matching messages on every poll and skips only imported ones.
 */
export async function recoverFromUploadOutage(): Promise<{ skipped: boolean; mailboxesRewound: number }> {
  return runAsSystem(async () => {
    const marker = await prisma.appSetting.findUnique({ where: { key: UPLOAD_OUTAGE_RECOVERY_KEY } });
    if (marker) return { skipped: true, mailboxesRewound: 0 };
    const { count } = await prisma.mailboxAccount.updateMany({
      where: { provider: { not: 'GMAIL_OAUTH' }, lastPolledAt: { gt: UPLOAD_OUTAGE_START } },
      data: { lastPolledAt: UPLOAD_OUTAGE_START },
    });
    await prisma.appSetting.create({
      data: { key: UPLOAD_OUTAGE_RECOVERY_KEY, value: { ranAt: new Date().toISOString(), mailboxesRewound: count } },
    });
    logger.info({ mailboxesRewound: count }, '[recovery] upload-outage recovery done');
    return { skipped: false, mailboxesRewound: count };
  });
}

/** Everything above, for the nightly job and the boot sequence. */
export async function runIngestionRecovery(): Promise<{ imports: ImportRetrySummary }> {
  await recoverFromUploadOutage();
  return { imports: await retryFailedImports() };
}
