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

export function getImportQueue(): Bull.Queue<ImportJobPayload> {
  if (!_importQueue) {
    _importQueue = new Bull<ImportJobPayload>('imports', env.REDIS_URL, {
      defaultJobOptions: {
        attempts: 2,
        backoff: { type: 'exponential', delay: 5_000 },
        removeOnComplete: { count: 200 },
        removeOnFail: { count: 500 },
        timeout: JOB_TIMEOUT_MS,
      },
      settings: {
        lockDuration: LOCK_DURATION_MS,
        lockRenewTime: LOCK_DURATION_MS / 2,
        stalledInterval: 30_000,
        maxStalledCount: 1,
      },
    });

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

export async function closeQueues(): Promise<void> {
  if (_importQueue) {
    await _importQueue.close();
    _importQueue = null;
  }
  if (_gmailScanQueue) {
    await _gmailScanQueue.close();
    _gmailScanQueue = null;
  }
}
