import { readFile, unlink } from 'node:fs/promises';
import type { ImportType, TransactionType, AssetClass, Exchange } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { logger } from '../../lib/logger.js';
import { NotFoundError, ForbiddenError, BadRequestError } from '../../lib/errors.js';
import { runParser } from './parsers/index.js';
import type { ParsedTransaction } from './parsers/types.js';
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

  const { parser, result } = await runParser({
    filePath: job.filePath,
    fileName: job.fileName,
    portfolioId: job.portfolioId,
    userId: job.userId,
  });

  // File-hash backs the positional fallback for rows without a broker natural
  // key — re-uploading the exact same bytes must produce zero new rows (§3.3,
  // idempotency invariant test). We hash the file ONCE here rather than per
  // row: cheaper and also keeps the row-level hash deterministic across
  // parser re-runs.
  let fileHash: string | null = null;
  try {
    const bytes = await readFile(job.filePath);
    fileHash = hashBytes(bytes);
  } catch (err) {
    logger.warn({ err, importJobId }, '[import] failed to hash source file — rows without natural keys will be admitted without dedup');
  }
  const adapterId = result.adapter ?? parser;
  const adapterVer = result.adapterVer ?? '1';

  const total = result.transactions.length;
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
    return { parser, total, success: 0, failed: total, errors: [{ row: 0, reason: 'No portfolio available' }] };
  }

  for (const [i, pt] of result.transactions.entries()) {
    try {
      // Per §6.2 preference order: parser-supplied hash (rare) → broker natural
      // key (handled inside createTransaction) → file+row fallback (this file).
      // For parsers like CAS/CSV that don't emit orderNo+tradeNo, the file-hash
      // path is what makes re-uploading the same file a no-op.
      const rowHash =
        pt.sourceHash ??
        (pt.broker && pt.orderNo && pt.tradeNo
          ? undefined // let createTransaction derive the natural-key hash
          : fileHash
            ? positionalHash({ adapterId, fileHash, rowIndex: i })
            : undefined);

      const before = await prisma.transaction.count({ where: { portfolioId } });
      const created = await createTransaction(
        job.userId,
        toTransactionInput(pt, portfolioId, {
          sourceAdapter: adapterId,
          sourceAdapterVer: adapterVer,
          sourceHash: rowHash,
        }),
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
        parser,
        adapter: adapterId,
        adapterVer,
        parserWarnings: result.warnings,
        rowErrors: errors,
        skippedAsDuplicates: skipped,
      },
      completedAt: new Date(),
    },
  });

  return { parser, total, success, failed, errors };
}

function toTransactionInput(
  pt: ParsedTransaction,
  portfolioId: string,
  source: {
    sourceAdapter: string;
    sourceAdapterVer: string;
    sourceHash?: string;
  },
) {
  return {
    portfolioId,
    assetClass: pt.assetClass as AssetClass,
    transactionType: pt.transactionType as TransactionType,
    stockSymbol: pt.symbol,
    stockName: pt.stockName ?? pt.assetName,
    exchange: pt.exchange as Exchange | undefined,
    schemeCode: pt.schemeCode,
    schemeName: pt.schemeName ?? pt.assetName,
    amcName: pt.amcName,
    assetName: pt.assetName ?? pt.stockName ?? pt.schemeName,
    isin: pt.isin,
    tradeDate: pt.tradeDate,
    settlementDate: pt.settlementDate,
    quantity: pt.quantity,
    price: pt.price,
    brokerage: pt.brokerage,
    stt: pt.stt,
    stampDuty: pt.stampDuty,
    exchangeCharges: pt.exchangeCharges,
    gst: pt.gst,
    sebiCharges: pt.sebiCharges,
    otherCharges: pt.otherCharges,
    broker: pt.broker,
    orderNo: pt.orderNo,
    tradeNo: pt.tradeNo,
    narration: pt.narration,
    sourceAdapter: source.sourceAdapter,
    sourceAdapterVer: source.sourceAdapterVer,
    sourceHash: source.sourceHash,
  };
}
