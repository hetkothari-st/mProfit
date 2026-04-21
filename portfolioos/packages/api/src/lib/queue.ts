import Bull from 'bull';
import { env } from '../config/env.js';
import { logger } from './logger.js';

export interface ImportJobPayload {
  importJobId: string;
  userId: string;
}

let _importQueue: Bull.Queue<ImportJobPayload> | null = null;

export function getImportQueue(): Bull.Queue<ImportJobPayload> {
  if (!_importQueue) {
    _importQueue = new Bull<ImportJobPayload>('imports', env.REDIS_URL, {
      defaultJobOptions: {
        attempts: 2,
        backoff: { type: 'exponential', delay: 5_000 },
        removeOnComplete: { count: 200 },
        removeOnFail: { count: 500 },
      },
    });

    _importQueue.on('failed', (job, err) => {
      logger.error({ jobId: job?.id, err }, '[queue] import job failed');
    });
    _importQueue.on('completed', (job) => {
      logger.info({ jobId: job.id, importJobId: job.data.importJobId }, '[queue] import job completed');
    });
  }
  return _importQueue;
}

export async function closeQueues(): Promise<void> {
  if (_importQueue) {
    await _importQueue.close();
    _importQueue = null;
  }
}
