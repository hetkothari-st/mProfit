/**
 * The MF analysis job (`01-DATA-FOUNDATION.md §5`, `05-FINDINGS-ENGINE.md §7`).
 *
 * Unlike every other job in `src/jobs/`, this one has **no schedule**. The
 * existing chain is a pipeline of reference-data work on a clock —
 * benchmarkPrice 20:00, mfNavAdjustment 22:30, mfMetrics 23:15, mfPeerRank
 * 00:30, riskFreeRate Mon 06:00, mfMetadata 1st 02:00, mfReconciliation 5th
 * 03:00 — and this job sits *downstream* of all of it, per user, triggered by
 * something changing. `01 §5` names the three triggers:
 *
 *   (a) a user's MF holdings projection changes,
 *   (b) a new `MfSchemeScore` lands for a scheme the user holds,
 *   (c) the user asks for a refresh — **rate-limited to 1/hour**.
 *
 * A nightly sweep over every user was considered and rejected: an analysis run
 * that nobody triggered produces verdict rows nobody asked for, and verdict
 * rows are append-only advice records (`05 §5`). Manufacturing them on a timer
 * would fill a user's audit trail with conclusions drawn from data that had not
 * moved. The `SCHEDULE` trigger value exists in the enum for a future sweep;
 * nothing here emits it.
 *
 * ---------------------------------------------------------------------------
 * Registration
 * ---------------------------------------------------------------------------
 *
 * Deliberately absent: no import in `src/index.ts` or `jobs/index.ts`. This
 * module exports `startMfAnalysisJob` and the three trigger entry points, and
 * the boot sequence wires them — matching `startMfPeerRankJob` and
 * `startNetWorthSnapshotJob`. The trigger points are also exported so the
 * holdings-projection path and the scoring job can call them directly without
 * importing an orchestrator.
 *
 * ---------------------------------------------------------------------------
 * Why an in-process queue rather than Bull
 * ---------------------------------------------------------------------------
 *
 * `lib/queue.ts` has exactly two Bull queues today (import, gmail scan) and
 * both exist because their work is long, retryable and survives a restart.
 * This work is neither long nor worth retrying across a restart: a run is
 * seconds of CPU over facts already in memory, and a run that is lost to a
 * deploy is re-triggered by the next holdings change or by the user pressing
 * refresh. What it *does* need is **coalescing** — a CAS import that rewrites
 * forty holdings fires forty holdings-change triggers, and forty analysis runs
 * for one user would each write a verdict row — so the queue below is a
 * `Map` keyed by user, which collapses a burst into one run by construction.
 */

import { logger } from '../lib/logger.js';
import { TooManyRequestsError } from '../lib/errors.js';
import { prisma } from '../lib/prisma.js';
import { runAsSystem, runAsUser } from '../lib/requestContext.js';
import {
  runMfAnalysis,
  type MfAnalysisRunResult,
  type MfAnalysisTrigger,
} from '../services/mfAnalytics/mfAnalysisEngine.service.js';

/**
 * `01 §5`: "the user requests a refresh (rate-limited 1/hour)".
 *
 * Enforced against `MfAnalysisRun.startedAt` rather than an in-memory counter
 * or a Redis key, for two reasons. The limit has to survive a restart — a
 * process bounce is not a licence to re-run — and the rows are the evidence
 * anyway: `triggeredBy = 'USER_REFRESH'` is written on every manual run, so
 * the limit is enforced against exactly the record it is about. An in-memory
 * counter would also be per-instance, which is no limit at all behind more
 * than one process.
 *
 * Only USER_REFRESH is limited. Holdings changes and score updates are the
 * system reacting to real events and are coalesced by the queue below instead.
 */
export const USER_REFRESH_COOLDOWN_MS = 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Coalescing queue
// ---------------------------------------------------------------------------

/**
 * Users with a run pending, and what triggered it.
 *
 * A `Map` and not an array: a second trigger for a user already queued
 * overwrites the first rather than appending, which is the coalescing. The
 * *last* trigger wins, so a burst that ends with a user pressing refresh is
 * attributed to the refresh — the most specific thing that happened.
 */
const pending = new Map<string, MfAnalysisTrigger>();

/** Set by `startMfAnalysisJob`. Triggers received before boot are queued and
 *  drained on start rather than dropped or run outside the worker. */
let started = false;
/** One drain at a time, so two triggers cannot produce two concurrent runs for
 *  the same user and race each other's supersede lookup. */
let draining = false;

/**
 * Queue a run for one user, collapsing it into any run already pending.
 *
 * Returns immediately. This is called from write paths (a holdings recompute,
 * a scoring job) that must not wait on an analysis, and from the refresh
 * endpoint after its rate-limit check.
 */
export function enqueueMfAnalysis(userId: string, trigger: MfAnalysisTrigger): void {
  pending.set(userId, trigger);
  if (started && !draining) void drainMfAnalysisQueue();
}

/**
 * Run everything currently queued, one user at a time.
 *
 * Serial on purpose. These runs are CPU-bound over facts already loaded, so
 * concurrency buys nothing but lock contention on the verdict tables, and the
 * supersede lookup ("the current head for this scheme") is only correct if one
 * run for a user finishes before the next begins.
 *
 * Exported so a test can await the drain instead of polling for it. Never
 * throws: a failed user is logged and the loop continues, because one user's
 * broken facts must not stop every other user's analysis — the same guarantee
 * the engine gives its rules, one level up.
 */
export async function drainMfAnalysisQueue(): Promise<void> {
  if (draining) return;
  draining = true;
  try {
    while (pending.size > 0) {
      const [userId, trigger] = pending.entries().next().value as [string, MfAnalysisTrigger];
      pending.delete(userId);
      try {
        await runMfAnalysisForUser(userId, trigger);
      } catch (err) {
        logger.error({ err, userId, trigger }, '[mfAnalysis] run failed for user');
      }
    }
  } finally {
    draining = false;
  }
}

// ---------------------------------------------------------------------------
// The run
// ---------------------------------------------------------------------------

/**
 * Run the engine for one user, in that user's RLS context.
 *
 * `runAsUser`, never `runAsSystem`: every table the engine touches is
 * user-scoped, the analysis belongs to the user whose holdings produced it, and
 * the session variable is what makes that true at the database rather than at
 * the `where` clause (`CONTEXT.md §3.4`). A system-context run would also
 * write rows whose ownership the policy could not verify.
 */
export async function runMfAnalysisForUser(
  userId: string,
  trigger: MfAnalysisTrigger,
): Promise<MfAnalysisRunResult> {
  const t0 = Date.now();
  const result = await runAsUser(userId, () => runMfAnalysis(userId, { triggeredBy: trigger }));
  logger.info(
    {
      userId,
      trigger,
      runId: result.runId,
      status: result.status,
      findings: result.findings.length,
      verdictsCreated: result.verdictsCreated,
      verdictsSuperseded: result.verdictsSuperseded,
      verdictsUnchanged: result.verdictsUnchanged,
      ms: Date.now() - t0,
    },
    '[mfAnalysis] run complete',
  );
  return result;
}

// ---------------------------------------------------------------------------
// Trigger (a) — holdings changed
// ---------------------------------------------------------------------------

/**
 * `01 §5(a)`: the user's MF holdings projection changed.
 *
 * Call from the holdings-projection path once the recompute has committed, for
 * `assetClass` in the MF set. Not from inside the recompute's transaction:
 * the analysis reads the projection it is reacting to, so running it before
 * the write is visible would analyse the *previous* state — and would hold the
 * recompute's transaction open for the length of a full analysis.
 */
export function onMfHoldingsChanged(userId: string): void {
  enqueueMfAnalysis(userId, 'HOLDINGS_CHANGE');
}

// ---------------------------------------------------------------------------
// Trigger (b) — a new score for a held scheme
// ---------------------------------------------------------------------------

/**
 * `01 §5(b)`: a new `MfSchemeScore` landed for schemes some users hold.
 *
 * Called by the scoring job with the schemes it just rescored. Resolves the
 * affected users itself, under `runAsSystem`, because it is a reference-data
 * event asking "who does this concern?" — a question no single user's RLS
 * context can answer. Nothing about a user's data is read here beyond the
 * identity of the holder; the run itself then happens in that user's own
 * context, where every policy applies.
 *
 * The scheme -> holder join goes through `MutualFundMaster` because
 * `HoldingProjection` identifies an instrument by `fundId` / `assetKey`, not by
 * AMFI scheme code (`CONTEXT.md §3.2`).
 */
export async function onMfSchemeScoresUpdated(schemeCodes: readonly string[]): Promise<number> {
  if (schemeCodes.length === 0) return 0;

  const userIds = await runAsSystem(async () => {
    const funds = await prisma.mutualFundMaster.findMany({
      where: { schemeCode: { in: [...schemeCodes] } },
      select: { id: true },
    });
    if (funds.length === 0) return [];

    const holders = await prisma.holdingProjection.findMany({
      where: {
        fundId: { in: funds.map((f) => f.id) },
        assetClass: 'MUTUAL_FUND',
        // A closed position still has a row; re-analysing a fund the user no
        // longer owns because somebody else's score moved is noise.
        quantity: { gt: 0 },
      },
      select: { portfolio: { select: { userId: true } } },
    });

    return [...new Set(holders.map((h) => h.portfolio.userId).filter((id): id is string => id !== null))];
  });

  for (const userId of userIds) enqueueMfAnalysis(userId, 'SCORE_UPDATE');
  return userIds.length;
}

// ---------------------------------------------------------------------------
// Trigger (c) — user refresh, 1/hour
// ---------------------------------------------------------------------------

/**
 * When this user may next ask for a refresh, or `null` if now.
 *
 * Split out from `requestMfAnalysisRefresh` so a controller can render "next
 * refresh available at HH:MM" without provoking the error — a button that is
 * disabled with a reason is better UX than one that throws when pressed.
 *
 * Must be called inside the user's RLS context: `MfAnalysisRun` is user-scoped
 * and fails closed to zero rows without one, which would silently read as "no
 * recent refresh" and defeat the limit.
 */
export async function nextUserRefreshAllowedAt(userId: string): Promise<Date | null> {
  const last = await prisma.mfAnalysisRun.findFirst({
    where: { userId, triggeredBy: 'USER_REFRESH' },
    orderBy: { startedAt: 'desc' },
    select: { startedAt: true },
  });
  if (last === null) return null;

  const next = new Date(last.startedAt.getTime() + USER_REFRESH_COOLDOWN_MS);
  return next.getTime() > Date.now() ? next : null;
}

/**
 * `01 §5(c)`: the user asked for a refresh.
 *
 * Runs **synchronously** rather than going through the coalescing queue: the
 * caller is a person waiting on a page, and handing them a job id to poll for
 * a few seconds of CPU is worse than making them wait for it. The queue exists
 * to collapse machine-generated bursts, and a 1/hour limit means there is no
 * burst to collapse here.
 *
 * Throws `TooManyRequestsError` when inside the cooldown. Not a silent no-op
 * and not a stale cached result: the user pressed a button and is entitled to
 * know why nothing happened and when it will.
 */
export async function requestMfAnalysisRefresh(userId: string): Promise<MfAnalysisRunResult> {
  const blockedUntil = await nextUserRefreshAllowedAt(userId);
  if (blockedUntil !== null) {
    throw new TooManyRequestsError(
      `Analysis was refreshed less than an hour ago. Next refresh available at ${blockedUntil.toISOString()}.`,
    );
  }
  return runMfAnalysisForUser(userId, 'USER_REFRESH');
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

/**
 * Start the worker. Named starter, deliberately NOT registered anywhere.
 *
 * There is no cron here — the triggers above are the schedule. What starting
 * does is open the drain: triggers that arrived during boot (a startup sync
 * rewriting holdings, say) are queued while `started` is false and run in one
 * coalesced pass the moment the process is ready to serve.
 */
export function startMfAnalysisJob(): void {
  if (process.env.ENABLE_MF_ANALYSIS_JOB === 'false') {
    logger.info('[mfAnalysis] job disabled via ENABLE_MF_ANALYSIS_JOB=false');
    return;
  }
  started = true;
  logger.info(
    { queued: pending.size },
    '[mfAnalysis] job started — trigger-driven (holdings change, score update, user refresh)',
  );
  if (pending.size > 0) void drainMfAnalysisQueue();
}

/** Stop accepting drains and forget anything queued. For tests and shutdown;
 *  a queued run is re-triggered by the next holdings change, so dropping it is
 *  safe in a way that dropping an import job would not be. */
export function stopMfAnalysisJob(): void {
  started = false;
  pending.clear();
}
