import { readFile, unlink } from 'node:fs/promises';
import type { ImportType } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { logger } from '../../lib/logger.js';
import { NotFoundError, ForbiddenError } from '../../lib/errors.js';
import { runFileImportAdapter } from '../../adapters/fileImport/runner.js';
import { projectTransactionEvent } from '../../adapters/fileImport/projection.js';
import { createTransaction } from '../transaction.service.js';
import { hashBytes, positionalHash } from '../sourceHash.js';
import { getImportQueue } from '../../lib/queue.js';

export interface CreateImportJobInput {
  userId: string;
  portfolioId: string | null;
  type: ImportType;
  fileName: string;
  filePath: string;
  broker?: string | null;
}

export async function createImportJob(input: CreateImportJobInput) {
  if (input.portfolioId) {
    const p = await prisma.portfolio.findUnique({ where: { id: input.portfolioId } });
    if (!p) throw new NotFoundError('Portfolio not found');
    if (p.userId !== input.userId) throw new ForbiddenError();
  }

  const job = await prisma.importJob.create({
    data: {
      userId: input.userId,
      portfolioId: input.portfolioId,
      type: input.type,
      status: 'PENDING',
      fileName: input.fileName,
      filePath: input.filePath,
      broker: input.broker ?? null,
    },
  });

  // Enqueue for async processing
  try {
    const q = getImportQueue();
    await q.add({ importJobId: job.id, userId: input.userId });
    logger.info({ jobId: job.id }, '[import] enqueued');
  } catch (err) {
    logger.warn({ err, jobId: job.id }, '[import] enqueue failed — will need manual retry');
  }

  return job;
}

export async function getImportJob(userId: string, id: string) {
  const job = await prisma.importJob.findUnique({
    where: { id },
    include: {
      _count: { select: { transactions: true } },
    },
  });
  if (!job) throw new NotFoundError('Import job not found');
  if (job.userId !== userId) throw new ForbiddenError();
  return job;
}

export async function listImportJobs(userId: string, limit = 50) {
  return prisma.importJob.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: Math.min(limit, 200),
    include: { _count: { select: { transactions: true } } },
  });
}

export async function deleteImportJob(userId: string, id: string) {
  const job = await prisma.importJob.findUnique({ where: { id } });
  if (!job) throw new NotFoundError('Import job not found');
  if (job.userId !== userId) throw new ForbiddenError();

  // Detach transactions (keep them) and delete job
  await prisma.transaction.updateMany({
    where: { importJobId: id },
    data: { importJobId: null },
  });
  await prisma.importJob.delete({ where: { id } });

  try {
    await unlink(job.filePath);
  } catch {
    // ignore
  }
}

export async function processImportJob(importJobId: string): Promise<{
  parser: string;
  total: number;
  success: number;
  failed: number;
  errors: { row: number; reason: string }[];
}> {
  const job = await prisma.importJob.findUnique({ where: { id: importJobId } });
  if (!job) throw new NotFoundError('Import job not found');

  await prisma.importJob.update({
    where: { id: importJobId },
    data: { status: 'PROCESSING' },
  });

  const { adapter, result } = await runFileImportAdapter({
    filePath: job.filePath,
    fileName: job.fileName,
    portfolioId: job.portfolioId,
    userId: job.userId,
  });

  // A hard parse failure (e.g. truncated PDF, parser threw) surfaces as
  // ok:false. Phase 4.5 stops short of the full DLQ plumbing (Task 8), so
  // for now we write the failure into errorLog and mark the job FAILED —
  // Task 8 will redirect this into IngestionFailure with rawPayload intact.
  if (!result.ok) {
    await prisma.importJob.update({
      where: { id: importJobId },
      data: {
        status: 'FAILED',
        totalRows: 0,
        successRows: 0,
        failedRows: 0,
        errorLog: {
          adapter: adapter?.id ?? 'none',
          adapterVer: adapter?.version ?? null,
          parseError: result.error,
          rawPayload: result.rawPayload ?? null,
        },
        completedAt: new Date(),
      },
    });
    return {
      parser: adapter?.id ?? 'none',
      total: 0,
      success: 0,
      failed: 0,
      errors: [{ row: 0, reason: result.error }],
    };
  }

  const events = result.events;
  const warnings = result.warnings ?? [];
  const adapterId = adapter?.id ?? 'none';
  const adapterVer = adapter?.version ?? '1';

  // File-hash backs the positional fallback for events without a broker
  // natural key — re-uploading the exact same bytes must produce zero new
  // rows (§3.3). Hash ONCE per job rather than per event.
  let fileHash: string | null = null;
  try {
    const bytes = await readFile(job.filePath);
    fileHash = hashBytes(bytes);
  } catch (err) {
    logger.warn(
      { err, importJobId },
      '[import] failed to hash source file — rows without natural keys will be admitted without dedup',
    );
  }

  const total = events.length;
  let success = 0;
  let failed = 0;
  let skipped = 0;
  const errors: { row: number; reason: string }[] = [];

  // Need a portfolio — fall back to user's default if not set
  let portfolioId = job.portfolioId;
  if (!portfolioId) {
    const def = await prisma.portfolio.findFirst({
      where: { userId: job.userId, isDefault: true },
    });
    portfolioId = def?.id ?? null;
  }
  if (!portfolioId) {
    const first = await prisma.portfolio.findFirst({ where: { userId: job.userId } });
    portfolioId = first?.id ?? null;
  }
  if (!portfolioId) {
    await prisma.importJob.update({
      where: { id: importJobId },
      data: {
        status: 'FAILED',
        totalRows: total,
        successRows: 0,
        failedRows: total,
        errorLog: { general: 'No portfolio selected and user has no portfolios' },
        completedAt: new Date(),
      },
    });
    return {
      parser: adapterId,
      total,
      success: 0,
      failed: total,
      errors: [{ row: 0, reason: 'No portfolio available' }],
    };
  }

  for (const [i, event] of events.entries()) {
    try {
      // Per §6.2 preference order: adapter-supplied hash → broker natural
      // key (derived inside createTransaction) → file+row positional
      // fallback. For adapters like CAS/CSV that don't emit orderNo+tradeNo,
      // the positional path is what makes re-uploading the same file a no-op.
      const rowHash =
        event.sourceHash ??
        (event.metadata.broker && event.metadata.orderNo && event.metadata.tradeNo
          ? undefined // let createTransaction derive the natural-key hash
          : fileHash
            ? positionalHash({ adapterId, fileHash, rowIndex: i })
            : undefined);

      const eventForProjection = rowHash
        ? { ...event, sourceHash: rowHash }
        : event;

      const before = await prisma.transaction.count({ where: { portfolioId } });
      const created = await createTransaction(
        job.userId,
        projectTransactionEvent(eventForProjection, portfolioId),
      );
      const after = await prisma.transaction.count({ where: { portfolioId } });

      if (after === before) {
        // createTransaction returned an existing row (idempotent short-circuit).
        // Don't rewrite its importJobId — the first ingestion owns the lineage.
        skipped++;
      } else {
        await prisma.transaction.update({
          where: { id: created.id },
          data: { importJobId },
        });
        success++;
      }
    } catch (err) {
      failed++;
      errors.push({ row: i + 1, reason: (err as Error).message });
      logger.warn({ err, row: i, importJobId }, '[import] row failed');
    }
  }

  const finalStatus =
    failed === 0 ? 'COMPLETED' : success === 0 && skipped === 0 ? 'FAILED' : 'COMPLETED_WITH_ERRORS';

  await prisma.importJob.update({
    where: { id: importJobId },
    data: {
      status: finalStatus,
      totalRows: total,
      successRows: success,
      failedRows: failed,
      errorLog: {
        adapter: adapterId,
        adapterVer,
        parserWarnings: warnings,
        rowErrors: errors,
        skippedAsDuplicates: skipped,
      },
      completedAt: new Date(),
    },
  });

  return { parser: adapterId, total, success, failed, errors };
}
