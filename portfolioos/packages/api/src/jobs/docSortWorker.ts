import { getDocSortQueue } from '../lib/queue.js';
import { logger } from '../lib/logger.js';
import { failStuckDocument, processDocument } from '../services/documents/docSorter/sorter.service.js';

/**
 * Wire the Documents sorter worker to its Bull queue. Called once at API boot.
 * processDocument never throws for bad input (it records the outcome on the
 * document), so a job only fails on a timeout or an infrastructure error. Then
 * the document is marked FAILED so it does not read "Reading…" forever.
 */
export function registerDocSortWorker(): void {
  const queue = getDocSortQueue();
  queue.process(2, async (job) => {
    await processDocument(job.data.documentId, job.data.password ? { password: job.data.password } : undefined);
  });
  queue.on('failed', (job) => {
    failStuckDocument(job.data.documentId).catch((err: unknown) => {
      logger.error({ err, documentId: job.data.documentId }, '[docSort] could not mark a stuck document as failed');
    });
  });
  logger.info('[docSort] worker registered');
}
