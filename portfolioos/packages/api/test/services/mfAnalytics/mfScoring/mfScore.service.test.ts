/**
 * Integration tests for `mfScore.service.ts` — `03-SCORING.md §11.6-§11.9`,
 * the `§10` explainability payload, and the `06 §1` append-only invariant.
 *
 * These run against the local Postgres because the thing under test is the
 * wiring: which stored number reaches which input, and what the row that
 * lands in `MfSchemeScore` looks like. The arithmetic is covered by
 * `mfScoreMath.test.ts`; nothing here re-derives a percentile.
 *
 * The fixture universes are REGULAR-plan and keyed to a mid-month `asOf`, so
 * they cannot collide with the real (DIRECT-plan, month-end) data the shared
 * dev database holds. Every scheme code carries a per-run prefix and cleanup
 * deletes by exact code list, never by pattern.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { Decimal, toDecimal, universeKey } from '@portfolioos/shared';
import type { MfOptionType, MfPillarScore } from '@portfolioos/shared';
import { prisma } from '../../../../src/lib/prisma.js';
import { runAsSystem } from '../../../../src/lib/requestContext.js';
import {
  runPeerRankForUniverse,
  type UniverseRef,
} from '../../../../src/services/mfAnalytics/mfPeerRank.service.js';
import {
  scoreUniverse,
  scoreScheme,
  getScoreForScheme,
  inputSourceFor,
  MF_SCORE_SERVICE_VERSION,
} from '../../../../src/services/mfAnalytics/mfScoring/mfScore.service.js';
import { MF_SCORING_MODELS } from '../../../../src/services/mfAnalytics/mfScoring/models/registry.js';
import {
  runMfScoreForUniverses,
  MF_SCORE_ADAPTER_ID,
} from '../../../../src/jobs/mfScoreJob.js';

// ---------------------------------------------------------------------------
// The `03 §11.8` "test double": a methodology-version bump without editing a
// model file. The registry is wrapped, not replaced — every weight is the
// real one, only the version string changes when the suffix is set.
// ---------------------------------------------------------------------------

const versionOverride = vi.hoisted(() => ({ suffix: '' }));

vi.mock('../../../../src/services/mfAnalytics/mfScoring/models/registry.js', async (importOriginal) => {
  const real = await importOriginal<
    typeof import('../../../../src/services/mfAnalytics/mfScoring/models/registry.js')
  >();
  return {
    ...real,
    modelForKey: (key: Parameters<typeof real.modelForKey>[0]) => {
      const model = real.modelForKey(key);
      if (versionOverride.suffix === '') return model;
      return { ...model, methodologyVersion: `${model.methodologyVersion}${versionOverride.suffix}` };
    },
  };
});

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

const RUN = randomUUID().slice(0, 8).toUpperCase();
/** Mid-month on purpose: real metrics/rank rows are keyed to month-ends. */
const ASOF = new Date(Date.UTC(2025, 10, 15)); // 2025-11-15

const createdSchemeCodes: string[] = [];

function code(label: string): string {
  const c = `S${RUN}${label}`;
  createdSchemeCodes.push(c);
  return c;
}

const SUB_RATED = 'Large Cap Fund';
const SUB_SMALL = 'Mid Cap Fund';
const PLAN = 'REGULAR' as const;

function refFor(sub: string): UniverseRef {
  return { universeKey: universeKey(sub, PLAN), sebiSubCategory: sub, planType: PLAN };
}

interface HorizonSeed {
  status: 'OK' | 'INSUFFICIENT_DATA';
  sortino?: string;
  informationRatio?: string;
  jensenAlphaAnn?: string;
  rollingBeatBenchPct?: string;
  downCapture?: string;
  maxDrawdown?: string;
  worstCalendarYear?: string;
}

interface SeedOpts {
  schemeCode: string;
  sebiSubCategory: string;
  optionType?: MfOptionType;
  growthSiblingSchemeCode?: string | null;
  /** Months of history before ASOF (drives `inceptionDate`). */
  historyMonths?: number;
  horizons?: Record<number, HorizonSeed>;
  profile?: { terPct?: string | null; activeShare?: string | null; managerTenureYears?: string | null };
}

function nullRatio(path: string, fs: Record<string, string>): null {
  fs[path] = 'INSUFFICIENT_DATA';
  return null;
}

function horizonJson(horizonYears: number, seed: HorizonSeed) {
  const fieldStatus: Record<string, string> = {};
  const v = (path: string, x: string | undefined): string | null =>
    x === undefined ? nullRatio(path, fieldStatus) : x;
  return {
    asOf: ASOF.toISOString().slice(0, 10),
    horizonYears,
    observationsMonthly: seed.status === 'OK' ? horizonYears * 12 : 0,
    status: seed.status,
    ...(seed.status === 'OK' ? {} : { statusReason: 'nav_history_covers_30_of_36_months' }),
    benchmarkCode: 'NIFTY100_TRI',
    riskFreeSeries: 'FBIL_TBILL_91D',
    mathVersion: 'metrics-v1',
    returns: {
      cagr: v('returns.cagr', undefined),
      absolute: null,
      benchmarkCagr: null,
      categoryMedianCagr: null,
      rolling1y: null,
      rolling3y: null,
      rolling5y: null,
      calendarYears: [],
      sipXirr: null,
    },
    risk: {
      stdDevAnn: null,
      downsideDevAnn: null,
      maxDrawdown: v('risk.maxDrawdown', seed.maxDrawdown),
      maxDrawdownDurationDays: null,
      recoveryDays: null,
      worstMonth: null,
      bestMonth: null,
      worstCalendarYear: v('risk.worstCalendarYear', seed.worstCalendarYear),
      var95Monthly: null,
      cvar95Monthly: null,
      pctNegativeMonths: null,
    },
    riskAdjusted: {
      sharpe: null,
      sortino: v('riskAdjusted.sortino', seed.sortino),
      beta: null,
      jensenAlphaAnn: v('riskAdjusted.jensenAlphaAnn', seed.jensenAlphaAnn),
      treynor: null,
      trackingErrorAnn: null,
      informationRatio: v('riskAdjusted.informationRatio', seed.informationRatio),
      calmar: null,
      omega: null,
      m2: null,
    },
    relative: {
      upCapture: null,
      downCapture: v('relative.downCapture', seed.downCapture),
      captureRatio: null,
      battingAverage: null,
      outperformanceAnn: null,
    },
    consistency: {
      rollingBeatBenchPct: v('consistency.rollingBeatBenchPct', seed.rollingBeatBenchPct),
      rollingBeatCategoryPct: nullRatio('consistency.rollingBeatCategoryPct', fieldStatus),
      quartileHistory: [],
      quartileConsistency: nullRatio('consistency.quartileConsistency', fieldStatus),
      survivorshipAdjusted: false,
    },
    fieldStatus,
  };
}

function profileJson(seed: NonNullable<SeedOpts['profile']>) {
  const terPct = seed.terPct ?? null;
  const activeShare = seed.activeShare ?? null;
  const managerTenureYears = seed.managerTenureYears ?? null;
  const fieldStatus: Record<string, string> = {};
  if (terPct === null) fieldStatus['terPct'] = 'INSUFFICIENT_DATA';
  if (activeShare === null) fieldStatus['activeShare'] = 'INSUFFICIENT_DATA';
  if (managerTenureYears === null) fieldStatus['managerTenureYears'] = 'INSUFFICIENT_DATA';
  for (const f of ['hhi', 'styleDrift', 'aum', 'terCategoryMedianPct', 'terPercentile', 'aumCategoryPercentile']) {
    fieldStatus[f] = 'INSUFFICIENT_DATA';
  }
  return {
    asOf: ASOF.toISOString().slice(0, 10),
    snapshotAsOf: null,
    status: 'INSUFFICIENT_DATA',
    statusReason: 'no_portfolio_snapshot',
    numHoldings: null,
    top10WeightPct: null,
    hhi: null,
    effectiveHoldings: null,
    cashPct: null,
    activeShare,
    marketCapSplit: null,
    sectorWeights: null,
    sectorActiveWeights: null,
    turnoverPct: null,
    turnoverIsEstimated: true,
    styleBox: null,
    styleDrift: null,
    topHoldings: [],
    modifiedDuration: null,
    durationIsApproximated: true,
    averageMaturityYears: null,
    ytmPct: null,
    creditQualitySplit: null,
    belowAAPct: null,
    topIssuerPct: null,
    terPct,
    terCategoryMedianPct: null,
    terPercentile: null,
    aum: null,
    aumGrowth12mPct: null,
    aumCategoryPercentile: null,
    managerTenureYears,
    managerChangesLast3y: 0,
    currentManagers: [],
    fundAgeYears: null,
    exitLoadMaxDays: null,
    fieldStatus,
  };
}

async function seedScheme(opts: SeedOpts): Promise<void> {
  const historyMonths = opts.historyMonths ?? 96;
  const inception = new Date(
    Date.UTC(ASOF.getUTCFullYear(), ASOF.getUTCMonth() - historyMonths, ASOF.getUTCDate()),
  );
  await prisma.mfSchemeMeta.create({
    data: {
      schemeCode: opts.schemeCode,
      isin: null,
      schemeName: `Score fixture ${opts.schemeCode}`,
      amcCode: 'FIXAMC',
      amcName: 'Fixture AMC',
      sebiCategory: 'EQUITY',
      sebiSubCategory: opts.sebiSubCategory,
      planType: PLAN,
      optionType: opts.optionType ?? 'GROWTH',
      inceptionDate: inception,
      status: 'ACTIVE',
      growthSiblingSchemeCode: opts.growthSiblingSchemeCode ?? null,
      sourceHash: `score-fixture-${opts.schemeCode}`,
      fetchedAt: ASOF,
    },
  });

  if (opts.profile !== undefined) {
    await prisma.mfSchemeMetrics.create({
      data: {
        schemeCode: opts.schemeCode,
        asOf: ASOF,
        horizonYears: 0,
        status: 'INSUFFICIENT_DATA',
        statusReason: 'no_portfolio_snapshot',
        metrics: profileJson(opts.profile) as never,
        mathVersion: 'metrics-v1',
      },
    });
  }
  for (const [h, seed] of Object.entries(opts.horizons ?? {})) {
    const horizonYears = Number.parseInt(h, 10);
    await prisma.mfSchemeMetrics.create({
      data: {
        schemeCode: opts.schemeCode,
        asOf: ASOF,
        horizonYears,
        status: seed.status,
        metrics: horizonJson(horizonYears, seed) as never,
        mathVersion: 'metrics-v1',
      },
    });
  }
}

/** A full-history active-equity scheme whose every scored input is `1 + i`-ish. */
function ratedSeed(schemeCode: string, sub: string, i: number): SeedOpts {
  const h: HorizonSeed = {
    status: 'OK',
    sortino: `${1 + i}`,
    informationRatio: `${(i + 1) / 10}`,
    jensenAlphaAnn: `${(i + 1) / 100}`,
    rollingBeatBenchPct: `${(i + 1) / 20}`,
    downCapture: `${1 - (i + 1) / 40}`,
    maxDrawdown: `-${(0.4 - (i + 1) / 50).toFixed(4)}`,
    worstCalendarYear: `-${(0.3 - (i + 1) / 60).toFixed(4)}`,
  };
  return {
    schemeCode,
    sebiSubCategory: sub,
    horizons: { 3: h, 5: h, 10: h },
    profile: { terPct: `${(2 - (i + 1) / 10).toFixed(4)}`, activeShare: `${0.3 + i / 50}`, managerTenureYears: `${1 + i}` },
  };
}

async function loadRows(sub: string, version?: string) {
  return prisma.mfSchemeScore.findMany({
    where: {
      universeKey: universeKey(sub, PLAN),
      asOf: ASOF,
      ...(version === undefined ? {} : { methodologyVersion: version }),
      schemeCode: { in: createdSchemeCodes },
    },
    orderBy: [{ methodologyVersion: 'asc' }, { schemeCode: 'asc' }],
  });
}

const DECIMAL_STRING = /^-?\d+\.\d{6}$/;

/** Every leaf of the pillars payload that is not a status or a string must be a Decimal string. */
function assertNoJsNumbers(value: unknown, path = 'pillars'): void {
  if (value === null || value === undefined) return;
  expect(typeof value, `${path} must not be a JS number`).not.toBe('number');
  if (typeof value === 'object') {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      assertNoJsNumbers(v, `${path}.${k}`);
    }
  }
}

// ---------------------------------------------------------------------------

let RATED_CODES: string[] = [];
let YOUNG: string;
let NONAV: string;
let IDCW: string;
let IDCW_ORPHAN: string;
let UNMAPPED: string;
let SMALL_CODES: string[] = [];

describe('mfScore.service', () => {
  beforeAll(async () => {
    await runAsSystem(async () => {
      // ── rated universe: 12 full-history schemes + 1 young + 1 IDCW ───────
      RATED_CODES = [];
      for (let i = 0; i < 12; i++) {
        const c = code(`R${i.toString().padStart(2, '0')}`);
        RATED_CODES.push(c);
        await seedScheme(ratedSeed(c, SUB_RATED, i));
      }
      YOUNG = code('YOUNG');
      await seedScheme({
        schemeCode: YOUNG,
        sebiSubCategory: SUB_RATED,
        historyMonths: 30,
        // A 30-month-old fund has a measured 1y window and an unmeasurable 3y
        // one. The 1y row is what makes it a *member* (measured), the missing
        // 3y row is what makes it unrated.
        horizons: { 1: { status: 'OK', sortino: '1' }, 3: { status: 'INSUFFICIENT_DATA' } },
        profile: { terPct: '0.5000' },
      });
      NONAV = code('NONAV');
      await seedScheme({
        schemeCode: NONAV,
        sebiSubCategory: SUB_RATED,
        // What the metrics job leaves behind for a scheme with no NAV at all:
        // rows on every horizon, none measured. Old fund, no data.
        historyMonths: 240,
        horizons: { 1: { status: 'INSUFFICIENT_DATA' }, 3: { status: 'INSUFFICIENT_DATA' } },
        profile: { terPct: '0.9000' },
      });
      IDCW = code('IDCW');
      await seedScheme({
        ...ratedSeed(IDCW, SUB_RATED, 20), // deliberately the best numbers in the category
        optionType: 'IDCW_PAYOUT',
        growthSiblingSchemeCode: RATED_CODES[0]!,
      });
      IDCW_ORPHAN = code('IDCWX');
      await seedScheme({
        ...ratedSeed(IDCW_ORPHAN, SUB_RATED, 21),
        optionType: 'IDCW_REINVEST',
        growthSiblingSchemeCode: null,
      });
      UNMAPPED = code('UNMAP');
      await seedScheme(ratedSeed(UNMAPPED, 'UNMAPPED', 3));

      // ── small universe: exactly 8 ────────────────────────────────────────
      SMALL_CODES = [];
      for (let i = 0; i < 8; i++) {
        const c = code(`M${i}`);
        SMALL_CODES.push(c);
        await seedScheme(ratedSeed(c, SUB_SMALL, i));
      }

      // Ranks are the scorer's input; produce them with the real pipeline.
      await runPeerRankForUniverse(refFor(SUB_RATED), ASOF);
      await runPeerRankForUniverse(refFor(SUB_SMALL), ASOF);
    });
  }, 120_000);

  afterAll(async () => {
    await runAsSystem(async () => {
      await prisma.mfSchemeScore.deleteMany({ where: { schemeCode: { in: createdSchemeCodes } } });
      await prisma.mfPeerRank.deleteMany({ where: { schemeCode: { in: createdSchemeCodes } } });
      await prisma.mfSchemeMetrics.deleteMany({ where: { schemeCode: { in: createdSchemeCodes } } });
      await prisma.mfSchemeMeta.deleteMany({ where: { schemeCode: { in: createdSchemeCodes } } });
      await prisma.ingestionFailure.deleteMany({
        where: { sourceAdapter: MF_SCORE_ADAPTER_ID, sourceRef: { startsWith: `UNMAPPED|${PLAN}@` } },
      });
    });
  }, 120_000);

  // -------------------------------------------------------------------------

  describe('input source coverage', () => {
    it('every input named in every model resolves to a stored number or a derivation', () => {
      for (const model of Object.values(MF_SCORING_MODELS)) {
        for (const pillar of model.pillars) {
          for (const input of pillar.inputs) {
            expect(() => inputSourceFor(input.metric), `${model.modelKey}.${pillar.key}.${input.metric}`).not.toThrow();
          }
        }
      }
      expect(() => inputSourceFor('notAMetric')).toThrow(RangeError);
    });
  });

  describe('rated universe', () => {
    it('scores every ACTIVE growth member, rates the 12 with history, and withholds the young one (§11.6)', async () => {
      const result = await runAsSystem(() => scoreUniverse(refFor(SUB_RATED), ASOF));

      expect(result.modelKey).toBe('ACTIVE_EQUITY');
      expect(result.methodologyVersion).toBe('score-active-equity-v1');
      // 12 rated + 1 young. The IDCW options are not members at all.
      expect(result.scored).toBe(13);
      expect(result.written).toBe(13);
      expect(result.skippedExisting).toBe(0);
      expect(result.ratingStatusCounts).toEqual({
        RATED: 12,
        INSUFFICIENT_HISTORY: 1,
        CATEGORY_TOO_SMALL: 0,
        NOT_APPLICABLE: 0,
      });
      expect(result.rows.map((r) => r.schemeCode)).not.toContain(IDCW);
      expect(result.rows.map((r) => r.schemeCode)).not.toContain(IDCW_ORPHAN);
      // A scheme with no measured window is not a member: no row, not an
      // INSUFFICIENT_HISTORY row. (The count also absorbs any real REGULAR
      // schemes in this sub-category that have no metrics at the fixture date.)
      expect(result.rows.map((r) => r.schemeCode)).not.toContain(NONAV);
      expect(result.skippedUnmeasured).toBeGreaterThanOrEqual(1);
      expect(await prisma.mfSchemeScore.count({ where: { schemeCode: NONAV } })).toBe(0);

      const young = result.rows.find((r) => r.schemeCode === YOUNG)!;
      expect(young.ratingStatus).toBe('INSUFFICIENT_HISTORY');
      expect(young.diagnostics.historyMonths).toBe(30);
      expect(young.rating).toBeNull();
      expect(young.composite).toBeNull();
      // Pillars still reported where computable: no 3y rank ⇒ PERFORMANCE
      // null, but its TER was ranked at horizon 0 ⇒ COST scored.
      expect(young.pillars['PERFORMANCE']!.score).toBeNull();
      expect(young.pillars['COST']!.score).not.toBeNull();
      expect(young.pillars['PERFORMANCE']!.inputs['sortino']!.status).toBe('INSUFFICIENT_DATA');
      // The rating pool is the 12 rated peers; that is the n the copy needs.
      expect(young.universeSize).toBe(12);
    });

    it('persists composite and rating as stored Decimal / int, and the pool size', async () => {
      const rows = await loadRows(SUB_RATED, 'score-active-equity-v1');
      expect(rows).toHaveLength(13);
      const rated = rows.filter((r) => r.ratingStatus === 'RATED');
      expect(rated).toHaveLength(12);
      for (const r of rated) {
        expect(r.composite).not.toBeNull();
        const c = toDecimal(r.composite!);
        expect(c.greaterThanOrEqualTo(0) && c.lessThanOrEqualTo(100)).toBe(true);
        expect([1, 2, 3, 4, 5]).toContain(r.rating);
        expect(r.universeSize).toBe(12);
        expect(r.modelKey).toBe('ACTIVE_EQUITY');
      }
      // Rating is monotone in composite (ties go up, but there are none here).
      const sorted = [...rated].sort((a, b) => toDecimal(b.composite!).comparedTo(toDecimal(a.composite!)));
      for (let i = 1; i < sorted.length; i++) {
        expect(sorted[i]!.rating!).toBeLessThanOrEqual(sorted[i - 1]!.rating!);
      }
      expect(sorted[0]!.rating).toBe(5);
      expect(sorted[sorted.length - 1]!.rating).toBe(1);
      // The best numbers in the category belong to the IDCW option, which is
      // not in the universe — so the top of the table is a growth member.
      expect(sorted[0]!.schemeCode).toBe(RATED_CODES[11]);
    });

    it('stores the §10 explainability payload, every numeric a Decimal string', async () => {
      const rows = await loadRows(SUB_RATED, 'score-active-equity-v1');
      const r0 = rows.find((r) => r.schemeCode === RATED_CODES[0])!;
      const pillars = r0.pillars as unknown as Record<string, MfPillarScore>;

      assertNoJsNumbers(pillars);
      // Key *sets*, not order: the column is jsonb, which canonicalises order.
      expect(Object.keys(pillars).sort()).toEqual(
        ['PERFORMANCE', 'CONSISTENCY', 'DOWNSIDE', 'COST', 'PORTFOLIO', 'PEOPLE_PARENT'].sort(),
      );

      const sortino = pillars['PERFORMANCE']!.inputs['sortino']!;
      expect(Object.keys(sortino).sort()).toEqual(
        ['value', 'percentile', 'status', 'universeMedian', 'weight', 'horizonBlend'].sort(),
      );
      expect(sortino.status).toBe('OK');
      // Sortino 1 among 1..12, no ties: (0 + 0.5) / 12.
      expect(sortino.value).toBe('1.000000');
      expect(sortino.percentile).toBe(new Decimal(0.5).dividedBy(12).toFixed(6));
      expect(sortino.universeMedian).toBe('6.500000');
      expect(sortino.horizonBlend).toEqual({
        '3': sortino.percentile,
        '5': sortino.percentile,
        '10': sortino.percentile,
      });
      for (const k of ['value', 'percentile', 'universeMedian', 'weight'] as const) {
        expect(sortino[k]).toMatch(DECIMAL_STRING);
      }

      // Applied weights re-normalise across the inputs that scored, and the
      // pillar weights across the pillars that scored.
      const perfInputs = Object.values(pillars['PERFORMANCE']!.inputs);
      const inputWeightSum = perfInputs.reduce((acc, i) => acc.plus(i.weight), new Decimal(0));
      expect(inputWeightSum.toFixed(4)).toBe('1.0000');
      const pillarWeightSum = Object.values(pillars).reduce(
        (acc, p) => acc.plus(p.weight),
        new Decimal(0),
      );
      expect(pillarWeightSum.toFixed(4)).toBe('1.0000');

      // Structural input: percentile from the horizon-0 rank, no blend key.
      const ter = pillars['COST']!.inputs['terPercentile']!;
      expect(ter.status).toBe('OK');
      expect(ter.horizonBlend).toBeUndefined();
      expect(ter.value).toMatch(DECIMAL_STRING);
      expect(ter.universeMedian).toMatch(DECIMAL_STRING);

      // Locally-ranked profile input.
      const active = pillars['PORTFOLIO']!.inputs['activeShare']!;
      expect(active.status).toBe('OK');
      expect(active.percentile).toMatch(DECIMAL_STRING);
      // Missing profile inputs are null WITH a status, never 0.
      expect(pillars['PORTFOLIO']!.inputs['hhi']).toEqual({
        value: null, percentile: null, status: 'INSUFFICIENT_DATA', universeMedian: null, weight: '0.000000',
      });
      // Raw 0-1 score, not a percentile: clean AMC ⇒ 1.
      expect(pillars['PEOPLE_PARENT']!.inputs['amcQualitativeScore']!.percentile).toBe('1.000000');
    });
  });

  describe('append-only (§11.8, 06 §1 mf-score-append-only)', () => {
    it('a same-day re-run writes nothing and leaves every row byte-identical', async () => {
      const before = await loadRows(SUB_RATED, 'score-active-equity-v1');
      expect(before).toHaveLength(13);

      const again = await runAsSystem(() => scoreUniverse(refFor(SUB_RATED), ASOF));
      expect(again.scored).toBe(13);
      expect(again.written).toBe(0);
      expect(again.skippedExisting).toBe(13);

      const after = await loadRows(SUB_RATED, 'score-active-equity-v1');
      expect(JSON.stringify(after)).toBe(JSON.stringify(before));
    });

    it('a bumped methodologyVersion writes a second row beside the first, which stays byte-identical', async () => {
      const before = await loadRows(SUB_RATED, 'score-active-equity-v1');
      versionOverride.suffix = `-test${RUN}`;
      try {
        const bumped = await runAsSystem(() => scoreUniverse(refFor(SUB_RATED), ASOF));
        expect(bumped.methodologyVersion).toBe(`score-active-equity-v1-test${RUN}`);
        expect(bumped.written).toBe(13);
        expect(bumped.skippedExisting).toBe(0);
      } finally {
        versionOverride.suffix = '';
      }

      const all = await loadRows(SUB_RATED);
      expect(all).toHaveLength(26);
      const v1 = all.filter((r) => r.methodologyVersion === 'score-active-equity-v1');
      const v2 = all.filter((r) => r.methodologyVersion === `score-active-equity-v1-test${RUN}`);
      expect(v1).toHaveLength(13);
      expect(v2).toHaveLength(13);
      expect(JSON.stringify(v1)).toBe(JSON.stringify(before));
      // Same inputs, same maths ⇒ the new version's payload is identical too;
      // only the version string and the row identity differ.
      for (const row of v2) {
        const twin = v1.find((r) => r.schemeCode === row.schemeCode)!;
        expect(JSON.stringify(row.pillars)).toBe(JSON.stringify(twin.pillars));
        expect(row.composite?.toString() ?? null).toBe(twin.composite?.toString() ?? null);
        expect(row.rating).toBe(twin.rating);
        expect(row.id).not.toBe(twin.id);
      }
    });

    it('the service has no update path at all', async () => {
      const source = await readFile(
        fileURLToPath(
          new URL('../../../../src/services/mfAnalytics/mfScoring/mfScore.service.ts', import.meta.url),
        ),
        'utf8',
      );
      for (const verb of ['update', 'updateMany', 'upsert', 'delete', 'deleteMany']) {
        expect(source, `mfSchemeScore.${verb}(`).not.toMatch(new RegExp(`mfSchemeScore\\s*\\.\\s*${verb}\\s*\\(`));
      }
      expect(source).toMatch(/mfSchemeScore\s*\.\s*createMany\s*\(/);
      expect(source).not.toMatch(/prisma\.\$transaction\s*\(/);
      expect(MF_SCORE_SERVICE_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
    });
  });

  describe('IDCW → growth sibling (§11.9)', () => {
    it('scoreScheme on an IDCW option resolves the growth sibling and writes no row under the IDCW code', async () => {
      const outcome = await runAsSystem(() => scoreScheme(IDCW, ASOF));
      expect(outcome.requestedSchemeCode).toBe(IDCW);
      expect(outcome.scoredSchemeCode).toBe(RATED_CODES[0]);
      expect(outcome.ratingStatus).toBe('RATED');
      expect(outcome.row!.schemeCode).toBe(RATED_CODES[0]);
      // The universe was already scored: delegating did not re-write it.
      expect(outcome.universe!.written).toBe(0);

      const mirror = await prisma.mfSchemeScore.findMany({ where: { schemeCode: IDCW } });
      expect(mirror).toHaveLength(0);
    });

    it('getScoreForScheme on the IDCW option returns the sibling row', async () => {
      const viaIdcw = await getScoreForScheme(IDCW, { asOf: ASOF, methodologyVersion: 'score-active-equity-v1' });
      const direct = await getScoreForScheme(RATED_CODES[0]!, { asOf: ASOF, methodologyVersion: 'score-active-equity-v1' });
      expect(viaIdcw).not.toBeNull();
      expect(viaIdcw!.schemeCode).toBe(RATED_CODES[0]);
      expect(viaIdcw!.id).toBe(direct!.id);
      expect(viaIdcw!.rating).toBe(direct!.rating);
      expect(viaIdcw!.composite!.toString()).toBe(direct!.composite!.toString());
    });

    it('an IDCW option with no resolved sibling is NOT_APPLICABLE, not scored off its own NAV', async () => {
      const outcome = await runAsSystem(() => scoreScheme(IDCW_ORPHAN, ASOF));
      expect(outcome.ratingStatus).toBe('NOT_APPLICABLE');
      expect(outcome.reason).toBe('no_growth_sibling');
      expect(outcome.row).toBeNull();
      expect(await getScoreForScheme(IDCW_ORPHAN)).toBeNull();
      expect(await prisma.mfSchemeScore.count({ where: { schemeCode: IDCW_ORPHAN } })).toBe(0);
    });
  });

  describe('small universe (§11.7)', () => {
    it('8 schemes ⇒ CATEGORY_TOO_SMALL for all, pillars still published, nothing rated', async () => {
      const result = await runAsSystem(() => scoreUniverse(refFor(SUB_SMALL), ASOF));
      expect(result.scored).toBe(8);
      expect(result.ratingStatusCounts.CATEGORY_TOO_SMALL).toBe(8);
      expect(result.ratingStatusCounts.RATED).toBe(0);
      for (const row of result.rows) {
        expect(row.universeSize).toBe(8);
        expect(row.composite).toBeNull();
        expect(row.rating).toBeNull();
        expect(row.pillars['PERFORMANCE']!.score).not.toBeNull();
        expect(row.diagnostics.compositeBeforeGate).not.toBeNull();
      }
      const stored = await loadRows(SUB_SMALL);
      expect(stored).toHaveLength(8);
      expect(stored.every((r) => r.composite === null && r.rating === null)).toBe(true);
    });
  });

  describe('no model applies', () => {
    it('an UNMAPPED scheme is NOT_APPLICABLE and nothing is persisted', async () => {
      const outcome = await runAsSystem(() => scoreScheme(UNMAPPED, ASOF));
      expect(outcome.ratingStatus).toBe('NOT_APPLICABLE');
      expect(outcome.reason).toBe('unmapped_subcategory');
      expect(outcome.row).toBeNull();
      expect(await prisma.mfSchemeScore.count({ where: { schemeCode: UNMAPPED } })).toBe(0);
    });

    it('an unknown scheme is NOT_APPLICABLE with scheme_not_found', async () => {
      const outcome = await runAsSystem(() => scoreScheme(`S${RUN}NOPE`, ASOF));
      expect(outcome.ratingStatus).toBe('NOT_APPLICABLE');
      expect(outcome.reason).toBe('scheme_not_found');
    });

    it('scoreUniverse refuses an UNMAPPED universe outright', async () => {
      await expect(
        runAsSystem(() => scoreUniverse(refFor('UNMAPPED'), ASOF)),
      ).rejects.toThrow(/no scoring model/);
    });
  });

  describe('job', () => {
    it('reports skipped rows on a re-run and continues past a failing universe', async () => {
      const result = await runAsSystem(() =>
        runMfScoreForUniverses([refFor(SUB_RATED), refFor('UNMAPPED'), refFor(SUB_SMALL)], ASOF),
      );
      expect(result.universes).toBe(3);
      expect(result.succeeded).toBe(2);
      expect(result.failed).toBe(1);
      expect(result.scored).toBe(21);
      expect(result.rowsWritten).toBe(0);
      expect(result.rowsSkippedExisting).toBe(21);
      expect(result.ratingStatusCounts.RATED).toBe(12);
      expect(result.ratingStatusCounts.CATEGORY_TOO_SMALL).toBe(8);
      expect(result.ratingStatusCounts.INSUFFICIENT_HISTORY).toBe(1);
    });
  });
});
