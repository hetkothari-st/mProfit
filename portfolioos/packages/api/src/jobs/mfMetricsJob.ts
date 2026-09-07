/**
 * Nightly metrics computation for every ACTIVE mutual fund scheme
 * (`01-DATA-FOUNDATION.md §5`, `07-IMPLEMENTATION-PLAN.md` Task 2.3).
 *
 * Runs after the AMFI NAV file lands (22:00 IST), computes six rows per scheme
 * — the five horizons plus the `horizonYears = 0` portfolio/structural profile
 * — and upserts them on `(schemeCode, asOf, horizonYears)`. A second run on the
 * same day rewrites identical content and is a no-op by construction, which is
 * what makes the job safe to retry without a guard (`01 §5`).
 *
 * Three properties are load-bearing and each has a comment where it is
 * implemented below:
 *
 *  1. **One bad scheme must not fail the run.** Every per-scheme failure writes
 *     an `IngestionFailure` (CONTEXT.md §3.5) and the loop continues. A scheme
 *     whose NAV series is malformed is a data problem; aborting the other 1,499
 *     schemes turns it into an outage.
 *
 *  2. **Chunked, with a bounded per-chunk runtime.** See `CHUNK_SIZE`.
 *
 *  3. **Coverage is alerted on, not merely logged.** `06 §7`: fewer than 90% of
 *     ACTIVE schemes computed means something upstream broke — a NAV feed that
 *     did not land, a benchmark that stopped publishing — and it is invisible
 *     from the outside because every individual row still exists carrying a
 *     plausible `INSUFFICIENT_DATA`.
 *
 * Registration is deliberately NOT done here: `startMfMetricsJob` is exported
 * for `index.ts` / `jobs/index.ts` to call, matching the shape of every other
 * job in this directory.
 */

import cron from 'node-cron';
import { logger } from '../lib/logger.js';
import { prisma } from '../lib/prisma.js';
import { runAsSystem } from '../lib/requestContext.js';
import { writeIngestionFailure } from '../services/ingestionFailures.service.js';
import {
  computeMetricsForScheme,
  persistSchemeMetrics,
} from '../services/mfAnalytics/mfMetrics.service.js';
import { MF_METRICS_MATH_VERSION } from '../services/mfAnalytics/mfMetricsMath.js';

const TZ = 'Asia/Kolkata';

/** Adapter identity carried on every DLQ row this job writes (CONTEXT.md §3.4 / §14). */
export const MF_METRICS_ADAPTER_ID = 'mf.metrics';

/**
 * Schemes per chunk.
 *
 * The sizing is set by the Bull lock window, not by memory. `lib/queue.ts` fixes
 * both `JOB_TIMEOUT_MS` and `LOCK_DURATION_MS` at five minutes: a unit of work
 * that runs past that is killed as timed out and, worse, re-enqueued as stalled.
 * One scheme costs roughly six indexed reads (NAV, benchmark, risk-free,
 * snapshots, TER/AUM, managers) plus in-memory math over ~3,800 daily points —
 * on the order of 0.2–0.5 s wall clock against a warm local Postgres, and worse
 * against a pooled remote one. At 100 schemes a chunk that is 20–50 s of
 * expected work and roughly 100 s at the pessimistic end, which leaves a wide
 * margin under the five-minute ceiling even when the database is slow. The
 * full ~1,500-scheme run is therefore ~15 chunks and cannot fit in one lock
 * window at any plausible per-scheme cost, which is exactly why it is chunked.
 *
 * `CHUNK_BUDGET_MS` enforces the property rather than assuming it: if a chunk
 * overruns, the job logs it loudly instead of silently drifting toward the day
 * a lock expires mid-write. Today the job is driven by `node-cron` in-process
 * (matching `netWorthSnapshotJob`, `pfNudgeJob` and the rest of this
 * directory), so nothing kills a long chunk — but the moment it is moved onto a
 * Bull queue the chunk is the unit that must fit, and the number has to already
 * be right.
 */
export const CHUNK_SIZE = 100;

/** Four minutes: a chunk that exceeds this would be at risk under a 5-min lock. */
const CHUNK_BUDGET_MS = 4 * 60 * 1000;

/** `06 §7`: below this share of ACTIVE schemes, raise an operational alert. */
export const MIN_COVERAGE_RATIO = 0.9;

let running = false;

/** Today at UTC midnight — metrics rows are keyed by date, never by timestamp. */
function todayAsOf(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export interface MfMetricsRunSummary {
  asOf: Date;
  totalSchemes: number;
  computed: number;
  failed: number;
  rowsWritten: number;
  coverage: number;
  /** True when coverage fell below `MIN_COVERAGE_RATIO` and an alert was raised. */
  alerted: boolean;
  durationMs: number;
}

/**
 * Write the coverage alert (`06 §7`).
 *
 * `Alert` is a user-scoped table — there is no system-owned alert channel in
 * this schema — so an operational alert is delivered to the ADMIN users, which
 * is the closest thing the model has to an ops inbox. When there is no admin
 * (a fresh install, a test database) the loud `logger.error` is the whole
 * alert; the job must not fail because nobody was listening.
 */
async function raiseCoverageAlert(summary: MfMetricsRunSummary): Promise<boolean> {
  const message =
    `mfMetricsJob computed ${summary.computed}/${summary.totalSchemes} ACTIVE schemes ` +
    `(${(summary.coverage * 100).toFixed(1)}%), below the ${MIN_COVERAGE_RATIO * 100}% floor`;
  logger.error({ ...summary, asOf: summary.asOf.toISOString() }, `[cron] ${message}`);

  const admins = await prisma.user.findMany({
    where: { role: 'ADMIN', isActive: true },
    select: { id: true },
  });
  if (admins.length === 0) return false;

  await prisma.alert.createMany({
    data: admins.map((a) => ({
      userId: a.id,
      type: 'CUSTOM' as const,
      title: 'MF metrics coverage below 90%',
      description: message,
      triggerDate: summary.asOf,
      metadata: {
        job: 'mfMetricsJob',
        asOf: summary.asOf.toISOString().slice(0, 10),
        totalSchemes: summary.totalSchemes,
        computed: summary.computed,
        failed: summary.failed,
      },
    })),
  });
  return true;
}

/**
 * Compute and persist metrics for one scheme, converting any failure into a DLQ
 * row rather than an exception.
 *
 * Returns the number of rows written, or `null` when the scheme failed. The
 * caller uses `null` — not a thrown error — to count failures, so there is no
 * path by which one scheme aborts the run.
 */
async function runForScheme(schemeCode: string, asOf: Date): Promise<number | null> {
  try {
    const result = await computeMetricsForScheme(schemeCode, asOf);
    return await persistSchemeMetrics(result);
  } catch (err) {
    // The DLQ row is the record; the log line is for the operator watching now.
    // Neither swallows the error — `writeIngestionFailure` persists the message
    // and stack, and the run summary counts it (CONTEXT.md §3.5).
    await writeSchemeFailure(schemeCode, asOf, err);
    logger.error({ err, schemeCode }, '[cron] mf metrics failed for scheme');
    return null;
  }
}

/**
 * `IngestionFailure` requires a `userId` (it is a user-facing DLQ), but this job
 * is reference-data work owned by nobody. The row is attributed to the oldest
 * ADMIN so it lands somewhere a human can see it at `/ops/ingestion-failures`;
 * with no admin present the failure is logged and dropped rather than
 * fabricating a user.
 */
let opsUserIdCache: string | null | undefined;

async function resolveOpsUserId(): Promise<string | null> {
  if (opsUserIdCache !== undefined) return opsUserIdCache;
  const admin = await prisma.user.findFirst({
    where: { role: 'ADMIN', isActive: true },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });
  opsUserIdCache = admin?.id ?? null;
  return opsUserIdCache;
}

/** Exported for tests, which create an admin after this module is first loaded. */
export function resetOpsUserCache(): void {
  opsUserIdCache = undefined;
}

async function writeSchemeFailure(schemeCode: string, asOf: Date, err: unknown): Promise<void> {
  const userId = await resolveOpsUserId();
  if (userId === null) {
    logger.error(
      { err, schemeCode },
      '[cron] mf metrics failure not written to DLQ — no ADMIN user to attribute it to',
    );
    return;
  }
  await writeIngestionFailure({
    userId,
    sourceAdapter: MF_METRICS_ADAPTER_ID,
    adapterVersion: MF_METRICS_MATH_VERSION,
    sourceRef: `${schemeCode}@${asOf.toISOString().slice(0, 10)}`,
    error: err instanceof Error ? err : String(err),
    rawPayload: { schemeCode, asOf: asOf.toISOString().slice(0, 10) },
  });
}

/**
 * The whole run. Safe to call directly (tests, a manual backfill for a past
 * `asOf`); `startMfMetricsJob` is only the scheduler around it.
 */
export async function runMfMetricsJob(
  options: { asOf?: Date; chunkSize?: number; schemeCodes?: string[] } = {},
): Promise<MfMetricsRunSummary> {
  const asOf = options.asOf ?? todayAsOf();
  const chunkSize = options.chunkSize ?? CHUNK_SIZE;
  const t0 = Date.now();

  return runAsSystem(async () => {
    // ACTIVE only (`01 §5`). MERGED and WOUND_UP schemes still matter for
    // survivorship-adjusted category medians, but those are the peer-rank job's
    // business; recomputing a dead scheme's Sharpe every night is not.
    const schemeCodes =
      options.schemeCodes ??
      (
        await prisma.mfSchemeMeta.findMany({
          where: { status: 'ACTIVE' },
          select: { schemeCode: true },
          orderBy: { schemeCode: 'asc' },
        })
      ).map((s) => s.schemeCode);

    let computed = 0;
    let failed = 0;
    let rowsWritten = 0;

    for (let offset = 0; offset < schemeCodes.length; offset += chunkSize) {
      const chunk = schemeCodes.slice(offset, offset + chunkSize);
      const chunkStart = Date.now();

      // Sequential within a chunk on purpose. Parallelism here buys little —
      // the work is database-bound and the pool is shared with live API traffic
      // — and it would make the per-chunk budget below unpredictable.
      for (const schemeCode of chunk) {
        const rows = await runForScheme(schemeCode, asOf);
        if (rows === null) failed++;
        else {
          computed++;
          rowsWritten += rows;
        }
      }

      const chunkMs = Date.now() - chunkStart;
      if (chunkMs > CHUNK_BUDGET_MS) {
        // Not fatal today (node-cron has no lock), but it is the early warning
        // for the day this moves onto Bull and a chunk starts outliving its
        // five-minute lock. Loud, so the chunk size gets revisited.
        logger.warn(
          { chunkMs, chunkSize: chunk.length, budgetMs: CHUNK_BUDGET_MS },
          '[cron] mf metrics chunk exceeded its runtime budget — reduce CHUNK_SIZE',
        );
      } else {
        logger.debug(
          { offset, chunkSize: chunk.length, chunkMs },
          '[cron] mf metrics chunk done',
        );
      }
    }

    const total = schemeCodes.length;
    const summary: MfMetricsRunSummary = {
      asOf,
      totalSchemes: total,
      computed,
      failed,
      rowsWritten,
      // An empty universe is 100% covered, not 0% — dividing by zero here would
      // fire the alert on every fresh install.
      coverage: total === 0 ? 1 : computed / total,
      alerted: false,
      durationMs: 0,
    };

    if (total > 0 && summary.coverage < MIN_COVERAGE_RATIO) {
      summary.alerted = await raiseCoverageAlert(summary);
    }

    summary.durationMs = Date.now() - t0;
    logger.info(
      { ...summary, asOf: asOf.toISOString().slice(0, 10) },
      '[cron] mf metrics job done',
    );
    return summary;
  });
}

/**
 * Scheduler. 22:30 IST daily — after the AMFI NAV import (22:00, `01 §5`) so
 * today's NAV is in `MFNav` before the series is read, and before the
 * net-worth snapshot at 23:45 which reads nothing from here but shares the box.
 */
export function startMfMetricsJob(): void {
  if (process.env.ENABLE_MF_METRICS_CRON === 'false') {
    logger.info('[cron] mf metrics job disabled via ENABLE_MF_METRICS_CRON=false');
    return;
  }
  cron.schedule(
    // 23:15 IST, NOT 22:30. mfNavAdjustmentJob runs at 22:30 and writes the
    // `adjustedNav` column every return metric in this job reads (`02 §1`).
    // Both jobs were originally scheduled at 22:30 and would have raced: the
    // first night's metrics would have been computed from unadjusted NAVs,
    // understating every IDCW fund's return by its distributions — a wrong
    // number with no error anywhere to show for it. 45 minutes is the gap,
    // against a NAV-adjustment run bounded to ~5 minutes by its own budget.
    '15 23 * * *',
    () => {
      if (running) {
        // A run that is still going when the next tick arrives means the
        // universe outgrew the schedule. Skipping is right — two concurrent
        // runs would upsert the same keys and serialise on row locks — but it
        // is a warning, not a routine event.
        logger.warn('[cron] mf metrics job already running — skipping this tick');
        return;
      }
      running = true;
      void runMfMetricsJob()
        .catch((err: unknown) => {
          // The per-scheme loop already handles scheme failures; reaching here
          // means the run itself failed (the scheme list query, the alert
          // write). Logged, never swallowed — there is no DLQ row to write
          // because there is no scheme to attribute it to.
          logger.error({ err }, '[cron] mf metrics job failed');
        })
        .finally(() => {
          running = false;
        });
    },
    { timezone: TZ },
  );
  logger.info('[cron] scheduled: mf metrics @22:30 IST');
}
