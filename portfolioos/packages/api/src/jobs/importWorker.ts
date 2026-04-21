import { getImportQueue } from '../lib/queue.js';
import { processImportJob } from '../services/imports/import.service.js';
import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';
import { runAsSystem, runAsUser } from '../lib/requestContext.js';

export function startImportWorker(): void {
  if (process.env.ENABLE_IMPORT_WORKER === 'false') {
    logger.info('[worker] import worker disabled via ENABLE_IMPORT_WORKER=false');
    return;
  }

  const q = getImportQueue();
  q.process(2, async (job) => {
    const { importJobId, userId } = job.data as { importJobId: string; userId: string };
    logger.info({ bullJobId: job.id, importJobId }, '[worker] processing import job');
    // Each import belongs to exactly one user — run under their tenant
    // context so Prisma + RLS enforce isolation even inside the worker.
    const result = await runAsUser(userId, () => processImportJob(importJobId));
    logger.info({ bullJobId: job.id, importJobId, result }, '[worker] import job done');
    return result;
  });

  logger.info('[worker] import worker started — concurrency=2');

  // Rescue: re-enqueue any PENDING jobs that never got picked up (e.g. after
  // a crash, or if Redis wasn't reachable at the time of upload).
  void rescuePendingJobs(q);
}

async function rescuePendingJobs(q: ReturnType<typeof getImportQueue>): Promise<void> {
  try {
    // Cross-tenant scan — can't be attributed to one user.
    const pending = await runAsSystem(() =>
      prisma.importJob.findMany({
        where: { status: 'PENDING' },
        select: { id: true, userId: true, fileName: true },
        take: 100,
      }),
    );
    if (pending.length === 0) return;
    logger.info({ count: pending.length }, '[worker] re-enqueueing stuck PENDING jobs');
    for (const j of pending) {
      try {
        await q.add({ importJobId: j.id, userId: j.userId });
      } catch (err) {
        logger.warn({ err, jobId: j.id, fileName: j.fileName }, '[worker] rescue enqueue failed');
      }
    }
  } catch (err) {
    logger.warn({ err }, '[worker] rescuePendingJobs failed');
  }
}
