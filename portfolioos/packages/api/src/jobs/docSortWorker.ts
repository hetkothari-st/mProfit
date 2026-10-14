import { getDocSortQueue } from '../lib/queue.js';
import { logger } from '../lib/logger.js';
import { processDocument } from '../services/docSorter/sorter.service.js';

/**
 * Wire the Documents sorter worker to its Bull queue. Called once at API boot.
 * processDocument never throws for bad input (it records the outcome on the
 * document), so a job only fails on infrastructure errors worth retrying.
 */
export function registerDocSortWorker(): void {
  getDocSortQueue().process(2, async (job) => {
    await processDocument(job.data.documentId, job.data.password ? { password: job.data.password } : undefined);
  });
  logger.info('[docSort] worker registered');
}
