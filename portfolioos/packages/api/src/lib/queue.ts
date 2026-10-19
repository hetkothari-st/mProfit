import Bull from 'bull';
import { env } from '../config/env.js';
import { logger } from './logger.js';

export interface ImportJobPayload {
  importJobId: string;
  userId: string;
  pdfPassword?: string | null;
}

/**
 * §5.1 task 12 — bounded worker runtime.
 *
 * `timeout` hard-kills a job that runs past this point, surfacing the failure
 * via Bull's failed event and the retry/DLQ pipeline. A runaway parser (e.g.
 * infinite regex, deadlocked Playwright handle) can't silently hog a worker.
 *
 * `lockDuration` must be comfortably longer than the realistic per-job
 * wall-clock — Bull treats a job as stalled if the lock isn't renewed within
 * this window and re-enqueues it, which would double-commit rows without the
 * sourceHash idempotency guard. 5-min ceiling matches the timeout.
 *
 * `stalledInterval` is how often the delayed-set sweeper checks for stalls;
 * keep at Bull's default 30s.
 */
const JOB_TIMEOUT_MS = 5 * 60 * 1000;
const LOCK_DURATION_MS = 5 * 60 * 1000;

let _importQueue: Bull.Queue<ImportJobPayload> | null = null;

/**
 * One attempt. Bull's `timeout` fails the job but cannot cancel the promise
 * still running in this process, so a second attempt ran *beside* the timed-out
 * first one: two workers committing the same ImportJob and racing its status.
 * Same reasoning as the doc-sort queue below. A job interrupted by a crash or
 * deploy is still recovered — that is the stalled-job path (`maxStalledCount`),
 * which only fires when no process holds the lock.
 */
export const IMPORT_JOB_OPTIONS: Bull.JobOptions = {
  attempts: 1,
  removeOnComplete: { count: 200 },
  removeOnFail: { count: 500 },
  timeout: JOB_TIMEOUT_MS,
};

const QUEUE_ERROR_LOG_INTERVAL_MS = 60_000;

/**
 * Bull attaches a no-op `error` listener so a Redis outage cannot crash the
 * process — which also means nothing is ever logged while Redis is down. Log
 * it, at most once a minute per queue, with a count of what was suppressed.
 */
export function logQueueErrors(queue: Pick<Bull.Queue, 'on'>, name: string, now: () => number = Date.now): void {
  let lastLoggedAt = -Infinity;
  let suppressed = 0;
  queue.on('error', (err: Error) => {
    const t = now();
    if (t - lastLoggedAt < QUEUE_ERROR_LOG_INTERVAL_MS) {
      suppressed++;
      return;
    }
    logger.warn({ err, queue: name, suppressed }, '[queue] redis error');
    lastLoggedAt = t;
    suppressed = 0;
  });
}

export function getImportQueue(): Bull.Queue<ImportJobPayload> {
  if (!_importQueue) {
    _importQueue = new Bull<ImportJobPayload>('imports', env.REDIS_URL, {
      defaultJobOptions: IMPORT_JOB_OPTIONS,
      settings: {
        lockDuration: LOCK_DURATION_MS,
        lockRenewTime: LOCK_DURATION_MS / 2,
        stalledInterval: 30_000,
        maxStalledCount: 1,
      },
    });

    logQueueErrors(_importQueue, 'imports');
    _importQueue.on('failed', (job, err) => {
      logger.error({ jobId: job?.id, err }, '[queue] import job failed');
    });
    _importQueue.on('completed', (job) => {
      logger.info({ jobId: job.id, importJobId: job.data.importJobId }, '[queue] import job completed');
    });
    _importQueue.on('stalled', (job) => {
      logger.warn(
        { jobId: job?.id, importJobId: job?.data?.importJobId },
        '[queue] import job stalled — will retry once',
      );
    });
  }
  return _importQueue;
}

export interface GmailScanJobPayload {
  scanJobId: string;
}

let _gmailScanQueue: Bull.Queue<GmailScanJobPayload> | null = null;

/**
 * Bull queue for the Gmail full-inbox scan worker. Lock + timeout
 * tuned for long-running list/download/classify phases (large inboxes
 * can take 30+ minutes).
 */
export function getGmailScanQueue(): Bull.Queue<GmailScanJobPayload> {
  if (!_gmailScanQueue) {
    _gmailScanQueue = new Bull<GmailScanJobPayload>('gmail-scan', env.REDIS_URL, {
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 60_000 },
        timeout: 30 * 60 * 1000,
        removeOnComplete: { count: 50 },
        removeOnFail: { count: 100 },
      },
      settings: {
        lockDuration: 5 * 60 * 1000,
        lockRenewTime: 2 * 60 * 1000,
        stalledInterval: 30_000,
        maxStalledCount: 2,
      },
    });

    logQueueErrors(_gmailScanQueue, 'gmail-scan');
    _gmailScanQueue.on('failed', (job, err) => {
      logger.error({ jobId: job?.id, err }, '[queue] gmail-scan job failed');
    });
    _gmailScanQueue.on('completed', (job) => {
      logger.info(
        { jobId: job.id, scanJobId: job.data.scanJobId },
        '[queue] gmail-scan job completed',
      );
    });
  }
  return _gmailScanQueue;
}

export interface DocSortJobPayload {
  documentId: string;
  userId: string;
  /** Only for a "this PDF needs a password" retry. Removed from Redis when the job ends; never in the DB. */
  password?: string;
}

let _docSortQueue: Bull.Queue<DocSortJobPayload> | null = null;

/** Bull queue for the Documents sorter: one job per uploaded file, bounded to 5 minutes. */
export function getDocSortQueue(): Bull.Queue<DocSortJobPayload> {
  if (!_docSortQueue) {
    _docSortQueue = new Bull<DocSortJobPayload>('doc-sort', env.REDIS_URL, {
      defaultJobOptions: {
        // One attempt: a timed-out job keeps running in this process, so a retry would run beside
        // it. A job that fails is marked FAILED on its document and re-queued by dropping the file again.
        attempts: 1,
        timeout: 5 * 60 * 1000,
        // A retried PDF password rides in the job data: never keep finished jobs in Redis.
        removeOnComplete: true,
        removeOnFail: true,
      },
    });
    logQueueErrors(_docSortQueue, 'doc-sort');
    _docSortQueue.on('failed', (job, err) => {
      logger.error({ jobId: job?.id, err }, '[queue] doc-sort job failed');
    });
  }
  return _docSortQueue;
}

export async function closeQueues(): Promise<void> {
  if (_importQueue) {
    await _importQueue.close();
    _importQueue = null;
  }
  if (_gmailScanQueue) {
    await _gmailScanQueue.close();
    _gmailScanQueue = null;
  }
  if (_docSortQueue) {
    await _docSortQueue.close();
    _docSortQueue = null;
  }
}

/**
 * Wait at most `ms` for a queue add to be accepted.
 *
 * Bull's `add` never rejects while Redis is down: ioredis buffers the command
 * and waits for a reconnect, so an upload or scan request that awaited it
 * hung until the client gave up, even though the callers were written to
 * carry on ("enqueue failed — manual retry"). This returns false instead, and
 * leaves the buffered add running: if Redis comes back, the job still runs.
 */
export async function enqueueBounded(add: Promise<unknown>, label: string, ms = 5_000): Promise<boolean> {
  // The add may settle after we stop waiting; never let that be unhandled.
  const settled = add.then(
    () => true,
    (err: unknown) => {
      logger.warn({ err, label }, '[queue] enqueue failed');
      return false;
    },
  );
  let timer: NodeJS.Timeout | undefined;
  const timedOut = new Promise<false>((resolve) => {
    timer = setTimeout(() => resolve(false), ms);
  });
  const ok = await Promise.race([settled, timedOut]);
  clearTimeout(timer);
  if (!ok) logger.warn({ label, waitedMs: ms }, '[queue] not enqueued in time (Redis unavailable?) — will run if Redis recovers');
  return ok;
}
