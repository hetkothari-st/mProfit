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
import { buildTradingCalendar } from './navGaps.js';
import {
  DEFAULT_MAX_CALENDAR_GAP_WEEKDAYS,
  describeCalendarGap,
  judgeCalendar,
} from './calendarIntegrity.js';
import { captureFeedFailure } from '../../../lib/runAlerting.js';
import { computeMetrics, median, monthlyReturnsPct, rollingReturnsPct } from './metrics.js';
import { rankBucket, scoreBucket, type ScoringInput } from './scoring.js';
import type { DetailedExclusionReason, FundCandidate, MethodologyConfig } from './types.js';

/** How much NAV history to load per scheme. Five years covers the three-year
 *  rolling windows with enough steps to say something about consistency,
 *  without pulling a decade of rows for every scheme in the market. */
const NAV_LOOKBACK_YEARS = 5;

/**
 * How many schemes to load NAV history for per round trip.
 *
 * ── Why this is not one query ────────────────────────────────────
 * It used to be. One `findMany` over `MutualFundMaster` with `navHistory`
 * nested inside it, and for a long time that was fine: the development
 * database held 191 trading days, production 314, so the whole universe came
 * back as roughly 859,000 rows.
 *
 * Then production got the history it was always supposed to have — 1,821
 * trading days, 9.7 million NAV rows — and the same query died with:
 *
 *   PrismaClientKnownRequestError: Invalid `prisma.mutualFundMaster.findMany()`
 *   code: 'GenericFailure'  meta: { modelName: 'MutualFundMaster' }
 *
 * Not an out-of-memory kill: the container has a 24 GB limit and nothing came
 * close to it. It is the query engine refusing to materialise a single nested
 * result set that large. Zero snapshots were written, which is the correct
 * failure mode and a useless one — the scoring run simply could not happen on
 * the complete data it exists to read.
 *
 * Paging fixes it for two reasons. The obvious one is that no single result
 * set is enormous any more. The less obvious one matters more: Prisma hands
 * back every NAV as a `Decimal` object, and this loader's whole job is to turn
 * those into plain numbers. Batched, each batch's Decimals become garbage as
 * soon as the batch is mapped, so peak memory is the plain-number universe
 * plus one batch of Decimals rather than both in full at once.
 *
 * What does NOT change is the result: the same candidates, in the same shape,
 * with the same history. This is a loader change, not a methodology change.
 */
const FUND_BATCH_SIZE = Number.parseInt(process.env.FUND_SCORING_BATCH_SIZE ?? '500', 10);

export interface ScoringRunResult {
  asOfDate: Date;
  methodologyVersionId: string;
  schemesConsidered: number;
  snapshotsWritten: number;
  failures: number;
}

/**
 * Load the scheme universe with its NAV history, as plain ranking inputs.
 *
 * Exported for the paging test: the interesting property — every scheme
 * exactly once, across batch boundaries — is invisible from `runFundScoring`
 * and is exactly the thing a cursor gets wrong.
 */
export async function loadCandidates(asOf: Date): Promise<FundCandidate[]> {
  const since = new Date(asOf.getTime() - NAV_LOOKBACK_YEARS * 365.25 * 86_400_000);
  const out: FundCandidate[] = [];
  let cursor: string | undefined;
  let batches = 0;
  let navRows = 0;

  for (;;) {
    const funds = await prisma.mutualFundMaster.findMany({
      take: FUND_BATCH_SIZE,
      // `skip: 1` steps past the cursor row itself, which was already
      // returned by the previous batch. Without it every batch boundary
      // duplicates one scheme; with it on the FIRST call, one scheme is
      // dropped. Hence the conditional, and the test that counts both.
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      // A stable total order is what makes the cursor mean anything. Ids are
      // unique, so no two batches can straddle the same row.
      orderBy: { id: 'asc' },
      select: {
        id: true,
        schemeCode: true,
        schemeName: true,
        amcName: true,
        category: true,
        subCategory: true,
        isin: true,
        isActive: true,
        planType: true,
        optionType: true,
        terPct: true,
        terJoinStatus: true,
        aumInr: true,
        navHistory: {
          where: { date: { gte: since, lte: asOf } },
          orderBy: { date: 'asc' },
          select: { date: true, nav: true },
        },
      },
    });

    if (funds.length === 0) break;
    batches += 1;
    for (const f of funds) {
      navRows += f.navHistory.length;
      out.push(toCandidate(f));
    }
    cursor = funds[funds.length - 1]!.id;
    if (funds.length < FUND_BATCH_SIZE) break;
  }

  logger.info(
    { schemes: out.length, navRows, batches, batchSize: FUND_BATCH_SIZE },
    '[fundScoring] loaded the scheme universe',
  );
  return out;
}

/** Anything that stringifies to a number: `Prisma.Decimal` in production, a
 *  plain string in a test fixture. The mapping only ever reads it as text. */
type NumericLike = { toString(): string };

type FundRow = {
  schemeCode: string;
  schemeName: string;
  amcName: string;
  category: string;
  subCategory: string | null;
  isin: string | null;
  isActive: boolean;
  planType: string | null;
  optionType: string | null;
  terPct: NumericLike | null;
  terJoinStatus: string | null;
  aumInr: NumericLike | null;
  navHistory: Array<{ date: Date; nav: NumericLike }>;
};

/** One database row into one ranking input. Pure, so paging cannot change it. */
function toCandidate(f: FundRow): FundCandidate {
  return {
    schemeCode: f.schemeCode,
    schemeName: f.schemeName,
    amcName: f.amcName,
    category: f.category,
    subCategory: f.subCategory,
    isin: f.isin,
    isActive: f.isActive,
    planType: f.planType,
    optionType: f.optionType,
    navHistory: f.navHistory.map((n) => ({
      date: n.date.toISOString().slice(0, 10),
      // NAV is a price, not a money total: it is only ever used to compute
      // ratios here, never added to a balance. The Decimal → number crossing
      // happens once, at this boundary, and is documented in metrics.ts.
      nav: Number.parseFloat(n.nav.toString()),
    })),
    // Real, from AMFI's published files (priceFeeds/amfiCostAndSize.service).
    // Null still means UNKNOWN and is handled as a data gap or an exclusion —
    // it is never defaulted to a number.
    terPct: f.terPct == null ? null : Number.parseFloat(f.terPct.toString()),
    terJoinStatus: f.terJoinStatus,
    aumInr: f.aumInr == null ? null : new Decimal(f.aumInr.toString()),
    // Still absent: no verified source. See DATA-INVENTORY.md.
    managerTenureYears: null,
    benchmarkTri: null,
  };
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

  // The market's own trading calendar: every date on which ANY scheme priced.
  // Built from the whole universe rather than per fund, because a single
  // fund's history cannot tell you which of its missing days were holidays —
  // that is exactly the information a gap hides.
  const tradingDays = buildTradingCalendar(
    candidates.flatMap((c) => c.navHistory.map((n) => n.date)),
  );
  logger.info(
    { tradingDays: tradingDays.length, schemes: candidates.length },
    '[fundScoring] trading calendar derived from the NAV universe',
  );

  // Is the calendar itself trustworthy?
  //
  // Every gap rule below measures a fund AGAINST this calendar, and the
  // calendar comes from the same feed the funds do. If the feed stops, the
  // calendar stops with it: three weeks of missing NAVs do not look like
  // three weeks of gaps in 14,000 funds, they look like three weeks that
  // were not trading days, and every fund passes unanimously. The
  // measurement and the thing measured fail together, in agreement.
  //
  // So the calendar is checked against something the feed cannot influence:
  // the weekday. See calendarIntegrity.ts.
  await assertCalendarIsTrustworthy({
    tradingDays,
    asOfDate,
    config: args.config,
    methodologyVersionId: args.methodologyVersionId,
  });

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
      { eligible: boolean; reasons: DetailedExclusionReason[]; metrics: unknown }
    >();

    for (const { candidate, passive } of members) {
      try {
        const eligibility = assessEligibility(candidate, bucket, args.config, asOf, tradingDays);
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
          // The detailed form: `nav_history_gap` carries the span that is the
          // whole content of the finding. Plain reasons stay plain strings.
          reasons: eligibility.detailedReasons,
          metrics: {
            ...metrics,
            // The raw rolling series is long and not worth storing per scheme;
            // its shape is what the score used.
            rollingReturnsPct: undefined,
            rollingWindows: metrics.rollingReturnsPct.length,
            trackRecordYears: eligibility.traits.trackRecordYears,
            navGapTradingDays: eligibility.traits.navGap?.tradingDaysMissing ?? 0,
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
            terJoinStatus: candidate.terJoinStatus,
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

/**
 * Thrown when the trading calendar cannot be trusted. The scoring run stops
 * before writing anything, so yesterday's snapshot stays in force and the
 * existing staleness gate (`snapshotMaxAgeDays`, default 3) drops advice back
 * to category level on its own once that snapshot ages out.
 *
 * That fallback is the point: a stale ranking that says so is a degraded
 * service, and a fresh ranking computed over a market we stopped watching is
 * a wrong answer delivered confidently.
 */
export class CalendarIntegrityError extends Error {
  constructor(
    readonly reason: string,
    readonly runId: string | null,
  ) {
    super(`[fundScoring] ${reason}`);
    this.name = 'CalendarIntegrityError';
  }
}

async function assertCalendarIsTrustworthy(args: {
  tradingDays: readonly string[];
  asOfDate: Date;
  config: MethodologyConfig;
  methodologyVersionId: string;
}): Promise<void> {
  const max =
    args.config.eligibility.maxCalendarGapWeekdays ?? DEFAULT_MAX_CALENDAR_GAP_WEEKDAYS;
  const verdict = judgeCalendar(
    args.tradingDays,
    args.asOfDate.toISOString().slice(0, 10),
    max,
  );

  if (verdict.ok) {
    logger.info(
      {
        tradingDays: args.tradingDays.length,
        longestGapWeekdays: verdict.gap?.weekdays ?? 0,
        maxCalendarGapWeekdays: max,
      },
      '[fundScoring] trading calendar looks like a market that was open',
    );
    return;
  }

  const gap = verdict.gap!;
  // Written BEFORE the throw. A refusal that fails to record itself leaves
  // exactly the silence this check exists to break (CONTEXT.md §3.5).
  const row = await prisma.feedRunLog.create({
    data: {
      kind: 'SCORING',
      feed: 'fund_scoring',
      check: 'calendar_integrity',
      finishedAt: new Date(),
      status: 'REFUSED',
      reason: verdict.reason,
      // The scoring-specific numbers live in `details` rather than as six
      // more columns that are null on every feed row. They are read for
      // display and diagnosis, never filtered on.
      details: {
        asOfDate: args.asOfDate.toISOString().slice(0, 10),
        methodologyVersionId: args.methodologyVersionId,
        tradingDays: args.tradingDays.length,
        gapWeekdays: gap.weekdays,
        gapFrom: gap.from,
        gapTo: gap.to,
        missingWeekdays: gap.missing,
        maxCalendarGapWeekdays: max,
      },
    },
  });

  logger.error(
    {
      runId: row.id,
      gap: describeCalendarGap(gap),
      gapFrom: gap.from,
      gapTo: gap.to,
      gapWeekdays: gap.weekdays,
      maxCalendarGapWeekdays: max,
      tradingDays: args.tradingDays.length,
      missingWeekdays: gap.missing,
    },
    `[fundScoring] refusing to score: ${verdict.reason}`,
  );

  const err = new CalendarIntegrityError(verdict.reason!, row.id);
  captureFeedFailure(err, {
    kind: 'SCORING',
    subject: 'fund_scoring',
    check: 'calendar_integrity',
    runId: row.id,
    reason: verdict.reason,
    outcome: 'refused',
    context: {
      asOfDate: args.asOfDate.toISOString().slice(0, 10),
      tradingDays: args.tradingDays.length,
      gapFrom: gap.from,
      gapTo: gap.to,
      gapWeekdays: gap.weekdays,
      maxCalendarGapWeekdays: max,
    },
  });
  throw err;
}
