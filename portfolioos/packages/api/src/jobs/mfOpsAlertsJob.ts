/**
 * The two MF-analytics operational alerts that have no job of their own
 * (`06-QUALITY-COMPLIANCE.md §7`, `07-IMPLEMENTATION-PLAN.md` Task 6.1).
 *
 * `06 §7` lists six alerts. Four of them live inside the job whose output they
 * are watching, because that job already holds the numbers:
 *
 *   | Alert | Where it already lives |
 *   |---|---|
 *   | benchmark stale > 3 business days | `benchmarkPriceJob.raiseStaleAlert` |
 *   | `mfMetricsJob` coverage < 90% | `mfMetricsJob.raiseCoverageAlert` |
 *   | > 2% of NAV rows quarantined in a day | `mfNavAdjustmentJob.maybeRaiseQuarantineAlert` |
 *   | reconciliation drift | `mfReconciliationJob.raiseAlert` |
 *
 * The remaining two are different in kind: neither is a property of a single
 * run, so neither has a run to hang off.
 *
 *  - **Prose verification failure rate** is a rate over a *day* of per-user
 *    prose generations. `mfProseJob` is queue-driven and coalescing — it has no
 *    clock at all — so `checkMfProseVerificationFailureRate` was written there
 *    (it needs that module's `LlmSpend` purpose and failure-prefix constants)
 *    but left unscheduled. This file is its schedule.
 *  - **`mfAnalysisJob` PARTIAL rate** is a rate over a day of per-user analysis
 *    runs. `mfAnalysisJob` is deliberately trigger-driven with **no cron** —
 *    that is a load-bearing property of its design, not an omission (a nightly
 *    sweep would manufacture append-only verdict rows nobody asked for). Adding
 *    a cron to that module to watch it would contradict its own header, so the
 *    monitor lives here and the monitored job stays clockless.
 *
 * Both are fleet-wide questions — "how did every user's runs go yesterday?" —
 * which no single user's RLS context can answer, so both read under
 * `runAsSystem` and neither lets anything user-identifying out.
 *
 * Registration is deliberately NOT done here: `startMfOpsAlertsJob` is exported
 * for the boot sequence to call, matching every other job in this directory.
 */

import cron from 'node-cron';
import { Decimal } from 'decimal.js';
import { logger } from '../lib/logger.js';
import { prisma } from '../lib/prisma.js';
import { runAsSystem } from '../lib/requestContext.js';
import {
  checkMfProseVerificationFailureRate,
  type ProseVerificationRateResult,
} from './mfProseJob.js';

const TZ = 'Asia/Kolkata';

/** Source tag on every `Alert.metadata` this file writes. */
export const MF_OPS_ALERTS_SOURCE = 'mf.ops-alerts';

// ---------------------------------------------------------------------------
// DLQ / alert ownership — identical to mfReconciliationJob, mfMetadataJob,
// mfPeerRankJob, benchmarkPriceJob
// ---------------------------------------------------------------------------

/**
 * `Alert` requires a `userId`; this is cross-tenant operational work owned by
 * nobody. Attribute it to the oldest active ADMIN so it surfaces where an
 * operator is already looking; with no admin present, log at `error` and drop
 * rather than fabricate a user.
 *
 * Cached because this runs on a clock and the answer does not change between
 * ticks. `resetMfOpsAlertsOpsUserCache` exists because a test creates its admin
 * *after* this module is first loaded, which would otherwise pin the cache to
 * `null` for the life of the process.
 */
let opsUserIdCache: string | null | undefined;

async function resolveOpsUserId(override?: string): Promise<string | null> {
  if (override !== undefined) return override;
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
export function resetMfOpsAlertsOpsUserCache(): void {
  opsUserIdCache = undefined;
}

/**
 * One alert per day per title. Dedupe key `(userId, type, title, triggerDate)`
 * — the same shape `benchmarkPriceJob`, `mfNavAdjustmentJob`,
 * `mfReconciliationJob` and `mfProseJob` use, so no two reference-data jobs
 * disagree about what "already alerted for that day" means. That matters here
 * more than elsewhere: this job is safe to re-run by hand for a past day while
 * investigating, and a re-run must not re-page anyone.
 */
async function raiseAlert(input: {
  opsUserId: string | null;
  title: string;
  description: string;
  triggerDate: Date;
  metadata: Record<string, unknown>;
}): Promise<boolean> {
  if (input.opsUserId === null) {
    logger.error({ title: input.title }, `[mfOpsAlerts] ${input.description} (no ADMIN user to alert)`);
    return false;
  }
  const existing = await prisma.alert.findFirst({
    where: {
      userId: input.opsUserId,
      type: 'CUSTOM',
      title: input.title,
      triggerDate: input.triggerDate,
    },
    select: { id: true },
  });
  if (existing === null) {
    await prisma.alert.create({
      data: {
        userId: input.opsUserId,
        type: 'CUSTOM',
        title: input.title,
        description: input.description,
        triggerDate: input.triggerDate,
        metadata: { source: MF_OPS_ALERTS_SOURCE, ...input.metadata },
      },
    });
  }
  logger.warn({ title: input.title }, `[mfOpsAlerts] ${input.description}`);
  return true;
}

// ---------------------------------------------------------------------------
// `mfAnalysisJob` PARTIAL rate (`06 §7`, last bullet)
// ---------------------------------------------------------------------------

/** `06 §7`: "`mfAnalysisJob` `PARTIAL` rate > 5%". */
export const MF_ANALYSIS_PARTIAL_RATE_THRESHOLD = new Decimal('0.05');

/**
 * Below this many terminal runs in the day, no alert is raised.
 *
 * Without a floor the first PARTIAL run of a quiet day is a 100% failure rate
 * and pages somebody about one user. The alert is watching for a rule
 * regression, which is a property of a population — the same reasoning, and the
 * same number, as `PROSE_VERIFICATION_MIN_SAMPLE`.
 */
export const MF_ANALYSIS_PARTIAL_MIN_SAMPLE = 20;

export interface MfAnalysisPartialRateResult {
  day: string;
  completed: number;
  partial: number;
  /** Terminal-but-produced-nothing runs. Reported, deliberately not in the rate. */
  failed: number;
  rate: string;
  alerted: boolean;
  /** Why no alert, when none was raised. */
  reason?: string;
}

function utcDayBounds(day: Date): { start: Date; end: Date } {
  const start = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate()));
  return { start, end: new Date(start.getTime() + 24 * 60 * 60 * 1000) };
}

/**
 * Compute the day's `PARTIAL` share of MF analysis runs and raise an ops alert
 * if it breaches.
 *
 * The rate is deliberately `PARTIAL / (PARTIAL + COMPLETED)`:
 *
 *  - `RUNNING` rows are not terminal. A run in flight has no outcome yet, and
 *    counting it as a success would understate the rate for as long as it takes
 *    the process to crash.
 *  - `FAILED` is outside **both** numerator and denominator. A PARTIAL run is
 *    the specific signal `06 §7` asks for — a rule *category* threw while the
 *    rest of the engine still produced findings, which is what a rule
 *    regression looks like. A FAILED run produced nothing at all and is a
 *    different, louder alarm that the engine already logs per user. Putting
 *    FAILED in the denominator would *dilute* the partial rate precisely when
 *    things are worst, which is the wrong direction for an alert to move.
 *
 * `MfAnalysisRun` is user-scoped, so this reads under `runAsSystem`: it is a
 * question about the fleet that no single user's context can answer. Only
 * counts leave the function — never a user id, never a scheme.
 *
 * Safe to run repeatedly for the same day; the alert is deduped by
 * `(userId, type, title, triggerDate)`.
 */
export async function checkMfAnalysisPartialRate(
  opts: { day?: Date; opsUserId?: string } = {},
): Promise<MfAnalysisPartialRateResult> {
  const { start, end } = utcDayBounds(opts.day ?? new Date());
  const dayLabel = start.toISOString().slice(0, 10);

  return runAsSystem(async () => {
    // Keyed on `startedAt` rather than `completedAt`: `completedAt` is null on
    // a run the process died inside, which would quietly drop exactly the runs
    // most worth counting.
    const rows = await prisma.mfAnalysisRun.groupBy({
      by: ['status'],
      where: { startedAt: { gte: start, lt: end } },
      _count: { _all: true },
    });

    const countOf = (status: string): number =>
      rows.find((r) => r.status === status)?._count._all ?? 0;

    const completed = countOf('COMPLETED');
    const partial = countOf('PARTIAL');
    const failed = countOf('FAILED');

    const sample = completed + partial;
    const rate = sample === 0 ? new Decimal(0) : new Decimal(partial).dividedBy(sample);
    const base: MfAnalysisPartialRateResult = {
      day: dayLabel,
      completed,
      partial,
      failed,
      rate: rate.toFixed(4),
      alerted: false,
    };

    if (sample < MF_ANALYSIS_PARTIAL_MIN_SAMPLE) {
      return {
        ...base,
        reason: `only ${sample} terminal runs; minimum sample is ${MF_ANALYSIS_PARTIAL_MIN_SAMPLE}`,
      };
    }
    if (rate.lessThanOrEqualTo(MF_ANALYSIS_PARTIAL_RATE_THRESHOLD)) {
      return { ...base, reason: 'within threshold' };
    }

    const title = `MF analysis PARTIAL rate: ${dayLabel}`;
    const description =
      `${partial} of ${sample} MF analysis runs (${rate.times(100).toFixed(1)}%) finished PARTIAL — ` +
      `at least one rule category threw and its findings are missing from the result those users were shown. ` +
      `The threshold is ${MF_ANALYSIS_PARTIAL_RATE_THRESHOLD.times(100).toFixed(0)}%. ` +
      `A rate this high is a rule or facts-builder regression, not a run of unlucky portfolios; ` +
      `the failing categories are named per run in MfAnalysisRun.ruleVersionsSnapshot. ` +
      `${failed} further run(s) FAILED outright and are counted separately.`;

    const alerted = await raiseAlert({
      opsUserId: await resolveOpsUserId(opts.opsUserId),
      title,
      description,
      triggerDate: start,
      metadata: { check: 'mfAnalysisPartialRate', completed, partial, failed, rate: rate.toFixed(4) },
    });
    return alerted ? { ...base, alerted: true } : { ...base, reason: 'no ADMIN user to alert' };
  });
}

// ---------------------------------------------------------------------------
// The sweep
// ---------------------------------------------------------------------------

export interface MfOpsAlertsRunResult {
  day: string;
  proseVerification: ProseVerificationRateResult;
  analysisPartial: MfAnalysisPartialRateResult;
}

/**
 * The whole sweep for one day. Exported so it can be run by hand against a past
 * day while investigating, which is also why every write below is deduped.
 *
 * `allSettled`, not `all`: the two checks share a tick for scheduling
 * convenience and are otherwise unrelated, so a thrown prose query must not
 * prevent the PARTIAL-rate check from *running and raising its alert*. Both
 * always execute; a rejection is logged with its own error and then rethrown so
 * the caller and the cron log record that this sweep was incomplete. Returning
 * a cheerful partial result would be the alerting system reporting itself
 * healthy while half of it was down.
 */
export async function runMfOpsAlertsSweep(
  opts: { day?: Date; opsUserId?: string } = {},
): Promise<MfOpsAlertsRunResult> {
  const day = opts.day ?? previousUtcDay();
  const results = await Promise.allSettled([
    checkMfProseVerificationFailureRate({ day, opsUserId: opts.opsUserId }),
    checkMfAnalysisPartialRate({ day, opsUserId: opts.opsUserId }),
  ]);

  for (const r of results) {
    if (r.status === 'rejected') {
      logger.error({ err: r.reason }, '[cron] mf ops alert check failed');
    }
  }
  const [prose, partial] = results;
  if (prose.status === 'rejected') throw prose.reason;
  if (partial.status === 'rejected') throw partial.reason;

  const result: MfOpsAlertsRunResult = {
    day: prose.value.day,
    proseVerification: prose.value,
    analysisPartial: partial.value,
  };
  logger.info(result, '[cron] mf ops alerts sweep done');
  return result;
}

/** Yesterday, UTC. See the scheduler comment for why the sweep looks backwards. */
function previousUtcDay(): Date {
  return new Date(Date.now() - 24 * 60 * 60 * 1000);
}

let running = false;

/**
 * Scheduler. 06:30 IST daily — named starter, deliberately NOT registered here.
 *
 * The time is chosen so the day being measured is **closed**. Both checks are
 * rates over a UTC day; 06:30 IST is 01:00 UTC, so "yesterday UTC" ended an
 * hour ago and cannot gain more runs after the sample is taken. Running at, say,
 * 00:30 IST would sample a UTC day that still had five hours left in it and
 * would report a rate over a partial population — which is the failure mode the
 * minimum-sample floors exist to prevent, reintroduced by the clock.
 *
 * It also sits clear of the nightly reference-data chain (benchmarkPrice 20:00,
 * mfNavAdjustment 22:30, mfMetrics 22:30/23:15, mfPeerRank 00:30), so a sweep
 * that queries across every user's runs is not competing with it for the pool.
 */
export function startMfOpsAlertsJob(): void {
  if (process.env.ENABLE_MF_OPS_ALERTS_CRON === 'false') {
    logger.info('[cron] mf ops alerts job disabled via ENABLE_MF_OPS_ALERTS_CRON=false');
    return;
  }
  cron.schedule(
    '30 6 * * *',
    () => {
      if (running) {
        logger.warn('[cron] mf ops alerts sweep already running — skipping this tick');
        return;
      }
      running = true;
      void runMfOpsAlertsSweep()
        .catch((err: unknown) => {
          // Reaching here means both checks threw. Logged at error, never
          // swallowed — and note that a crashed sweep leaves no "all clear"
          // behind, by construction.
          logger.error({ err }, '[cron] mf ops alerts sweep failed');
        })
        .finally(() => {
          running = false;
        });
    },
    { timezone: TZ },
  );
  logger.info('[cron] scheduled: mf ops alerts sweep @06:30 IST');
}
