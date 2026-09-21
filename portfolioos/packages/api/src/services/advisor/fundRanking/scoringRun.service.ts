/**
 * The nightly pass: score every scheme in every bucket it could belong to.
 *
 * This is the only file in the folder that touches the database. Everything it
 * decides comes from the pure functions next door, so the interesting logic
 * stays testable without Postgres and this file stays a loader plus a writer.
 *
 * Per-scheme failures are recorded and skipped, never fatal (CONTEXT.md §3.5).
 * One malformed NAV series must not cost the whole market its scores.
 */

import { Decimal } from 'decimal.js';
import { prisma } from '../../../lib/prisma.js';
import { logger } from '../../../lib/logger.js';
import { ADVISOR_ASSET_BUCKETS } from '../types.js';
import { bucketForScheme, isPassive, trackedIndexKey } from './categoryMap.js';
import { assessEligibility } from './eligibility.js';
import { computeMetrics, median, monthlyReturnsPct, rollingReturnsPct } from './metrics.js';
import { rankBucket, scoreBucket, type ScoringInput } from './scoring.js';
import type { FundCandidate, MethodologyConfig } from './types.js';

/** How much NAV history to load per scheme. Five years covers the three-year
 *  rolling windows with enough steps to say something about consistency,
 *  without pulling a decade of rows for every scheme in the market. */
const NAV_LOOKBACK_YEARS = 5;

export interface ScoringRunResult {
  asOfDate: Date;
  methodologyVersionId: string;
  schemesConsidered: number;
  snapshotsWritten: number;
  failures: number;
}

/** Load the scheme universe with its NAV history, as plain ranking inputs. */
async function loadCandidates(asOf: Date): Promise<FundCandidate[]> {
  const since = new Date(asOf.getTime() - NAV_LOOKBACK_YEARS * 365.25 * 86_400_000);
  const funds = await prisma.mutualFundMaster.findMany({
    select: {
      id: true,
      schemeCode: true,
      schemeName: true,
      amcName: true,
      category: true,
      subCategory: true,
      isin: true,
      isActive: true,
      navHistory: {
        where: { date: { gte: since, lte: asOf } },
        orderBy: { date: 'asc' },
        select: { date: true, nav: true },
      },
    },
  });

  return funds.map((f) => ({
    schemeCode: f.schemeCode,
    schemeName: f.schemeName,
    amcName: f.amcName,
    category: f.category,
    subCategory: f.subCategory,
    isin: f.isin,
    isActive: f.isActive,
    navHistory: f.navHistory.map((n) => ({
      date: n.date.toISOString().slice(0, 10),
      // NAV is a price, not a money total: it is only ever used to compute
      // ratios here, never added to a balance. The Decimal → number crossing
      // happens once, at this boundary, and is documented in metrics.ts.
      nav: Number.parseFloat(n.nav.toString()),
    })),
    // Genuinely absent — see DATA-INVENTORY.md. Never defaulted to a number.
    terPct: null,
    aumInr: null,
    managerTenureYears: null,
    benchmarkTri: null,
  }));
}

/** Comparator series for a bucket: the median peer, built from the same
 *  month-end grid every fund is measured on. Passive funds are compared with
 *  their same-index peers where the name tells us the index, and the evidence
 *  records that the comparison is peer-relative rather than against a real
 *  benchmark TRI. */
function buildComparators(
  members: Array<{ candidate: FundCandidate; passive: boolean }>,
  config: MethodologyConfig,
  asOf: Date,
): {
  monthlyByKey: Map<string, number[]>;
  rollingByKey: Map<string, number[]>;
} {
  const monthlySeries = new Map<string, number[][]>();
  const rollingSeries = new Map<string, number[][]>();

  for (const { candidate, passive } of members) {
    const key = passive ? (trackedIndexKey(candidate.schemeName) ?? 'BUCKET') : 'BUCKET';
    const monthly = monthlyReturnsPct(candidate.navHistory, asOf);
    const rolling = rollingReturnsPct(
      candidate.navHistory,
      asOf,
      config.metrics.rollingReturnYears,
      config.metrics.rollingStepMonths,
    );
    if (!monthlySeries.has(key)) monthlySeries.set(key, []);
    if (!rollingSeries.has(key)) rollingSeries.set(key, []);
    monthlySeries.get(key)!.push(monthly);
    rollingSeries.get(key)!.push(rolling);
  }

  const medianOf = (series: number[][]): number[] => {
    const maxLen = series.reduce((m, s) => Math.max(m, s.length), 0);
    const out: number[] = [];
    for (let i = 1; i <= maxLen; i += 1) {
      // Align from the right: the most recent month is the one every series
      // shares, and padding on the left would invent history.
      const slice = series
        .map((s) => (s.length >= i ? s[s.length - i] : undefined))
        .filter((v): v is number => v != null && Number.isFinite(v));
      const m = median(slice);
      if (m != null) out.unshift(m);
    }
    return out;
  };

  const monthlyByKey = new Map<string, number[]>();
  const rollingByKey = new Map<string, number[]>();
  for (const [key, series] of monthlySeries) monthlyByKey.set(key, medianOf(series));
  for (const [key, series] of rollingSeries) rollingByKey.set(key, medianOf(series));
  return { monthlyByKey, rollingByKey };
}

/**
 * Score and persist one day's snapshot.
 *
 * Idempotent per (asOfDate, methodologyVersionId, schemeCode, bucket): a
 * re-run upserts each row rather than stacking a second set of scores, which
 * matters because this job is retried by Bull on any transient failure.
 */
export async function runFundScoring(args: {
  methodologyVersionId: string;
  config: MethodologyConfig;
  asOf?: Date;
}): Promise<ScoringRunResult> {
  const asOf = args.asOf ?? new Date();
  const asOfDate = new Date(Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth(), asOf.getUTCDate()));
  const candidates = await loadCandidates(asOf);

  let snapshotsWritten = 0;
  let failures = 0;

  for (const bucket of ADVISOR_ASSET_BUCKETS) {
    // Only schemes this bucket could ever contain are scored for it, so a
    // bucket's percentiles are taken against real peers rather than against
    // the whole market.
    const members = candidates
      .filter(
        (c) => bucketForScheme(c.category, c.subCategory, c.schemeName) === bucket,
      )
      .map((candidate) => ({
        candidate,
        passive: isPassive(candidate.category, candidate.schemeName, candidate.subCategory),
      }));
    if (members.length === 0) continue;

    const comparators = buildComparators(members, args.config, asOf);

    const scoringInputs: ScoringInput[] = [];
    const eligibilityByScheme = new Map<
      string,
      { eligible: boolean; reasons: string[]; metrics: unknown }
    >();

    for (const { candidate, passive } of members) {
      try {
        const eligibility = assessEligibility(candidate, bucket, args.config, asOf);
        const indexKey = passive ? (trackedIndexKey(candidate.schemeName) ?? 'BUCKET') : 'BUCKET';
        const metrics = computeMetrics({
          navHistory: candidate.navHistory,
          comparatorMonthlyPct: comparators.monthlyByKey.get(indexKey) ?? [],
          comparatorRollingPct: comparators.rollingByKey.get(indexKey) ?? [],
          passive,
          // We hold no benchmark TRI, so every tracking figure is measured
          // against same-index peers. Saying so is the difference between an
          // approximation and a claim.
          trackingIsPeerRelative: true,
          config: args.config,
          asOf,
        });

        eligibilityByScheme.set(candidate.schemeCode, {
          eligible: eligibility.eligible,
          reasons: eligibility.reasons,
          metrics: {
            ...metrics,
            // The raw rolling series is long and not worth storing per scheme;
            // its shape is what the score used.
            rollingReturnsPct: undefined,
            rollingWindows: metrics.rollingReturnsPct.length,
            trackRecordYears: eligibility.traits.trackRecordYears,
            plan: eligibility.traits.plan,
            option: eligibility.traits.option,
          },
        });

        // Ineligible funds are still recorded, but never scored: a score
        // implies it was a candidate.
        if (eligibility.eligible) {
          scoringInputs.push({
            schemeCode: candidate.schemeCode,
            metrics,
            passive,
            terPct: candidate.terPct,
            aumInr: candidate.aumInr == null ? null : Number.parseFloat(candidate.aumInr.toString()),
            managerTenureYears: candidate.managerTenureYears,
          });
        }
      } catch (err) {
        failures += 1;
        logger.warn(
          { schemeCode: candidate.schemeCode, bucket, err: err instanceof Error ? err.message : String(err) },
          '[fundRanking] scheme scoring failed, continuing',
        );
      }
    }

    const ranked = rankBucket(scoreBucket(scoringInputs, bucket, args.config));
    const rankedByScheme = new Map(ranked.map((r) => [r.schemeCode, r]));

    for (const [schemeCode, assessment] of eligibilityByScheme) {
      const scored = rankedByScheme.get(schemeCode);
      try {
        await prisma.fundScoreSnapshot.upsert({
          where: {
            asOfDate_methodologyVersionId_schemeCode_bucket: {
              asOfDate,
              methodologyVersionId: args.methodologyVersionId,
              schemeCode,
              bucket,
            },
          },
          create: {
            asOfDate,
            methodologyVersionId: args.methodologyVersionId,
            schemeCode,
            bucket,
            eligible: assessment.eligible,
            exclusionReasons: assessment.reasons,
            metrics: assessment.metrics as object,
            score: scored?.score == null ? null : new Decimal(scored.score).toFixed(4),
            rankInBucket: scored?.rankInBucket ?? null,
            dataGaps: (scored?.dataGaps ?? []) as object,
          },
          update: {
            eligible: assessment.eligible,
            exclusionReasons: assessment.reasons,
            metrics: assessment.metrics as object,
            score: scored?.score == null ? null : new Decimal(scored.score).toFixed(4),
            rankInBucket: scored?.rankInBucket ?? null,
            dataGaps: (scored?.dataGaps ?? []) as object,
          },
        });
        snapshotsWritten += 1;
      } catch (err) {
        failures += 1;
        logger.warn(
          { schemeCode, bucket, err: err instanceof Error ? err.message : String(err) },
          '[fundRanking] snapshot write failed, continuing',
        );
      }
    }
  }

  return {
    asOfDate,
    methodologyVersionId: args.methodologyVersionId,
    schemesConsidered: candidates.length,
    snapshotsWritten,
    failures,
  };
}
