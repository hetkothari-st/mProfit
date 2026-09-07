/**
 * Daily peer-rank job (`01-DATA-FOUNDATION.md §5`, `07` Task 2.4).
 *
 * Runs after `mfMetricsJob`: every percentile it writes is a rank over the
 * metrics that job produced for the same `asOf`, so running the two out of
 * order would rank today's fund against yesterday's peers.
 *
 * Three properties this job guarantees, each of which is a decision:
 *
 *  1. **The universe is the unit of work.** Ranking one fund requires every
 *     other member's metrics in memory, so a per-scheme job would load the
 *     same universe once per member. Batching per universe is not an
 *     optimisation, it is the only shape that is not quadratic.
 *
 *  2. **One universe's failure is one universe's failure.** A category whose
 *     NAV feed is broken writes an `IngestionFailure` and the loop continues,
 *     rather than taking the other 150 categories down with it (CONTEXT.md
 *     §3.5, and the same guarantee `advisorEngine.service.ts` gives its rules).
 *
 *  3. **A same-day re-run is a no-op.** Every write is an upsert on
 *     `(schemeCode, asOf, horizonYears)`, so a retry after a partial failure
 *     converges rather than duplicating.
 *
 * Reference tables (`MfSchemeMeta`, `MfSchemeMetrics`, `MfPeerRank`, `MFNav`)
 * are shared market data with no RLS policy (`00-README` invariant 1), but the
 * job still runs inside `runAsSystem` — the Prisma hook needs *some* ambient
 * context, and `IngestionFailure` and `User`, which this job does touch, are
 * user-scoped and would otherwise fail closed to zero rows.
 *
 * Registration is deliberately absent: no import in `src/index.ts`. Export
 * `startMfPeerRankJob` and let the boot sequence wire it, matching
 * `startNetWorthSnapshotJob`.
 */

import cron from 'node-cron';
import { logger } from '../lib/logger.js';
import { prisma } from '../lib/prisma.js';
import { runAsSystem } from '../lib/requestContext.js';
import { writeIngestionFailure } from '../services/ingestionFailures.service.js';
import {
  listUniverses,
  runPeerRankForUniverse,
  MF_PEER_RANK_VERSION,
  type UniverseRef,
} from '../services/mfAnalytics/mfPeerRank.service.js';

const TZ = 'Asia/Kolkata';

export const MF_PEER_RANK_ADAPTER_ID = 'mf.peerRank';

/**
 * Universes processed before the loop yields a progress log.
 *
 * The real bound is `lib/queue.ts`'s 5-minute `JOB_TIMEOUT_MS` /
 * `LOCK_DURATION_MS`. This job is cron-driven rather than Bull-driven today,
 * but it is sized as though it were queued, because that is the migration
 * everything else in `src/jobs/` eventually makes and a job that only fits
 * outside the lock window is a job that gets re-enqueued mid-flight and
 * double-writes.
 *
 * A universe is 20-70 schemes; loading ~13 years of daily NAV for each (in
 * `NAV_FETCH_CHUNK_SIZE` = 25 scheme batches) and computing its rolling series
 * runs in the low single-digit seconds. Eight universes per slice therefore
 * sits comfortably inside a 5-minute window even at the high end, with room
 * for a slow category to overrun without dragging the slice past the lock.
 */
/**
 * Universes per slice. 7, not 8: the Phase 6 load test put the supported
 * ceiling at 7 for the slice budget. See docs/mf-analytics/LOAD-TEST.md.
 */
export const UNIVERSE_CHUNK_SIZE = 7;

/**
 * Wall-clock ceiling for one slice. Half the 5-minute lock, so a slice that
 * blows its budget still finishes and logs inside the window rather than being
 * declared stalled.
 */
const SLICE_BUDGET_MS = 150_000;

let running = false;

function todayAsOf(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/**
 * `IngestionFailure` requires a `userId` (it is a user-facing DLQ), but this
 * job is reference-data work owned by nobody. The row is attributed to the
 * oldest active ADMIN so it lands somewhere a human can see it at
 * `/ops/ingestion-failures`; with no admin present the failure is logged at
 * `error` and dropped rather than fabricating a user.
 *
 * Deliberately identical to `mfMetricsJob.resolveOpsUserId` — two sibling
 * reference-data jobs resolving "who owns this failure" differently is how
 * half the DLQ ends up somewhere nobody is looking.
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

async function recordUniverseFailure(
  ref: UniverseRef,
  asOf: Date,
  err: unknown,
): Promise<void> {
  const opsUserId = await resolveOpsUserId();
  if (opsUserId === null) {
    logger.error(
      { err, universeKey: ref.universeKey },
      '[cron] mf peer rank failure not written to DLQ — no ADMIN user to attribute it to',
    );
    return;
  }
  await writeIngestionFailure({
    userId: opsUserId,
    sourceAdapter: MF_PEER_RANK_ADAPTER_ID,
    adapterVersion: MF_PEER_RANK_VERSION,
    sourceRef: `${ref.universeKey}@${asOf.toISOString().slice(0, 10)}`,
    error: err instanceof Error ? err : String(err),
    rawPayload: {
      universeKey: ref.universeKey,
      sebiSubCategory: ref.sebiSubCategory,
      planType: ref.planType,
      asOf: asOf.toISOString().slice(0, 10),
    },
  });
}

export interface MfPeerRankJobResult {
  universes: number;
  succeeded: number;
  failed: number;
  rowsWritten: number;
  /**
   * Horizon-0 `MfCurrentProfile` rows patched with their TER / AUM
   * percentiles. Logged separately from `rowsWritten` because it is the only
   * write this job makes to a table it does not own, and a run where it stays
   * at zero while `rowsWritten` climbs means the metrics job did not leave a
   * horizon-0 row behind — the COST pillar would be null for the whole day.
   */
  profilesPatched: number;
}

/**
 * Rank one explicit list of universes. Exposed so the reconciliation job and
 * tests can re-rank a single category without a full sweep.
 */
export async function runMfPeerRankForUniverses(
  refs: readonly UniverseRef[],
  asOf: Date = todayAsOf(),
): Promise<MfPeerRankJobResult> {
  let succeeded = 0;
  let failed = 0;
  let rowsWritten = 0;
  let profilesPatched = 0;

  for (let i = 0; i < refs.length; i += UNIVERSE_CHUNK_SIZE) {
    const slice = refs.slice(i, i + UNIVERSE_CHUNK_SIZE);
    const sliceStart = Date.now();

    for (const ref of slice) {
      try {
        const result = await runPeerRankForUniverse(ref, asOf);
        rowsWritten += result.rowsWritten;
        profilesPatched += result.profilesPatched;
        succeeded += 1;
      } catch (err) {
        failed += 1;
        logger.error({ err, universeKey: ref.universeKey }, '[mfPeerRank] universe failed');
        await recordUniverseFailure(ref, asOf, err);
      }
    }

    const elapsed = Date.now() - sliceStart;
    if (elapsed > SLICE_BUDGET_MS) {
      logger.warn(
        { elapsed, budgetMs: SLICE_BUDGET_MS, sliceSize: slice.length },
        '[mfPeerRank] slice exceeded its budget — reduce UNIVERSE_CHUNK_SIZE if this persists',
      );
    }
  }

  return { universes: refs.length, succeeded, failed, rowsWritten, profilesPatched };
}

export async function runMfPeerRankJob(
  asOf: Date = todayAsOf(),
): Promise<MfPeerRankJobResult> {
  if (running) {
    logger.warn('[cron] mf peer rank job already running — skipping');
    return { universes: 0, succeeded: 0, failed: 0, rowsWritten: 0, profilesPatched: 0 };
  }
  running = true;
  const t0 = Date.now();
  try {
    return await runAsSystem(async () => {
      const refs = await listUniverses();
      const result = await runMfPeerRankForUniverses(refs, asOf);
      logger.info(
        { ...result, asOf: asOf.toISOString(), ms: Date.now() - t0 },
        '[cron] mf peer rank job done',
      );
      return result;
    });
  } finally {
    running = false;
  }
}

export function startMfPeerRankJob(): void {
  if (process.env.ENABLE_MF_PEER_RANK_CRON === 'false') {
    logger.info('[cron] mf peer rank job disabled via ENABLE_MF_PEER_RANK_CRON=false');
    return;
  }
  // 00:30 IST — after mfMetricsJob at 23:15, which is itself after the AMFI
  // NAV import at 22:00. Ranking before the metrics land would rank today's
  // universe against yesterday's numbers for exactly the schemes whose metrics
  // had not yet been rewritten.
  // 00:30 IST, NOT 23:00. Ranking a scheme needs every *other* scheme in its
  // universe to already have an `MfSchemeMetrics` row for the horizon, so this
  // must start after mfMetricsJob (23:15) has finished, not after it has
  // started. That job is ~15 chunks at roughly 40-100s each, so it can run
  // 10-25 minutes; 75 minutes leaves real headroom. Starting early would not
  // error — it would silently rank against a partial universe, which is worse.
  cron.schedule('30 0 * * *', () => void runMfPeerRankJob(), { timezone: TZ });
  logger.info('[cron] scheduled: mf peer rank @00:30 IST');
}
