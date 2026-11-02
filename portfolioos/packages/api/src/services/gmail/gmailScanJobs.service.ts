import { prisma } from '../../lib/prisma.js';
import { NotFoundError, BadRequestError } from '../../lib/errors.js';
import { enqueueBounded, getGmailScanQueue } from '../../lib/queue.js';
import { logger } from '../../lib/logger.js';

export interface CreateScanJobInput {
  userId: string;
  mailboxId: string;
  lookbackFrom: Date;
  lookbackTo: Date;
  /** FULL (default) or INSURANCE — see buildInsuranceScanQuery. */
  kind?: 'FULL' | 'INSURANCE';
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
      kind: input.kind ?? 'FULL',
      status: 'PENDING',
    },
  });
  try {
    const q = getGmailScanQueue();
    if (await enqueueBounded(q.add({ scanJobId: job.id }), `gmailScan:${job.id}`)) {
      logger.info({ jobId: job.id }, '[gmailScan] enqueued');
    }
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
  await enqueueBounded(q.add({ scanJobId: id }), `gmailScan:${id}`);
  return getScanJob(userId, id);
}

// ─── Whole-inbox fetch: on connect, then nightly ─────────────────

/** Gmail opened in April 2004; nothing in a mailbox is older. */
export const INBOX_BEGINNING = new Date('2004-04-01T12:00:00Z');

const RUNNING: GmailScanStatusValue[] = ['PENDING', 'LISTING', 'DOWNLOADING', 'CLASSIFYING'];
type GmailScanStatusValue = 'PENDING' | 'LISTING' | 'DOWNLOADING' | 'CLASSIFYING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';

const DAY_MS = 86_400_000;

/**
 * Fetch every financial document already in the mailbox: a FULL scan from
 * the beginning of Gmail to today. When earlier scans (the old 5-year
 * default, say) already covered the recent part, only the older part not yet
 * scanned is fetched. Nothing is started while a scan of this mailbox is
 * running, or when its whole history is covered — reconnecting the same
 * account never starts a duplicate.
 */
export async function startInboxBackfill(
  userId: string,
  mailboxId: string,
  now: Date = new Date(),
): Promise<{ started: boolean; jobId: string | null }> {
  const jobs = await prisma.gmailScanJob.findMany({
    where: { userId, mailboxId, kind: 'FULL', status: { notIn: ['FAILED', 'CANCELLED'] } },
    select: { id: true, status: true, lookbackFrom: true, lookbackTo: true },
  });
  const running = jobs.find((j) => RUNNING.includes(j.status as GmailScanStatusValue));
  if (running) return { started: false, jobId: running.id };

  const earliest = jobs.reduce<Date | null>((min, j) => (min === null || j.lookbackFrom < min ? j.lookbackFrom : min), null);
  // Covered back to the start (a day's slack for the noon-UTC dates).
  if (earliest && earliest.getTime() <= INBOX_BEGINNING.getTime() + DAY_MS) return { started: false, jobId: null };

  const job = await createScanJob({
    userId,
    mailboxId,
    lookbackFrom: INBOX_BEGINNING,
    // Up to where the earlier scans began (they overlap by a day; duplicates
    // are skipped by message id and content hash), or today if there were none.
    lookbackTo: earliest ? new Date(earliest.getTime() + DAY_MS) : now,
  });
  logger.info({ jobId: job.id, mailboxId, from: job.lookbackFrom, to: job.lookbackTo }, '[gmailScan] whole-inbox fetch started');
  return { started: true, jobId: job.id };
}

/**
 * The nightly pass for one mailbox: the whole history if it was never
 * fetched, else the mail that arrived since the last scan (with a day of
 * overlap). Nothing while a scan of this mailbox is still running.
 */
export async function scanNewMail(
  userId: string,
  mailboxId: string,
  now: Date = new Date(),
): Promise<'backfill' | 'incremental' | 'busy' | 'up-to-date'> {
  const backfill = await startInboxBackfill(userId, mailboxId, now);
  if (backfill.started) return 'backfill';
  if (backfill.jobId) return 'busy';

  const latest = await prisma.gmailScanJob.findFirst({
    where: { userId, mailboxId, kind: 'FULL', status: 'COMPLETED' },
    orderBy: { lookbackTo: 'desc' },
    select: { lookbackTo: true },
  });
  if (!latest) return 'up-to-date';
  if (now.getTime() - latest.lookbackTo.getTime() < DAY_MS / 2) return 'up-to-date';
  await createScanJob({
    userId,
    mailboxId,
    lookbackFrom: new Date(latest.lookbackTo.getTime() - DAY_MS),
    lookbackTo: now,
  });
  return 'incremental';
}
