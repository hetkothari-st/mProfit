/**
 * Route-level tests for `/api/mf-analytics` (Task 3.1).
 *
 * These drive a real Express server over real HTTP rather than calling the
 * controller functions directly, because three of the guarantees under test are
 * properties of the MIDDLEWARE CHAIN and are invisible to a direct call:
 * `authenticate` rejecting an unauthenticated request, `requireFeature` rejecting
 * a FREE-tier one, and `asyncHandler` turning a rejected handler promise into a
 * 404 through `errorHandler` instead of an unhandled rejection that kills the
 * process (CONTEXT.md §4). Calling `getSchemeMeta(req, res)` in isolation would
 * pass all three tests while the route stayed broken.
 *
 * No supertest: Node's built-in `fetch` against `app.listen(0)` is the same
 * thing without adding a dependency to a package.json several other agents are
 * editing concurrently.
 *
 * Fixtures are namespaced `MFAPI31_*` and torn down by that prefix. The dev
 * database is shared with other agents' test runs, so there is no unscoped
 * `deleteMany` anywhere below.
 */

import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';

import {
  serializeRatio,
  serializePct,
  serializeMoney,
  type MfHorizonMetrics,
  type MfHorizonYears,
  type MfCurrentProfile,
  type MfSchemeMetaDto,
  type MfSchemeScoreDto,
  type MfPillarScore,
  type MfFundAnalyticsDto,
} from '@portfolioos/shared';

import { prisma } from '../../src/lib/prisma.js';
import { mfAnalyticsRouter } from '../../src/routes/mfAnalytics.routes.js';
import { errorHandler } from '../../src/middleware/errorHandler.js';
import { signAccessToken } from '../../src/services/jwt.service.js';

// ---------------------------------------------------------------------------
// Guard rail
// ---------------------------------------------------------------------------

/**
 * These tests write fixture rows. `packages/api/.env` points `DATABASE_URL` at
 * the production Neon branch, so a run that picked it up would seed a live
 * database. Fail loudly instead of quietly doing that.
 */
const DB_URL = process.env.DATABASE_URL ?? '';
if (!/localhost|127\.0\.0\.1/.test(DB_URL)) {
  throw new Error(
    `Refusing to run: DATABASE_URL must point at a local database, got "${DB_URL.replace(/:[^:@/]*@/, ':***@')}"`,
  );
}

// ---------------------------------------------------------------------------
// Fixture scheme codes — reserved band for this task
// ---------------------------------------------------------------------------

const PREFIX = 'MFAPI31_';
const RATED = `${PREFIX}RATED`;
const UNRATED = `${PREFIX}UNRATED`;
const PEER_A = `${PREFIX}PEERA`;
const PEER_B = `${PREFIX}PEERB`;
const ALL_CODES = [RATED, UNRATED, PEER_A, PEER_B];

const AS_OF = new Date('2026-08-31T00:00:00.000Z');
const AS_OF_ISO = '2026-08-31';
const METHODOLOGY_V1 = 'score-active-equity-v1';
const METHODOLOGY_V2 = 'score-active-equity-v2';
const UNIVERSE = 'Large Cap Fund|DIRECT';

// ---------------------------------------------------------------------------
// Fixture builders — typed against the SHARED DTOs on purpose
// ---------------------------------------------------------------------------

/**
 * Annotating the fixtures with the shared types makes the fixture itself a
 * compile-time conformance check: if `MfHorizonMetrics` gains a required field,
 * this file stops building before the controller can ship a response missing it.
 */
function horizonMetrics(horizonYears: MfHorizonYears): MfHorizonMetrics {
  return {
    asOf: AS_OF_ISO,
    horizonYears,
    observationsMonthly: horizonYears * 12,
    status: 'OK',
    benchmarkCode: 'NIFTY100_TRI',
    riskFreeSeries: 'TBILL_91D',
    mathVersion: '1.0.0',
    returns: {
      cagr: serializeRatio('0.142500'),
      absolute: null,
      benchmarkCagr: serializeRatio('0.131000'),
      categoryMedianCagr: serializeRatio('0.127500'),
      rolling1y: null,
      rolling3y: null,
      rolling5y: null,
      calendarYears: [
        {
          year: 2025,
          fund: serializeRatio('0.185000'),
          benchmark: serializeRatio('0.171000'),
          categoryMedian: serializeRatio('0.166000'),
          rank: 12,
          universeSize: 48,
          quartile: 1,
        },
      ],
      sipXirr: serializeRatio('0.151200'),
    },
    risk: {
      stdDevAnn: serializeRatio('0.138000'),
      downsideDevAnn: serializeRatio('0.091000'),
      maxDrawdown: serializeRatio('-0.284000'),
      maxDrawdownDurationDays: 214,
      recoveryDays: null,
      worstMonth: serializeRatio('-0.112000'),
      bestMonth: serializeRatio('0.128000'),
      worstCalendarYear: serializeRatio('-0.041000'),
      var95Monthly: serializeRatio('-0.068000'),
      cvar95Monthly: serializeRatio('-0.094000'),
      pctNegativeMonths: serializeRatio('0.336000'),
    },
    riskAdjusted: {
      sharpe: serializeRatio('0.712000'),
      sortino: serializeRatio('1.041000'),
      beta: serializeRatio('0.940000'),
      // A non-OK field: null value WITH a reason in `fieldStatus` below. The
      // honesty test asserts both survive to the client.
      jensenAlphaAnn: null,
      treynor: null,
      trackingErrorAnn: serializeRatio('0.042000'),
      informationRatio: serializeRatio('0.274000'),
      calmar: serializeRatio('0.501000'),
      omega: serializeRatio('1.310000'),
      m2: serializeRatio('0.139000'),
    },
    relative: {
      upCapture: serializeRatio('1.042000'),
      downCapture: serializeRatio('0.918000'),
      captureRatio: serializeRatio('1.135000'),
      battingAverage: serializeRatio('0.583000'),
      outperformanceAnn: serializeRatio('0.011500'),
    },
    consistency: {
      rollingBeatBenchPct: serializeRatio('0.640000'),
      rollingBeatCategoryPct: serializeRatio('0.710000'),
      quartileHistory: [
        { year: 2024, quartile: 2 },
        { year: 2025, quartile: 1 },
      ],
      quartileConsistency: serializeRatio('0.750000'),
      survivorshipAdjusted: true,
    },
    fieldStatus: {
      // `06 §6`: a metric that could not be computed keeps its status and its
      // reason. BENCHMARK_UNAVAILABLE for alpha, NOT_APPLICABLE for Treynor
      // (beta near zero) — two different kinds of "no number", which the UI
      // must render differently and therefore must receive differently.
      'riskAdjusted.jensenAlphaAnn': 'BENCHMARK_UNAVAILABLE',
      'riskAdjusted.treynor': 'NOT_APPLICABLE',
    },
  };
}

function currentProfile(): MfCurrentProfile {
  return {
    asOf: AS_OF_ISO,
    snapshotAsOf: '2026-07-31',
    status: 'OK',
    numHoldings: 52,
    top10WeightPct: serializePct('41.200000'),
    hhi: serializeRatio('0.043000'),
    effectiveHoldings: serializeRatio('23.250000'),
    cashPct: serializePct('3.100000'),
    activeShare: serializeRatio('0.482000'),
    marketCapSplit: {
      large: serializePct('82.400000'),
      mid: serializePct('11.900000'),
      small: serializePct('2.600000'),
      unclassified: serializePct('0.000000'),
    },
    sectorWeights: { Financials: serializePct('31.200000'), IT: serializePct('14.800000') },
    sectorActiveWeights: { Financials: serializePct('2.100000') },
    turnoverPct: serializePct('38.000000'),
    turnoverIsEstimated: true,
    styleBox: { cap: 'LARGE', style: 'BLEND' },
    styleDrift: serializeRatio('0.021000'),
    topHoldings: [
      {
        isin: 'INE040A01034',
        securityName: 'HDFC Bank Ltd',
        kind: 'EQUITY',
        weightPct: serializePct('9.100000'),
        sector: 'Financials',
        marketCapBucket: 'LARGE',
      },
    ],
    modifiedDuration: null,
    durationIsApproximated: false,
    averageMaturityYears: null,
    ytmPct: null,
    creditQualitySplit: null,
    belowAAPct: null,
    topIssuerPct: null,
    terPct: serializePct('0.620000'),
    terCategoryMedianPct: serializePct('0.780000'),
    terPercentile: serializeRatio('0.810000'),
    aum: serializeMoney('184000000000'),
    aumGrowth12mPct: serializePct('12.400000'),
    aumCategoryPercentile: serializeRatio('0.900000'),
    managerTenureYears: serializeRatio('6.240000'),
    managerChangesLast3y: 0,
    currentManagers: [{ name: 'TEST MANAGER', role: 'Lead', fromDate: '2020-04-01' }],
    fundAgeYears: serializeRatio('14.100000'),
    exitLoadMaxDays: 365,
    fieldStatus: {
      'debt.modifiedDuration': 'NOT_APPLICABLE',
      'debt.ytmPct': 'NOT_APPLICABLE',
    },
  };
}

function pillars(): Record<string, MfPillarScore> {
  return {
    PERFORMANCE: {
      score: serializeRatio('72.400000'),
      weight: serializeRatio('0.300000'),
      inputs: {
        cagr: {
          value: serializeRatio('0.142500'),
          percentile: serializeRatio('0.780000'),
          status: 'OK',
          universeMedian: serializeRatio('0.127500'),
          weight: serializeRatio('1.000000'),
        },
      },
    },
    CONSISTENCY: {
      score: serializeRatio('68.100000'),
      weight: serializeRatio('0.200000'),
      inputs: {},
    },
  };
}

// ---------------------------------------------------------------------------
// Seed / teardown
// ---------------------------------------------------------------------------

async function seedScheme(schemeCode: string, schemeName: string): Promise<void> {
  await prisma.mfSchemeMeta.create({
    data: {
      schemeCode,
      isin: null,
      schemeName,
      amcCode: 'MFAPI31AMC',
      amcName: 'Test AMC',
      sebiCategory: 'EQUITY',
      sebiSubCategory: 'Large Cap Fund',
      planType: 'DIRECT',
      optionType: 'GROWTH',
      benchmarkIndexCode: 'NIFTY100_TRI',
      inceptionDate: new Date('2012-06-15T00:00:00.000Z'),
      status: 'ACTIVE',
      riskometer: 'VERY_HIGH',
      exitLoadText: '1% if redeemed within 365 days',
      exitLoadRules: [{ daysUpTo: 365, pct: serializePct('1') }],
      minSip: '500',
      sourceHash: `mfapi31-${schemeCode}`,
      fetchedAt: AS_OF,
    },
  });
}

async function cleanup(): Promise<void> {
  // MfPeerRank and MfSchemeQualitativeFact carry `schemeCode` as a plain column
  // with no FK, so the cascade on MfSchemeMeta does not reach them. Delete them
  // first and explicitly — leaving orphans behind in a shared dev database is
  // how the next agent's universe aggregates pick up rows nobody can explain.
  await prisma.mfPeerRank.deleteMany({ where: { schemeCode: { startsWith: PREFIX } } });
  await prisma.mfSchemeQualitativeFact.deleteMany({
    where: { schemeCode: { startsWith: PREFIX } },
  });
  await prisma.mfSchemeMetrics.deleteMany({ where: { schemeCode: { startsWith: PREFIX } } });
  await prisma.mfSchemeScore.deleteMany({ where: { schemeCode: { startsWith: PREFIX } } });
  await prisma.mfSchemeMeta.deleteMany({ where: { schemeCode: { startsWith: PREFIX } } });
}

// ---------------------------------------------------------------------------
// HTTP harness
// ---------------------------------------------------------------------------

let server: Server;
let base: string;

/**
 * `authenticate` and `requireFeature` both read the JWT claims only — neither
 * touches the User table — so a signed token is a complete and honest stand-in
 * for a logged-in user of that tier. A User row would add DB churn to a shared
 * database and test nothing extra.
 */
function tokenFor(plan: 'FREE' | 'PLUS'): string {
  return signAccessToken({
    sub: `mfapi31-${plan.toLowerCase()}`,
    email: `mfapi31-${plan.toLowerCase()}@test.local`,
    role: 'INVESTOR',
    plan,
  }).token;
}

let plusToken: string;
let freeToken: string;

interface HttpResult {
  status: number;
  body: { success: boolean; data?: unknown; error?: string; code?: string };
}

async function get(path: string, token?: string): Promise<HttpResult> {
  const res = await fetch(`${base}${path}`, {
    headers: token === undefined ? {} : { authorization: `Bearer ${token}` },
  });
  return { status: res.status, body: (await res.json()) as HttpResult['body'] };
}

beforeAll(async () => {
  await cleanup();

  await seedScheme(RATED, 'Test Rated Large Cap Fund - Direct Growth');
  await seedScheme(UNRATED, 'Test Young Large Cap Fund - Direct Growth');
  await seedScheme(PEER_A, 'Test Peer A Fund - Direct Growth');
  await seedScheme(PEER_B, 'Test Peer B Fund - Direct Growth');

  // Metrics: the five horizons plus the horizon-0 profile, all at one asOf —
  // the shape mfMetricsJob writes.
  for (const h of [1, 3, 5, 7, 10] as const) {
    await prisma.mfSchemeMetrics.create({
      data: {
        schemeCode: RATED,
        asOf: AS_OF,
        horizonYears: h,
        status: 'OK',
        metrics: horizonMetrics(h) as unknown as object,
        benchmarkCode: 'NIFTY100_TRI',
        riskFreeSeries: 'TBILL_91D',
        mathVersion: '1.0.0',
      },
    });
  }
  await prisma.mfSchemeMetrics.create({
    data: {
      schemeCode: RATED,
      asOf: AS_OF,
      horizonYears: 0,
      status: 'OK',
      metrics: currentProfile() as unknown as object,
      benchmarkCode: 'NIFTY100_TRI',
      riskFreeSeries: 'TBILL_91D',
      mathVersion: '1.0.0',
    },
  });

  await prisma.mfPeerRank.create({
    data: {
      schemeCode: RATED,
      asOf: AS_OF,
      horizonYears: 3,
      universeKey: UNIVERSE,
      universeSize: 48,
      percentiles: {
        cagr: serializeRatio('0.780000'),
        sharpe: serializeRatio('0.660000'),
        $medians: { cagr: serializeRatio('0.127500') },
      },
    },
  });

  // Two methodology versions of the same score, so `?version=` has something to
  // discriminate. V2 is the newer computedAt and must therefore be "latest".
  await prisma.mfSchemeScore.create({
    data: {
      schemeCode: RATED,
      asOf: AS_OF,
      methodologyVersion: METHODOLOGY_V1,
      modelKey: 'ACTIVE_EQUITY',
      ratingStatus: 'RATED',
      composite: '71.250000',
      rating: 4,
      pillars: pillars() as unknown as object,
      universeKey: UNIVERSE,
      universeSize: 48,
      computedAt: new Date('2026-09-01T00:00:00.000Z'),
    },
  });
  await prisma.mfSchemeScore.create({
    data: {
      schemeCode: RATED,
      asOf: AS_OF,
      methodologyVersion: METHODOLOGY_V2,
      modelKey: 'ACTIVE_EQUITY',
      ratingStatus: 'RATED',
      composite: '68.500000',
      rating: 3,
      pillars: pillars() as unknown as object,
      universeKey: UNIVERSE,
      universeSize: 48,
      computedAt: new Date('2026-09-02T00:00:00.000Z'),
    },
  });

  // Peers for the category median/top-quartile aggregate, same universe + asOf
  // + methodology version as the RATED scheme's latest score.
  for (const [code, composite] of [
    [PEER_A, '55.000000'],
    [PEER_B, '80.000000'],
  ] as const) {
    await prisma.mfSchemeScore.create({
      data: {
        schemeCode: code,
        asOf: AS_OF,
        methodologyVersion: METHODOLOGY_V2,
        modelKey: 'ACTIVE_EQUITY',
        ratingStatus: 'RATED',
        composite,
        rating: 3,
        pillars: {},
        universeKey: UNIVERSE,
        universeSize: 48,
        computedAt: new Date('2026-09-02T00:00:00.000Z'),
      },
    });
  }

  // The unrated fund: 18 months of history, so no composite and no rating —
  // but a score row all the same, because "we could not rate this" is an answer
  // and an absent row is a bug report (`06 §6`).
  await prisma.mfSchemeScore.create({
    data: {
      schemeCode: UNRATED,
      asOf: AS_OF,
      methodologyVersion: METHODOLOGY_V2,
      modelKey: 'ACTIVE_EQUITY',
      ratingStatus: 'INSUFFICIENT_HISTORY',
      composite: null,
      rating: null,
      pillars: {},
      universeKey: UNIVERSE,
      universeSize: 48,
      computedAt: new Date('2026-09-02T00:00:00.000Z'),
    },
  });

  await prisma.mfSchemeQualitativeFact.create({
    data: {
      schemeCode: RATED,
      factType: 'STRATEGY_CAPACITY_CAP',
      value: { note: 'Soft close on lumpsum inflows' },
      validFrom: new Date('2026-01-01T00:00:00.000Z'),
      validTo: null,
      source: 'https://example.invalid/notice',
      enteredBy: 'mfapi31-admin',
    },
  });

  const app = express();
  app.use(express.json());
  app.use('/api/mf-analytics', mfAnalyticsRouter);
  app.use(errorHandler);
  server = app.listen(0);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  plusToken = tokenFor('PLUS');
  freeToken = tokenFor('FREE');
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve())),
  );
  await cleanup();
});

// ---------------------------------------------------------------------------
// Numeric-on-the-wire walker
// ---------------------------------------------------------------------------

/**
 * Keys whose value is legitimately a JSON number.
 *
 * The DTO header states the rule: every numeric is a branded Decimal string
 * except "genuine counts and day-differences, which are integers by nature and
 * carry no precision risk". This list IS that exception set, enumerated. Any
 * number appearing under any other key is a `Money`/`Ratio`/`Pct` that lost its
 * brand somewhere between Postgres and the socket — which is the bug this test
 * exists to catch, and which typecheck cannot see because JSON is `unknown`.
 */
const COUNT_KEYS = new Set([
  'horizonYears',
  'observationsMonthly',
  'observations',
  'windowYears',
  'year',
  'rank',
  'universeSize',
  'quartile',
  'maxDrawdownDurationDays',
  'recoveryDays',
  'numHoldings',
  'managerChangesLast3y',
  'exitLoadMaxDays',
  'rating',
  'daysUpTo',
  'memberCount',
  'totalHoldings',
  'holdingDays',
  'daysToLtcg',
  'holdingPeriodDays',
  'fundCount',
  'equityFundCount',
  // Whole months of NAV history behind an unrated score (06 §6's
  // "Unrated - N months of history" copy). A count, like the rest of this
  // list -- no fractional months, no precision risk.
  'historyMonths',
]);

/** Every `path -> number` in the payload that is NOT an allowed count. */
function offendingNumbers(node: unknown, path = '$'): string[] {
  if (typeof node === 'number') {
    const key = path.slice(path.lastIndexOf('.') + 1).replace(/\[\d+\]$/, '');
    return COUNT_KEYS.has(key) ? [] : [`${path} = ${node}`];
  }
  if (Array.isArray(node)) {
    return node.flatMap((v, i) => offendingNumbers(v, `${path}[${i}]`));
  }
  if (typeof node === 'object' && node !== null) {
    return Object.entries(node).flatMap(([k, v]) => offendingNumbers(v, `${path}.${k}`));
  }
  return [];
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GET /api/mf-analytics — auth and entitlement gate', () => {
  const paths = [
    `/api/mf-analytics/schemes/${RATED}`,
    `/api/mf-analytics/schemes/${RATED}/metrics`,
    `/api/mf-analytics/schemes/${RATED}/score`,
    `/api/mf-analytics/schemes/${RATED}/peers`,
    `/api/mf-analytics/schemes/${RATED}/holdings`,
    `/api/mf-analytics/schemes/${RATED}/analytics`,
  ];

  it('401s every route without an Authorization header', async () => {
    for (const p of paths) {
      const res = await get(p);
      expect(res.status, p).toBe(401);
      expect(res.body.success).toBe(false);
    }
  });

  it('401s on a garbage bearer token', async () => {
    const res = await get(paths[0]!, 'not-a-jwt');
    expect(res.status).toBe(401);
  });

  it('403s every route for a FREE-tier user (MF_ANALYTICS is PLUS)', async () => {
    for (const p of paths) {
      const res = await get(p, freeToken);
      expect(res.status, p).toBe(403);
      expect(res.body.code).toBe('FORBIDDEN');
      expect(res.body.error).toMatch(/PLUS/);
    }
  });

  it('200s every route for a PLUS-tier user', async () => {
    for (const p of paths) {
      const res = await get(p, plusToken);
      expect(res.status, p).toBe(200);
      expect(res.body.success).toBe(true);
    }
  });
});

describe('GET /schemes/:schemeCode — meta', () => {
  it('returns MfSchemeMetaDto with the risk-o-meter SEBI requires beside a score', async () => {
    const res = await get(`/api/mf-analytics/schemes/${RATED}`, plusToken);
    expect(res.status).toBe(200);
    const meta = res.body.data as MfSchemeMetaDto;

    expect(meta.schemeCode).toBe(RATED);
    expect(meta.sebiCategory).toBe('EQUITY');
    expect(meta.sebiSubCategory).toBe('Large Cap Fund');
    expect(meta.planType).toBe('DIRECT');
    expect(meta.optionType).toBe('GROWTH');
    expect(meta.status).toBe('ACTIVE');
    expect(meta.inceptionDate).toBe('2012-06-15');
    // `06 §4`: risk-o-meter wherever a scheme is presented.
    expect(meta.riskometer).toBe('VERY_HIGH');
    expect(meta.exitLoadRules).toEqual([{ daysUpTo: 365, pct: '1.000000' }]);
    expect(meta.minSip).toBe('500.0000');
    // The month-count source for "Unrated — N months of history".
    expect(typeof meta.fundAgeYears).toBe('string');
  });

  it('404s an unknown scheme rather than 200-with-null or a bare 500', async () => {
    const res = await get(`/api/mf-analytics/schemes/${PREFIX}NOPE`, plusToken);
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOT_FOUND');
  });
});

describe('GET /schemes/:schemeCode/metrics', () => {
  it('returns every horizon keyed by horizon', async () => {
    const res = await get(`/api/mf-analytics/schemes/${RATED}/metrics`, plusToken);
    const metrics = res.body.data as MfFundAnalyticsDto['metrics'];
    expect(Object.keys(metrics).sort()).toEqual(['1', '10', '3', '5', '7']);
    expect(metrics['3']!.horizonYears).toBe(3);
    expect(metrics['3']!.benchmarkCode).toBe('NIFTY100_TRI');
    // Horizon 0 is the profile and belongs to /holdings, not here.
    expect(metrics).not.toHaveProperty('0');
  });

  it('narrows to one horizon with ?horizon=', async () => {
    const res = await get(`/api/mf-analytics/schemes/${RATED}/metrics?horizon=5`, plusToken);
    const metrics = res.body.data as MfFundAnalyticsDto['metrics'];
    expect(Object.keys(metrics)).toEqual(['5']);
  });

  it('422s an unsupported horizon instead of silently returning nothing', async () => {
    const res = await get(`/api/mf-analytics/schemes/${RATED}/metrics?horizon=4`, plusToken);
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('returns {} — not 404 — for a scheme that exists but has no metrics', async () => {
    const res = await get(`/api/mf-analytics/schemes/${UNRATED}/metrics`, plusToken);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({});
  });

  it('preserves non-OK field statuses and their nulls (06 §6)', async () => {
    const res = await get(`/api/mf-analytics/schemes/${RATED}/metrics?horizon=3`, plusToken);
    const h = (res.body.data as MfFundAnalyticsDto['metrics'])['3'] as MfHorizonMetrics;
    // Null value, never 0 — and the reason survives beside it so the UI can say
    // "Not available — benchmark unavailable" rather than rendering a dash.
    expect(h.riskAdjusted.jensenAlphaAnn).toBeNull();
    expect(h.fieldStatus['riskAdjusted.jensenAlphaAnn']).toBe('BENCHMARK_UNAVAILABLE');
    // NOT_APPLICABLE is a distinct third state from OK and INSUFFICIENT_DATA.
    expect(h.riskAdjusted.treynor).toBeNull();
    expect(h.fieldStatus['riskAdjusted.treynor']).toBe('NOT_APPLICABLE');
  });
});

describe('GET /schemes/:schemeCode/score', () => {
  it('returns the latest methodology version by default', async () => {
    const res = await get(`/api/mf-analytics/schemes/${RATED}/score`, plusToken);
    const score = res.body.data as MfSchemeScoreDto;
    expect(score.methodologyVersion).toBe(METHODOLOGY_V2);
    expect(score.ratingStatus).toBe('RATED');
    expect(score.composite).toBe('68.500000');
    expect(score.rating).toBe(3);
    expect(score.universeKey).toBe(UNIVERSE);
    expect(score.pillars.PERFORMANCE!.score).toBe('72.400000');
  });

  it('returns the requested methodology version with ?version=', async () => {
    const res = await get(
      `/api/mf-analytics/schemes/${RATED}/score?version=${METHODOLOGY_V1}`,
      plusToken,
    );
    const score = res.body.data as MfSchemeScoreDto;
    expect(score.methodologyVersion).toBe(METHODOLOGY_V1);
    expect(score.composite).toBe('71.250000');
    expect(score.rating).toBe(4);
  });

  it('404s a methodology version that was never computed for this scheme', async () => {
    const res = await get(
      `/api/mf-analytics/schemes/${RATED}/score?version=score-does-not-exist-v9`,
      plusToken,
    );
    expect(res.status).toBe(404);
  });

  it('returns ratingStatus INSUFFICIENT_HISTORY with a NULL rating — never 0, never omitted', async () => {
    const res = await get(`/api/mf-analytics/schemes/${UNRATED}/score`, plusToken);
    expect(res.status).toBe(200);
    const score = res.body.data as MfSchemeScoreDto;

    expect(score.ratingStatus).toBe('INSUFFICIENT_HISTORY');
    expect(score.rating).toBeNull();
    expect(score.composite).toBeNull();
    // Explicitly present-and-null, not absent: an omitted key and a null key
    // are different things to a client that does `'rating' in score`.
    expect(Object.hasOwn(score, 'rating')).toBe(true);
    expect(Object.hasOwn(score, 'composite')).toBe(true);
    // Peer count is what renders "Unrated — only n peers in category".
    expect(score.universeSize).toBe(48);
  });
});

describe('GET /schemes/:schemeCode/peers', () => {
  it('returns percentiles and medians keyed by horizon', async () => {
    const res = await get(`/api/mf-analytics/schemes/${RATED}/peers`, plusToken);
    const peer = res.body.data as MfFundAnalyticsDto['peer'];
    expect(Object.keys(peer)).toEqual(['3']);
    expect(peer['3']!.universeKey).toBe(UNIVERSE);
    expect(peer['3']!.universeSize).toBe(48);
    expect(peer['3']!.percentiles.cagr).toBe('0.780000');
    // Medians are decoded out of the `$medians` internal key by the service's
    // own parser, not re-derived here.
    expect(peer['3']!.medians.cagr).toBe('0.127500');
    // The `$`-prefixed internal keys must never leak onto the wire.
    expect(peer['3']!.percentiles).not.toHaveProperty('$medians');
  });

  it('returns {} for a scheme with no peer ranks', async () => {
    const res = await get(`/api/mf-analytics/schemes/${UNRATED}/peers`, plusToken);
    expect(res.body.data).toEqual({});
  });
});

describe('GET /schemes/:schemeCode/holdings', () => {
  it('returns the horizon-0 profile with the snapshot date the staleness badge needs', async () => {
    const res = await get(`/api/mf-analytics/schemes/${RATED}/holdings`, plusToken);
    const profile = res.body.data as MfCurrentProfile;
    expect(profile.snapshotAsOf).toBe('2026-07-31');
    expect(profile.numHoldings).toBe(52);
    expect(profile.topHoldings[0]!.securityName).toBe('HDFC Bank Ltd');
    expect(profile.topHoldings[0]!.weightPct).toBe('9.100000');
    // Debt-only fields on an equity fund are NOT_APPLICABLE, not zero.
    expect(profile.modifiedDuration).toBeNull();
    expect(profile.fieldStatus['debt.modifiedDuration']).toBe('NOT_APPLICABLE');
  });

  it('returns null — not 404 — when the metrics job has never run', async () => {
    const res = await get(`/api/mf-analytics/schemes/${UNRATED}/holdings`, plusToken);
    expect(res.status).toBe(200);
    expect(res.body.data).toBeNull();
  });
});

describe('GET /schemes/:schemeCode/analytics — composed view', () => {
  it('returns MfFundAnalyticsDto with meta, score, metrics, profile, peer and category stats', async () => {
    const res = await get(`/api/mf-analytics/schemes/${RATED}/analytics`, plusToken);
    const dto = res.body.data as MfFundAnalyticsDto;

    // The whole point of the composed endpoint: risk-o-meter arrives in the
    // same payload as the score, so `06 §4` cannot be violated by a page that
    // simply forgot to fetch meta.
    expect(dto.meta.riskometer).toBe('VERY_HIGH');
    expect(dto.score!.methodologyVersion).toBe(METHODOLOGY_V2);
    expect(Object.keys(dto.metrics).sort()).toEqual(['1', '10', '3', '5', '7']);
    expect(dto.profile!.snapshotAsOf).toBe('2026-07-31');
    expect(dto.peer['3']!.universeSize).toBe(48);
    expect(dto.qualitative).toHaveLength(1);
    expect(dto.qualitative[0]!.factType).toBe('STRATEGY_CAPACITY_CAP');

    // Median of {68.5, 55, 80} = 68.5; 75th percentile = 74.25.
    expect(dto.categoryStats.universeKey).toBe(UNIVERSE);
    expect(dto.categoryStats.medianComposite).toBe('68.500000');
    expect(dto.categoryStats.topQuartileComposite).toBe('74.250000');

    // Phase 4/5 territory: no engine writes these yet.
    expect(dto.held).toBeNull();
    expect(dto.findings).toEqual([]);
    expect(dto.verdict).toBeNull();
  });

  it('names the universe but claims no distribution for an unscored scheme', async () => {
    // PEER_A has a score; UNRATED has one too. Use a scheme whose only score is
    // unrated to confirm the composite aggregate excludes it.
    const res = await get(`/api/mf-analytics/schemes/${UNRATED}/analytics`, plusToken);
    const dto = res.body.data as MfFundAnalyticsDto;
    expect(dto.score!.ratingStatus).toBe('INSUFFICIENT_HISTORY');
    // Three RATED peers at this (universe, asOf, version); the unrated fund is
    // excluded from its own category median rather than counted as a zero.
    expect(dto.categoryStats.medianComposite).toBe('68.500000');
  });
});

describe('money and ratios are Decimal strings on the wire', () => {
  it('emits no JSON number outside the enumerated count fields', async () => {
    const paths = [
      `/api/mf-analytics/schemes/${RATED}`,
      `/api/mf-analytics/schemes/${RATED}/metrics`,
      `/api/mf-analytics/schemes/${RATED}/score`,
      `/api/mf-analytics/schemes/${RATED}/peers`,
      `/api/mf-analytics/schemes/${RATED}/holdings`,
      `/api/mf-analytics/schemes/${RATED}/analytics`,
      `/api/mf-analytics/schemes/${UNRATED}/score`,
    ];

    for (const p of paths) {
      const res = await get(p, plusToken);
      expect(res.status, p).toBe(200);
      expect(offendingNumbers(res.body.data), p).toEqual([]);
    }
  });

  it('the walker actually fires on a planted number (guards against a vacuous pass)', () => {
    expect(offendingNumbers({ composite: 71.25 })).toEqual(['$.composite = 71.25']);
    expect(offendingNumbers({ universeSize: 48 })).toEqual([]);
  });
});
