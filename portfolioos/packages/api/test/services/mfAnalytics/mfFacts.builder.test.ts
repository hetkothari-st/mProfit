/**
 * `mfFacts.builder.ts` — Task 5.1's "done when" condition and the invariants
 * around it (`docs/mf-analytics/05-FINDINGS-ENGINE.md §2`,
 * `07-IMPLEMENTATION-PLAN.md` Task 5.1).
 *
 * Four things are under test, and each has a failure mode that is silent:
 *
 *  1. **JSON round-trip fidelity.** The facts are snapshotted onto
 *     `MfAnalysisRun.factsSnapshot` and read back to replay a run under a newer
 *     rule version (`05 §8.8`). If a `Date` or a `Decimal` reaches the
 *     snapshot it serialises to a *string*, and the replay then hands a rule a
 *     string where the live run handed it an object — a crash on a code path
 *     nobody watches, months later. Asserted two ways below: structurally
 *     (nothing but JSON primitives is present) and behaviourally
 *     (`JSON.parse(JSON.stringify(facts))` is `toStrictEqual` the original).
 *  2. **Batched loading.** `05 §2` says one query per table. A per-scheme
 *     fan-out is invisible on a two-fund fixture and quadratic on a real
 *     household, and every one of those queries is wrapped in its own
 *     transaction by the RLS hook (`CONTEXT.md §5`). Measured by counting
 *     delegate calls for a 1-fund user and a 3-fund user and asserting the
 *     difference is zero.
 *  3. **The empty case is a value, not an exception.** A user who holds no
 *     mutual funds must get well-formed empty facts. A throw here would take
 *     out the whole engine for every new user.
 *  4. **Family caps are honoured, and `null` is not `[]`.** `CONTEXT.md §6`:
 *     conflating them is a fail-*open* bug and it shipped once.
 *
 * **Every service call is inside `scope.runAs(...)`** (`CONTEXT.md §12`).
 * Without it RLS fails closed and every query returns zero rows, which looks
 * exactly like a logic bug and is not one. Fixture writes run under
 * `runAsSystem` so the bootstrap inserts are not themselves blocked.
 *
 * **The local database is shared with other agents.** Every fixture row this
 * file creates is namespaced with `FX` below, and `afterAll` deletes only rows
 * matching that prefix or belonging to users this file created. There is no
 * unscoped `deleteMany` anywhere in here, deliberately.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Decimal, MIN_UNIVERSE_SIZE, toDecimal } from '@portfolioos/shared';
import type { MFCategory } from '@prisma/client';

import { prisma } from '../../../src/lib/prisma.js';
import { runAsSystem } from '../../../src/lib/requestContext.js';
import { buildMfAnalysisFacts } from '../../../src/services/mfAnalytics/mfFacts.builder.js';
import { MF_HORIZON_KEYS } from '../../../src/services/mfAnalytics/types.js';
import { UNPERSISTED_RUN_ID } from '../../../src/services/mfAnalytics/mfPortfolioAnalysis.service.js';
import { getEffectiveScope } from '../../../src/services/familyScope.service.js';
import { createTestScope, type TestScope } from '../../helpers/db.js';

// ---------------------------------------------------------------------------
// Fixture namespace
// ---------------------------------------------------------------------------

/** Prefix on every scheme code, ISIN and AMC this file writes. */
const FX = 'TSTMFFB';

/**
 * Fixed rather than `new Date()`: the metrics/peer/score rows below are dated
 * relative to it, so what the builder picks up is a property of the fixture
 * and not of the day the suite happens to run.
 */
const AS_OF = new Date(Date.UTC(2026, 5, 30));
/** The universe snapshot date. Strictly before `AS_OF`, as a real one would be. */
const SCORE_AS_OF = new Date(Date.UTC(2026, 4, 31));

/** Held, growth option, fully populated: metrics, peer, score, qualitative. */
const S_FULL = `${FX}-FULL`;
/** Held, growth option, no reference data at all — every map must be null. */
const S_BARE = `${FX}-BARE`;
/** Held, IDCW option. Its metrics live under its growth sibling. */
const S_IDCW = `${FX}-IDCW`;
/** Not held. The growth sibling of `S_IDCW`, and where its rows are stored. */
const S_SIBLING = `${FX}-SIB`;
/** Not held. The adviser-approved replacement candidate. */
const S_APPROVED = `${FX}-APPR`;

/** `"<sebiSubCategory>|<planType>"` (`03 §1`). */
const UNIVERSE_KEY = `Large Cap Fund|DIRECT`;

/** `S_FULL`'s own composite. Mid-table, so it is not an edge case itself. */
const FULL_COMPOSITE = 72;
/**
 * `S_APPROVED`'s composite. It is a rated, ACTIVE, GROWTH, DIRECT Large Cap
 * fund, so it is a genuine member of `UNIVERSE_KEY` and counts toward the
 * category statistics — being on the adviser's list does not remove a fund
 * from its own peer group.
 */
const APPROVED_COMPOSITE = 88;
/** Eleven anonymous peers, to take the universe past `MIN_UNIVERSE_SIZE`. */
const PEER_COMPOSITES = [40, 44, 48, 52, 56, 60, 64, 68, 76, 80, 84];

/**
 * Every rated composite in `UNIVERSE_KEY` at `SCORE_AS_OF`, and the statistics
 * that follow from it — hand-derived here rather than read off the
 * implementation, so this tests the statistic and not a snapshot of it.
 *
 * Sorted (n = 13): 40 44 48 52 56 60 64 68 72 76 80 84 88
 *   median            = the 7th value            -> 64
 *   nearest-rank p75  = index ceil(0.75 x 13) - 1 = 9 -> 76
 */
const UNIVERSE_SIZE = PEER_COMPOSITES.length + 2;
const EXPECTED_MEDIAN = '64';
const EXPECTED_TOP_QUARTILE = '76';

const MS_PER_DAY = 86_400_000;
const DAYS_PER_YEAR = 365.25;

function utc(y: number, m: number, d: number): Date {
  return new Date(Date.UTC(y, m, d));
}

// ---------------------------------------------------------------------------
// Fixture builders
// ---------------------------------------------------------------------------

const fundIdByScheme = new Map<string, string>();

interface SchemeSeed {
  schemeCode: string;
  optionType?: 'GROWTH' | 'IDCW_PAYOUT' | 'IDCW_REINVEST';
  growthSiblingSchemeCode?: string | null;
  planType?: 'DIRECT' | 'REGULAR';
  masterCategory?: MFCategory;
  terPct?: string;
}

async function seedScheme(seed: SchemeSeed): Promise<string> {
  const master = await prisma.mutualFundMaster.create({
    data: {
      schemeCode: seed.schemeCode,
      schemeName: `${seed.schemeCode} Fund`,
      amcName: `${FX} AMC`,
      category: seed.masterCategory ?? 'EQUITY',
    },
  });
  await prisma.mfSchemeMeta.create({
    data: {
      schemeCode: seed.schemeCode,
      schemeName: `${seed.schemeCode} Fund`,
      amcCode: `${FX}AMC`,
      amcName: `${FX} AMC`,
      sebiCategory: 'EQUITY',
      sebiSubCategory: 'Large Cap Fund',
      planType: seed.planType ?? 'DIRECT',
      optionType: seed.optionType ?? 'GROWTH',
      growthSiblingSchemeCode: seed.growthSiblingSchemeCode ?? null,
      benchmarkIndexCode: null,
      inceptionDate: utc(2014, 0, 1),
      status: 'ACTIVE',
      sourceHash: `${seed.schemeCode}:meta`,
      fetchedAt: AS_OF,
    },
  });
  if (seed.terPct !== undefined) {
    await prisma.mfSchemeTer.create({
      data: {
        schemeCode: seed.schemeCode,
        effectiveFrom: utc(2024, 0, 1),
        terPct: seed.terPct,
        sourceHash: `${seed.schemeCode}:ter`,
        fetchedAt: AS_OF,
      },
    });
  }
  fundIdByScheme.set(seed.schemeCode, master.id);
  return master.id;
}

/**
 * A metrics row whose `metrics` payload is the shape the real job writes: the
 * whole `MfHorizonMetrics` object, numerics as Decimal strings.
 *
 * Only the fields the builder or a later rule actually reads are populated.
 * The point of the fixture is the join and the JSON closure, not the maths —
 * `mfMetrics.service.test.ts` owns that.
 */
async function seedHorizonMetrics(schemeCode: string, horizonYears: number): Promise<void> {
  await prisma.mfSchemeMetrics.create({
    data: {
      schemeCode,
      asOf: SCORE_AS_OF,
      horizonYears,
      status: 'OK',
      mathVersion: 'test-1.0.0',
      benchmarkCode: null,
      riskFreeSeries: 'TBILL_91D',
      metrics: {
        asOf: SCORE_AS_OF.toISOString().slice(0, 10),
        horizonYears,
        observationsMonthly: horizonYears * 12,
        status: 'OK',
        mathVersion: 'test-1.0.0',
        returns: { cagr: horizonYears === 1 ? null : '0.140000' },
        risk: { maxDrawdown: '-0.320000' },
        riskAdjusted: { sortino: '1.100000' },
        relative: { downCapture: '1.250000' },
        consistency: { rollingBeatBenchPct: '0.250000' },
        fieldStatus: {},
      },
    },
  });
}

/** The `horizonYears = 0` current-profile row (`02 §7`). */
async function seedProfile(schemeCode: string): Promise<void> {
  await prisma.mfSchemeMetrics.create({
    data: {
      schemeCode,
      asOf: SCORE_AS_OF,
      horizonYears: 0,
      status: 'OK',
      mathVersion: 'test-1.0.0',
      metrics: {
        asOf: SCORE_AS_OF.toISOString().slice(0, 10),
        snapshotAsOf: '2026-04-30',
        status: 'OK',
        terPct: '1.750000',
        terPercentile: '0.120000',
        top10WeightPct: '64.000000',
        turnoverIsEstimated: true,
        durationIsApproximated: false,
        currentManagers: [],
        topHoldings: [],
        fieldStatus: {},
      },
    },
  });
}

async function seedPeerRank(schemeCode: string, horizonYears: number): Promise<void> {
  await prisma.mfPeerRank.create({
    data: {
      schemeCode,
      asOf: SCORE_AS_OF,
      horizonYears,
      universeKey: UNIVERSE_KEY,
      universeSize: UNIVERSE_SIZE,
      // Written in `serializePeerRankPayload`'s shape: bare metric keys plus
      // `$`-prefixed internals. The builder must go through
      // `parsePeerRankPayload`, not hand-parse, and this proves it does.
      percentiles: {
        'relative.downCapture': '0.180000',
        'riskAdjusted.sortino': '0.220000',
        $medians: { 'relative.downCapture': '1.020000' },
        $version: '1.0.0',
      },
    },
  });
}

async function seedScore(
  schemeCode: string,
  composite: number,
  rating: number | null,
): Promise<void> {
  await prisma.mfSchemeScore.create({
    data: {
      schemeCode,
      asOf: SCORE_AS_OF,
      methodologyVersion: 'score-test-v1',
      modelKey: 'ACTIVE_EQUITY',
      ratingStatus: 'RATED',
      composite: new Decimal(composite).toFixed(6),
      rating,
      pillars: {},
      universeKey: UNIVERSE_KEY,
      universeSize: UNIVERSE_SIZE,
    },
  });
}

/**
 * Give a scope a position in a scheme: the transaction that produced it plus
 * the `HoldingProjection` row it projects to (`CONTEXT.md §3.2` — holdings are
 * a projection, and the price router is not part of what is under test).
 */
async function seedPosition(
  scope: TestScope,
  schemeCode: string,
  opts: { quantity: string; price: string; netAmount: string; currentValue: string },
): Promise<void> {
  const fundId = fundIdByScheme.get(schemeCode)!;
  const assetKey = `fund:${fundId}`;
  await prisma.transaction.create({
    data: {
      portfolioId: scope.portfolioId,
      assetClass: 'MUTUAL_FUND',
      transactionType: 'BUY',
      fundId,
      assetName: schemeCode,
      tradeDate: utc(2024, 0, 10),
      quantity: opts.quantity,
      price: opts.price,
      grossAmount: opts.netAmount,
      netAmount: opts.netAmount,
      assetKey,
    },
  });
  await prisma.holdingProjection.create({
    data: {
      portfolioId: scope.portfolioId,
      assetKey,
      assetClass: 'MUTUAL_FUND',
      fundId,
      assetName: schemeCode,
      quantity: opts.quantity,
      avgCostPrice: opts.price,
      totalCost: opts.netAmount,
      currentValue: opts.currentValue,
      unrealisedPnL: toDecimal(opts.currentValue).minus(toDecimal(opts.netAmount)).toFixed(4),
      sourceTxCount: 1,
    },
  });
}

// ---------------------------------------------------------------------------
// JSON-closure assertions
// ---------------------------------------------------------------------------

/**
 * Walk a value and collect every path that could not survive JSON.
 *
 * Deliberately independent of the builder's own `toSnapshotSafe`: if both the
 * production guard and its test used one implementation, a bug in that
 * implementation would be invisible to both. This one only *reports*, and it
 * reports the path, so a failure names the field rather than the fact that
 * something somewhere is wrong.
 */
function jsonHazards(value: unknown, path = '$', out: string[] = []): string[] {
  if (value === null) return out;
  const t = typeof value;
  if (t === 'string' || t === 'boolean') return out;
  if (t === 'number') {
    if (!Number.isFinite(value as number)) out.push(`${path}: non-finite number`);
    return out;
  }
  if (t !== 'object') {
    out.push(`${path}: ${t}`);
    return out;
  }
  if (Array.isArray(value)) {
    value.forEach((item, i) => {
      if (item === undefined) out.push(`${path}[${i}]: undefined array element`);
      else jsonHazards(item, `${path}[${i}]`, out);
    });
    return out;
  }
  const proto = Object.getPrototypeOf(value as object);
  if (proto !== Object.prototype && proto !== null) {
    out.push(`${path}: ${(value as object).constructor?.name ?? 'unknown'} instance`);
    return out;
  }
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (v === undefined) out.push(`${path}.${k}: undefined property`);
    else jsonHazards(v, `${path}.${k}`, out);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Query counting
// ---------------------------------------------------------------------------

/**
 * The delegates whose call counts must not grow with the number of held
 * schemes. Every one of them is loaded with an `in` list, once per run.
 */
const COUNTED_DELEGATES = [
  'mfSchemeMetrics',
  'mfPeerRank',
  'mfSchemeQualitativeFact',
  'mfSchemeScore',
  'mfSchemeMeta',
  'mfSchemeTer',
  'mutualFundMaster',
  'advisorApprovedProduct',
  'goal',
] as const;

const COUNTED_METHODS = ['findMany', 'findFirst', 'findUnique', 'count'] as const;

/**
 * Run `fn` with the delegates above instrumented, and return per-delegate call
 * counts.
 *
 * Monkey-patching rather than `vi.spyOn` because the client is a Prisma
 * `$extends` proxy and the assertion needs to survive whatever `spyOn` does or
 * does not manage to install on it. Restored in a `finally`, so a failure
 * inside `fn` cannot leave the shared client instrumented for the next file.
 */
async function countQueries<T>(
  fn: () => Promise<T>,
): Promise<{ result: T; counts: Record<string, number> }> {
  const counts: Record<string, number> = {};
  const restore: Array<() => void> = [];

  for (const delegateName of COUNTED_DELEGATES) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const delegate = (prisma as any)[delegateName];
    if (delegate === undefined) continue;
    counts[delegateName] = 0;
    for (const method of COUNTED_METHODS) {
      const original = delegate[method];
      if (typeof original !== 'function') continue;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delegate[method] = (...args: any[]) => {
        counts[delegateName] = (counts[delegateName] ?? 0) + 1;
        return original.apply(delegate, args);
      };
      restore.push(() => {
        delegate[method] = original;
      });
    }
  }

  try {
    const result = await fn();
    return { result, counts };
  } finally {
    for (const undo of restore) undo();
  }
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

const scopes: TestScope[] = [];

async function newScope(label: string): Promise<TestScope> {
  const s = await createTestScope(`mffb-${label}`);
  scopes.push(s);
  return s;
}

/** Holds all three schemes. The main subject. */
let richUser: TestScope;
/**
 * Holds exactly one scheme. The control for the batching assertion, so it is
 * given an identical *profile* to `richUser` — same approved list, same goal —
 * and differs from it in nothing but the number of funds held. Without that,
 * the query-count delta measures the approved list, not the fan-out.
 */
let oneFundUser: TestScope;
/** Holds nothing. */
let emptyUser: TestScope;
let famOwner: TestScope;
let famViewer: TestScope;
let familyId: string;
let modelPortfolioId: string;
let controlModelPortfolioId: string;
let approvedFundId: string;

beforeAll(async () => {
  richUser = await newScope('rich');
  oneFundUser = await newScope('one');
  emptyUser = await newScope('empty');
  famOwner = await newScope('fam-owner');
  famViewer = await newScope('fam-viewer');

  await runAsSystem(async () => {
    // -- reference data ----------------------------------------------------
    await seedScheme({ schemeCode: S_FULL, terPct: '1.750000' });
    await seedScheme({ schemeCode: S_BARE });
    await seedScheme({
      schemeCode: S_IDCW,
      optionType: 'IDCW_PAYOUT',
      growthSiblingSchemeCode: S_SIBLING,
    });
    await seedScheme({ schemeCode: S_SIBLING });
    approvedFundId = await seedScheme({ schemeCode: S_APPROVED, terPct: '0.550000' });

    // S_FULL: full stack. S_SIBLING: metrics+peer only, so the IDCW option's
    // maps come from it while its own score stays absent.
    for (const h of [1, 3, 5, 7, 10]) {
      await seedHorizonMetrics(S_FULL, h);
      await seedPeerRank(S_FULL, h);
    }
    await seedProfile(S_FULL);
    await seedHorizonMetrics(S_SIBLING, 3);
    await seedPeerRank(S_SIBLING, 3);
    await seedProfile(S_SIBLING);

    // The universe: S_FULL, the approved candidate, and eleven anonymous peers
    // that take it past MIN_UNIVERSE_SIZE so median and top quartile exist.
    await seedScore(S_FULL, FULL_COMPOSITE, 3);
    for (let i = 0; i < PEER_COMPOSITES.length; i += 1) {
      const peerCode = `${FX}-PEER${i}`;
      await seedScheme({ schemeCode: peerCode });
      await seedScore(peerCode, PEER_COMPOSITES[i]!, 3);
    }
    // The approved candidate is a 5-star fund in the same sub-category — the
    // exact shape 05 §5 row 3 looks for.
    await seedScore(S_APPROVED, APPROVED_COMPOSITE, 5);

    // In force at AS_OF (open-ended), so it must appear on S_FULL's facts.
    await prisma.mfSchemeQualitativeFact.create({
      data: {
        schemeCode: S_FULL,
        factType: 'AMC_REGULATORY_ACTION',
        value: { note: `${FX} test action` },
        validFrom: utc(2025, 0, 1),
        validTo: null,
        source: `${FX}://test`,
        enteredBy: `${FX}-admin`,
      },
    });
    // Lapsed a year before AS_OF. Must NOT appear: a finding driven by an
    // expired fact is a finding about something that is no longer true.
    await prisma.mfSchemeQualitativeFact.create({
      data: {
        schemeCode: S_FULL,
        factType: 'STRATEGY_CAPACITY_CAP',
        value: { note: `${FX} lapsed` },
        validFrom: utc(2023, 0, 1),
        validTo: utc(2025, 0, 1),
        source: `${FX}://lapsed`,
        enteredBy: `${FX}-admin`,
      },
    });

    // -- positions ---------------------------------------------------------
    for (const code of [S_FULL, S_BARE, S_IDCW]) {
      await seedPosition(richUser, code, {
        quantity: '1000.000000',
        price: '100.0000',
        netAmount: '100000.0000',
        currentValue: '120000.0000',
      });
    }
    await seedPosition(oneFundUser, S_FULL, {
      quantity: '1000.000000',
      price: '100.0000',
      netAmount: '100000.0000',
      currentValue: '120000.0000',
    });
    await seedPosition(famOwner, S_FULL, {
      quantity: '500.000000',
      price: '100.0000',
      netAmount: '50000.0000',
      currentValue: '60000.0000',
    });

    // -- the caller's own profile -----------------------------------------
    const model = await prisma.modelPortfolio.create({
      data: { userId: richUser.userId, name: `${FX} Balanced`, riskCategory: 'BALANCED' },
    });
    modelPortfolioId = model.id;
    await prisma.advisorApprovedProduct.create({
      data: {
        userId: richUser.userId,
        modelPortfolioId,
        bucket: 'EQUITY_DOMESTIC',
        rank: 1,
        fundId: approvedFundId,
        label: `${S_APPROVED} Fund`,
      },
    });
    await prisma.goal.create({
      data: {
        userId: richUser.userId,
        name: `${FX} Retirement`,
        category: 'RETIREMENT',
        priority: 'HIGH',
        status: 'ACTIVE',
        targetAmount: '5000000',
        initialAmount: '100000',
        targetDate: utc(2036, 5, 30),
        startDate: utc(2024, 0, 1),
        portfolioIds: [richUser.portfolioId],
      },
    });

    // The control's profile, identical to the above. Income is deliberately
    // NOT given to it — `incomeKnown` is asserted false for this user, and
    // income is read with one unconditional query either way, so it cannot
    // affect the count.
    const controlModel = await prisma.modelPortfolio.create({
      data: { userId: oneFundUser.userId, name: `${FX} Balanced`, riskCategory: 'BALANCED' },
    });
    controlModelPortfolioId = controlModel.id;
    await prisma.advisorApprovedProduct.create({
      data: {
        userId: oneFundUser.userId,
        modelPortfolioId: controlModelPortfolioId,
        bucket: 'EQUITY_DOMESTIC',
        rank: 1,
        fundId: approvedFundId,
        label: `${S_APPROVED} Fund`,
      },
    });
    await prisma.goal.create({
      data: {
        userId: oneFundUser.userId,
        name: `${FX} Retirement`,
        category: 'RETIREMENT',
        priority: 'HIGH',
        status: 'ACTIVE',
        targetAmount: '5000000',
        initialAmount: '100000',
        targetDate: utc(2036, 5, 30),
        startDate: utc(2024, 0, 1),
        portfolioIds: [oneFundUser.portfolioId],
      },
    });
    await prisma.income.create({
      data: {
        userId: richUser.userId,
        type: 'SALARY',
        sourceName: `${FX} Employer`,
        monthlyAmount: '150000.00',
        isActive: true,
      },
    });

    // -- family ------------------------------------------------------------
    const family = await prisma.family.create({
      data: { name: `${FX} Household`, createdById: famOwner.userId },
    });
    familyId = family.id;
    await prisma.familyMember.create({
      data: { familyId, userId: famOwner.userId, role: 'OWNER', status: 'ACTIVE' },
    });
    await prisma.familyMember.create({
      data: {
        familyId,
        userId: famViewer.userId,
        role: 'VIEWER',
        status: 'ACTIVE',
        // `@default([])` is the state of every member invited without someone
        // ticking boxes, and `[]` is DENY-ALL, not "unrestricted".
        visibleAssetClasses: [],
        visibleCategories: [],
      },
    });
  });
}, 180_000);

afterAll(async () => {
  // The family goes first: `Family.createdById` is a foreign key onto the
  // owner, so `createTestScope`'s `user.delete` fails (silently — it catches)
  // while the family still stands. Then the per-scope cleanups, which own the
  // user-scoped rows referencing the reference data. Then the reference data.
  //
  // Every delete below is bounded to a user this file created or to the `FX`
  // namespace: the local database is shared with other agents and must come
  // out of this suite exactly as it went in.
  await runAsSystem(async () => {
    await prisma.familyMember.deleteMany({ where: { familyId } });
    await prisma.family.deleteMany({ where: { id: familyId } });
    await prisma.advisorApprovedProduct.deleteMany({
      where: { modelPortfolioId: { in: [modelPortfolioId, controlModelPortfolioId] } },
    });
    await prisma.goal.deleteMany({
      where: { userId: { in: [richUser.userId, oneFundUser.userId] } },
    });
    await prisma.income.deleteMany({ where: { userId: richUser.userId } });
    await prisma.modelPortfolio.deleteMany({
      where: { id: { in: [modelPortfolioId, controlModelPortfolioId] } },
    });
  });

  for (const s of scopes) await s.cleanup();

  await runAsSystem(async () => {
    await prisma.mfSchemeQualitativeFact.deleteMany({
      where: { schemeCode: { startsWith: FX } },
    });
    await prisma.mfPeerRank.deleteMany({ where: { schemeCode: { startsWith: FX } } });
    await prisma.mfSchemeScore.deleteMany({ where: { schemeCode: { startsWith: FX } } });
    await prisma.mfSchemeMetrics.deleteMany({ where: { schemeCode: { startsWith: FX } } });
    await prisma.mfSchemeTer.deleteMany({ where: { schemeCode: { startsWith: FX } } });
    await prisma.mfSchemeMeta.deleteMany({ where: { schemeCode: { startsWith: FX } } });
    await prisma.mutualFundMaster.deleteMany({ where: { schemeCode: { startsWith: FX } } });
  });
}, 180_000);

// ---------------------------------------------------------------------------

async function factsFor(scope: TestScope, opts: { familyId?: string } = {}) {
  return scope.runAs(async () => {
    const eff = await getEffectiveScope(scope.userId, opts);
    return buildMfAnalysisFacts(eff, AS_OF);
  });
}

// ---------------------------------------------------------------------------
// 1. JSON round-trip — Task 5.1's "done when"
// ---------------------------------------------------------------------------

describe('JSON round-trip fidelity', () => {
  it('round-trips through JSON.parse(JSON.stringify(…)) unchanged', async () => {
    const facts = await factsFor(richUser);

    // Structural: nothing in the tree is anything but a JSON primitive,
    // a plain object or an array. Checked first because it names the offending
    // path, where the deep-equal below would only say "not equal".
    expect(jsonHazards(facts)).toEqual([]);

    // Behavioural: `toStrictEqual`, not `toEqual`. `toEqual` treats a missing
    // key and an `undefined` key as the same thing, which is exactly the
    // difference the snapshot has to survive.
    const roundTripped = JSON.parse(JSON.stringify(facts));
    expect(roundTripped).toStrictEqual(facts);
  });

  it('rejects a Date, a Decimal and an undefined array element by path', async () => {
    // The guard is what makes the round trip a property rather than a
    // coincidence, so it is tested directly: a violation must throw naming the
    // field, not sail through and corrupt a snapshot months later.
    const { toSnapshotSafe } = await import(
      '../../../src/services/mfAnalytics/mfFacts.builder.js'
    );
    expect(() => toSnapshotSafe({ a: { b: new Date() } }, '$')).toThrow(/\$\.a\.b/);
    expect(() => toSnapshotSafe({ a: new Decimal(1) }, '$')).toThrow(/Decimal/);
    expect(() => toSnapshotSafe({ a: [1, undefined, 3] }, '$')).toThrow(/\$\.a\[1\]/);
    expect(() => toSnapshotSafe({ a: Number.NaN }, '$')).toThrow(/non-finite/);
    // An `undefined` *property* is dropped, not rejected — JSON.stringify does
    // the same, and the upstream DTOs use optional fields legitimately.
    expect(toSnapshotSafe({ a: 1, b: undefined }, '$')).toStrictEqual({ a: 1 });
  });
});

// ---------------------------------------------------------------------------
// 2. Shape — `05 §2`
// ---------------------------------------------------------------------------

describe('MfAnalysisFacts shape', () => {
  it('keys funds by scheme code and carries the 04 analysis whole', async () => {
    const facts = await factsFor(richUser);

    expect(Object.keys(facts.funds).sort()).toEqual([S_BARE, S_FULL, S_IDCW].sort());
    expect(facts.userId).toBe(richUser.userId);
    expect(facts.asOf).toBe(AS_OF.toISOString());
    expect(facts.scope.callerId).toBe(richUser.userId);
    // Not a re-derivation: the DTO the portfolio page renders, verbatim.
    expect(facts.portfolio.runId).toBe(UNPERSISTED_RUN_ID);
    expect(facts.portfolio.funds).toHaveLength(3);
    // Thresholds travel with the facts so a rule never imports them (05 §3).
    expect(facts.constants.highTerPercentileCeiling).toBe(0.25);
  });

  it('carries a total horizon map — every key present, missing rows null', async () => {
    const facts = await factsFor(richUser);

    const full = facts.funds[S_FULL]!;
    expect(Object.keys(full.metrics).sort()).toEqual([...MF_HORIZON_KEYS].sort());
    expect(Object.keys(full.peer).sort()).toEqual([...MF_HORIZON_KEYS].sort());
    expect(full.metrics['3']).not.toBeNull();
    expect(full.profile).not.toBeNull();
    expect(full.profile!.terPercentile).toBe('0.120000');

    // A fund with no reference data at all: every key present, every value
    // null. "We have no 10-year history" and "we did not look" must not be the
    // same value, and an absent key cannot tell them apart.
    const bare = facts.funds[S_BARE]!;
    for (const key of MF_HORIZON_KEYS) {
      expect(bare.metrics[key]).toBeNull();
      expect(bare.peer[key]).toBeNull();
    }
    expect(bare.profile).toBeNull();
    expect(bare.score).toBeNull();
    expect(bare.qualitative).toEqual([]);
  });

  it('resolves an IDCW option through its growth sibling (03 §1)', async () => {
    const facts = await factsFor(richUser);
    const idcw = facts.funds[S_IDCW]!;

    // Its own scheme code has no metrics row. Showing it a rank computed from
    // its own payout-depressed NAV would understate the fund by the whole
    // distribution, so it borrows the sibling's.
    expect(idcw.meta.schemeCode).toBe(S_IDCW);
    expect(idcw.meta.growthSiblingSchemeCode).toBe(S_SIBLING);
    expect(idcw.metrics['3']).not.toBeNull();
    expect(idcw.peer['3']).not.toBeNull();
    expect(idcw.profile).not.toBeNull();
  });

  it('parses the peer payload through its documented inverse, not by hand', async () => {
    const facts = await factsFor(richUser);
    const peer = facts.funds[S_FULL]!.peer['3']!;

    expect(peer.universeKey).toBe(UNIVERSE_KEY);
    expect(peer.universeSize).toBe(UNIVERSE_SIZE);
    expect(peer.percentiles['relative.downCapture']).toBe('0.180000');
    expect(peer.medians['relative.downCapture']).toBe('1.020000');
    // The `$`-prefixed internals are an implementation detail of the column
    // and must not leak into the facts a rule reasons over.
    expect(Object.keys(peer.percentiles)).not.toContain('$medians');
    expect(Object.keys(peer.percentiles)).not.toContain('$version');
  });

  it('computes category stats from the rated members of the fund own universe snapshot', async () => {
    const facts = await factsFor(richUser);
    const stats = facts.funds[S_FULL]!.categoryStats;

    expect(stats.universeKey).toBe(UNIVERSE_KEY);
    expect(stats.universeSize).toBe(UNIVERSE_SIZE);
    expect(stats.universeSize).toBeGreaterThanOrEqual(MIN_UNIVERSE_SIZE);
    // Hand-derived at the top of this file from UNIVERSE_COMPOSITES.
    expect(toDecimal(stats.medianComposite!).toString()).toBe(EXPECTED_MEDIAN);
    expect(toDecimal(stats.topQuartileComposite!).toString()).toBe(EXPECTED_TOP_QUARTILE);

    // An unscored fund has no universe. Null, not zero — a category we cannot
    // rank is not a category where everyone scores nothing.
    const bare = facts.funds[S_BARE]!.categoryStats;
    expect(bare.universeKey).toBeNull();
    expect(bare.medianComposite).toBeNull();
    expect(bare.topQuartileComposite).toBeNull();
  });

  it('includes qualitative facts in force at asOf and excludes lapsed ones', async () => {
    const facts = await factsFor(richUser);
    const types = facts.funds[S_FULL]!.qualitative.map((f) => f.factType);

    expect(types).toContain('AMC_REGULATORY_ACTION');
    expect(types).not.toContain('STRATEGY_CAPACITY_CAP');
    // ISO date strings, not Dates — the snapshot has to survive JSON.
    expect(facts.funds[S_FULL]!.qualitative[0]!.validFrom).toBe('2025-01-01');
    expect(facts.funds[S_FULL]!.qualitative[0]!.validTo).toBeNull();
  });

  it('denormalises the approved universe so the verdict table stays pure', async () => {
    const facts = await factsFor(richUser);
    expect(facts.approvedUniverse).toHaveLength(1);

    const candidate = facts.approvedUniverse[0]!;
    // 05 §5 row 3 needs sub-category and rating on the candidate. Without them
    // in the facts, mfVerdict.ts could only get them by querying — which would
    // make the verdict impure — or by guessing.
    expect(candidate.schemeCode).toBe(S_APPROVED);
    expect(candidate.sebiSubCategory).toBe('Large Cap Fund');
    expect(candidate.planType).toBe('DIRECT');
    expect(candidate.rating).toBe(5);
    expect(toDecimal(candidate.composite!).toString()).toBe(`${APPROVED_COMPOSITE}`);
    expect(candidate.terPct).toBe('0.550000');
  });

  it('carries the user profile, with income as a boolean rather than an amount', async () => {
    const facts = await factsFor(richUser);

    expect(facts.userProfile.incomeKnown).toBe(true);
    expect(facts.userProfile.goals).toHaveLength(1);

    const goal = facts.userProfile.goals[0]!;
    expect(goal.name).toBe(`${FX} Retirement`);
    expect(goal.targetDate).toBe('2036-06-30');
    // (2036-06-30 − 2026-06-30) / 365.25 days. Hand-derived, not snapshotted.
    const expectedYears = new Decimal(utc(2036, 5, 30).getTime() - AS_OF.getTime())
      .dividedBy(MS_PER_DAY)
      .dividedBy(DAYS_PER_YEAR);
    expect(toDecimal(goal.horizonYears).minus(expectedYears).abs().lessThan('0.000001')).toBe(true);

    // No questionnaire submitted: null, not a defaulted BALANCED. A finding
    // against a risk profile the user never chose is advice nobody asked for.
    expect(facts.userProfile.riskProfile).toBeNull();
  });

  it('reports incomeKnown false — not an income of zero — when nothing is on file', async () => {
    const facts = await factsFor(oneFundUser);
    // CONTEXT.md §6: "Income not on file", never ₹0. The facts carry the
    // distinction so a rule can decline to size something rather than size it
    // against nothing.
    expect(facts.userProfile.incomeKnown).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 3. Batched loading — `05 §2`
// ---------------------------------------------------------------------------

describe('batched loading', () => {
  it('issues the same number of reference queries for 1 fund as for 3', async () => {
    // The two users have identical profiles — same approved list, same goal —
    // and differ only in holding 1 fund versus 3. Any difference in the counts
    // below is therefore a per-scheme fan-out and nothing else. An earlier
    // version of this test gave the approved list only to `richUser`, and the
    // extra `mfSchemeMeta` query it caused looked exactly like fan-out.
    //
    // Warm both paths first: the very first call in a process pays for
    // connection setup and Prisma's lazy engine start, which would otherwise
    // show up as a difference that has nothing to do with fan-out.
    await factsFor(oneFundUser);
    await factsFor(richUser);

    const one = await countQueries(() => factsFor(oneFundUser));
    const three = await countQueries(() => factsFor(richUser));

    for (const delegate of COUNTED_DELEGATES) {
      expect(
        three.counts[delegate],
        `${delegate}: ${three.counts[delegate]} queries for 3 funds vs ` +
          `${one.counts[delegate]} for 1. 05 §2 requires one batched query per ` +
          'table; a per-scheme fan-out is invisible here and quadratic on a real ' +
          'household, and the RLS hook wraps every one of them in its own transaction.',
      ).toBe(one.counts[delegate]);
    }

    // And the absolute count is small: no table is read more than a handful of
    // times per run, whatever the holdings.
    const total = Object.values(three.counts).reduce((a, b) => a + b, 0);
    expect(total).toBeLessThanOrEqual(COUNTED_DELEGATES.length * 3);
  }, 120_000);
});

// ---------------------------------------------------------------------------
// 4. Degenerate and restricted scopes
// ---------------------------------------------------------------------------

describe('empty and restricted scopes', () => {
  it('yields well-formed empty facts for a user with no mutual funds', async () => {
    const facts = await factsFor(emptyUser);

    // A value, not a throw. A throw here takes the engine out for every new
    // user, and "no funds" is the most common state there is.
    expect(facts.funds).toStrictEqual({});
    expect(facts.portfolio.funds).toEqual([]);
    expect(facts.approvedUniverse).toEqual([]);
    expect(facts.userProfile.goals).toEqual([]);
    expect(facts.userProfile.riskProfile).toBeNull();
    expect(facts.userProfile.incomeKnown).toBe(false);
    // The tax block still exists: §112A headroom is a property of the
    // financial year, not of whether the user happens to hold a fund today.
    expect(facts.portfolio.tax.financialYear).toBeTruthy();
    // Still snapshot-safe, so an empty run is replayable like any other.
    expect(jsonHazards(facts)).toEqual([]);
    expect(JSON.parse(JSON.stringify(facts))).toStrictEqual(facts);
  });

  it('honours a family OWNER unrestricted scope (null caps)', async () => {
    const facts = await factsFor(famOwner, { familyId });

    // The contract, asserted rather than assumed: an OWNER's caps are null,
    // which means UNRESTRICTED. Every branch below depends on this being a
    // different value from `[]`.
    expect(facts.scope.allowedAssetClasses).toBeNull();
    expect(facts.scope.familyId).toBe(familyId);
    expect(Object.keys(facts.funds)).toContain(S_FULL);
    expect(facts.portfolio.scope.partial).toBe(false);
  });

  it('treats a VIEWER with `[]` caps as deny-all, and says the view is partial', async () => {
    const facts = await factsFor(famViewer, { familyId });

    // The fail-open regression, guarded: `[]` is falsy, and reading it as "no
    // restriction" once showed capped members the whole household.
    expect(facts.scope.allowedAssetClasses).toEqual([]);
    expect(facts.funds).toStrictEqual({});
    expect(facts.portfolio.scope.partial).toBe(true);

    // Goals are a capped *category* and `[]` denies them too. Empty because
    // they are hidden, which is a different claim from "this user has none" —
    // `portfolio.scope.partial` above is what carries that distinction to the
    // UI (CONTEXT.md §6).
    expect(facts.userProfile.goals).toEqual([]);

    // The scope itself is snapshotted, so a replay can tell a finding computed
    // over a restricted floor from one computed over a complete book.
    expect(facts.scope.readableUserIds).toContain(famOwner.userId);
    expect(jsonHazards(facts)).toEqual([]);
  });
});
