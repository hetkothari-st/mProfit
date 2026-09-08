/**
 * Route-level tests for the USER-SCOPED half of `/api/mf-analytics` (Task 5.6):
 * `/runs/latest`, `/funds/:schemeCode/findings`, `/funds/:schemeCode/verdict`
 * and `POST /refresh`.
 *
 * Real Express over real HTTP, for the reasons the sibling suite gives: three
 * of the guarantees under test are properties of the MIDDLEWARE CHAIN and are
 * invisible to a direct controller call — `authenticate` rejecting an anonymous
 * request, `requireFeature` rejecting a FREE-tier one, and `asyncHandler`
 * routing a rejected handler promise through `errorHandler` rather than into an
 * unhandled rejection that kills the process (CONTEXT.md §4).
 *
 * ---------------------------------------------------------------------------
 * What is different from the reference suite
 * ---------------------------------------------------------------------------
 *
 * These endpoints read the caller's OWN rows. That changes the harness in two
 * ways that matter:
 *
 *  1. **The JWT `sub` must be a real `User.id`.** The reference suite signs a
 *     token for a made-up subject because its tables have no owner. Here the
 *     subject is what `enterUserContext` puts into `app.current_user_id`, and
 *     an id with no rows behind it would make every assertion pass vacuously
 *     against an empty result set — the exact failure mode `scope.runAs` exists
 *     to prevent (CONTEXT.md §12).
 *
 *  2. **Fixture writes go through `runAsSystem`.** RLS `WITH CHECK` would
 *     otherwise reject the bootstrap inserts, and a `runAsUser` bootstrap would
 *     make the test unable to seed user B's rows while asserting as user A.
 *
 * ---------------------------------------------------------------------------
 * The RIA gate is tested in BOTH positions
 * ---------------------------------------------------------------------------
 *
 * `06 §4` is the compliance requirement this task exists for, and a suite that
 * only asserted the disabled state would pass against an INVERTED gate — one
 * that stripped advice when the registration was in place and published it when
 * it was not. So the same stored `SWITCH_CANDIDATE` row is fetched twice, once
 * with `RIA_VERDICTS_ENABLED=false` and once with `true`, and the two responses
 * are asserted to differ in exactly the three ways §4 names.
 *
 * The row is constructed directly rather than driven out of the engine because
 * no `SWITCH_CANDIDATE` is currently reachable: `REPLACEMENT_EXPECTED_EDGE` is
 * null in `constants.ts` until the backtest lands, so `mfVerdict.ts` row 3 can
 * never fire. Waiting for that would leave the gate untested in production.
 *
 * Fixtures are namespaced `MFAPI56_*` and every delete is scoped to this run's
 * own ids. The dev database is shared with other agents; there is no unscoped
 * `deleteMany` below.
 */

import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';

import {
  serializeMoney,
  serializePct,
  serializeRatio,
  type MfAnalysisRunDto,
  type MfEvidence,
  type MfFinding,
  type MfFundVerdictDto,
  type MfHeldFundDto,
  type MfPortfolioAnalysisDto,
  type MfRuleRunRecord,
  type MfSchemeMetaDto,
} from '@portfolioos/shared';

import { prisma } from '../../src/lib/prisma.js';
import { runAsSystem } from '../../src/lib/requestContext.js';
import { mfAnalyticsRouter } from '../../src/routes/mfAnalytics.routes.js';
import { errorHandler } from '../../src/middleware/errorHandler.js';
import { signAccessToken } from '../../src/services/jwt.service.js';
import { env } from '../../src/config/env.js';
import { createTestScope, type TestScope } from '../helpers/db.js';
import { offendingNumbers } from '../helpers/wireNumerics.js';

// ---------------------------------------------------------------------------
// Guard rail
// ---------------------------------------------------------------------------

/**
 * `packages/api/.env` points `DATABASE_URL` at the production Neon branch, so a
 * run that picked it up would seed a live database with fixture users. Fail
 * loudly instead of quietly doing that.
 */
const DB_URL = process.env.DATABASE_URL ?? '';
if (!/localhost|127\.0\.0\.1/.test(DB_URL)) {
  throw new Error(
    `Refusing to run: DATABASE_URL must point at a local database, got "${DB_URL.replace(/:[^:@/]*@/, ':***@')}"`,
  );
}

// ---------------------------------------------------------------------------
// Fixture identifiers — reserved band for this task
// ---------------------------------------------------------------------------

const PREFIX = 'MFAPI56_';
const HELD = `${PREFIX}HELD`;
const REPLACEMENT = `${PREFIX}REPL`;
const UNHELD = `${PREFIX}OTHER`;

const AS_OF = new Date('2026-08-31T00:00:00.000Z');
const AS_OF_ISO = '2026-08-31';

/**
 * The rule whose failure makes the seeded run PARTIAL. A real id from the
 * registry on purpose: `missingCategories` is derived by joining the run's
 * `ruleVersionsSnapshot` back against `MF_RULES`, so an invented id would
 * resolve to no category and the banner assertion would pass for the wrong
 * reason.
 */
const FAILED_RULE_ID = 'mf.cost.high-ter';
const FAILED_RULE_CATEGORY = 'COST';

// ---------------------------------------------------------------------------
// Fixture builders — typed against the SHARED DTOs on purpose
// ---------------------------------------------------------------------------

/**
 * Annotating a fixture with the real DTO makes the fixture a compile-time
 * conformance check: a field added to `MfPortfolioAnalysisDto` stops this file
 * building before the controller can ship a response missing it.
 */
function metaDto(schemeCode: string, schemeName: string): MfSchemeMetaDto {
  return {
    schemeCode,
    isin: null,
    schemeName,
    amcCode: 'MFAPI56AMC',
    amcName: 'Test AMC',
    sebiCategory: 'EQUITY',
    sebiSubCategory: 'Large Cap Fund',
    planType: 'DIRECT',
    optionType: 'GROWTH',
    benchmarkIndexCode: 'NIFTY100_TRI',
    inceptionDate: '2012-06-15',
    status: 'ACTIVE',
    statusChangedAt: null,
    predecessorSchemeCode: null,
    growthSiblingSchemeCode: null,
    riskometer: 'VERY_HIGH',
    exitLoadText: null,
    exitLoadRules: null,
    minSip: null,
    fundAgeYears: serializeRatio('14.200000'),
  };
}

function heldFund(): MfHeldFundDto {
  return {
    schemeCode: HELD,
    meta: metaDto(HELD, 'Test Held Large Cap Fund - Direct Growth'),
    units: '1250.500000',
    investedValue: serializeMoney('125000'),
    currentValue: serializeMoney('148250.75'),
    absoluteGain: serializeMoney('23250.75'),
    absoluteGainPct: serializePct('18.600600'),
    userXirr: serializeRatio('0.142500'),
    userXirrStatus: 'OK',
    fundCagrSamePeriod: serializeRatio('0.151000'),
    timingGap: serializeRatio('-0.008500'),
    holdingPeriodDays: 940,
    sipActive: true,
    weightInMfPortfolio: serializePct('100.000000'),
    weightInNetWorth: null,
    score: null,
    lots: [],
  };
}

/**
 * The stored `portfolioAnalysis` column.
 *
 * `funds` is not decoration: `toRunDto` narrows the standing verdicts to the
 * schemes the run actually analysed, and it reads that set from here. An empty
 * `funds` array would silently drop every verdict from the response, and the
 * gate tests would then pass against a payload containing nothing at all.
 */
function portfolioAnalysis(runId: string): MfPortfolioAnalysisDto {
  return {
    asOf: AS_OF_ISO,
    runId,
    totals: {
      investedValue: serializeMoney('125000'),
      currentValue: serializeMoney('148250.75'),
      absoluteGain: serializeMoney('23250.75'),
      portfolioXirr: serializeRatio('0.142500'),
      portfolioXirrStatus: 'OK',
      // Null, not zero: no held fund disclosed a TER. Zero is a real (and
      // excellent) expense ratio, so it must not stand in for "unknown".
      weightedTerPct: null,
      annualCostInr: null,
      directPlanSavingsInr: serializeMoney('0'),
      effectiveFundCount: serializeRatio('1.000000'),
      redundancyScore: null,
      fundCount: 1,
      equityFundCount: 1,
    },
    funds: [heldFund()],
    overlap: { pairs: [], debtPairs: [] },
    lookThrough: {
      topStocks: [],
      sectors: {},
      sectorsBenchmark: null,
      marketCap: { large: null, mid: null, small: null, unclassified: null },
      credit: null,
      assetClass: {},
      target: null,
      fundsWithoutHoldings: [],
    },
    cost: {
      weightedTerPct: null,
      annualCostInr: null,
      directPlanSavingsInr: serializeMoney('0'),
      costCategoryPercentile: null,
      byFund: [],
    },
    tax: {
      unrealisedStcg: serializeMoney('0'),
      unrealisedLtcg: serializeMoney('23250.75'),
      ltcgExemptionHeadroomInr: serializeMoney('125000'),
      financialYear: '2026-27',
      harvestCandidates: [],
      lots: [],
    },
    goals: [],
    scope: { partial: false, hiddenCategories: [], memberCount: null },
  };
}

/** One rule errored ⇒ the run is PARTIAL and one category is missing. */
function ruleVersionsSnapshot(): MfRuleRunRecord[] {
  return [
    { ruleId: 'mf.risk.high-down-capture', version: '1.0.0', ran: true, emitted: 1 },
    { ruleId: 'mf.perf.recent-reversal', version: '1.0.0', ran: true, emitted: 0 },
    {
      ruleId: FAILED_RULE_ID,
      version: '1.0.0',
      ran: true,
      emitted: 0,
      error: `[${HELD}] Cannot read properties of undefined (reading 'terPct')`,
    },
  ];
}

function evidence(): MfEvidence[] {
  return [
    {
      metric: 'relative.downCapture',
      label: 'Downside capture vs benchmark',
      horizonYears: 3,
      value: serializeRatio('1.184000'),
      categoryMedian: serializeRatio('0.996000'),
      percentile: serializeRatio('0.180000'),
      unit: 'ratio',
    },
  ];
}

// ---------------------------------------------------------------------------
// HTTP harness
// ---------------------------------------------------------------------------

let server: Server;
let baseUrl: string;
let userA: TestScope;
let userB: TestScope;
let tokenA: string;
let tokenB: string;
let freeToken: string;
let runId: string;
let verdictId: string;

/**
 * `authenticate` and `requireFeature` read the JWT claims only — neither
 * touches the User table — but the `sub` MUST be a real user id here because it
 * becomes `app.current_user_id` and therefore decides which rows RLS returns.
 */
function tokenFor(userId: string, plan: 'FREE' | 'PLUS'): string {
  return signAccessToken({
    sub: userId,
    email: `mfapi56-${plan.toLowerCase()}@test.local`,
    role: 'INVESTOR',
    plan,
  }).token;
}

interface HttpResult {
  status: number;
  body: { success: boolean; data?: unknown; error?: string; code?: string };
}

async function request(
  method: 'GET' | 'POST',
  path: string,
  token?: string,
): Promise<HttpResult> {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: token === undefined ? {} : { authorization: `Bearer ${token}` },
  });
  return { status: res.status, body: (await res.json()) as HttpResult['body'] };
}

const get = (path: string, token?: string) => request('GET', path, token);
const post = (path: string, token?: string) => request('POST', path, token);

// ---------------------------------------------------------------------------
// The RIA flag
// ---------------------------------------------------------------------------

/**
 * `env` is the Zod-parsed object; the controller reads
 * `env.RIA_VERDICTS_ENABLED` at call time precisely so this is possible. A
 * module-level const in the controller would have frozen the flag at import and
 * made the "both states" requirement untestable in one process.
 */
const ORIGINAL_RIA = env.RIA_VERDICTS_ENABLED;
function setRia(value: 'true' | 'false'): void {
  (env as { RIA_VERDICTS_ENABLED: 'true' | 'false' }).RIA_VERDICTS_ENABLED = value;
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

async function cleanupMfRows(userIds: readonly string[]): Promise<void> {
  await runAsSystem(async () => {
    // Verdicts first: MfFundVerdict -> MfAnalysisRun is ON DELETE RESTRICT by
    // design (a verdict is the record of advice given and outlives its run), so
    // deleting the run or the user first fails with a foreign-key error.
    await prisma.mfFundVerdict.deleteMany({ where: { userId: { in: [...userIds] } } });
    await prisma.mfFinding.deleteMany({ where: { userId: { in: [...userIds] } } });
    await prisma.mfAnalysisRun.deleteMany({ where: { userId: { in: [...userIds] } } });
  });
}

beforeAll(async () => {
  userA = await createTestScope('mfapi56-a');
  userB = await createTestScope('mfapi56-b');

  await runAsSystem(async () => {
    for (const [code, name] of [
      [HELD, 'Test Held Large Cap Fund - Direct Growth'],
      [REPLACEMENT, 'Test Replacement Large Cap Fund - Direct Growth'],
      [UNHELD, 'Test Unheld Large Cap Fund - Direct Growth'],
    ] as const) {
      await prisma.mfSchemeMeta.upsert({
        where: { schemeCode: code },
        update: {},
        create: {
          schemeCode: code,
          schemeName: name,
          amcCode: 'MFAPI56AMC',
          amcName: 'Test AMC',
          sebiCategory: 'EQUITY',
          sebiSubCategory: 'Large Cap Fund',
          planType: 'DIRECT',
          optionType: 'GROWTH',
          benchmarkIndexCode: 'NIFTY100_TRI',
          inceptionDate: new Date('2012-06-15T00:00:00.000Z'),
          status: 'ACTIVE',
          riskometer: 'VERY_HIGH',
          sourceHash: `mfapi56-${code}`,
          fetchedAt: AS_OF,
        },
      });
    }

    const run = await prisma.mfAnalysisRun.create({
      data: {
        userId: userA.userId,
        asOf: AS_OF,
        // PARTIAL, not COMPLETED: the banner that names `missingCategories` is
        // a `06 §6` honesty state and has to be exercised by the default
        // fixture rather than by an afterthought.
        status: 'PARTIAL',
        factsSnapshot: {},
        portfolioAnalysis: {},
        ruleVersionsSnapshot: ruleVersionsSnapshot() as unknown as object,
        triggeredBy: 'HOLDINGS_CHANGE',
        startedAt: new Date('2026-09-01T10:00:00.000Z'),
        completedAt: new Date('2026-09-01T10:00:04.000Z'),
      },
      select: { id: true },
    });
    runId = run.id;

    await prisma.mfAnalysisRun.update({
      where: { id: runId },
      data: { portfolioAnalysis: portfolioAnalysis(runId) as unknown as object },
    });

    await prisma.mfFinding.createMany({
      data: [
        {
          runId,
          userId: userA.userId,
          schemeCode: HELD,
          ruleId: 'mf.risk.high-down-capture',
          ruleVersion: '1.0.0',
          code: 'HIGH_DOWN_CAPTURE',
          category: 'RISK',
          severity: 'WARNING',
          confidence: '0.700000',
          headline: 'Captured 118.4% of benchmark losses (category median 99.6%)',
          evidence: evidence() as unknown as object,
          whatWouldChangeThis: 'Would clear at a downside capture of 1.10 or better.',
          createdAt: new Date('2026-09-01T10:00:04.000Z'),
        },
        {
          // A portfolio-level finding: it must NOT appear on the fund endpoint.
          runId,
          userId: userA.userId,
          schemeCode: null,
          ruleId: 'mf.pf.too-many-funds',
          ruleVersion: '1.0.0',
          code: 'FUND_SPRAWL',
          category: 'PORTFOLIO',
          severity: 'NOTICE',
          confidence: '1.000000',
          headline: 'Your equity book is spread across more funds than it needs',
          evidence: [] as unknown as object,
          whatWouldChangeThis: 'Would clear below eleven equity funds.',
          createdAt: new Date('2026-09-01T10:00:04.000Z'),
        },
      ],
    });

    const verdict = await prisma.mfFundVerdict.create({
      data: {
        runId,
        userId: userA.userId,
        schemeCode: HELD,
        // Constructed directly. See the file header: no engine path can produce
        // this today, and the gate must still be provable.
        verdict: 'SWITCH_CANDIDATE',
        reasons: ['PERSISTENT_UNDERPERFORMANCE', 'HIGH_DOWN_CAPTURE'] as unknown as object,
        suggestedReplacementSchemeCode: REPLACEMENT,
        switchCost: {
          exitLoadInr: serializeMoney('0'),
          taxInr: serializeMoney('1482.50'),
          breakEvenMonths: serializeRatio('14.300000'),
        } as unknown as object,
        prose: 'This fund has fallen further than its peers in every down market since 2023.',
        proseModel: 'claude-haiku-4-5-20251001',
        proseVerified: true,
        createdAt: new Date('2026-09-01T10:00:04.000Z'),
      },
      select: { id: true },
    });
    verdictId = verdict.id;
  });

  const app = express();
  app.use(express.json());
  app.use('/api/mf-analytics', mfAnalyticsRouter);
  app.use(errorHandler);
  server = app.listen(0);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  tokenA = tokenFor(userA.userId, 'PLUS');
  tokenB = tokenFor(userB.userId, 'PLUS');
  freeToken = tokenFor(userA.userId, 'FREE');

  setRia('false');
});

afterAll(async () => {
  setRia(ORIGINAL_RIA);
  await new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve())),
  );
  await cleanupMfRows([userA.userId, userB.userId]);
  await userA.cleanup();
  await userB.cleanup();
  await runAsSystem(async () => {
    await prisma.mfSchemeMeta.deleteMany({ where: { schemeCode: { startsWith: PREFIX } } });
  });
});

// ---------------------------------------------------------------------------
// Auth and entitlement
// ---------------------------------------------------------------------------

describe('mf-analytics findings routes — auth and entitlement gate', () => {
  const paths = [
    '/api/mf-analytics/runs/latest',
    `/api/mf-analytics/funds/${HELD}/findings`,
    `/api/mf-analytics/funds/${HELD}/verdict`,
  ];

  it('401s every route without an Authorization header', async () => {
    for (const p of paths) {
      const res = await get(p);
      expect(res.status, p).toBe(401);
      expect(res.body.success).toBe(false);
    }
    const refresh = await post('/api/mf-analytics/refresh');
    expect(refresh.status).toBe(401);
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
    const refresh = await post('/api/mf-analytics/refresh', freeToken);
    expect(refresh.status).toBe(403);
    expect(refresh.body.code).toBe('FORBIDDEN');
  });
});

// ---------------------------------------------------------------------------
// GET /runs/latest
// ---------------------------------------------------------------------------

describe('GET /runs/latest', () => {
  it('returns the run with its findings, standing verdicts and rule snapshot', async () => {
    const res = await get('/api/mf-analytics/runs/latest', tokenA);
    expect(res.status).toBe(200);
    const run = res.body.data as MfAnalysisRunDto;

    expect(run.id).toBe(runId);
    expect(run.status).toBe('PARTIAL');
    expect(run.triggeredBy).toBe('HOLDINGS_CHANGE');
    expect(run.completedAt).not.toBeNull();
    expect(run.portfolioAnalysis.totals.currentValue).toBe('148250.7500');
    expect(run.findings).toHaveLength(2);
    expect(run.verdicts).toHaveLength(1);
    expect(run.ruleVersionsSnapshot).toHaveLength(3);
  });

  it('names the missing rule categories on a PARTIAL run rather than staying silent', async () => {
    const res = await get('/api/mf-analytics/runs/latest', tokenA);
    const run = res.body.data as MfAnalysisRunDto;
    // Derived by joining the errored ruleId back against the rule registry —
    // the snapshot records versions, not categories.
    expect(run.missingCategories).toEqual([FAILED_RULE_CATEGORY]);
  });

  it('orders findings most-serious-first', async () => {
    const res = await get('/api/mf-analytics/runs/latest', tokenA);
    const run = res.body.data as MfAnalysisRunDto;
    expect(run.findings.map((f) => f.severity)).toEqual(['WARNING', 'NOTICE']);
  });

  it('returns null (200) for a user who has never had an analysis run', async () => {
    const res = await get('/api/mf-analytics/runs/latest', tokenB);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toBeNull();
  });

  it('never exposes a RUNNING or FAILED run, whose payload columns are placeholders', async () => {
    // A later, incomplete run must not displace the last honest one: its
    // `portfolioAnalysis` is still the `{}` the engine writes before the facts
    // build, and rendering that would show a twelve-fund user an empty book.
    const ghostId = await runAsSystem(async () => {
      const row = await prisma.mfAnalysisRun.create({
        data: {
          userId: userA.userId,
          asOf: AS_OF,
          status: 'FAILED',
          factsSnapshot: {},
          portfolioAnalysis: {},
          ruleVersionsSnapshot: [],
          triggeredBy: 'HOLDINGS_CHANGE',
          startedAt: new Date('2026-09-02T10:00:00.000Z'),
          completedAt: new Date('2026-09-02T10:00:01.000Z'),
        },
        select: { id: true },
      });
      return row.id;
    });

    try {
      const res = await get('/api/mf-analytics/runs/latest', tokenA);
      expect(res.status).toBe(200);
      expect((res.body.data as MfAnalysisRunDto).id).toBe(runId);
    } finally {
      await runAsSystem(() => prisma.mfAnalysisRun.delete({ where: { id: ghostId } }));
    }
  });
});

// ---------------------------------------------------------------------------
// GET /funds/:schemeCode/findings
// ---------------------------------------------------------------------------

describe('GET /funds/:schemeCode/findings', () => {
  it('returns the fund findings with evidence and the mandatory counterfactual', async () => {
    const res = await get(`/api/mf-analytics/funds/${HELD}/findings`, tokenA);
    expect(res.status).toBe(200);
    const findings = res.body.data as MfFinding[];

    expect(findings).toHaveLength(1);
    const [finding] = findings;
    expect(finding!.code).toBe('HIGH_DOWN_CAPTURE');
    expect(finding!.confidence).toBe('0.700000');
    expect(finding!.evidence[0]!.value).toBe('1.184000');
    // `05 §3`: a finding without this is an opinion, not an observation.
    expect(finding!.whatWouldChangeThis.length).toBeGreaterThan(0);
  });

  it('excludes portfolio-level findings from a fund view', async () => {
    const res = await get(`/api/mf-analytics/funds/${HELD}/findings`, tokenA);
    const findings = res.body.data as MfFinding[];
    expect(findings.some((f) => f.code === 'FUND_SPRAWL')).toBe(false);
  });

  it('returns [] for a scheme the latest run said nothing about', async () => {
    const res = await get(`/api/mf-analytics/funds/${UNHELD}/findings`, tokenA);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// The RIA gate — BOTH states, same stored row
// ---------------------------------------------------------------------------

describe('RIA_VERDICTS_ENABLED — the compliance gate (06 §4)', () => {
  it('with the gate SHUT, downgrades SWITCH_CANDIDATE to REVIEW and strips the replacement', async () => {
    setRia('false');
    const res = await get(`/api/mf-analytics/funds/${HELD}/verdict`, tokenA);
    expect(res.status).toBe(200);
    const verdict = res.body.data as MfFundVerdictDto;

    expect(verdict.id).toBe(verdictId);
    expect(verdict.verdict).toBe('REVIEW');
    expect(verdict.suggestedReplacementSchemeCode).toBeNull();
    expect(verdict.suggestedReplacementName).toBeNull();
    // The UI must be able to say "analysis only" rather than implying the
    // engine reached a milder conclusion of its own accord.
    expect(verdict.advisoryGated).toBe(true);
    // Reasons and switch cost still travel: they are research, not advice, and
    // stripping them would leave the user unable to see why anything was said.
    expect(verdict.reasons).toEqual(['PERSISTENT_UNDERPERFORMANCE', 'HIGH_DOWN_CAPTURE']);
    expect(verdict.switchCost?.breakEvenMonths).toBe('14.300000');
  });

  it('with the gate OPEN, returns the stored SWITCH_CANDIDATE and names the replacement', async () => {
    setRia('true');
    try {
      const res = await get(`/api/mf-analytics/funds/${HELD}/verdict`, tokenA);
      expect(res.status).toBe(200);
      const verdict = res.body.data as MfFundVerdictDto;

      expect(verdict.id).toBe(verdictId);
      expect(verdict.verdict).toBe('SWITCH_CANDIDATE');
      expect(verdict.suggestedReplacementSchemeCode).toBe(REPLACEMENT);
      expect(verdict.suggestedReplacementName).toBe(
        'Test Replacement Large Cap Fund - Direct Growth',
      );
      // Nothing was downgraded, so nothing is flagged as gated.
      expect(verdict.advisoryGated).toBe(false);
    } finally {
      setRia('false');
    }
  });

  it('gates the copy of the verdict carried on /runs/latest identically', async () => {
    // Two endpoints returning the same row must not disagree about whether it
    // is advice. A gate applied on one path only is a gate with a hole in it.
    setRia('false');
    const shut = await get('/api/mf-analytics/runs/latest', tokenA);
    const shutVerdict = (shut.body.data as MfAnalysisRunDto).verdicts[0]!;
    expect(shutVerdict.verdict).toBe('REVIEW');
    expect(shutVerdict.advisoryGated).toBe(true);
    expect(shutVerdict.suggestedReplacementSchemeCode).toBeNull();

    setRia('true');
    try {
      const open = await get('/api/mf-analytics/runs/latest', tokenA);
      const openVerdict = (open.body.data as MfAnalysisRunDto).verdicts[0]!;
      expect(openVerdict.verdict).toBe('SWITCH_CANDIDATE');
      expect(openVerdict.advisoryGated).toBe(false);
      expect(openVerdict.suggestedReplacementSchemeCode).toBe(REPLACEMENT);
    } finally {
      setRia('false');
    }
  });

  it('the stored row is untouched by either state — the audit trail is the record', async () => {
    // `06 §4`: verdicts are computed and stored in full regardless of the flag,
    // because the record-keeping SEBI expects is what the engine concluded, not
    // what a feature flag displayed.
    const row = await runAsSystem(() =>
      prisma.mfFundVerdict.findUniqueOrThrow({ where: { id: verdictId } }),
    );
    expect(row.verdict).toBe('SWITCH_CANDIDATE');
    expect(row.suggestedReplacementSchemeCode).toBe(REPLACEMENT);
  });

  it('shows verified prose and withholds unverified prose without an error', async () => {
    // `06 §6`: proseVerified false ⇒ headlines, no prose, nothing surfaced to
    // the user. The finding headlines are what carry the page.
    const before = await get(`/api/mf-analytics/funds/${HELD}/verdict`, tokenA);
    expect((before.body.data as MfFundVerdictDto).prose).toMatch(/fallen further/);

    await runAsSystem(() =>
      prisma.mfFundVerdict.update({ where: { id: verdictId }, data: { proseVerified: false } }),
    );
    try {
      const after = await get(`/api/mf-analytics/funds/${HELD}/verdict`, tokenA);
      expect(after.status).toBe(200);
      const verdict = after.body.data as MfFundVerdictDto;
      expect(verdict.proseVerified).toBe(false);
      expect(verdict.prose).toBeNull();
      expect(verdict.proseModel).toBeNull();
    } finally {
      await runAsSystem(() =>
        prisma.mfFundVerdict.update({ where: { id: verdictId }, data: { proseVerified: true } }),
      );
    }
  });

  it('returns null for a scheme with no standing verdict', async () => {
    const res = await get(`/api/mf-analytics/funds/${UNHELD}/verdict`, tokenA);
    expect(res.status).toBe(200);
    expect(res.body.data).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Cross-user isolation
// ---------------------------------------------------------------------------

describe('cross-user isolation', () => {
  it("user B sees none of user A's findings, verdicts or runs", async () => {
    const [run, findings, verdict] = await Promise.all([
      get('/api/mf-analytics/runs/latest', tokenB),
      get(`/api/mf-analytics/funds/${HELD}/findings`, tokenB),
      get(`/api/mf-analytics/funds/${HELD}/verdict`, tokenB),
    ]);

    expect(run.status).toBe(200);
    expect(run.body.data).toBeNull();
    expect(findings.body.data).toEqual([]);
    expect(verdict.body.data).toBeNull();
  });

  it("user B cannot reach user A's verdict by naming its scheme code", async () => {
    // There is no id-addressable route by design, so the closest a caller can
    // come to enumerating another tenant's advice is guessing the scheme they
    // hold. That returns null, not a 200 with somebody else's conclusion.
    const res = await get(`/api/mf-analytics/funds/${HELD}/verdict`, tokenB);
    expect(res.status).toBe(200);
    expect(res.body.data).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// POST /refresh
// ---------------------------------------------------------------------------

describe('POST /refresh', () => {
  it('runs the engine and returns the resulting run, then rate-limits the second call', async () => {
    const first = await post('/api/mf-analytics/refresh', tokenB);
    expect(first.status).toBe(200);
    const run = first.body.data as MfAnalysisRunDto;
    expect(run.triggeredBy).toBe('USER_REFRESH');
    expect(['COMPLETED', 'PARTIAL']).toContain(run.status);

    // `01 §5(c)`: 1/hour, enforced by the job against `MfAnalysisRun.startedAt`
    // rather than by a second limiter on the route.
    const second = await post('/api/mf-analytics/refresh', tokenB);
    expect(second.status).toBe(429);
    expect(second.body.code).toBe('TOO_MANY_REQUESTS');
    // The message names when the next refresh becomes available: a button that
    // fails silently teaches the user nothing.
    expect(second.body.error).toMatch(/Next refresh available at/);
  });

  it('does not spend user A\'s window when user B is rate-limited', async () => {
    const res = await post('/api/mf-analytics/refresh', tokenA);
    expect([200, 429]).toContain(res.status);
    if (res.status === 200) {
      expect((res.body.data as MfAnalysisRunDto).triggeredBy).toBe('USER_REFRESH');
    }
  });
});

// ---------------------------------------------------------------------------
// The wire invariant
// ---------------------------------------------------------------------------

describe('every numeric on the wire is a Decimal string', () => {
  it('holds across every response this router serves', async () => {
    const responses = await Promise.all([
      get('/api/mf-analytics/runs/latest', tokenA),
      get(`/api/mf-analytics/funds/${HELD}/findings`, tokenA),
      get(`/api/mf-analytics/funds/${HELD}/verdict`, tokenA),
    ]);
    for (const res of responses) {
      expect(res.status).toBe(200);
      expect(offendingNumbers(res.body.data)).toEqual([]);
    }
  });

  it('the walker actually fires on a planted number (guards against a vacuous pass)', () => {
    expect(offendingNumbers({ confidence: 0.7 })).toEqual(['$.confidence = 0.7']);
    // A genuine count is allowed; a lost brand is not.
    expect(offendingNumbers({ emitted: 3 })).toEqual([]);
  });
});
