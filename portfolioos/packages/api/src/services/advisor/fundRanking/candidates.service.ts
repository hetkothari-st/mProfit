/**
 * The ranked universe, as the advisor engine sees it.
 *
 * Turns the nightly `FundScoreSnapshot` rows into per-bucket candidate lists
 * and gathers the two pieces of per-user history that selection needs: which
 * scheme this client was last told to buy in each bucket, and how long a
 * challenger has been beating it.
 *
 * Loaded once per run by the facts builder, exactly like every other fact, so
 * the rules stay pure and unit-testable (CONTEXT.md §9.8).
 */

import { Decimal } from 'decimal.js';
import { prisma } from '../../../lib/prisma.js';
import { ADVISOR_ASSET_BUCKETS, type AdvisorAssetBucketValue } from '../types.js';
import type { SelectionCandidate } from './selection.js';
import type { MethodologyConfig } from './types.js';

/** How many ranked funds per bucket the engine keeps in facts. Selection only
 *  ever looks at the top few; carrying the whole market would bloat every
 *  run's snapshot for no decision it could change. */
const CANDIDATES_PER_BUCKET = 10;

export interface RankedCandidateFact extends SelectionCandidate {
  /** Copied onto the recommendation so the evidence survives a re-score. */
  metrics: Record<string, unknown>;
  dataGaps: Array<{ metric: string; reason: string; weightReleased: number }>;
}

export type RankedUniverse = Record<AdvisorAssetBucketValue, RankedCandidateFact[]>;

export function emptyUniverse(): RankedUniverse {
  return ADVISOR_ASSET_BUCKETS.reduce((acc, b) => {
    acc[b] = [];
    return acc;
  }, {} as RankedUniverse);
}

/**
 * The top eligible candidates per bucket from the newest snapshot under this
 * methodology.
 *
 * Scheme codes are resolved back to `MutualFundMaster` so a recommendation can
 * carry a fundId, and any scheme that has since disappeared from the master is
 * dropped rather than named.
 */
export async function loadRankedUniverse(
  methodologyVersionId: string,
  asOfDate: Date,
): Promise<RankedUniverse> {
  const rows = await prisma.fundScoreSnapshot.findMany({
    where: {
      methodologyVersionId,
      asOfDate,
      eligible: true,
      rankInBucket: { not: null, lte: CANDIDATES_PER_BUCKET },
    },
    orderBy: [{ bucket: 'asc' }, { rankInBucket: 'asc' }],
  });
  if (rows.length === 0) return emptyUniverse();

  const funds = await prisma.mutualFundMaster.findMany({
    where: { schemeCode: { in: [...new Set(rows.map((r) => r.schemeCode))] } },
    select: { id: true, schemeCode: true, schemeName: true, amcName: true },
  });
  const byCode = new Map(funds.map((f) => [f.schemeCode, f]));

  const universe = emptyUniverse();
  for (const row of rows) {
    const fund = byCode.get(row.schemeCode);
    if (!fund || row.score == null || row.rankInBucket == null) continue;
    universe[row.bucket as AdvisorAssetBucketValue].push({
      schemeCode: row.schemeCode,
      schemeName: fund.schemeName,
      amcName: fund.amcName,
      fundId: fund.id,
      score: Number.parseFloat(row.score.toString()),
      rankInBucket: row.rankInBucket,
      // Overlap is filled in by the facts builder, which is the only place
      // that knows what this client holds.
      overlapPct: null,
      metrics: (row.metrics ?? {}) as Record<string, unknown>,
      dataGaps: (row.dataGaps ?? []) as RankedCandidateFact['dataGaps'],
    });
  }
  return universe;
}

/**
 * The scheme each bucket's standing recommendation currently names, and how
 * many consecutive snapshots a challenger has led it by more than the margin.
 *
 * The streak is what stops a one-night score wobble from triggering a switch:
 * see the hysteresis note in selection.ts.
 */
export async function loadIncumbents(
  userId: string,
  methodologyVersionId: string,
  config: MethodologyConfig,
): Promise<Record<string, { schemeCode: string | null; challengerStreak: number }>> {
  const open = await prisma.advisorRecommendation.findMany({
    where: {
      userId,
      supersededById: null,
      namedSchemeCode: { not: null },
      status: { in: ['OPEN', 'SNOOZED'] },
    },
    orderBy: { createdAt: 'desc' },
    select: { namedSchemeCode: true, action: true, createdAt: true },
  });

  const incumbentByBucket: Record<string, { schemeCode: string | null; challengerStreak: number }> =
    {};
  for (const bucket of ADVISOR_ASSET_BUCKETS) {
    incumbentByBucket[bucket] = { schemeCode: null, challengerStreak: 0 };
  }

  for (const rec of open) {
    const actions = Array.isArray(rec.action) ? (rec.action as Array<Record<string, unknown>>) : [];
    const bucket = actions.find((a) => typeof a?.['bucket'] === 'string')?.['bucket'] as
      | AdvisorAssetBucketValue
      | undefined;
    if (!bucket || !incumbentByBucket[bucket]) continue;
    // Newest first, so the first one we see per bucket is the standing pick.
    if (incumbentByBucket[bucket].schemeCode == null) {
      incumbentByBucket[bucket].schemeCode = rec.namedSchemeCode;
    }
  }

  // Count, per bucket, how many of the most recent snapshots had a leader
  // ahead of the incumbent by more than the margin.
  const recentDates = await prisma.fundScoreSnapshot.findMany({
    where: { methodologyVersionId },
    distinct: ['asOfDate'],
    orderBy: { asOfDate: 'desc' },
    take: config.selection.hysteresisSnapshots,
    select: { asOfDate: true },
  });

  for (const bucket of ADVISOR_ASSET_BUCKETS) {
    const incumbent = incumbentByBucket[bucket]!.schemeCode;
    if (!incumbent || recentDates.length === 0) continue;

    let streak = 0;
    for (const { asOfDate } of recentDates) {
      const leader: { score: Decimal | null; schemeCode: string } | null =
        await prisma.fundScoreSnapshot.findFirst({
          where: { methodologyVersionId, asOfDate, bucket, eligible: true, rankInBucket: 1 },
          select: { score: true, schemeCode: true },
        });
      const held: { score: Decimal | null } | null = await prisma.fundScoreSnapshot.findFirst({
        where: { methodologyVersionId, asOfDate, bucket, schemeCode: incumbent },
        select: { score: true },
      });
      if (!leader?.score || !held?.score || leader.schemeCode === incumbent) break;
      const margin = new Decimal(leader.score.toString()).minus(held.score.toString());
      if (margin.lessThan(config.selection.hysteresisMarginPct)) break;
      streak += 1;
    }
    incumbentByBucket[bucket]!.challengerStreak = streak;
  }

  return incumbentByBucket;
}
