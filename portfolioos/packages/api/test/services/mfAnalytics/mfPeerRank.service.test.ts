/**
 * Integration tests for `mfPeerRank.service.ts` (`07` Task 2.4 acceptance).
 *
 * These run against the local Postgres because the thing under test is a
 * *selection* — which rows end up in which universe — and a selection asserted
 * against a hand-built in-memory array proves nothing about the query that
 * builds it. The percentile arithmetic itself is covered by
 * `mfScoring/mfScoreMath.test.ts`; what is asserted here is the wiring.
 *
 * Every scheme code carries a per-run prefix so parallel work on the same dev
 * database cannot collide, and cleanup deletes by that prefix.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { Decimal, toDecimal, universeKey } from '@portfolioos/shared';
import type { MfPlanType, MfOptionType, MfSchemeStatus } from '@portfolioos/shared';
import { prisma } from '../../../src/lib/prisma.js';
import { runAsSystem } from '../../../src/lib/requestContext.js';
import {
  runPeerRankForUniverse,
  parsePeerRankPayload,
  resolveRankableSchemeCode,
  getPeerRankForScheme,
  listUniverses,
  isUniverseEligible,
  medianOf,
  quartileFromRank,
  STRUCTURAL_HORIZON,
  type UniverseRef,
} from '../../../src/services/mfAnalytics/mfPeerRank.service.js';
import { costHighTerRule } from '../../../src/services/mfAnalytics/rules/cost.high-ter.js';
import { makeFacts, makeFundFacts, SCHEME } from './rules/_facts.fixture.js';

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

const RUN = randomUUID().slice(0, 8).toUpperCase();
const ASOF = new Date(Date.UTC(2026, 0, 1)); // 2026-01-01

/** Every code this file creates, so cleanup is exact rather than by pattern. */
const createdSchemeCodes: string[] = [];

function code(label: string): string {
  const c = `T${RUN}${label}`;
  createdSchemeCodes.push(c);
  return c;
}

interface SeedSchemeOpts {
  schemeCode: string;
  sebiSubCategory: string;
  planType?: MfPlanType;
  optionType?: MfOptionType;
  status?: MfSchemeStatus;
  /** Years before ASOF that the NAV series (and inception) starts. */
  historyYears?: number;
  /** Constant annual growth of the synthetic NAV series. 0.12 = 12%/yr. */
  annualGrowth?: number;
  statusChangedAt?: Date | null;
  growthSiblingSchemeCode?: string | null;
  /** Horizon → metrics status. Absent horizons get no metrics row at all. */
  metrics?: Record<number, { status: string; sortino?: string }>;
  /**
   * Seed the horizon-0 `MfCurrentProfile` row. Absent means the scheme has no
   * profile at all, which is the one thing that keeps it out of the structural
   * universe.
   */
  profile?: ProfileSeed;
}

interface ProfileSeed {
  /** Percent units: '0.450000' is a 0.45%/yr expense ratio. */
  terPct?: string | null;
  /** Rupees, NOT crore — matching `MfSchemeAum.aum`. */
  aum?: string | null;
}

/**
 * Synthetic NAV: one point every three days, compounding at a constant annual
 * rate. Three days keeps the series inside `WINDOW_START_TOLERANCE_DAYS` (7)
 * at every window start while keeping the fixture to ~1k rows per scheme
 * rather than ~5k.
 */
function navPoints(historyYears: number, annualGrowth: number): Array<{ date: Date; value: Decimal }> {
  const start = new Date(
    Date.UTC(ASOF.getUTCFullYear() - historyYears, ASOF.getUTCMonth(), ASOF.getUTCDate()),
  );
  const dayMs = 24 * 60 * 60 * 1000;
  const totalDays = Math.floor((ASOF.getTime() - start.getTime()) / dayMs);
  const growth = toDecimal(1).plus(toDecimal(annualGrowth));
  const out: Array<{ date: Date; value: Decimal }> = [];
  for (let d = 0; d <= totalDays; d += 3) {
    const date = new Date(start.getTime() + d * dayMs);
    const years = toDecimal(d).dividedBy(toDecimal(365));
    out.push({ date, value: toDecimal(100).times(growth.pow(years)) });
  }
  // Always pin the terminal point exactly on ASOF so horizonCagr has an end.
  const lastYears = toDecimal(totalDays).dividedBy(toDecimal(365));
  out.push({ date: ASOF, value: toDecimal(100).times(growth.pow(lastYears)) });
  return out;
}

function metricsJson(horizonYears: number, sortino: string | undefined) {
  return {
    asOf: ASOF.toISOString(),
    horizonYears,
    observationsMonthly: horizonYears * 12,
    status: 'OK',
    benchmarkCode: null,
    riskFreeSeries: null,
    mathVersion: 'metrics-v1',
    returns: { cagr: null, absolute: null, benchmarkCagr: null, categoryMedianCagr: null,
      rolling1y: null, rolling3y: null, rolling5y: null, calendarYears: [], sipXirr: null },
    risk: {},
    riskAdjusted: sortino === undefined ? {} : { sortino },
    relative: {},
    consistency: {},
    fieldStatus: {},
  };
}

async function seedScheme(opts: SeedSchemeOpts): Promise<void> {
  const historyYears = opts.historyYears ?? 8;
  const inception = new Date(
    Date.UTC(ASOF.getUTCFullYear() - historyYears, ASOF.getUTCMonth(), ASOF.getUTCDate()),
  );

  await prisma.mfSchemeMeta.create({
    data: {
      schemeCode: opts.schemeCode,
      isin: null,
      schemeName: `Fixture ${opts.schemeCode}`,
      amcCode: 'FIXAMC',
      amcName: 'Fixture AMC',
      sebiCategory: 'EQUITY',
      sebiSubCategory: opts.sebiSubCategory,
      planType: opts.planType ?? 'DIRECT',
      optionType: opts.optionType ?? 'GROWTH',
      inceptionDate: inception,
      status: opts.status ?? 'ACTIVE',
      statusChangedAt: opts.statusChangedAt ?? null,
      growthSiblingSchemeCode: opts.growthSiblingSchemeCode ?? null,
      sourceHash: `fixture-${opts.schemeCode}`,
      fetchedAt: ASOF,
    },
  });

  if (opts.annualGrowth !== undefined) {
    const fund = await prisma.mutualFundMaster.create({
      data: {
        schemeCode: opts.schemeCode,
        schemeName: `Fixture ${opts.schemeCode}`,
        amcName: 'Fixture AMC',
        category: 'EQUITY',
      },
    });
    const points = navPoints(historyYears, opts.annualGrowth);
    await prisma.mFNav.createMany({
      data: points.map((p) => ({
        fundId: fund.id,
        date: p.date,
        nav: p.value.toFixed(4),
        adjustedNav: p.value.toFixed(6),
      })),
      skipDuplicates: true,
    });
  }

  if (opts.profile !== undefined) {
    await prisma.mfSchemeMetrics.create({
      data: {
        schemeCode: opts.schemeCode,
        asOf: ASOF,
        horizonYears: 0,
        // Not 'OK': see `profileJson`. Structural membership must not depend
        // on the portfolio-snapshot status.
        status: 'INSUFFICIENT_DATA',
        statusReason: 'no_portfolio_snapshot',
        metrics: profileJson(opts.profile) as never,
        mathVersion: 'metrics-v1',
      },
    });
  }

  for (const [h, m] of Object.entries(opts.metrics ?? {})) {
    const horizonYears = Number.parseInt(h, 10);
    await prisma.mfSchemeMetrics.create({
      data: {
        schemeCode: opts.schemeCode,
        asOf: ASOF,
        horizonYears,
        status: m.status as never,
        metrics: metricsJson(horizonYears, m.sortino) as never,
        mathVersion: 'metrics-v1',
      },
    });
  }
}


/**
 * A horizon-0 `MfCurrentProfile` as `mfMetrics.service.computeProfile` emits
 * it *before* the peer-rank job has run: `terPct` / `aum` populated from the
 * meta tables, and the three universe-derived fields null with a status
 * beside each (`02 §8`).
 *
 * `status: 'INSUFFICIENT_DATA'` is deliberate and load-bearing. That status
 * describes the missing *portfolio snapshot*, not the expense ratio, and the
 * structural universe must ignore it — a fund that has never disclosed its
 * holdings still has a published TER that is perfectly rankable.
 */
function profileJson(seed: ProfileSeed) {
  const terPct = seed.terPct ?? null;
  const aum = seed.aum ?? null;
  const fieldStatus: Record<string, string> = {};
  if (terPct === null) fieldStatus['terPct'] = 'INSUFFICIENT_DATA';
  if (aum === null) fieldStatus['aum'] = 'INSUFFICIENT_DATA';
  fieldStatus['terCategoryMedianPct'] = 'INSUFFICIENT_DATA';
  fieldStatus['terPercentile'] = 'INSUFFICIENT_DATA';
  fieldStatus['aumCategoryPercentile'] = 'INSUFFICIENT_DATA';

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
    activeShare: null,
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
    aum,
    aumGrowth12mPct: null,
    aumCategoryPercentile: null,
    managerTenureYears: null,
    managerChangesLast3y: 0,
    currentManagers: [],
    fundAgeYears: null,
    exitLoadMaxDays: null,
    fieldStatus,
  };
}

/** The stored horizon-0 profile for one scheme, as the consumers read it. */
async function loadProfile(schemeCode: string): Promise<Record<string, unknown>> {
  const row = await prisma.mfSchemeMetrics.findUnique({
    where: {
      schemeCode_asOf_horizonYears: {
        schemeCode,
        asOf: ASOF,
        horizonYears: STRUCTURAL_HORIZON,
      },
    },
    select: { metrics: true },
  });
  return row!.metrics as unknown as Record<string, unknown>;
}

/** The horizon-0 `MfPeerRank` rows for one universe. */
async function loadStructuralRows(sub: string, planType: MfPlanType = 'DIRECT') {
  return (await loadRows(sub, planType)).filter((r) => r.horizonYears === STRUCTURAL_HORIZON);
}

function refFor(sub: string, planType: MfPlanType = 'DIRECT'): UniverseRef {
  return { universeKey: universeKey(sub, planType), sebiSubCategory: sub, planType };
}

async function loadRows(sub: string, planType: MfPlanType = 'DIRECT') {
  const rows = await prisma.mfPeerRank.findMany({
    where: { universeKey: universeKey(sub, planType), asOf: ASOF },
    orderBy: [{ horizonYears: 'asc' }, { schemeCode: 'asc' }],
  });
  return rows.map((r) => parsePeerRankPayload(r));
}

// ---------------------------------------------------------------------------
// Sub-categories used, one per concern, so tests cannot contaminate each other
// ---------------------------------------------------------------------------

const SUB_TIES = 'Large Cap Fund';
const SUB_IDCW = 'Mid Cap Fund';
const SUB_MERGED = 'Small Cap Fund';
const SUB_PLANS = 'Flexi Cap Fund';
const SUB_HORIZON = 'Focused Fund';
const SUB_SMALL = 'Value Fund';
const SUB_UNMAPPED = 'UNMAPPED';
// Horizon-0 structural universes, one concern each.
const SUB_TER = 'Contra Fund';
const SUB_AUM = 'ELSS';
const SUB_YOUNG = 'Multi Cap Fund';

// ---------------------------------------------------------------------------

describe('mfPeerRank.service', () => {
  beforeAll(async () => {
    await runAsSystem(async () => {
      // ── ties universe: sortinos 1, 1, 2, 3, 3 ────────────────────────────
      const tieValues = ['1', '1', '2', '3', '3'];
      for (let i = 0; i < tieValues.length; i++) {
        await seedScheme({
          schemeCode: code(`TIE${i}`),
          sebiSubCategory: SUB_TIES,
          metrics: { 3: { status: 'OK', sortino: tieValues[i] } },
        });
      }

      // ── IDCW exclusion: 3 growth + 1 IDCW sibling of the first ───────────
      const growth0 = code('IDG0');
      await seedScheme({
        schemeCode: growth0,
        sebiSubCategory: SUB_IDCW,
        metrics: { 3: { status: 'OK', sortino: '1.5' } },
      });
      for (let i = 1; i < 3; i++) {
        await seedScheme({
          schemeCode: code(`IDG${i}`),
          sebiSubCategory: SUB_IDCW,
          metrics: { 3: { status: 'OK', sortino: `${1 + i}` } },
        });
      }
      await seedScheme({
        schemeCode: code('IDCW0'),
        sebiSubCategory: SUB_IDCW,
        optionType: 'IDCW_PAYOUT',
        growthSiblingSchemeCode: growth0,
        // Deliberately given OK metrics: exclusion must come from optionType,
        // not from the metrics row happening to be absent.
        metrics: { 3: { status: 'OK', sortino: '9' } },
      });

      // ── MERGED: 3 active + 1 merged that overlaps the window ─────────────
      const activeGrowths = [0.1, 0.12, 0.14];
      for (let i = 0; i < activeGrowths.length; i++) {
        await seedScheme({
          schemeCode: code(`MRA${i}`),
          sebiSubCategory: SUB_MERGED,
          annualGrowth: activeGrowths[i],
          metrics: { 3: { status: 'OK', sortino: `${1 + i}` } },
        });
      }
      await seedScheme({
        schemeCode: code('MRDEAD'),
        sebiSubCategory: SUB_MERGED,
        status: 'MERGED',
        // Died six months before asOf, so its history covers most of the 3y
        // window and it belongs in the median.
        statusChangedAt: new Date(Date.UTC(2025, 6, 1)),
        annualGrowth: -0.2,
        // A merged scheme has no metrics rows — the metrics job runs for ACTIVE
        // schemes only. Its median membership must come from NAV coverage.
      });

      // ── DIRECT vs REGULAR ────────────────────────────────────────────────
      for (let i = 0; i < 3; i++) {
        await seedScheme({
          schemeCode: code(`PLD${i}`),
          sebiSubCategory: SUB_PLANS,
          planType: 'DIRECT',
          metrics: { 3: { status: 'OK', sortino: `${1 + i}` } },
        });
      }
      for (let i = 0; i < 4; i++) {
        await seedScheme({
          schemeCode: code(`PLR${i}`),
          sebiSubCategory: SUB_PLANS,
          planType: 'REGULAR',
          metrics: { 3: { status: 'OK', sortino: `${1 + i}` } },
        });
      }

      // ── per-horizon membership: two schemes have 5y, one has 3y only ─────
      for (let i = 0; i < 2; i++) {
        await seedScheme({
          schemeCode: code(`HZL${i}`),
          sebiSubCategory: SUB_HORIZON,
          metrics: {
            3: { status: 'OK', sortino: `${1 + i}` },
            5: { status: 'OK', sortino: `${1 + i}` },
          },
        });
      }
      await seedScheme({
        schemeCode: code('HZSHORT'),
        sebiSubCategory: SUB_HORIZON,
        historyYears: 4,
        metrics: {
          3: { status: 'OK', sortino: '5' },
          5: { status: 'INSUFFICIENT_DATA' },
        },
      });

      // ── small universe: exactly 8 ────────────────────────────────────────
      for (let i = 0; i < 8; i++) {
        await seedScheme({
          schemeCode: code(`SML${i}`),
          sebiSubCategory: SUB_SMALL,
          metrics: { 3: { status: 'OK', sortino: `${i + 1}` } },
        });
      }

      // ── UNMAPPED ─────────────────────────────────────────────────────────
      await seedScheme({
        schemeCode: code('UNMAP0'),
        sebiSubCategory: SUB_UNMAPPED,
        metrics: { 3: { status: 'OK', sortino: '2' } },
      });

      // ── horizon-0 TER universe: 5 funds with a TER + 1 with none ─────────
      //
      // No NAV and no return-horizon metrics rows anywhere in this universe:
      // an expense ratio is rankable without a single day of history, and if
      // any of these assertions ever needed a NAV series the membership rule
      // would have quietly acquired a return-history gate.
      const terValues = ['0.200000', '0.200000', '0.500000', '1.000000', '1.500000'];
      for (let i = 0; i < terValues.length; i++) {
        await seedScheme({
          schemeCode: code(`TER${i}`),
          sebiSubCategory: SUB_TER,
          profile: { terPct: terValues[i] },
        });
      }
      // In the universe (it has an AUM) but with no expense ratio on file.
      await seedScheme({
        schemeCode: code('TERNONE'),
        sebiSubCategory: SUB_TER,
        profile: { terPct: null, aum: '1000000000.0000' },
      });

      // ── horizon-0 AUM universe: two funds at/above the plateau cap ───────
      // ₹50,000cr, ₹10,000cr (exactly AUM_PLATEAU_CAP_INR), ₹1,000cr, ₹10cr.
      const aumValues = ['500000000000.0000', '100000000000.0000', '10000000000.0000', '100000000.0000'];
      for (let i = 0; i < aumValues.length; i++) {
        await seedScheme({
          schemeCode: code(`AUM${i}`),
          sebiSubCategory: SUB_AUM,
          profile: { aum: aumValues[i] },
        });
      }

      // ── horizon-0 vs horizon-3 membership: one 12-month fund ─────────────
      await seedScheme({
        schemeCode: code('YNGA'),
        sebiSubCategory: SUB_YOUNG,
        profile: { terPct: '0.400000' },
        metrics: { 3: { status: 'OK', sortino: '1' } },
      });
      await seedScheme({
        schemeCode: code('YNGB'),
        sebiSubCategory: SUB_YOUNG,
        profile: { terPct: '0.800000' },
        metrics: { 3: { status: 'OK', sortino: '2' } },
      });
      // Twelve months old: no 3-year metrics, but a published TER.
      await seedScheme({
        schemeCode: code('YNGNEW'),
        sebiSubCategory: SUB_YOUNG,
        historyYears: 1,
        profile: { terPct: '0.100000' },
        metrics: { 3: { status: 'INSUFFICIENT_DATA' } },
      });
    });
  }, 120_000);

  afterAll(async () => {
    await runAsSystem(async () => {
      await prisma.mfPeerRank.deleteMany({ where: { schemeCode: { in: createdSchemeCodes } } });
      await prisma.mfSchemeMetrics.deleteMany({
        where: { schemeCode: { in: createdSchemeCodes } },
      });
      await prisma.mfSchemeMeta.deleteMany({ where: { schemeCode: { in: createdSchemeCodes } } });
      const funds = await prisma.mutualFundMaster.findMany({
        where: { schemeCode: { in: createdSchemeCodes } },
        select: { id: true },
      });
      if (funds.length > 0) {
        await prisma.mFNav.deleteMany({ where: { fundId: { in: funds.map((f) => f.id) } } });
        await prisma.mutualFundMaster.deleteMany({
          where: { id: { in: funds.map((f) => f.id) } },
        });
      }
    });
  }, 120_000);

  // -------------------------------------------------------------------------

  describe('pure helpers', () => {
    it('medianOf averages the middle pair on an even count and returns null on empty', () => {
      expect(medianOf([]) ).toBeNull();
      expect(medianOf([toDecimal(1), toDecimal(3)])!.toString()).toBe('2');
      expect(medianOf([toDecimal(1), toDecimal(2), toDecimal(9)])!.toString()).toBe('2');
    });

    it('quartileFromRank puts rank 1 in Q1 and the last rank in Q4', () => {
      expect(quartileFromRank(1, 40)).toBe(1);
      expect(quartileFromRank(10, 40)).toBe(1);
      expect(quartileFromRank(11, 40)).toBe(2);
      expect(quartileFromRank(40, 40)).toBe(4);
      expect(quartileFromRank(1, 0)).toBeNull();
    });

    it('isUniverseEligible rejects UNMAPPED, IDCW and SUSPENDED schemes', () => {
      const base = {
        schemeCode: 'X',
        sebiSubCategory: 'Large Cap Fund',
        planType: 'DIRECT' as const,
        optionType: 'GROWTH' as const,
        status: 'ACTIVE' as const,
        inceptionDate: new Date(0),
        statusChangedAt: null,
        growthSiblingSchemeCode: null,
      };
      expect(isUniverseEligible(base)).toBe(true);
      expect(isUniverseEligible({ ...base, sebiSubCategory: 'UNMAPPED' })).toBe(false);
      expect(isUniverseEligible({ ...base, optionType: 'IDCW_PAYOUT' })).toBe(false);
      expect(isUniverseEligible({ ...base, optionType: 'IDCW_REINVEST' })).toBe(false);
      expect(isUniverseEligible({ ...base, status: 'SUSPENDED' })).toBe(false);
      // MERGED stays eligible: it is excluded from ranking later, not here,
      // because it is still wanted for the survivorship-adjusted median.
      expect(isUniverseEligible({ ...base, status: 'MERGED' })).toBe(true);
    });

    it('resolveRankableSchemeCode maps IDCW to its growth sibling, or null', () => {
      expect(
        resolveRankableSchemeCode({
          schemeCode: 'A',
          optionType: 'GROWTH',
          growthSiblingSchemeCode: null,
        }),
      ).toBe('A');
      expect(
        resolveRankableSchemeCode({
          schemeCode: 'A-IDCW',
          optionType: 'IDCW_REINVEST',
          growthSiblingSchemeCode: 'A',
        }),
      ).toBe('A');
      expect(
        resolveRankableSchemeCode({
          schemeCode: 'A-IDCW',
          optionType: 'IDCW_PAYOUT',
          growthSiblingSchemeCode: null,
        }),
      ).toBeNull();
    });
  });

  // -------------------------------------------------------------------------

  it('percentiles use the (worse + 0.5·equal)/n tie rule', async () => {
    await runAsSystem(() => runPeerRankForUniverse(refFor(SUB_TIES), ASOF));
    const rows = (await loadRows(SUB_TIES)).filter((r) => r.horizonYears === 3);

    expect(rows).toHaveLength(5);
    const bySortino = new Map(rows.map((r) => [r.peer.percentiles.sortino, r]));
    // sortinos 1,1,2,3,3 → 0.2, 0.5, 0.8
    expect([...bySortino.keys()].sort()).toEqual(['0.200000', '0.500000', '0.800000']);
    for (const r of rows) {
      expect(r.peer.universeSize).toBe(5);
      // The median accompanying a percentile comes from the same (ranking)
      // universe, so the explanation stays internally consistent.
      expect(r.peer.medians.sortino).toBe('2.000000');
    }
  });

  it('excludes IDCW options from the universe and resolves them to the growth sibling', async () => {
    await runAsSystem(() => runPeerRankForUniverse(refFor(SUB_IDCW), ASOF));
    const rows = (await loadRows(SUB_IDCW)).filter((r) => r.horizonYears === 3);

    const idcwCode = createdSchemeCodes.find((c) => c.endsWith('IDCW0'))!;
    const growthCode = createdSchemeCodes.find((c) => c.endsWith('IDG0'))!;

    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.schemeCode)).not.toContain(idcwCode);
    for (const r of rows) expect(r.peer.universeSize).toBe(3);

    const resolved = await runAsSystem(() => getPeerRankForScheme(idcwCode, ASOF, 3));
    expect(resolved).not.toBeNull();
    expect(resolved!.schemeCode).toBe(growthCode);
    expect(resolved!.peer.percentiles.sortino).toBe(
      rows.find((r) => r.schemeCode === growthCode)!.peer.percentiles.sortino,
    );
  });

  it('excludes UNMAPPED schemes from every universe', async () => {
    const unmapped = createdSchemeCodes.find((c) => c.endsWith('UNMAP0'))!;
    const universes = await runAsSystem(() => listUniverses());
    expect(universes.map((u) => u.sebiSubCategory)).not.toContain('UNMAPPED');

    // Even if the universe is asked for by name, the scheme is not eligible
    // and no row is produced.
    await runAsSystem(() =>
      runPeerRankForUniverse(
        { universeKey: universeKey('UNMAPPED', 'DIRECT'), sebiSubCategory: 'UNMAPPED', planType: 'DIRECT' },
        ASOF,
      ),
    );
    const rows = await prisma.mfPeerRank.findMany({ where: { schemeCode: unmapped } });
    expect(rows).toHaveLength(0);
  });

  it('excludes MERGED schemes from ranking but includes them in the median', async () => {
    await runAsSystem(() => runPeerRankForUniverse(refFor(SUB_MERGED), ASOF));
    const rows = (await loadRows(SUB_MERGED)).filter((r) => r.horizonYears === 3);
    const dead = createdSchemeCodes.find((c) => c.endsWith('MRDEAD'))!;

    // (a) the dead scheme is not ranked
    expect(rows.map((r) => r.schemeCode)).not.toContain(dead);
    expect(rows).toHaveLength(3);
    for (const r of rows) expect(r.peer.universeSize).toBe(3);

    // (b) but it IS in the median selection — the two selections genuinely differ
    const derived = rows[0]!.universeDerived!;
    expect(derived.medianUniverseSize).toBe(4);
    expect(derived.survivorshipAdjusted).toBe(true);

    // (c) and it moves the median. Ranking universe CAGRs are ~10/12/14%
    // (median ~12%); adding a fund that lost 20% a year pulls the median down
    // to roughly the midpoint of 10% and 12%. Excluding it would flatter every
    // survivor — the bias `02 §6` requires us to correct.
    const median = toDecimal(derived.categoryMedianCagr!);
    expect(median.lessThan(toDecimal('0.12'))).toBe(true);
    expect(median.greaterThan(toDecimal('0.09'))).toBe(true);

    // (d) the sharpest form of the same point. Ranking universe rolling-3y
    // returns are ~10/12/14%; its median is 12%, so the 12% fund would beat
    // ZERO windows against a survivors-only median. Adding the dead fund makes
    // the per-window-end median ~11% and the 12% fund beats EVERY window. A
    // `1` here is only reachable if the merged scheme is genuinely in the
    // median selection and genuinely out of the ranking one.
    const mid = rows.find((r) => r.schemeCode.endsWith('MRA1'))!;
    expect(mid.universeDerived!.rollingBeatCategoryPct).toBe('1.000000');
    expect(
      rows.find((r) => r.schemeCode.endsWith('MRA0'))!.universeDerived!.rollingBeatCategoryPct,
    ).toBe('0.000000');
  });

  it('ranks DIRECT and REGULAR plans in separate universes', async () => {
    await runAsSystem(() => runPeerRankForUniverse(refFor(SUB_PLANS, 'DIRECT'), ASOF));
    await runAsSystem(() => runPeerRankForUniverse(refFor(SUB_PLANS, 'REGULAR'), ASOF));

    const direct = (await loadRows(SUB_PLANS, 'DIRECT')).filter((r) => r.horizonYears === 3);
    const regular = (await loadRows(SUB_PLANS, 'REGULAR')).filter((r) => r.horizonYears === 3);

    expect(direct).toHaveLength(3);
    expect(regular).toHaveLength(4);
    expect(direct[0]!.peer.universeKey).toBe('Flexi Cap Fund|DIRECT');
    expect(regular[0]!.peer.universeKey).toBe('Flexi Cap Fund|REGULAR');
    for (const r of direct) expect(r.peer.universeSize).toBe(3);
    for (const r of regular) expect(r.peer.universeSize).toBe(4);
    // No scheme appears in both.
    const overlap = direct
      .map((r) => r.schemeCode)
      .filter((c) => regular.some((r) => r.schemeCode === c));
    expect(overlap).toEqual([]);
  });

  it('computes membership per horizon — a 3y-only fund is absent from the 5y universe', async () => {
    await runAsSystem(() => runPeerRankForUniverse(refFor(SUB_HORIZON), ASOF));
    const rows = await loadRows(SUB_HORIZON);
    const short = createdSchemeCodes.find((c) => c.endsWith('HZSHORT'))!;

    const h3 = rows.filter((r) => r.horizonYears === 3);
    const h5 = rows.filter((r) => r.horizonYears === 5);

    expect(h3.map((r) => r.schemeCode)).toContain(short);
    expect(h5.map((r) => r.schemeCode)).not.toContain(short);
    expect(h3).toHaveLength(3);
    expect(h5).toHaveLength(2);
    for (const r of h3) expect(r.peer.universeSize).toBe(3);
    for (const r of h5) expect(r.peer.universeSize).toBe(2);
  });

  it('publishes percentiles for an under-sized universe and reports the size', async () => {
    await runAsSystem(() => runPeerRankForUniverse(refFor(SUB_SMALL), ASOF));
    const rows = (await loadRows(SUB_SMALL)).filter((r) => r.horizonYears === 3);

    expect(rows).toHaveLength(8);
    for (const r of rows) {
      // `03 §1`: metrics and percentiles are still published; only the RATING
      // is withheld, and the caller needs the size to decide that.
      expect(r.peer.universeSize).toBe(8);
      expect(r.peer.percentiles.sortino).toBeDefined();
    }
    // Best of 8 with no ties: (7 worse + 0.5 × 1 equal-to-itself) / 8.
    const best = rows.find((r) => r.peer.percentiles.sortino === '0.937500');
    expect(best).toBeDefined();
    // Worst: (0 + 0.5)/8.
    expect(rows.some((r) => r.peer.percentiles.sortino === '0.062500')).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Horizon-0 structural ranks (TER, AUM)
  // -------------------------------------------------------------------------

  describe('horizon-0 structural ranks', () => {
    it('ranks TER lower-is-better — the cheapest fund gets the highest percentile', async () => {
      await runAsSystem(() => runPeerRankForUniverse(refFor(SUB_TER), ASOF));
      const rows = await loadStructuralRows(SUB_TER);

      // All six are members: five have a TER, the sixth has an AUM.
      expect(rows).toHaveLength(6);
      for (const r of rows) expect(r.peer.universeSize).toBe(6);

      const pctByCode = new Map(rows.map((r) => [r.schemeCode, r.peer.percentiles['terPct']]));
      const at = (label: string) =>
        pctByCode.get(createdSchemeCodes.find((c) => c.endsWith(label))!);

      // TERs 0.20, 0.20, 0.50, 1.00, 1.50 over n = 5, with the
      // (worse + 0.5·equal)/n tie rule and LOWER_IS_BETTER:
      //   0.20 → (3 + 0.5·2)/5 = 0.8   (the two cheapest share the tie group)
      //   0.50 → (2 + 0.5·1)/5 = 0.5
      //   1.00 → (1 + 0.5·1)/5 = 0.3
      //   1.50 → (0 + 0.5·1)/5 = 0.1
      expect(at('TER0')).toBe('0.800000');
      expect(at('TER1')).toBe('0.800000');
      expect(at('TER2')).toBe('0.500000');
      expect(at('TER3')).toBe('0.300000');
      expect(at('TER4')).toBe('0.100000');

      // THE assertion this whole change exists for. If the direction were
      // inverted every number above would still look plausible — an ordered
      // spread from 0.1 to 0.8 — and the COST pillar would reward the
      // priciest fund in every category. Asserted as an ordering too, so an
      // inversion fails even if the tie arithmetic is ever retuned.
      expect(toDecimal(at('TER0')!).greaterThan(toDecimal(at('TER4')!))).toBe(true);
      const ranked = [at('TER0')!, at('TER2')!, at('TER3')!, at('TER4')!];
      for (let i = 1; i < ranked.length; i++) {
        expect(toDecimal(ranked[i - 1]!).greaterThan(toDecimal(ranked[i]!))).toBe(true);
      }
    });

    it('publishes the category TER median on every profile in the universe', async () => {
      await runAsSystem(() => runPeerRankForUniverse(refFor(SUB_TER), ASOF));

      // median of [0.2, 0.2, 0.5, 1.0, 1.5] = 0.5, in percent units.
      for (const label of ['TER0', 'TER2', 'TER4', 'TERNONE']) {
        const profile = await loadProfile(createdSchemeCodes.find((c) => c.endsWith(label))!);
        // Published even to the fund with no TER of its own: the median is a
        // property of the category, and `HIGH_TER`'s counterfactual quotes it.
        expect(profile['terCategoryMedianPct']).toBe('0.500000');
        expect(
          (profile['fieldStatus'] as Record<string, string>)['terCategoryMedianPct'],
        ).toBeUndefined();
      }
    });

    it('gives a fund with no TER on file null with a status — never 0', async () => {
      await runAsSystem(() => runPeerRankForUniverse(refFor(SUB_TER), ASOF));
      const noTer = createdSchemeCodes.find((c) => c.endsWith('TERNONE'))!;

      const profile = await loadProfile(noTer);
      // A zero expense ratio is a real and excellent value. Publishing 0 for
      // "unknown" would tell the user the fund is free.
      expect(profile['terPercentile']).toBeNull();
      expect((profile['fieldStatus'] as Record<string, string>)['terPercentile']).toBe(
        'INSUFFICIENT_DATA',
      );

      // It is still a universe member and still ranked on what it does have.
      const row = (await loadStructuralRows(SUB_TER)).find((r) => r.schemeCode === noTer)!;
      expect(row.peer.percentiles['terPct']).toBeUndefined();
      expect(row.peer.percentiles['aum']).toBe('0.500000');
    });

    it('plateaus AUM at the cap — a huge fund and a merely large one tie at the top', async () => {
      await runAsSystem(() => runPeerRankForUniverse(refFor(SUB_AUM), ASOF));
      const rows = await loadStructuralRows(SUB_AUM);
      expect(rows).toHaveLength(4);

      const pctByCode = new Map(rows.map((r) => [r.schemeCode, r.peer.percentiles['aum']]));
      const at = (label: string) =>
        pctByCode.get(createdSchemeCodes.find((c) => c.endsWith(label))!);

      // ₹50,000cr and ₹10,000cr both clamp to AUM_PLATEAU_CAP_INR and form one
      // tie group: (2 worse + 0.5·2)/4 = 0.75. Past the plateau the marginal
      // rupee is an impact-cost liability, not a quality signal (`03 §1`).
      expect(at('AUM0')).toBe('0.750000');
      expect(at('AUM1')).toBe('0.750000');
      // ₹1,000cr → (1 + 0.5)/4; ₹10cr → 0.5/4.
      expect(at('AUM2')).toBe('0.375000');
      expect(at('AUM3')).toBe('0.125000');
      // Direction: below the cap, bigger is genuinely better.
      expect(toDecimal(at('AUM2')!).greaterThan(toDecimal(at('AUM3')!))).toBe(true);
    });

    it('includes a 12-month fund in the TER universe though it has no 3y record', async () => {
      await runAsSystem(() => runPeerRankForUniverse(refFor(SUB_YOUNG), ASOF));
      const rows = await loadRows(SUB_YOUNG);
      const young = createdSchemeCodes.find((c) => c.endsWith('YNGNEW'))!;

      // Return horizons exclude it — its 3y metrics row is INSUFFICIENT_DATA.
      const h3 = rows.filter((r) => r.horizonYears === 3);
      expect(h3).toHaveLength(2);
      expect(h3.map((r) => r.schemeCode)).not.toContain(young);

      // The structural universe includes it, because a published expense ratio
      // does not need three years of NAV behind it. Ranking TER only among
      // funds with a 3y record would shrink the cost universe and tilt it
      // toward incumbents.
      const structural = rows.filter((r) => r.horizonYears === STRUCTURAL_HORIZON);
      expect(structural).toHaveLength(3);
      expect(structural.map((r) => r.schemeCode)).toContain(young);
      for (const r of structural) expect(r.peer.universeSize).toBe(3);

      // TERs 0.40, 0.80, 0.10 → the 12-month fund is the cheapest:
      // (2 + 0.5)/3 = 0.833333.
      expect(structural.find((r) => r.schemeCode === young)!.peer.percentiles['terPct']).toBe(
        '0.833333',
      );
      const profile = await loadProfile(young);
      expect(profile['terPercentile']).toBe('0.833333');
    });

    it('leaves MfCurrentProfile and MfPeerRank holding the same number', async () => {
      await runAsSystem(() => runPeerRankForUniverse(refFor(SUB_TER), ASOF));
      await runAsSystem(() => runPeerRankForUniverse(refFor(SUB_AUM), ASOF));

      for (const sub of [SUB_TER, SUB_AUM]) {
        for (const row of await loadStructuralRows(sub)) {
          const profile = await loadProfile(row.schemeCode);
          const status = profile['fieldStatus'] as Record<string, string>;

          // The profile field is a denormalisation of the rank row, written in
          // the same pass from the same Decimal. Two sources that could
          // disagree is exactly what this asserts does not exist.
          expect(profile['terPercentile']).toBe(row.peer.percentiles['terPct'] ?? null);
          expect(profile['aumCategoryPercentile']).toBe(row.peer.percentiles['aum'] ?? null);

          // And the status invariant holds both ways: a present value carries
          // no status entry, a null always carries one.
          for (const field of ['terPercentile', 'aumCategoryPercentile']) {
            if (profile[field] === null) expect(status[field]).toBe('INSUFFICIENT_DATA');
            else expect(status[field]).toBeUndefined();
          }
        }
      }
    });

    it('is idempotent — a second run leaves identical rank rows and profiles', async () => {
      await runAsSystem(() => runPeerRankForUniverse(refFor(SUB_AUM), ASOF));
      const firstRows = await prisma.mfPeerRank.findMany({
        where: { universeKey: universeKey(SUB_AUM, 'DIRECT'), asOf: ASOF },
        orderBy: [{ schemeCode: 'asc' }, { horizonYears: 'asc' }],
      });
      const firstProfiles = await Promise.all(firstRows.map((r) => loadProfile(r.schemeCode)));

      await runAsSystem(() => runPeerRankForUniverse(refFor(SUB_AUM), ASOF));
      const secondRows = await prisma.mfPeerRank.findMany({
        where: { universeKey: universeKey(SUB_AUM, 'DIRECT'), asOf: ASOF },
        orderBy: [{ schemeCode: 'asc' }, { horizonYears: 'asc' }],
      });
      const secondProfiles = await Promise.all(secondRows.map((r) => loadProfile(r.schemeCode)));

      expect(firstRows.length).toBeGreaterThan(0);
      expect(secondRows).toHaveLength(firstRows.length);
      for (let i = 0; i < firstRows.length; i++) {
        expect(secondRows[i]!.id).toBe(firstRows[i]!.id);
        expect(secondRows[i]!.percentiles).toEqual(firstRows[i]!.percentiles);
        // Byte-identical JSON, key order included — the write-back mutates the
        // stored object in place rather than rebuilding it.
        expect(JSON.stringify(secondProfiles[i])).toBe(JSON.stringify(firstProfiles[i]));
      }
    });

    it('unblocks mf.cost.high-ter — a real ranked profile now fires the rule', async () => {
      await runAsSystem(() => runPeerRankForUniverse(refFor(SUB_YOUNG), ASOF));
      // TERs 0.40 / 0.80 / 0.10 over n = 3, so the dearest fund lands at
      // (0 + 0.5)/3 = 0.166667, under the 0.25 ceiling.
      const dearest = createdSchemeCodes.find((c) => c.endsWith('YNGB'))!;
      const profile = await loadProfile(dearest);
      expect(profile['terPercentile']).toBe('0.166667');

      const facts = makeFacts({
        funds: {
          [SCHEME]: makeFundFacts({
            profile: {
              terPercentile: profile['terPercentile'] as never,
              terPct: profile['terPct'] as never,
              terCategoryMedianPct: profile['terCategoryMedianPct'] as never,
              fieldStatus: profile['fieldStatus'] as never,
            },
          }),
        },
      });

      const found = costHighTerRule.evaluate(facts, SCHEME);
      // Before this change `terPercentile` was hard-coded null on every
      // profile, so this rule could never fire for any fund in production.
      expect(found).toHaveLength(1);
      expect(found[0]!.code).toBe('HIGH_TER');
      // The counterfactual needs the category median, which comes from the
      // same universe pass — 0.40 is the median of [0.40, 0.80, 0.10].
      expect(found[0]!.whatWouldChangeThis).toContain('0.40%');
    });
  });

  it('is idempotent — a second run writes identical rows', async () => {
    await runAsSystem(() => runPeerRankForUniverse(refFor(SUB_TIES), ASOF));
    const first = await prisma.mfPeerRank.findMany({
      where: { universeKey: universeKey(SUB_TIES, 'DIRECT'), asOf: ASOF },
      orderBy: [{ schemeCode: 'asc' }, { horizonYears: 'asc' }],
    });

    await runAsSystem(() => runPeerRankForUniverse(refFor(SUB_TIES), ASOF));
    const second = await prisma.mfPeerRank.findMany({
      where: { universeKey: universeKey(SUB_TIES, 'DIRECT'), asOf: ASOF },
      orderBy: [{ schemeCode: 'asc' }, { horizonYears: 'asc' }],
    });

    expect(second).toHaveLength(first.length);
    expect(first.length).toBeGreaterThan(0);
    for (let i = 0; i < first.length; i++) {
      // Same row (upsert on the unique key), same content. `computedAt` moves
      // by design: it records when we last confirmed the value, not when the
      // value changed.
      expect(second[i]!.id).toBe(first[i]!.id);
      expect(second[i]!.schemeCode).toBe(first[i]!.schemeCode);
      expect(second[i]!.universeSize).toBe(first[i]!.universeSize);
      expect(second[i]!.percentiles).toEqual(first[i]!.percentiles);
    }
  });
});
