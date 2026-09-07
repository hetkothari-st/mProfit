/**
 * Monthly scheme-score job (`01-DATA-FOUNDATION.md §5`: "15th of month, after
 * holdings + metrics"; `03-SCORING.md`).
 *
 * Runs after `mfPeerRankJob`: every score is a blend of the percentiles that
 * job wrote for the same `asOf`, so scoring before the ranks land would score
 * every fund as "no percentile available" and re-normalise its way to a
 * composite built from whatever was left.
 *
 * The three properties `mfPeerRankJob` guarantees hold here for the same
 * reasons — the universe is the unit of work (a rating is a bucket within it),
 * one universe's failure goes to the DLQ and the loop continues, and a same-day
 * re-run is a no-op — but the third is *stronger* here. Peer ranks converge by
 * upsert; scores converge by **never writing a second time**. A re-run of this
 * job for an `asOf` and methodology version that already has rows inserts
 * nothing and reports every row as `skippedExisting` (`03 §9`, and the
 * `mf-score-append-only` invariant in `06 §1`). The service exposes no update
 * path for it to call.
 *
 * `asOf` is a UTC calendar date, as for every sibling job. The cron fires at
 * 02:00 IST on the 15th, which is 20:30 UTC on the *14th* — the same UTC date
 * `mfMetricsJob` (23:15 IST) and `mfPeerRankJob` (00:30 IST) keyed their rows
 * to, so all three land on one `asOf` without any of them knowing about the
 * others.
 *
 * Registration is deliberately absent: no import in `src/index.ts`. Export
 * `startMfScoreJob` and let the boot sequence wire it.
 */

import cron from 'node-cron';
import type { MfRatingStatus } from '@portfolioos/shared';
import { logger } from '../lib/logger.js';
import { prisma } from '../lib/prisma.js';
import { runAsSystem } from '../lib/requestContext.js';
import { writeIngestionFailure } from '../services/ingestionFailures.service.js';
import { listUniverses, type UniverseRef } from '../services/mfAnalytics/mfPeerRank.service.js';
import {
  scoreUniverse,
  MF_SCORE_SERVICE_VERSION,
} from '../services/mfAnalytics/mfScoring/mfScore.service.js';

const TZ = 'Asia/Kolkata';

export const MF_SCORE_ADAPTER_ID = 'mf.score';

/**
 * Universes per slice, matching `mfPeerRankJob.UNIVERSE_CHUNK_SIZE`.
 *
 * Scoring is far cheaper than ranking — no NAV series are loaded, only the
 * metrics, rank and fact rows already keyed to `asOf` — so this is
 * conservative. It is kept equal to the peer-rank job's on purpose: the two
 * jobs walk the same universe list, and a slice budget that one of them can
 * blow while the other cannot is a debugging trap. The real bound is
 * `lib/queue.ts`'s 5-minute lock window, which this job is sized against
 * even though it is cron-driven today (same reasoning as its sibling).
 */
export const UNIVERSE_CHUNK_SIZE = 7;

/** Half the 5-minute lock, so an overrunning slice still logs inside the window. */
const SLICE_BUDGET_MS = 150_000;

let running = false;

function todayAsOf(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/**
 * `IngestionFailure` requires a `userId` (it is a user-facing DLQ), but this
 * job is reference-data work owned by nobody. The row is attributed to the
 * oldest active ADMIN so it lands somewhere a human can see it; with no admin
 * present the failure is logged at `error` and dropped rather than fabricating
 * a user. Identical to `mfPeerRankJob.resolveOpsUserId` — two sibling
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

async function recordUniverseFailure(ref: UniverseRef, asOf: Date, err: unknown): Promise<void> {
  const opsUserId = await resolveOpsUserId();
  if (opsUserId === null) {
    logger.error(
      { err, universeKey: ref.universeKey },
      '[cron] mf score failure not written to DLQ — no ADMIN user to attribute it to',
    );
    return;
  }
  await writeIngestionFailure({
    userId: opsUserId,
    sourceAdapter: MF_SCORE_ADAPTER_ID,
    adapterVersion: MF_SCORE_SERVICE_VERSION,
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

export interface MfScoreJobResult {
  universes: number;
  succeeded: number;
  failed: number;
  /** Members scored across every universe, new rows or not. */
  scored: number;
  /** Rows actually inserted. */
  rowsWritten: number;
  /**
   * Rows that already existed for `(schemeCode, asOf, methodologyVersion)`.
   * On a same-day re-run this equals `scored` and `rowsWritten` is 0 — the
   * append-only property, visible in the log rather than inferred.
   */
  rowsSkippedExisting: number;
  /**
   * ACTIVE growth members with no metrics row at `asOf`. Non-zero on every
   * run today (the AMFI master lists ~4,000 growth schemes; NAV exists for a
   * fraction), and the number to watch: it should fall as NAV coverage grows
   * and must never rise between two runs on the same day.
   */
  schemesSkippedUnmeasured: number;
  ratingStatusCounts: Record<MfRatingStatus, number>;
}

function emptyResult(universes = 0): MfScoreJobResult {
  return {
    universes,
    succeeded: 0,
    failed: 0,
    scored: 0,
    rowsWritten: 0,
    rowsSkippedExisting: 0,
    schemesSkippedUnmeasured: 0,
    ratingStatusCounts: { RATED: 0, INSUFFICIENT_HISTORY: 0, CATEGORY_TOO_SMALL: 0, NOT_APPLICABLE: 0 },
  };
}

/**
 * Score one explicit list of universes. Exposed so tests and the backtest can
 * score a single category, or a historical `asOf`, without a full sweep.
 */
export async function runMfScoreForUniverses(
  refs: readonly UniverseRef[],
  asOf: Date = todayAsOf(),
): Promise<MfScoreJobResult> {
  const result = emptyResult(refs.length);

  for (let i = 0; i < refs.length; i += UNIVERSE_CHUNK_SIZE) {
    const slice = refs.slice(i, i + UNIVERSE_CHUNK_SIZE);
    const sliceStart = Date.now();

    for (const ref of slice) {
      try {
        const u = await scoreUniverse(ref, asOf);
        result.succeeded += 1;
        result.scored += u.scored;
        result.rowsWritten += u.written;
        result.rowsSkippedExisting += u.skippedExisting;
        result.schemesSkippedUnmeasured += u.skippedUnmeasured;
        for (const [status, n] of Object.entries(u.ratingStatusCounts)) {
          result.ratingStatusCounts[status as MfRatingStatus] += n;
        }
      } catch (err) {
        result.failed += 1;
        logger.error({ err, universeKey: ref.universeKey }, '[mfScore] universe failed');
        await recordUniverseFailure(ref, asOf, err);
      }
    }

    const elapsed = Date.now() - sliceStart;
    if (elapsed > SLICE_BUDGET_MS) {
      logger.warn(
        { elapsed, budgetMs: SLICE_BUDGET_MS, sliceSize: slice.length },
        '[mfScore] slice exceeded its budget — reduce UNIVERSE_CHUNK_SIZE if this persists',
      );
    }
  }

  return result;
}

export async function runMfScoreJob(asOf: Date = todayAsOf()): Promise<MfScoreJobResult> {
  if (running) {
    logger.warn('[cron] mf score job already running — skipping');
    return emptyResult();
  }
  running = true;
  const t0 = Date.now();
  try {
    // Reference data, but `runAsSystem` all the same: the Prisma hook needs an
    // ambient context, and the `IngestionFailure` / `User` rows this job
    // touches are user-scoped and would otherwise fail closed to zero rows.
    return await runAsSystem(async () => {
      const refs = await listUniverses();
      const result = await runMfScoreForUniverses(refs, asOf);
      logger.info(
        { ...result, asOf: asOf.toISOString(), ms: Date.now() - t0 },
        '[cron] mf score job done',
      );
      return result;
    });
  } finally {
    running = false;
  }
}

export function startMfScoreJob(): void {
  if (process.env.ENABLE_MF_SCORE_CRON === 'false') {
    logger.info('[cron] mf score job disabled via ENABLE_MF_SCORE_CRON=false');
    return;
  }
  // 02:00 IST on the 15th — 90 minutes after mfPeerRankJob starts at 00:30,
  // which is itself after mfMetricsJob (23:15) and the AMFI NAV import (22:00).
  // Ranking runs ~150 universes in 7-universe slices and finishes well inside
  // an hour; 90 minutes leaves headroom. Starting earlier would not error, it
  // would silently score against a partial set of ranks, which is worse.
  cron.schedule('0 2 15 * *', () => void runMfScoreJob(), { timezone: TZ });
  logger.info('[cron] scheduled: mf score @02:00 IST on the 15th');
}
