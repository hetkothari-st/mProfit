import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';
import { env } from '../config/env.js';
import {
  buildScanQuery,
  listMessageIdsPage,
  fetchMessageWithAttachments,
  downloadAttachmentBytes,
} from '../lib/gmailMessageLister.js';
import { classifyAttachmentWithLlm } from '../lib/gmailClassifier.js';
import { decryptIfNeeded } from '../lib/decryptIfNeeded.js';
import { getGmailScanQueue } from '../lib/queue.js';
import { sweepAutoApprovals } from '../services/gmailDocApproval.service.js';

const STORAGE_ROOT = env.UPLOAD_DIR;
const CONCURRENCY = 5;

/**
 * Bull job entry point. Idempotent across phases — every step guards on
 * the row's current status and writes status transitions atomically so
 * a worker crash mid-flight resumes from the same place on retry.
 */
export async function runScanJob(scanJobId: string): Promise<void> {
  const job = await prisma.gmailScanJob.findUnique({ where: { id: scanJobId } });
  if (!job) {
    logger.warn({ scanJobId }, '[gmailScan] missing job — dropping');
    return;
  }
  if (job.status === 'CANCELLED' || job.status === 'COMPLETED') return;

  await prisma.gmailScanJob.update({
    where: { id: scanJobId },
    data: { status: 'LISTING', startedAt: job.startedAt ?? new Date() },
  });

  try {
    const messageIds = await collectMessageIds(scanJobId);
    await prisma.gmailScanJob.update({
      where: { id: scanJobId },
      data: { status: 'DOWNLOADING', totalMessages: messageIds.length },
    });

    await processMessages(scanJobId, messageIds);
    await prisma.gmailScanJob.update({
      where: { id: scanJobId },
      data: { status: 'CLASSIFYING' },
    });

    await classifyPending(scanJobId);
    await sweepAutoApprovals(job.userId, scanJobId);

    await prisma.gmailScanJob.update({
      where: { id: scanJobId },
      data: { status: 'COMPLETED', completedAt: new Date() },
    });
  } catch (err) {
    logger.error({ err, scanJobId }, '[gmailScan] job failed');
    await prisma.gmailScanJob.update({
      where: { id: scanJobId },
      data: {
        status: 'FAILED',
        errorMessage: (err as Error).message,
        completedAt: new Date(),
      },
    });
    throw err;
  }
}

async function collectMessageIds(scanJobId: string): Promise<string[]> {
  const job = await prisma.gmailScanJob.findUniqueOrThrow({ where: { id: scanJobId } });
  const ids: string[] = [];
  let cursor = job.nextPageToken ?? null;
  const query = buildScanQuery(job.lookbackFrom, job.lookbackTo);
  logger.info({ scanJobId, query, lookbackFrom: job.lookbackFrom, lookbackTo: job.lookbackTo }, '[gmailScan] LISTING start');

  while (true) {
    if (await isCancelled(scanJobId)) return ids;
    const page = await listMessageIdsPage(job.mailboxId, query, cursor);
    ids.push(...page.ids);
    cursor = page.nextPageToken;
    await prisma.gmailScanJob.update({
      where: { id: scanJobId },
      data: { nextPageToken: cursor },
    });
    if (!cursor) break;
  }
  logger.info({ scanJobId, total: ids.length }, '[gmailScan] LISTING done');
  return ids;
}

async function processMessages(scanJobId: string, messageIds: string[]): Promise<void> {
  const job = await prisma.gmailScanJob.findUniqueOrThrow({ where: { id: scanJobId } });

  for (const messageId of messageIds) {
    if (await isCancelled(scanJobId)) return;
    const msg = await fetchMessageWithAttachments(job.mailboxId, messageId);
    if (!msg) continue;

    for (const att of msg.attachments) {
      const existing = await prisma.gmailDiscoveredDoc.findUnique({
        where: {
          userId_gmailMessageId_gmailAttachmentId: {
            userId: job.userId,
            gmailMessageId: msg.header.messageId,
            gmailAttachmentId: att.attachmentId,
          },
        },
      });
      if (existing) continue;

      const bytes = await downloadAttachmentBytes(
        job.mailboxId,
        msg.header.messageId,
        att.attachmentId,
      );
      const contentHash = sha256(bytes);

      const dupeImport = await prisma.importJob.findFirst({
        where: { userId: job.userId, contentHash },
        select: { id: true },
      });

      const dupeDoc = await prisma.gmailDiscoveredDoc.findUnique({
        where: { userId_contentHash: { userId: job.userId, contentHash } },
      });
      if (dupeDoc) continue;

      const storagePath = await writeBytes(
        job.userId,
        msg.header.messageId,
        att,
        bytes,
      );

      await prisma.gmailDiscoveredDoc.create({
        data: {
          userId: job.userId,
          scanJobId,
          gmailMessageId: msg.header.messageId,
          gmailAttachmentId: att.attachmentId,
          fromAddress: msg.header.fromAddress,
          subject: msg.header.subject,
          receivedAt: msg.header.receivedAt,
          fileName: att.fileName,
          fileSize: att.size,
          mimeType: att.mimeType,
          contentHash,
          storagePath,
          status: dupeImport ? 'DUPLICATE' : 'CLASSIFYING',
        },
      });
    }

    await prisma.gmailScanJob.update({
      where: { id: scanJobId },
      data: {
        processedMessages: { increment: 1 },
        attachmentsFound: { increment: msg.attachments.length },
      },
    });
  }
}

async function classifyPending(scanJobId: string): Promise<void> {
  const docs = await prisma.gmailDiscoveredDoc.findMany({
    where: { scanJobId, status: 'CLASSIFYING' },
  });
  if (docs.length === 0) return;

  const queue = [...docs];
  const inFlight: Promise<void>[] = [];
  for (let i = 0; i < CONCURRENCY; i++) inFlight.push(worker());
  await Promise.all(inFlight);

  async function worker() {
    while (queue.length > 0) {
      if (await isCancelled(scanJobId)) return;
      const doc = queue.shift();
      if (!doc) return;

      const decrypted = await decryptIfNeeded(doc.storagePath, {
        fileName: doc.fileName,
        userId: doc.userId,
        allowedKinds: ['pdf', 'xlsx_ooxml', 'xlsx_encrypted', 'xls', 'csv'],
      });

      const first4kb = decrypted.ok && decrypted.text ? decrypted.text.slice(0, 4096) : '';

      const cls = await classifyAttachmentWithLlm({
        userId: doc.userId,
        fileName: doc.fileName,
        sender: doc.fromAddress,
        subject: doc.subject,
        first4kbText: first4kb,
      });

      if (!cls.ok) {
        if (cls.reason === 'budget_capped') {
          await prisma.gmailScanJob.update({
            where: { id: scanJobId },
            data: { errorMessage: cls.message },
          });
          queue.length = 0;
          return;
        }
        await prisma.gmailDiscoveredDoc.update({
          where: { id: doc.id },
          data: {
            classifierNotes: `${cls.reason}: ${cls.message}`,
            status: 'PENDING_APPROVAL',
            isFinancial: null,
          },
        });
        continue;
      }

      const c = cls.classification;
      const keep = c.is_financial && c.confidence >= 0.4;

      await prisma.gmailDiscoveredDoc.update({
        where: { id: doc.id },
        data: {
          isFinancial: c.is_financial,
          classifiedDocType: c.doc_type,
          classifierConfidence: c.confidence.toFixed(2),
          suggestedParser: c.suggested_parser ?? null,
          classifierNotes: c.reason,
          classifierTokensIn: cls.usage.inputTokens,
          classifierTokensOut: cls.usage.outputTokens,
          status: keep ? 'PENDING_APPROVAL' : 'NOT_FINANCIAL',
        },
      });
      await prisma.gmailScanJob.update({
        where: { id: scanJobId },
        data: {
          attachmentsClassified: { increment: 1 },
          attachmentsKept: keep ? { increment: 1 } : undefined,
        },
      });
    }
  }
}

async function isCancelled(scanJobId: string): Promise<boolean> {
  const j = await prisma.gmailScanJob.findUnique({
    where: { id: scanJobId },
    select: { status: true },
  });
  return j?.status === 'CANCELLED';
}

function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

async function writeBytes(
  userId: string,
  messageId: string,
  att: { attachmentId: string; fileName: string },
  bytes: Buffer,
): Promise<string> {
  const ym = new Date().toISOString().slice(0, 7);
  const dir = join(STORAGE_ROOT, 'gmail-imports', userId, ym);
  await mkdir(dir, { recursive: true });
  const ext = extname(att.fileName) || '.bin';
  const safeMsg = messageId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 32);
  const path = join(dir, `${safeMsg}-${att.attachmentId.slice(0, 12)}${ext}`);
  await writeFile(path, bytes);
  return path;
}

/**
 * Wire the worker to the Bull queue. Called once at API boot.
 */
export function registerGmailScanWorker(): void {
  const q = getGmailScanQueue();
  q.process(2, async (job) => {
    const { scanJobId } = job.data;
    await runScanJob(scanJobId);
  });
  logger.info('[gmailScan] worker registered');
}
