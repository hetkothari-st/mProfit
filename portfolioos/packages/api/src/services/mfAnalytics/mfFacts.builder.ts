/**
 * Assembles the single `MfAnalysisFacts` object every MF rule reasons over
 * (`docs/mf-analytics/05-FINDINGS-ENGINE.md §2`).
 *
 * This file is the *only* place in the findings engine that touches the
 * database. Rules receive facts and return findings; the orchestrator persists
 * them. That split is what makes a rule unit-testable from a fixture, and an
 * advice engine whose rules cannot be tested is one whose output cannot be
 * defended (`CONTEXT.md §9.8`).
 *
 * It **composes rather than re-queries**. The whole `04` analysis comes from
 * `computeMfPortfolioAnalysis`, not from a second pass over holdings, and each
 * held fund's `meta` and `score` are copied off the `MfHeldFundDto` that
 * analysis already produced. The findings page must not be able to disagree
 * with the portfolio page about how much of a fund someone owns, and the
 * surest way to guarantee that is to read the same function.
 *
 * Two constraints shape everything below.
 *
 * **Batched, never per-scheme.** `05 §2` says "one batched query per table",
 * and it is not a performance nicety: a fan-out of six queries per fund puts a
 * 20-fund household at 120 round trips, each of which the RLS hook wraps in
 * its own short transaction on its own connection (`CONTEXT.md §5`). The
 * `loadReferenceData` helper in `mfPortfolioAnalysis.service.ts` sets the
 * pattern this file follows: `findMany` with an `in` list, ordered so the
 * first row per key is the one in force, then grouped in memory.
 *
 * **JSON-closed.** The result is snapshotted verbatim onto
 * `MfAnalysisRun.factsSnapshot` so a stored run can be replayed against a
 * newer rule version (`05 §2`, `05 §8.8`). Everything returned is therefore a
 * string, number, boolean, null, array or plain object — no `Date`, no
 * `Decimal`, no `undefined`. `toSnapshotSafe` enforces that at the boundary
 * rather than leaving it to hope, and `mfFacts.builder.test.ts` proves the
 * round trip.
 */

import { Decimal } from 'decimal.js';
import {
  DEFAULT_MF_RULE_CONSTANTS,
  MIN_UNIVERSE_SIZE,
  serializeRatio,
  serializeRatioOrNull,
  toDecimal,
  type MfCurrentProfile,
  type MfHeldFundDto,
  type MfHorizonMetrics,
  type MfPeerPercentiles,
  type MfPlanType,
  type MfQualitativeFactDto,
  type MfRuleConstants,
  type MfSchemeScoreDto,
  type Pct,
  type SebiSubCategory,
} from '@portfolioos/shared';

import { prisma } from '../../lib/prisma.js';
import type { EffectiveScope } from '../familyScope.service.js';
import { getCurrentRiskProfile } from '../advisor/riskProfile.service.js';
import { activeMonthlyIncomeTotal } from '../income.service.js';
import type { RiskCategoryValue } from '../riskProfileMath.js';
import {
  computeMfPortfolioAnalysis,
  type MfPortfolioAnalysisOptions,
} from './mfPortfolioAnalysis.service.js';
import { parsePeerRankPayload, resolveRankableSchemeCode } from './mfPeerRank.service.js';
import {
  MF_HORIZON_KEYS,
  type AdvisorApprovedProductFacts,
  type GoalFacts,
  type MfAnalysisFacts,
  type MfCategoryStatsFacts,
  type MfFundFacts,
  type MfHorizonKey,
  type RiskProfileFacts,
} from './types.js';

const MS_PER_DAY = 86_400_000;
/** The same day-year `mfPortfolioAnalysis.service.ts` annualises on. */
const DAYS_PER_YEAR = 365.25;

/** `MfSchemeMetrics.horizonYears = 0` is the current-profile row (`02 §7`). */
const PROFILE_HORIZON = 0;

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface BuildMfAnalysisFactsOptions {
  /**
   * The `MfAnalysisRun` these facts belong to. Forwarded to the `04` analysis
   * so `facts.portfolio.runId` is the real run id, which is in turn where
   * `makeFinding` reads it from — one id, set in one place. A standalone call
   * gets `UNPERSISTED_RUN_ID` from the analysis service.
   */
  runId?: string;
  /**
   * Threshold overrides. Exists so a rule test can build facts with
   * `{...DEFAULT_MF_RULE_CONSTANTS, highTerPercentileCeiling: 0.9}` and assert
   * a fire/no-fire boundary without touching production calibration
   * (`05 §3-§4`). Production never passes it.
   */
  constants?: MfRuleConstants;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/**
 * Build the immutable fact set for one scope.
 *
 * `asOf` exists so a test can pin the clock: every time-dependent rule reads
 * `facts.asOf` rather than `Date.now()`, which is what makes rule output a
 * pure function of its input.
 *
 * Runs entirely under the caller's ambient RLS context. Everything user-scoped
 * it reads directly (approved products, goals, income, risk profile) belongs
 * to `scope.callerId`; the household fan-out that needs sibling contexts lives
 * inside `computeMfPortfolioAnalysis`, which already does it correctly, and is
 * deliberately not duplicated here.
 */
export async function buildMfAnalysisFacts(
  scope: EffectiveScope,
  asOf: Date = new Date(),
  opts: BuildMfAnalysisFactsOptions = {},
): Promise<MfAnalysisFacts> {
  const analysisOpts: MfPortfolioAnalysisOptions = { asOf };
  if (opts.runId !== undefined) analysisOpts.runId = opts.runId;
  const portfolio = await computeMfPortfolioAnalysis(scope, analysisOpts);

  // The scheme codes reference data is keyed by. An IDCW option is deliberately
  // absent from every universe and borrows its growth sibling's metrics, peer
  // rank and score (`03 §1`), so both codes go into the `in` lists and the
  // sibling's rows are what actually get attached.
  const held = portfolio.funds;
  const rankableByScheme = new Map<string, string | null>();
  for (const fund of held) {
    rankableByScheme.set(
      fund.schemeCode,
      resolveRankableSchemeCode({
        schemeCode: fund.meta.schemeCode,
        optionType: fund.meta.optionType,
        growthSiblingSchemeCode: fund.meta.growthSiblingSchemeCode,
      }),
    );
  }
  const referenceCodes = uniq([
    ...held.map((f) => f.schemeCode),
    ...[...rankableByScheme.values()].filter(isString),
  ]);

  // ── Wave 1 ───────────────────────────────────────────────────────────────
  //
  // Everything that depends only on the held funds, plus the head of the
  // approved list. One query per table, `in`-listed, never per scheme.
  const [metricRows, peerRows, qualitativeRows, approvedRows, goalRows, riskProfileRow, monthlyIncome] =
    await Promise.all([
      referenceCodes.length === 0
        ? []
        : prisma.mfSchemeMetrics.findMany({
            where: { schemeCode: { in: referenceCodes }, asOf: { lte: asOf } },
            // Descending, so the first row seen per (scheme, horizon) is the
            // one in force at `asOf`. Same trick as `loadReferenceData`.
            orderBy: { asOf: 'desc' },
            select: { schemeCode: true, asOf: true, horizonYears: true, metrics: true },
          }),
      referenceCodes.length === 0
        ? []
        : prisma.mfPeerRank.findMany({
            where: { schemeCode: { in: referenceCodes }, asOf: { lte: asOf } },
            orderBy: { asOf: 'desc' },
            select: {
              schemeCode: true,
              asOf: true,
              horizonYears: true,
              universeKey: true,
              universeSize: true,
              percentiles: true,
            },
          }),
      referenceCodes.length === 0
        ? []
        : prisma.mfSchemeQualitativeFact.findMany({
            where: {
              schemeCode: { in: referenceCodes },
              validFrom: { lte: asOf },
              // In force at `asOf`: open-ended, or not yet expired. A fact
              // that lapsed last year must not drive a finding today.
              OR: [{ validTo: null }, { validTo: { gte: asOf } }],
            },
            orderBy: { validFrom: 'desc' },
            select: {
              schemeCode: true,
              factType: true,
              value: true,
              validFrom: true,
              validTo: true,
              source: true,
            },
          }),
      prisma.advisorApprovedProduct.findMany({
        where: { userId: scope.callerId, isActive: true },
        orderBy: [{ bucket: 'asc' }, { rank: 'asc' }],
        select: {
          id: true,
          bucket: true,
          rank: true,
          label: true,
          fundId: true,
        },
      }),
      loadGoalRows(scope),
      getCurrentRiskProfile(scope.callerId),
      activeMonthlyIncomeTotal(scope.callerId),
    ]);

  // ── Wave 2 ───────────────────────────────────────────────────────────────
  //
  // Approved products name a `MutualFundMaster`, not a scheme code, so one
  // hop is unavoidable before their scheme-side data can be loaded.
  const approvedFundIds = uniq(approvedRows.map((r) => r.fundId).filter(isString));
  const masters =
    approvedFundIds.length === 0
      ? []
      : await prisma.mutualFundMaster.findMany({
          where: { id: { in: approvedFundIds } },
          select: { id: true, schemeCode: true, schemeName: true },
        });
  const schemeCodeByFundId = new Map<string, string>();
  for (const m of masters) {
    if (m.schemeCode !== null) schemeCodeByFundId.set(m.id, m.schemeCode);
  }
  const approvedSchemeCodes = uniq([...schemeCodeByFundId.values()]);

  // ── Wave 3 ───────────────────────────────────────────────────────────────
  //
  // Scheme-side data for the approved candidates, and the universe snapshots
  // behind `categoryStats`.
  //
  // The universe half is pinned to each held fund's own `score.asOf` rather
  // than to `asOf <= run date`. A universe is re-scored monthly; an unpinned
  // query would pull every historical snapshot of every universe a household
  // touches, and the median would then have to be re-derived from a pile of
  // mixed dates. The fund's score date IS the snapshot its percentile was
  // taken against, so it is the only date whose median is comparable.
  const universeAsOfs = uniq(
    held
      .map((f) => f.score)
      .filter((s): s is MfSchemeScoreDto => s !== null)
      .map((s) => `${s.universeKey}|${s.asOf}`),
  );
  const scoreRows = await loadScoreRows(universeAsOfs, approvedSchemeCodes, asOf);

  const [approvedMetas, terRows] = await Promise.all([
    approvedSchemeCodes.length === 0
      ? []
      : prisma.mfSchemeMeta.findMany({
          where: { schemeCode: { in: approvedSchemeCodes } },
          select: {
            schemeCode: true,
            schemeName: true,
            sebiSubCategory: true,
            planType: true,
          },
        }),
    approvedSchemeCodes.length === 0
      ? []
      : prisma.mfSchemeTer.findMany({
          where: { schemeCode: { in: approvedSchemeCodes }, effectiveFrom: { lte: asOf } },
          orderBy: { effectiveFrom: 'desc' },
          select: { schemeCode: true, terPct: true },
        }),
  ]);

  // ── Index the batches ────────────────────────────────────────────────────

  const profileByScheme = new Map<string, MfCurrentProfile>();
  const metricsByScheme = new Map<string, Map<MfHorizonKey, MfHorizonMetrics>>();
  const seenMetric = new Set<string>();
  for (const row of metricRows) {
    const key = `${row.schemeCode}|${row.horizonYears}`;
    if (seenMetric.has(key)) continue; // desc order: first wins
    seenMetric.add(key);
    if (row.metrics === null || typeof row.metrics !== 'object') continue;

    if (row.horizonYears === PROFILE_HORIZON) {
      profileByScheme.set(row.schemeCode, row.metrics as unknown as MfCurrentProfile);
      continue;
    }
    const horizonKey = asHorizonKey(row.horizonYears);
    if (horizonKey === null) continue;
    let byHorizon = metricsByScheme.get(row.schemeCode);
    if (byHorizon === undefined) {
      byHorizon = new Map();
      metricsByScheme.set(row.schemeCode, byHorizon);
    }
    byHorizon.set(horizonKey, row.metrics as unknown as MfHorizonMetrics);
  }

  const peerByScheme = new Map<string, Map<MfHorizonKey, MfPeerPercentiles>>();
  const seenPeer = new Set<string>();
  for (const row of peerRows) {
    const key = `${row.schemeCode}|${row.horizonYears}`;
    if (seenPeer.has(key)) continue;
    seenPeer.add(key);
    const horizonKey = asHorizonKey(row.horizonYears);
    if (horizonKey === null) continue;
    // Never hand-parse the column: the `$`-prefixed keys are an internal
    // detail of `serializePeerRankPayload` and this is its documented inverse.
    const parsed = parsePeerRankPayload(row);
    let byHorizon = peerByScheme.get(row.schemeCode);
    if (byHorizon === undefined) {
      byHorizon = new Map();
      peerByScheme.set(row.schemeCode, byHorizon);
    }
    byHorizon.set(horizonKey, parsed.peer);
  }

  const qualitativeByScheme = new Map<string, MfQualitativeFactDto[]>();
  for (const row of qualitativeRows) {
    const list = qualitativeByScheme.get(row.schemeCode) ?? [];
    list.push({
      factType: row.factType,
      value: row.value,
      validFrom: isoDate(row.validFrom),
      validTo: row.validTo === null ? null : isoDate(row.validTo),
      source: row.source,
    });
    qualitativeByScheme.set(row.schemeCode, list);
  }

  const metaByApprovedScheme = new Map(approvedMetas.map((m) => [m.schemeCode, m]));
  const terByApprovedScheme = new Map<string, Pct>();
  for (const t of terRows) {
    // Descending by `effectiveFrom`: the first row per scheme is in force.
    if (!terByApprovedScheme.has(t.schemeCode)) {
      terByApprovedScheme.set(t.schemeCode, toDecimal(t.terPct).toFixed(6) as Pct);
    }
  }

  const scoreByApprovedScheme = new Map<
    string,
    { rating: number | null; composite: Decimal | null }
  >();
  // Only the `(universeKey, asOf)` pairs actually requested are accumulated.
  // The one query above serves two purposes, and its approved-scheme branch
  // returns rows from whatever universes those candidates happen to sit in. A
  // universe we did not ask for comes back with only its approved members
  // present, so counting it would produce a "median" over one or two funds —
  // exactly the noise `MIN_UNIVERSE_SIZE` exists to suppress, arriving through
  // the back door with a plausible-looking `universeSize`.
  const requestedUniverses = new Set(universeAsOfs);
  const compositesByUniverse = new Map<string, Decimal[]>();
  for (const row of scoreRows) {
    if (!scoreByApprovedScheme.has(row.schemeCode) && approvedSchemeCodes.includes(row.schemeCode)) {
      scoreByApprovedScheme.set(row.schemeCode, {
        rating: row.rating,
        composite: row.composite === null ? null : toDecimal(row.composite),
      });
    }
    // Only RATED members carry a composite. An unrated fund counted as zero
    // would drag the median toward a score no fund actually achieved.
    if (row.ratingStatus !== 'RATED' || row.composite === null) continue;
    const universeAt = `${row.universeKey}|${isoDate(row.asOf)}`;
    if (!requestedUniverses.has(universeAt)) continue;
    const bucket = compositesByUniverse.get(universeAt) ?? [];
    bucket.push(toDecimal(row.composite));
    compositesByUniverse.set(universeAt, bucket);
  }

  // ── Assemble per-fund facts ──────────────────────────────────────────────

  const funds: Record<string, MfFundFacts> = {};
  for (const fund of held) {
    const rankable = rankableByScheme.get(fund.schemeCode) ?? null;
    funds[fund.schemeCode] = {
      meta: fund.meta,
      score: fund.score,
      metrics: horizonMap(rankable === null ? undefined : metricsByScheme.get(rankable)),
      profile: (rankable === null ? undefined : profileByScheme.get(rankable)) ?? null,
      peer: horizonMap(rankable === null ? undefined : peerByScheme.get(rankable)),
      // The held code's own facts first, then the growth sibling's — an AMC
      // action is recorded once, usually against the growth option, and an
      // IDCW holder is exposed to exactly the same AMC.
      qualitative: mergeQualitative(
        qualitativeByScheme.get(fund.schemeCode),
        rankable === null || rankable === fund.schemeCode
          ? undefined
          : qualitativeByScheme.get(rankable),
      ),
      held: fund,
      categoryStats: categoryStatsFor(fund, compositesByUniverse),
    };
  }

  // ── Approved universe ────────────────────────────────────────────────────

  const approvedUniverse: AdvisorApprovedProductFacts[] = approvedRows.map((row) => {
    const schemeCode = row.fundId === null ? null : schemeCodeByFundId.get(row.fundId) ?? null;
    const meta = schemeCode === null ? undefined : metaByApprovedScheme.get(schemeCode);
    const score = schemeCode === null ? undefined : scoreByApprovedScheme.get(schemeCode);
    return {
      approvedProductId: row.id,
      bucket: row.bucket,
      rank: row.rank,
      label: row.label,
      fundId: row.fundId,
      schemeCode,
      schemeName: meta?.schemeName ?? null,
      sebiSubCategory:
        meta === undefined ? null : (meta.sebiSubCategory as SebiSubCategory | 'UNMAPPED'),
      planType: meta === undefined ? null : (meta.planType as MfPlanType),
      rating: asRating(score?.rating ?? null),
      composite: serializeRatioOrNull(score?.composite ?? null),
      terPct: schemeCode === null ? null : terByApprovedScheme.get(schemeCode) ?? null,
    };
  });

  // ── User profile ─────────────────────────────────────────────────────────

  const riskProfile: RiskProfileFacts | null =
    riskProfileRow === null || riskProfileRow.category === null
      ? null
      : {
          assessmentId: riskProfileRow.assessmentId,
          category: riskProfileRow.category as RiskCategoryValue,
          assessedAt: riskProfileRow.assessedAt,
          taxSlabPct: riskProfileRow.taxSlabPct,
          // The questionnaire's own answer. The advisor falls back to the
          // user's DOB, which is a further query per run for a field no rule
          // in `05 §4` consumes; null here means "not asked", not "zero".
          age: riskProfileRow.answers?.age ?? null,
        };

  const goals: GoalFacts[] = goalRows.map((g) => ({
    goalId: g.id,
    name: g.name,
    category: g.category,
    priority: g.priority,
    targetDate: isoDate(g.targetDate),
    horizonYears: serializeRatio(
      new Decimal(g.targetDate.getTime() - asOf.getTime())
        .dividedBy(MS_PER_DAY)
        .dividedBy(DAYS_PER_YEAR),
    ),
    targetAmount: toDecimal(g.targetAmount).toFixed(4),
    currentValue: toDecimal(g.initialAmount).toFixed(4),
    portfolioIds: g.portfolioIds,
  }));

  const facts: MfAnalysisFacts = {
    asOf: asOf.toISOString(),
    userId: scope.callerId,
    scope,
    constants: opts.constants ?? DEFAULT_MF_RULE_CONSTANTS,
    portfolio,
    funds,
    approvedUniverse,
    userProfile: {
      riskProfile,
      goals,
      // `> 0`, not `!= null`. `activeMonthlyIncomeTotal` sums active income
      // rows and returns zero when there are none, so zero is the "nothing on
      // file" signal here. Reported as a boolean rather than as the amount
      // because no rule in `05 §4` sizes anything off income — they only need
      // to know whether they may say "we cannot tell you" (`CONTEXT.md §6`).
      incomeKnown: monthlyIncome.greaterThan(0),
    },
  };

  return toSnapshotSafe(facts, '$');
}

// ---------------------------------------------------------------------------
// Loading helpers
// ---------------------------------------------------------------------------

/**
 * The caller's ACTIVE goals, or none if the GOAL category is capped away.
 *
 * Mirrors `buildGoalFits` in `mfPortfolioAnalysis.service.ts` exactly, down to
 * the `=== null` test. Goals are a capped *category*, not an asset class:
 * `null` is unrestricted and `[]` is deny-all (`CONTEXT.md §6`). Writing this
 * as `!scope.allowedCategories` or `?.includes` reintroduces the fail-open bug
 * that shipped once, because an empty array is falsy.
 *
 * Only `scope.callerId`'s goals are loaded, never the household's. A goal is
 * the caller's own plan; another member's retirement date is not a fact about
 * the caller's fund selection, and reading it here would also need the sibling
 * RLS fan-out for no benefit.
 */
async function loadGoalRows(scope: EffectiveScope) {
  if (scope.allowedCategories !== null && !scope.allowedCategories.includes('GOAL')) return [];
  return prisma.goal.findMany({
    where: { userId: scope.callerId, status: 'ACTIVE' },
    orderBy: { targetDate: 'asc' },
    select: {
      id: true,
      name: true,
      category: true,
      priority: true,
      targetDate: true,
      targetAmount: true,
      initialAmount: true,
      portfolioIds: true,
    },
  });
}

/**
 * One `MfSchemeScore` query serving two purposes: the universe snapshots
 * behind `categoryStats`, and the ratings behind `approvedUniverse`.
 *
 * Kept as a single `findMany` because `05 §2` asks for one batched query per
 * table and because two queries against the same table would be two chances
 * for the run to see two different methodology versions.
 */
async function loadScoreRows(
  universeAsOfs: readonly string[],
  approvedSchemeCodes: readonly string[],
  asOf: Date,
) {
  const or: Array<Record<string, unknown>> = [];
  for (const pair of universeAsOfs) {
    const sep = pair.lastIndexOf('|');
    const universeKey = pair.slice(0, sep);
    const universeAsOf = pair.slice(sep + 1);
    or.push({ universeKey, asOf: new Date(`${universeAsOf}T00:00:00.000Z`) });
  }
  if (approvedSchemeCodes.length > 0) {
    or.push({ schemeCode: { in: [...approvedSchemeCodes] }, asOf: { lte: asOf } });
  }
  if (or.length === 0) return [];

  return prisma.mfSchemeScore.findMany({
    where: { OR: or },
    // Descending, so the first row per approved scheme is its latest score.
    orderBy: { asOf: 'desc' },
    select: {
      schemeCode: true,
      asOf: true,
      universeKey: true,
      ratingStatus: true,
      composite: true,
      rating: true,
    },
  });
}

// ---------------------------------------------------------------------------
// Derivation helpers
// ---------------------------------------------------------------------------

/**
 * Where the fund's universe sits, from the snapshot its own score was taken
 * against.
 *
 * Both statistics are `null` below `MIN_UNIVERSE_SIZE` rated members, per
 * `00-README.md` invariant 3: with eight funds a "top quartile" is one fund
 * and moving one place shifts it by twelve points, so the number would be
 * noise reported to six decimals. Null, never 0 — a category we cannot rank is
 * not a category where everyone scores zero.
 */
function categoryStatsFor(
  fund: MfHeldFundDto,
  compositesByUniverse: ReadonlyMap<string, Decimal[]>,
): MfCategoryStatsFacts {
  const score = fund.score;
  if (score === null) {
    return {
      universeKey: null,
      universeSize: 0,
      medianComposite: null,
      topQuartileComposite: null,
    };
  }

  const composites = compositesByUniverse.get(`${score.universeKey}|${score.asOf}`) ?? [];
  const rated = composites.length;
  if (rated < MIN_UNIVERSE_SIZE) {
    return {
      universeKey: score.universeKey,
      universeSize: rated,
      medianComposite: null,
      topQuartileComposite: null,
    };
  }

  const sorted = [...composites].sort((a, b) => a.comparedTo(b));
  return {
    universeKey: score.universeKey,
    universeSize: rated,
    medianComposite: serializeRatio(median(sorted)),
    topQuartileComposite: serializeRatio(nearestRank(sorted, 0.75)),
  };
}

/** Middle value, or the mean of the two middles. Ascending input assumed. */
function median(sorted: readonly Decimal[]): Decimal {
  const n = sorted.length;
  const mid = Math.floor(n / 2);
  if (n % 2 === 1) return sorted[mid]!;
  return sorted[mid - 1]!.plus(sorted[mid]!).dividedBy(2);
}

/**
 * Nearest-rank percentile: the smallest value at or above the `p` fraction of
 * the sorted set.
 *
 * Nearest-rank rather than linear interpolation because the result is compared
 * against real funds' composites — an interpolated "top quartile" is a score
 * no scheme in the universe actually has, and a finding that cites it is
 * citing a fund that does not exist.
 */
function nearestRank(sorted: readonly Decimal[], p: number): Decimal {
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1));
  return sorted[index]!;
}

/**
 * A total map over the five horizons: every key present, missing rows `null`.
 *
 * `05 §4`'s rules distinguish "this fund has no 10-year history" from "we did
 * not look at 10 years", and an absent key cannot express the first
 * unambiguously. It also keeps the snapshot's shape identical across runs,
 * which is what makes two `factsSnapshot`s diffable.
 */
function horizonMap<T>(byHorizon: ReadonlyMap<MfHorizonKey, T> | undefined): Record<MfHorizonKey, T | null> {
  const out = {} as Record<MfHorizonKey, T | null>;
  for (const key of MF_HORIZON_KEYS) out[key] = byHorizon?.get(key) ?? null;
  return out;
}

function mergeQualitative(
  own: MfQualitativeFactDto[] | undefined,
  sibling: MfQualitativeFactDto[] | undefined,
): MfQualitativeFactDto[] {
  const out = [...(own ?? [])];
  const seen = new Set(out.map(qualitativeKey));
  for (const fact of sibling ?? []) {
    const key = qualitativeKey(fact);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(fact);
  }
  return out;
}

function qualitativeKey(f: MfQualitativeFactDto): string {
  return `${f.factType}|${f.validFrom}|${f.source}`;
}

function asHorizonKey(horizonYears: number): MfHorizonKey | null {
  const key = `${horizonYears}` as MfHorizonKey;
  return MF_HORIZON_KEYS.includes(key) ? key : null;
}

/** 1-5 or null. A rating outside the band is data corruption, not a 3. */
function asRating(raw: number | null): 1 | 2 | 3 | 4 | 5 | null {
  if (raw === null) return null;
  return raw >= 1 && raw <= 5 ? (raw as 1 | 2 | 3 | 4 | 5) : null;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function isString(v: string | null | undefined): v is string {
  return typeof v === 'string';
}

function uniq(values: readonly string[]): string[] {
  return [...new Set(values)];
}

// ---------------------------------------------------------------------------
// JSON closure (`05 §2`)
// ---------------------------------------------------------------------------

/**
 * Return `value` as something that survives `JSON.parse(JSON.stringify(x))`
 * **unchanged**, or throw naming the offending path.
 *
 * The facts are written to `MfAnalysisRun.factsSnapshot` and read back to
 * replay a run under a newer rule version. If the in-memory facts and the
 * stored facts differ in any way, the replay is not a replay — it is a
 * different computation that happens to be spelled the same. Two failure modes
 * are silent and this function exists for them:
 *
 *  - a `Date` or `Decimal` slipping in serialises to a *string*, so the replay
 *    hands the rule a string where the live run handed it an object, and the
 *    rule's `.greaterThan(...)` throws only on the replay path — months later,
 *    in a job nobody is watching;
 *  - an `undefined` inside an array becomes `null`, silently turning "no
 *    fourth lot" into "a fourth lot that is null".
 *
 * Both throw here, at the boundary, with a path.
 *
 * `undefined` as an **object property value** is the one case that is dropped
 * rather than rejected, because that is precisely what `JSON.stringify` does
 * with it and because the upstream DTOs use optional fields (`statusReason?`,
 * `userXirrStatusReason?`) that are legitimately set to `undefined` by their
 * producers. Dropping it here makes the in-memory facts and the snapshot the
 * same value; leaving it would make `toStrictEqual` on the round trip fail for
 * a difference that carries no information.
 *
 * The plain-object test is a prototype check rather than a list of banned
 * classes, so a `Map`, a `Set`, a Prisma `Decimal` and anything else added
 * later are all caught by construction instead of by remembering to add them.
 */
export function toSnapshotSafe<T>(value: T, path: string): T {
  if (value === null) return value;

  const t = typeof value;
  if (t === 'string' || t === 'boolean') return value;

  if (t === 'number') {
    if (!Number.isFinite(value as unknown as number)) {
      throw new Error(
        `factsSnapshot: non-finite number at ${path}. JSON.stringify writes NaN and ` +
          'Infinity as null, so the replayed run would see a different value.',
      );
    }
    return value;
  }

  if (t === 'undefined' || t === 'bigint' || t === 'function' || t === 'symbol') {
    throw new Error(`factsSnapshot: ${t} at ${path} cannot survive JSON serialisation.`);
  }

  if (Array.isArray(value)) {
    return value.map((item, i) => {
      if (item === undefined) {
        throw new Error(
          `factsSnapshot: undefined array element at ${path}[${i}]. JSON.stringify ` +
            'writes it as null, which is a different value.',
        );
      }
      return toSnapshotSafe(item, `${path}[${i}]`);
    }) as unknown as T;
  }

  const proto = Object.getPrototypeOf(value as object);
  if (proto !== Object.prototype && proto !== null) {
    const name = (value as object).constructor?.name ?? 'unknown';
    throw new Error(
      `factsSnapshot: ${name} instance at ${path}. Facts must be plain JSON — a ` +
        `${name} serialises to something the replay cannot turn back into a ${name}. ` +
        'Serialise it (ISO string for a Date, decimal string for a Decimal) first.',
    );
  }

  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    // Dropped, not rejected — see the header comment.
    if (item === undefined) continue;
    out[key] = toSnapshotSafe(item, `${path}.${key}`);
  }
  return out as unknown as T;
}
