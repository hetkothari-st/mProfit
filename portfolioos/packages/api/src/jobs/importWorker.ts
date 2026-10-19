import { enqueueBounded, getImportQueue } from '../lib/queue.js';
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
    const { importJobId, userId, pdfPassword } = job.data as { importJobId: string; userId: string; pdfPassword?: string | null };
    const t0 = Date.now();
    logger.info({ bullJobId: job.id, importJobId }, '[worker] processing import job');
    // Each import belongs to exactly one user — run under their tenant
    // context so Prisma + RLS enforce isolation even inside the worker.
    const result = await runAsUser(userId, () => processImportJob(importJobId, pdfPassword));
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
  // a crash, or if Redis wasn't reachable at the time of upload), then close
  // out PROCESSING rows whose Bull job no longer exists.
  void rescuePendingJobs(q).then(() => sweepOrphanedProcessingJobs(q));
}

type RescueQueue = Pick<ReturnType<typeof getImportQueue>, 'add' | 'getJob'>;

/** A PROCESSING row older than this cannot still be running: the job timeout is 5 minutes. */
const ORPHAN_AFTER_MS = 60 * 60 * 1000;
const REDIS_WAIT_MS = 5_000;

export async function rescuePendingJobs(q: RescueQueue): Promise<void> {
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
      // jobId = ImportJob id, so a job still sitting in Redis is not added twice.
      // No pdfPassword: it is never persisted, so a protected PDF fails here
      // and asks the user for the password again.
      const queued = await enqueueBounded(q.add({ importJobId: j.id, userId: j.userId }, { jobId: j.id }), `import-rescue:${j.id}`);
      // Redis is not answering; every further add would wait out the same timeout.
      if (!queued) return;
    }
  } catch (err) {
    logger.warn({ err }, '[worker] rescuePendingJobs failed');
  }
}

/**
 * A row stuck in PROCESSING with no live Bull job behind it (Redis lost the
 * job, or it predates jobId = ImportJob id) never moves again and shows as a
 * spinner forever. Mark it FAILED so the user can re-upload. Skipped entirely
 * while Redis cannot answer, since "no job" would then be a guess.
 */
export async function sweepOrphanedProcessingJobs(q: RescueQueue, now: Date = new Date()): Promise<number> {
  try {
    const stale = await runAsSystem(() =>
      prisma.importJob.findMany({
        where: { status: 'PROCESSING', createdAt: { lt: new Date(now.getTime() - ORPHAN_AFTER_MS) } },
        select: { id: true },
        take: 200,
      }),
    );
    let swept = 0;
    for (const { id } of stale) {
      const state = await withTimeout(lookUpJobState(q, id), REDIS_WAIT_MS);
      if (state === 'unknown') {
        logger.warn('[worker] orphan sweep skipped — Redis not answering');
        return swept;
      }
      if (state === 'live') continue;
      await runAsSystem(() =>
        prisma.importJob.updateMany({
          where: { id, status: 'PROCESSING' },
          data: {
            status: 'FAILED',
            errorLog: { workerError: 'Import was interrupted. Please upload the file again.', orphaned: true },
            completedAt: now,
          },
        }),
      );
      swept++;
    }
    if (swept > 0) logger.warn({ swept }, '[worker] marked orphaned PROCESSING imports FAILED');
    return swept;
  } catch (err) {
    logger.warn({ err }, '[worker] orphan sweep failed');
    return 0;
  }
}

async function lookUpJobState(q: RescueQueue, id: string): Promise<'live' | 'gone'> {
  const job = await q.getJob(id);
  if (!job) return 'gone';
  const state = await job.getState();
  return state === 'completed' || state === 'failed' ? 'gone' : 'live';
}

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | 'unknown'> {
  let timer: NodeJS.Timeout | undefined;
  const timedOut = new Promise<'unknown'>((resolve) => {
    timer = setTimeout(() => resolve('unknown'), ms);
  });
  try {
    return await Promise.race([p.catch(() => 'unknown' as const), timedOut]);
  } finally {
    clearTimeout(timer);
  }
}
