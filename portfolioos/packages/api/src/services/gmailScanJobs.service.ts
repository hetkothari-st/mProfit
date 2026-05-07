import { prisma } from '../lib/prisma.js';
import { NotFoundError, BadRequestError } from '../lib/errors.js';
import { getGmailScanQueue } from '../lib/queue.js';
import { logger } from '../lib/logger.js';

export interface CreateScanJobInput {
  userId: string;
  mailboxId: string;
  lookbackFrom: Date;
  lookbackTo: Date;
}

export async function createScanJob(input: CreateScanJobInput) {
  if (input.lookbackTo <= input.lookbackFrom) {
    throw new BadRequestError('lookbackTo must be after lookbackFrom');
  }
  const mb = await prisma.mailboxAccount.findFirst({
    where: { id: input.mailboxId, userId: input.userId, provider: 'GMAIL_OAUTH' },
  });
  if (!mb) throw new NotFoundError('Gmail mailbox not found');

  const job = await prisma.gmailScanJob.create({
    data: {
      userId: input.userId,
      mailboxId: input.mailboxId,
      lookbackFrom: input.lookbackFrom,
      lookbackTo: input.lookbackTo,
      status: 'PENDING',
    },
  });
  try {
    const q = getGmailScanQueue();
    await q.add({ scanJobId: job.id });
    logger.info({ jobId: job.id }, '[gmailScan] enqueued');
  } catch (err) {
    logger.warn({ err, jobId: job.id }, '[gmailScan] enqueue failed — manual retry needed');
  }
  return job;
}

export async function listScanJobs(userId: string) {
  return prisma.gmailScanJob.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
}

export async function getScanJob(userId: string, id: string) {
  const job = await prisma.gmailScanJob.findUnique({ where: { id } });
  if (!job || job.userId !== userId) throw new NotFoundError('Scan job not found');
  return job;
}

export async function cancelScanJob(userId: string, id: string) {
  const job = await getScanJob(userId, id);
  if (['COMPLETED', 'FAILED', 'CANCELLED'].includes(job.status)) return job;
  return prisma.gmailScanJob.update({
    where: { id },
    data: { status: 'CANCELLED', completedAt: new Date() },
  });
}

export async function resumeScanJob(userId: string, id: string) {
  const job = await getScanJob(userId, id);
  if (job.status !== 'COMPLETED' && job.status !== 'FAILED') {
    throw new BadRequestError(`Cannot resume a job in status ${job.status}`);
  }
  await prisma.gmailScanJob.update({
    where: { id },
    data: { status: 'CLASSIFYING', errorMessage: null, completedAt: null },
  });
  const q = getGmailScanQueue();
  await q.add({ scanJobId: id });
  return getScanJob(userId, id);
}
