import { getImportQueue } from '../lib/queue.js';
import { processImportJob } from '../services/imports/import.service.js';
import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';
import { runAsSystem, runAsUser } from '../lib/requestContext.js';

/**
 * §5.1 task 12 — long-job visibility.
 *
 * Imports averaging >1 min deserve a warn-level log so operators can notice
 * regressions before the 5-minute Bull timeout trips. Threshold is
 * deliberately generous: a 200-row CAS with FIFO + projection recompute per
 * row is expected to land in the 5-30s range, so 60s is "odd, not broken."
 */
const SLOW_JOB_WARN_MS = 60_000;

export function startImportWorker(): void {
  if (process.env.ENABLE_IMPORT_WORKER === 'false') {
    logger.info('[worker] import worker disabled via ENABLE_IMPORT_WORKER=false');
    return;
  }

  const q = getImportQueue();
  q.process(2, async (job) => {
    const { importJobId, userId } = job.data as { importJobId: string; userId: string };
    const t0 = Date.now();
    logger.info({ bullJobId: job.id, importJobId }, '[worker] processing import job');
    // Each import belongs to exactly one user — run under their tenant
    // context so Prisma + RLS enforce isolation even inside the worker.
    const result = await runAsUser(userId, () => processImportJob(importJobId));
    const durationMs = Date.now() - t0;
    if (durationMs > SLOW_JOB_WARN_MS) {
      logger.warn(
        { bullJobId: job.id, importJobId, durationMs },
        '[worker] slow import — exceeded warn threshold',
      );
    }
    logger.info({ bullJobId: job.id, importJobId, result, durationMs }, '[worker] import job done');
    return result;
  });

  // Bull's `failed` event fires for timeouts, unhandled rejections, and
  // explicit throws. The ImportJob row stays in PROCESSING if we only log —
  // flip it to FAILED so the /import UI surfaces the error instead of
  // showing a ghost job. Runs under system context because the listener
  // fires outside any request / `runAsUser` frame.
  q.on('failed', (bullJob, err) => {
    const importJobId = bullJob?.data?.importJobId;
    if (!importJobId) return;
    const attemptsMade = bullJob?.attemptsMade ?? 0;
    const attemptsTotal = bullJob?.opts?.attempts ?? 1;
    // Only tombstone after the last attempt — earlier failures will retry.
    if (attemptsMade < attemptsTotal) return;
    void runAsSystem(async () => {
      try {
        await prisma.importJob.update({
          where: { id: importJobId },
          data: {
            status: 'FAILED',
            errorLog: {
              workerError: err.message,
              timedOut: /timed out|timeout/i.test(err.message),
              attemptsMade,
            },
            completedAt: new Date(),
          },
        });
      } catch (dbErr) {
        logger.error(
          { err: dbErr, importJobId },
          '[worker] failed to tombstone import job after terminal failure',
        );
      }
    });
  });

  logger.info('[worker] import worker started — concurrency=2, timeout=5min');

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
