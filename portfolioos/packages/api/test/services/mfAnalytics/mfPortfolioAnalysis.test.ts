/**
 * `mfPortfolioAnalysis.service.ts` — the `04-PORTFOLIO-ANALYSIS.md §9` suite.
 *
 * These run against the local database on purpose: what is under test is the
 * half that cannot be tested from fixtures alone — the two-hop
 * `HoldingProjection.fundId -> MutualFundMaster.schemeCode ->
 * MfSchemeMeta.schemeCode` join, the RLS fan-out across household members, and
 * the visibility caps that decide what a family view is allowed to add up.
 *
 * **Every service call is inside `scope.runAs(...)`** (`CONTEXT.md §12`).
 * Without it RLS fails closed and every query returns zero rows, which looks
 * exactly like a logic bug and is not one. Fixture writes run under
 * `runAsSystem` so the bootstrap inserts are not themselves blocked.
 *
 * **The local database is shared with other agents.** Every fixture row this
 * file creates is namespaced with `FX` below, and `afterAll` deletes only rows
 * matching that prefix or belonging to users this file created. There is no
 * unscoped `deleteMany` anywhere in here, deliberately: one in a previous
 * round took another suite's fixtures with it.
 *
 * Every number asserted below is hand-derivable from the fixture, and the
 * derivation is written next to the assertion. A test that only asserts "the
 * service returned something" would have passed against every bug this file
 * exists to catch.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Decimal, toDecimal } from '@portfolioos/shared';
import type { MfPortfolioAnalysisDto } from '@portfolioos/shared';
import type { AssetClass, MFCategory, TransactionType } from '@prisma/client';

import { prisma } from '../../../src/lib/prisma.js';
import { runAsSystem } from '../../../src/lib/requestContext.js';
import {
  computeMfPortfolioAnalysis,
  openLotsFifo,
} from '../../../src/services/mfAnalytics/mfPortfolioAnalysis.service.js';
import {
  getEffectiveScope,
  type EffectiveScope,
} from '../../../src/services/familyScope.service.js';
import { createTestScope, type TestScope } from '../../helpers/db.js';

// ---------------------------------------------------------------------------
// Fixture namespace
// ---------------------------------------------------------------------------

/** Prefix on every scheme code, ISIN and AMC this file writes. */
const FX = 'TSTMFPA';

/**
 * A month end, and safely in the past relative to any wall clock this suite
 * runs under. Fixed rather than `new Date()` so the STCG/LTCG boundary, the
 * financial year and the exit-load window are properties of the fixture, not
 * of the day the suite happens to run.
 *
 * It is after 23-Jul-2024, so `ratesForDate` yields the post-Finance-Act-2024
 * statutory rates: 20% equity STCG, 12.5% equity LTCG.
 */
const AS_OF = new Date(Date.UTC(2026, 5, 30));

/** FY of `AS_OF`. §112A allowance for 2026-27 is ₹1,25,000. */
const FY = '2026-27';

const EQUITY_STCG_PCT = 20;
const EQUITY_LTCG_PCT = 12.5;

// Scheme codes. One per behaviour under test, so a failure names its own case.
const S_SIP = `${FX}-SIP`;
const S_LUMP = `${FX}-LUMP`;
const S_OVL_A = `${FX}-OVLA`;
const S_OVL_B = `${FX}-OVLB`;
const S_LT_A = `${FX}-LTA`;
const S_LT_B = `${FX}-LTB`;
const S_LT_C = `${FX}-LTC`;
const S_REG = `${FX}-REG`;
const S_DIR = `${FX}-DIR`;
const S_TAX = `${FX}-TAX`;
const S_NOLOAD = `${FX}-NOLOAD`;
const S_GF = `${FX}-GF`;
const S_FAM = `${FX}-FAM`;
const S_RLS = `${FX}-RLS`;

const ISIN_GF = `IN${FX}GF001`;

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

const MS_PER_DAY = 86_400_000;

function utc(y: number, m: number, d: number): Date {
  return new Date(Date.UTC(y, m, d));
}

function minusDays(from: Date, days: number): Date {
  return new Date(from.getTime() - days * MS_PER_DAY);
}

/**
 * The XIRR solver's own day-year (`finance/xirr.ts` uses exactly 365.0). The
 * hand-computed expectations below must use the same convention or they are
 * testing a different function than the one that runs.
 */
function xirrYearFraction(a: Date, b: Date): number {
  return (b.getTime() - a.getTime()) / (365 * MS_PER_DAY);
}

// ---------------------------------------------------------------------------
// Fixture builders
// ---------------------------------------------------------------------------

interface SchemeSeed {
  schemeCode: string;
  schemeName: string;
  /** Drives the tax-side equity/debt split via `MutualFundMaster.category`. */
  masterCategory: MFCategory;
  sebiCategory?: 'EQUITY' | 'DEBT' | 'HYBRID' | 'OTHER';
  sebiSubCategory?: string;
  planType?: 'DIRECT' | 'REGULAR';
  isin?: string;
  /** Percent. Omitted = no `MfSchemeTer` row, i.e. TER genuinely unknown. */
  terPct?: string;
  /** Omitted = no ladder on file, which must surface as `null`, never 0. */
  exitLoadRules?: Array<{ daysUpTo: number; pct: string }>;
  inceptionDate?: Date;
}

/** `MutualFundMaster.id` by scheme code — the holdings' `fundId`. */
const fundIdByScheme = new Map<string, string>();

async function seedScheme(seed: SchemeSeed): Promise<string> {
  const master = await prisma.mutualFundMaster.create({
    data: {
      schemeCode: seed.schemeCode,
      schemeName: seed.schemeName,
      amcName: `${FX} AMC`,
      category: seed.masterCategory,
      isin: seed.isin ?? null,
    },
  });
  await prisma.mfSchemeMeta.create({
    data: {
      schemeCode: seed.schemeCode,
      schemeName: seed.schemeName,
      amcCode: `${FX}AMC`,
      amcName: `${FX} AMC`,
      sebiCategory: seed.sebiCategory ?? 'EQUITY',
      sebiSubCategory: seed.sebiSubCategory ?? 'Large Cap Fund',
      planType: seed.planType ?? 'DIRECT',
      optionType: 'GROWTH',
      benchmarkIndexCode: null,
      inceptionDate: seed.inceptionDate ?? utc(2015, 0, 1),
      status: 'ACTIVE',
      isin: seed.isin ?? null,
      exitLoadRules: seed.exitLoadRules ?? undefined,
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

interface SnapshotHoldingSeed {
  kind: 'EQUITY' | 'DEBT' | 'CASH' | 'GOLD';
  isin?: string;
  securityName: string;
  /** Percent of the fund's net assets. */
  weightPct: string;
  sector?: string;
  marketCapBucket?: 'LARGE' | 'MID' | 'SMALL';
  issuer?: string;
  creditRating?: string;
}

async function seedSnapshot(
  schemeCode: string,
  asOf: Date,
  holdings: SnapshotHoldingSeed[],
): Promise<void> {
  await prisma.mfPortfolioSnapshot.create({
    data: {
      schemeCode,
      asOf,
      totalHoldings: holdings.length,
      cashPct: '0.000000',
      sourceHash: `${schemeCode}:snap:${asOf.toISOString().slice(0, 10)}`,
      fetchedAt: AS_OF,
      holdings: {
        create: holdings.map((h) => ({
          kind: h.kind,
          isin: h.isin ?? null,
          securityName: h.securityName,
          weightPct: h.weightPct,
          sector: h.sector ?? null,
          marketCapBucket: h.marketCapBucket ?? null,
          issuer: h.issuer ?? null,
          creditRating: h.creditRating ?? null,
        })),
      },
    },
  });
}

async function seedNavs(
  schemeCode: string,
  points: Array<{ date: Date; nav: string }>,
): Promise<void> {
  const fundId = fundIdByScheme.get(schemeCode)!;
  await prisma.mFNav.createMany({
    data: points.map((p) => ({
      fundId,
      date: p.date,
      nav: p.nav,
      // Return math reads `adjustedNav`, never `nav` (`01 §2`). For a GROWTH
      // option a real backfill writes the same value to both.
      adjustedNav: p.nav,
    })),
  });
}

interface TxSeed {
  type?: TransactionType;
  tradeDate: Date;
  quantity: string;
  price: string;
  netAmount: string;
}

/**
 * Give a scope a position in a scheme: the transactions that produced it plus
 * the `HoldingProjection` row they project to.
 *
 * `currentValue` is passed explicitly rather than derived from a NAV lookup,
 * because the service reads the projection (`CONTEXT.md §3.2` — holdings are
 * the projection, and the price router is not part of what is under test).
 */
async function seedPosition(
  scope: TestScope,
  schemeCode: string,
  opts: {
    txs: TxSeed[];
    currentValue: string;
    assetClass?: AssetClass;
    isin?: string;
  },
): Promise<void> {
  const fundId = fundIdByScheme.get(schemeCode)!;
  const assetClass: AssetClass = opts.assetClass ?? 'MUTUAL_FUND';
  const assetKey = `fund:${fundId}`;

  let units = new Decimal(0);
  let cost = new Decimal(0);
  for (const tx of opts.txs) {
    const type = tx.type ?? 'BUY';
    await prisma.transaction.create({
      data: {
        portfolioId: scope.portfolioId,
        assetClass,
        transactionType: type,
        fundId,
        assetName: schemeCode,
        isin: opts.isin ?? null,
        tradeDate: tx.tradeDate,
        quantity: tx.quantity,
        price: tx.price,
        grossAmount: tx.netAmount,
        netAmount: tx.netAmount,
        assetKey,
      },
    });
    const q = new Decimal(tx.quantity);
    if (type === 'SELL' || type === 'REDEMPTION' || type === 'SWITCH_OUT') {
      units = units.minus(q);
      cost = cost.minus(q.times(tx.price));
    } else {
      units = units.plus(q);
      cost = cost.plus(new Decimal(tx.netAmount));
    }
  }

  await prisma.holdingProjection.create({
    data: {
      portfolioId: scope.portfolioId,
      assetKey,
      assetClass,
      fundId,
      assetName: schemeCode,
      isin: opts.isin ?? null,
      quantity: units.toFixed(6),
      avgCostPrice: units.isZero() ? '0' : cost.dividedBy(units).toFixed(4),
      totalCost: cost.toFixed(4),
      currentValue: opts.currentValue,
      unrealisedPnL: new Decimal(opts.currentValue).minus(cost).toFixed(4),
      sourceTxCount: opts.txs.length,
    },
  });
}

/** Resolve a personal scope for a test user and run the analysis under it. */
async function analyseAs(scope: TestScope): Promise<MfPortfolioAnalysisDto> {
  return scope.runAs(async () => {
    const eff = await getEffectiveScope(scope.userId);
    return computeMfPortfolioAnalysis(eff, { asOf: AS_OF });
  });
}

function fundOf(dto: MfPortfolioAnalysisDto, schemeCode: string) {
  const fund = dto.funds.find((f) => f.schemeCode === schemeCode);
  if (!fund) throw new Error(`fixture fund ${schemeCode} missing from analysis`);
  return fund;
}

/** Assert two decimal strings are equal to within `tol`, with a readable diff. */
function expectClose(actual: string | null, expected: number | string, tol: number): void {
  expect(actual).not.toBeNull();
  const diff = toDecimal(actual!).minus(toDecimal(expected)).abs();
  expect(
    diff.lessThanOrEqualTo(tol),
    `expected ${actual} ≈ ${expected} (±${tol}), off by ${diff.toString()}`,
  ).toBe(true);
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

const scopes: TestScope[] = [];

async function newScope(label: string): Promise<TestScope> {
  const s = await createTestScope(`mfpa-${label}`);
  scopes.push(s);
  return s;
}

let sipUser: TestScope;
let lumpUser: TestScope;
let overlapUser: TestScope;
let lookThroughUser: TestScope;
let costUser: TestScope;
let taxUser: TestScope;
let famOwner: TestScope;
let famViewer: TestScope;
let familyId: string;
let rlsUserA: TestScope;
let rlsUserB: TestScope;

// -- test 1 fixture arithmetic, computed once and reused in the assertion ----

const SIP_INSTALMENT = new Decimal(10_000);
const SIP_TARGET_RATE = 0.12;
/** 12 monthly instalments, the last one six weeks before `AS_OF`. */
const SIP_DATES = Array.from({ length: 12 }, (_, i) => utc(2025, 5 + i, 15));

/**
 * The terminal value that makes the SIP's XIRR exactly `SIP_TARGET_RATE`.
 *
 * Solving `Σ -C/(1+r)^t_i + V/(1+r)^t_T = 0` for V gives
 * `V = Σ C·(1+r)^(t_T − t_i)`. Computing it here rather than asserting against
 * whatever the solver returns is what makes this a test of the solver's answer
 * instead of a snapshot of it.
 */
function sipTerminalValue(): Decimal {
  const t0 = SIP_DATES[0]!;
  const tT = xirrYearFraction(t0, AS_OF);
  let v = new Decimal(0);
  for (const d of SIP_DATES) {
    const ti = xirrYearFraction(t0, d);
    v = v.plus(SIP_INSTALMENT.times(Math.pow(1 + SIP_TARGET_RATE, tT - ti)));
  }
  return v;
}

/** Lump sum: bought exactly 729 days before `AS_OF`, NAV 100 → 150. */
const LUMP_BUY_DATE = minusDays(AS_OF, 729);

beforeAll(async () => {
  sipUser = await newScope('sip');
  lumpUser = await newScope('lump');
  overlapUser = await newScope('overlap');
  lookThroughUser = await newScope('lookthrough');
  costUser = await newScope('cost');
  taxUser = await newScope('tax');
  famOwner = await newScope('fam-owner');
  famViewer = await newScope('fam-viewer');
  rlsUserA = await newScope('rls-a');
  rlsUserB = await newScope('rls-b');

  await runAsSystem(async () => {
    // -- reference data ----------------------------------------------------
    await seedScheme({ schemeCode: S_SIP, schemeName: `${FX} SIP Fund - Direct Plan - Growth`, masterCategory: 'EQUITY' });
    await seedScheme({ schemeCode: S_LUMP, schemeName: `${FX} Lump Fund - Direct Plan - Growth`, masterCategory: 'EQUITY' });
    await seedScheme({ schemeCode: S_OVL_A, schemeName: `${FX} Overlap A - Direct Plan - Growth`, masterCategory: 'EQUITY' });
    await seedScheme({ schemeCode: S_OVL_B, schemeName: `${FX} Overlap B - Direct Plan - Growth`, masterCategory: 'EQUITY' });
    await seedScheme({ schemeCode: S_LT_A, schemeName: `${FX} Look A - Direct Plan - Growth`, masterCategory: 'EQUITY' });
    await seedScheme({ schemeCode: S_LT_B, schemeName: `${FX} Look B - Direct Plan - Growth`, masterCategory: 'EQUITY' });
    await seedScheme({ schemeCode: S_LT_C, schemeName: `${FX} Look C - Direct Plan - Growth`, masterCategory: 'EQUITY' });
    // The direct/regular pair must canonicalise to the same name for the
    // sibling lookup to find it — that is the whole mechanism under test in §4.
    await seedScheme({
      schemeCode: S_REG,
      schemeName: `${FX} Sibling Fund - Regular Plan - Growth`,
      masterCategory: 'EQUITY',
      planType: 'REGULAR',
      terPct: '1.800000',
    });
    await seedScheme({
      schemeCode: S_DIR,
      schemeName: `${FX} Sibling Fund - Direct Plan - Growth`,
      masterCategory: 'EQUITY',
      planType: 'DIRECT',
      terPct: '0.800000',
    });
    await seedScheme({
      schemeCode: S_TAX,
      schemeName: `${FX} Tax Fund - Direct Plan - Growth`,
      masterCategory: 'EQUITY',
      exitLoadRules: [{ daysUpTo: 365, pct: '1.000000' }],
    });
    await seedScheme({
      schemeCode: S_NOLOAD,
      schemeName: `${FX} Unknown Load Fund - Direct Plan - Growth`,
      masterCategory: 'EQUITY',
      // No `exitLoadRules`: the ladder is genuinely unknown, and `04 §5`
      // requires that to surface as null rather than as a zero load.
    });
    await seedScheme({
      schemeCode: S_GF,
      schemeName: `${FX} Grandfathered Fund - Direct Plan - Growth`,
      masterCategory: 'EQUITY',
      isin: ISIN_GF,
      inceptionDate: utc(2010, 0, 1),
    });
    await seedScheme({ schemeCode: S_FAM, schemeName: `${FX} Family Fund - Direct Plan - Growth`, masterCategory: 'EQUITY' });
    await seedScheme({ schemeCode: S_RLS, schemeName: `${FX} Other User Fund - Direct Plan - Growth`, masterCategory: 'EQUITY' });

    // -- §1 XIRR: a 12 x ₹10,000 SIP with a hand-solved terminal value ------
    await seedPosition(sipUser, S_SIP, {
      txs: SIP_DATES.map((d, i) => ({
        type: 'SIP' as TransactionType,
        tradeDate: d,
        // A rising NAV so the units differ per instalment; the XIRR reads
        // `netAmount` only, so the path does not affect the expected rate.
        price: String(100 + i),
        quantity: SIP_INSTALMENT.dividedBy(100 + i).toFixed(6),
        netAmount: SIP_INSTALMENT.toFixed(4),
      })),
      currentValue: sipTerminalValue().toFixed(4),
    });

    // -- §1 timing gap: a lump sum tracks the fund exactly ------------------
    await seedNavs(S_LUMP, [
      { date: LUMP_BUY_DATE, nav: '100.0000' },
      { date: AS_OF, nav: '150.0000' },
    ]);
    await seedPosition(lumpUser, S_LUMP, {
      txs: [{ tradeDate: LUMP_BUY_DATE, quantity: '1000.000000', price: '100.0000', netAmount: '100000.0000' }],
      currentValue: '150000.0000',
    });

    // -- §2 overlap: three common ISINs ------------------------------------
    const SNAP_AS_OF = utc(2026, 4, 31); // 31-May-2026, one month-end back.
    await seedSnapshot(S_OVL_A, SNAP_AS_OF, [
      { kind: 'EQUITY', isin: `IN${FX}O001`, securityName: 'Common One', weightPct: '30.000000', sector: 'Financials', marketCapBucket: 'LARGE' },
      { kind: 'EQUITY', isin: `IN${FX}O002`, securityName: 'Common Two', weightPct: '20.000000', sector: 'Technology', marketCapBucket: 'LARGE' },
      { kind: 'EQUITY', isin: `IN${FX}O003`, securityName: 'Common Three', weightPct: '10.000000', sector: 'Energy', marketCapBucket: 'MID' },
      { kind: 'EQUITY', isin: `IN${FX}O004`, securityName: 'Only In A', weightPct: '40.000000', sector: 'Pharma', marketCapBucket: 'SMALL' },
    ]);
    await seedSnapshot(S_OVL_B, SNAP_AS_OF, [
      { kind: 'EQUITY', isin: `IN${FX}O001`, securityName: 'Common One', weightPct: '25.000000', sector: 'Financials', marketCapBucket: 'LARGE' },
      { kind: 'EQUITY', isin: `IN${FX}O002`, securityName: 'Common Two', weightPct: '25.000000', sector: 'Technology', marketCapBucket: 'LARGE' },
      { kind: 'EQUITY', isin: `IN${FX}O003`, securityName: 'Common Three', weightPct: '15.000000', sector: 'Energy', marketCapBucket: 'MID' },
      { kind: 'EQUITY', isin: `IN${FX}O005`, securityName: 'Only In B', weightPct: '35.000000', sector: 'Auto', marketCapBucket: 'SMALL' },
    ]);
    await seedPosition(overlapUser, S_OVL_A, {
      txs: [{ tradeDate: utc(2024, 0, 10), quantity: '1000.000000', price: '100.0000', netAmount: '100000.0000' }],
      currentValue: '100000.0000',
    });
    await seedPosition(overlapUser, S_OVL_B, {
      txs: [{ tradeDate: utc(2024, 0, 10), quantity: '1000.000000', price: '100.0000', netAmount: '100000.0000' }],
      currentValue: '100000.0000',
    });

    // -- §3 look-through: three funds, 50/30/20 of a ₹10,00,000 book -------
    await seedSnapshot(S_LT_A, SNAP_AS_OF, [
      { kind: 'EQUITY', isin: `IN${FX}L001`, securityName: 'Look One', weightPct: '60.000000', sector: 'Financials', marketCapBucket: 'LARGE' },
      { kind: 'EQUITY', isin: `IN${FX}L002`, securityName: 'Look Two', weightPct: '20.000000', sector: 'Technology', marketCapBucket: 'LARGE' },
      { kind: 'CASH', securityName: 'TREPS', weightPct: '20.000000' },
    ]);
    await seedSnapshot(S_LT_B, SNAP_AS_OF, [
      { kind: 'EQUITY', isin: `IN${FX}L002`, securityName: 'Look Two', weightPct: '50.000000', sector: 'Technology', marketCapBucket: 'LARGE' },
      { kind: 'EQUITY', isin: `IN${FX}L003`, securityName: 'Look Three', weightPct: '30.000000', sector: 'Energy', marketCapBucket: 'MID' },
      { kind: 'DEBT', securityName: 'NBFC 2029', weightPct: '20.000000', issuer: 'Fixture NBFC', creditRating: 'AA+' },
    ]);
    await seedSnapshot(S_LT_C, SNAP_AS_OF, [
      { kind: 'EQUITY', isin: `IN${FX}L004`, securityName: 'Look Four', weightPct: '100.000000', sector: 'Auto', marketCapBucket: 'SMALL' },
    ]);
    await seedPosition(lookThroughUser, S_LT_A, {
      txs: [{ tradeDate: utc(2024, 0, 10), quantity: '5000.000000', price: '100.0000', netAmount: '500000.0000' }],
      currentValue: '500000.0000',
    });
    await seedPosition(lookThroughUser, S_LT_B, {
      txs: [{ tradeDate: utc(2024, 0, 10), quantity: '3000.000000', price: '100.0000', netAmount: '300000.0000' }],
      currentValue: '300000.0000',
    });
    await seedPosition(lookThroughUser, S_LT_C, {
      txs: [{ tradeDate: utc(2024, 0, 10), quantity: '2000.000000', price: '100.0000', netAmount: '200000.0000' }],
      currentValue: '200000.0000',
    });

    // -- §4 cost: one REGULAR plan with a DIRECT sibling -------------------
    await seedPosition(costUser, S_REG, {
      txs: [{ tradeDate: utc(2024, 0, 10), quantity: '5000.000000', price: '100.0000', netAmount: '500000.0000' }],
      currentValue: '500000.0000',
    });

    // -- §5 tax: lots straddling the 12-month line, plus grandfathering ----
    await seedPosition(taxUser, S_TAX, {
      txs: [
        // 467 days: long-term, and past the 365-day exit-load tier.
        { tradeDate: minusDays(AS_OF, 467), quantity: '100.000000', price: '100.0000', netAmount: '10000.0000' },
        // 100 days: short-term, and inside the exit-load window.
        { tradeDate: minusDays(AS_OF, 100), quantity: '50.000000', price: '120.0000', netAmount: '6000.0000' },
      ],
      // 150 units at ₹150 — chosen so the per-unit value is a round number and
      // the per-lot values are hand-checkable.
      currentValue: '22500.0000',
    });
    await seedPosition(taxUser, S_NOLOAD, {
      txs: [{ tradeDate: minusDays(AS_OF, 30), quantity: '10.000000', price: '100.0000', netAmount: '1000.0000' }],
      currentValue: '900.0000', // a loss, so it is also a harvest candidate
    });
    await prisma.fmvOverride.create({
      data: {
        userId: taxUser.userId,
        isin: ISIN_GF,
        scripName: `${FX} Grandfathered`,
        fmvPerUnit: '80.0000',
        source: 'USER',
      },
    });
    await seedPosition(taxUser, S_GF, {
      txs: [{ tradeDate: utc(2017, 5, 15), quantity: '100.000000', price: '50.0000', netAmount: '5000.0000' }],
      currentValue: '12000.0000',
      isin: ISIN_GF,
    });

    // -- §7 family ----------------------------------------------------------
    await seedPosition(famOwner, S_FAM, {
      txs: [{ tradeDate: utc(2024, 0, 10), quantity: '1000.000000', price: '100.0000', netAmount: '100000.0000' }],
      currentValue: '120000.0000',
    });
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
        visibleAssetClasses: ['EQUITY'],
        visibleCategories: [],
      },
    });

    // -- RLS ----------------------------------------------------------------
    await seedPosition(rlsUserB, S_RLS, {
      txs: [{ tradeDate: utc(2024, 0, 10), quantity: '1000.000000', price: '100.0000', netAmount: '100000.0000' }],
      currentValue: '100000.0000',
    });
  });
}, 180_000);

afterAll(async () => {
  // Order matters twice over. The family goes first: `Family.createdById` is a
  // foreign key onto the owner, so `createTestScope`'s `user.delete` fails
  // (silently, it catches) while the family still stands, and the user row
  // survives the suite. Then the per-scope cleanups, which own the
  // user-scoped rows referencing the reference data. Then the reference data.
  //
  // Every delete below is bounded either to a user this file created or to the
  // `FX` namespace — the local database is shared with other agents and must
  // come out of this suite exactly as it went in.
  await runAsSystem(async () => {
    await prisma.familyMember.deleteMany({ where: { familyId } });
    await prisma.family.deleteMany({ where: { id: familyId } });
  });

  for (const s of scopes) await s.cleanup();

  await runAsSystem(async () => {
    await prisma.mfSchemeTer.deleteMany({ where: { schemeCode: { startsWith: FX } } });
    await prisma.mfPortfolioSnapshot.deleteMany({ where: { schemeCode: { startsWith: FX } } });
    await prisma.mfSchemeMeta.deleteMany({ where: { schemeCode: { startsWith: FX } } });
    // MFNav cascades off MutualFundMaster.
    await prisma.mutualFundMaster.deleteMany({ where: { schemeCode: { startsWith: FX } } });
  });
}, 180_000);

// ---------------------------------------------------------------------------
// §9.1 — XIRR and the timing gap
// ---------------------------------------------------------------------------

describe('§1 per-fund user metrics', () => {
  it('recovers the SIP XIRR the fixture was built around', async () => {
    const dto = await analyseAs(sipUser);
    const fund = fundOf(dto, S_SIP);

    expect(fund.userXirrStatus).toBe('OK');
    // The terminal value was solved so that the XIRR is exactly 12%. 1e-6 is
    // the serialisation granularity of a `Ratio`, so this is as tight an
    // assertion as the wire format admits.
    expectClose(fund.userXirr, SIP_TARGET_RATE, 1e-6);

    // Invested value is the FIFO open-lot cost, not the gross of every
    // transaction ever: 12 x ₹10,000, none of it redeemed.
    expect(fund.investedValue).toBe('120000.0000');
    expect(fund.currentValue).toBe(sipTerminalValue().toFixed(4));

    // No NAV series was seeded for this scheme, so the fund's own CAGR is
    // genuinely unknown — and the timing gap must be null rather than the
    // user's XIRR minus an assumed zero.
    expect(fund.fundCagrSamePeriod).toBeNull();
    expect(fund.timingGap).toBeNull();
  });

  it('reports a timing gap of ~0 for a lump sum held through the whole period', async () => {
    const dto = await analyseAs(lumpUser);
    const fund = fundOf(dto, S_LUMP);

    expect(fund.userXirrStatus).toBe('OK');
    expect(fund.fundCagrSamePeriod).not.toBeNull();

    // A single purchase held to `asOf` earns exactly what the fund earned, so
    // the timing gap is zero up to the two calculators' day-year conventions:
    // XIRR discounts on a 365.0-day year (`finance/xirr.ts`) and the CAGR
    // annualises on 365.25. Over two years that is ~1.7e-4, which is why the
    // tolerance is 1e-3 rather than 1e-6 — the residue is a known convention
    // difference, not solver noise.
    expectClose(fund.timingGap, 0, 1e-3);
    expect(fund.holdingPeriodDays).toBe(729);
  });

  it('returns null with a reason rather than a number when XIRR is undefined', async () => {
    // One outflow and no terminal inflow: a rate of return is not defined,
    // and the contract says null-with-a-status, never 0.
    const scope = await newScope('xirr-degenerate');
    await runAsSystem(() =>
      seedPosition(scope, S_SIP, {
        txs: [{ tradeDate: utc(2026, 4, 1), quantity: '10.000000', price: '100.0000', netAmount: '1000.0000' }],
        currentValue: '0.0000',
      }),
    );

    const dto = await analyseAs(scope);
    const fund = fundOf(dto, S_SIP);
    expect(fund.userXirr).toBeNull();
    expect(fund.userXirrStatus).toBe('INSUFFICIENT_DATA');
    expect(fund.userXirrStatusReason).toBe('insufficient_flows');
  });
});

// ---------------------------------------------------------------------------
// §9.2 — overlap
// ---------------------------------------------------------------------------

describe('§2 overlap', () => {
  it('computes Σ min(w_A, w_B) over the three common ISINs exactly', async () => {
    const dto = await analyseAs(overlapUser);

    expect(dto.overlap.pairs).toHaveLength(1);
    const pair = dto.overlap.pairs[0]!;

    // min(30,25) + min(20,25) + min(10,15) = 25 + 20 + 10 = 55%.
    // `overlapPct` is a `Pct`: 55 means 55%, not 5,500%.
    expect(pair.overlapPct).toBe('55.000000');
    expect(pair.sameSubCategory).toBe(true);
    expect([pair.schemeCodeA, pair.schemeCodeB].sort()).toEqual([S_OVL_A, S_OVL_B].sort());

    // The shared list is ordered by each security's contribution to the
    // overlap, so the top row is the one that matters most.
    expect(pair.topShared).toHaveLength(3);
    expect(pair.topShared[0]!.securityName).toBe('Common One');
    expect(pair.topShared[0]!.weightInA).toBe('30.000000');
    expect(pair.topShared[0]!.weightInB).toBe('25.000000');

    // Two equal-weighted funds behave like exactly two funds: 1/(0.5² + 0.5²).
    expect(dto.totals.effectiveFundCount).toBe('2.000000');

    // One pair, so the weighted mean is that pair's overlap as a fraction.
    expect(dto.totals.redundancyScore).toBe('0.550000');

    // No debt line in either disclosure, so there is nothing to report — and
    // an empty list, not a fabricated zero-overlap pair.
    expect(dto.overlap.debtPairs).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// §9.3 — look-through
// ---------------------------------------------------------------------------

describe('§3 look-through', () => {
  it('effective stock weights sum to the equity share of the book', async () => {
    const dto = await analyseAs(lookThroughUser);
    const lt = dto.lookThrough;

    // Book weights 0.50 / 0.30 / 0.20.
    //   Look One   = 0.50 x 60                = 30
    //   Look Two   = 0.50 x 20 + 0.30 x 50    = 25
    //   Look Three = 0.30 x 30                =  9
    //   Look Four  = 0.20 x 100               = 20
    //                                          ---
    //                                           84  = the equity share
    expect(lt.topStocks).toHaveLength(4);
    const byName = new Map(lt.topStocks.map((s) => [s.securityName, s.effectiveWeightPct]));
    expect(byName.get('Look One')).toBe('30.000000');
    expect(byName.get('Look Two')).toBe('25.000000');
    expect(byName.get('Look Three')).toBe('9.000000');
    expect(byName.get('Look Four')).toBe('20.000000');

    const stockSum = lt.topStocks.reduce((acc, s) => acc.plus(toDecimal(s.effectiveWeightPct)), new Decimal(0));
    expect(stockSum.toFixed(6)).toBe('84.000000');
    expect(lt.assetClass.EQUITY).toBe('84.000000');

    // Cash 0.50 x 20 = 10, debt 0.30 x 20 = 6 — the rest of the book.
    expect(lt.assetClass.CASH).toBe('10.000000');
    expect(lt.assetClass.DEBT).toBe('6.000000');

    // Market cap is expressed as a share of the whole book, so it sums to the
    // equity share too: LARGE 30 + 25 = 55, MID 9, SMALL 20.
    expect(lt.marketCap.large).toBe('55.000000');
    expect(lt.marketCap.mid).toBe('9.000000');
    expect(lt.marketCap.small).toBe('20.000000');
    expect(lt.marketCap.unclassified).toBe('0.000000');

    // Two funds hold Look Two; both must be named, or the user cannot see
    // where their exposure comes from.
    const lookTwo = lt.topStocks.find((s) => s.securityName === 'Look Two')!;
    expect(lookTwo.contributors.map((c) => c.schemeCode).sort()).toEqual([S_LT_A, S_LT_B].sort());

    // Every fund here has a disclosure, so the look-through is complete.
    expect(lt.fundsWithoutHoldings).toEqual([]);
    // No Nifty 500 constituent table exists, so there is no benchmark to
    // compare against — null, not an empty object.
    expect(lt.sectorsBenchmark).toBeNull();
  });

  it('names funds with no usable snapshot instead of silently omitting them', async () => {
    // `04 §3`: without these the aggregate is a floor and must say so.
    const dto = await analyseAs(sipUser);
    expect(dto.lookThrough.fundsWithoutHoldings).toContain(S_SIP);
    expect(dto.lookThrough.topStocks).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// §9.4 — cost
// ---------------------------------------------------------------------------

describe('§4 cost', () => {
  it('prices the regular-to-direct switch from the sibling TER delta', async () => {
    const dto = await analyseAs(costUser);

    // TER 1.80% on ₹5,00,000 = ₹9,000 a year.
    expect(dto.cost.weightedTerPct).toBe('1.800000');
    expect(dto.cost.annualCostInr).toBe('9000.0000');

    // (1.80 − 0.80)% x ₹5,00,000 = ₹5,000 a year, which is the single largest
    // actionable number in most retail portfolios.
    expect(dto.cost.directPlanSavingsInr).toBe('5000.0000');
    expect(dto.totals.directPlanSavingsInr).toBe('5000.0000');

    // The breakdown has to make the headline auditable, not just assert it.
    const row = dto.cost.byFund.find((r) => r.schemeCode === S_REG)!;
    expect(row.terPct).toBe('1.800000');
    expect(row.directSiblingSchemeCode).toBe(S_DIR);
    expect(row.directSiblingTerPct).toBe('0.800000');
    expect(row.annualSavingsInr).toBe('5000.0000');

    // No `terPercentile` is written by the peer-rank layer for TER, so this
    // is genuinely unknown and must not be reported as a zeroth percentile.
    expect(dto.cost.costCategoryPercentile).toBeNull();
  });

  it('reports an unknown TER as null rather than as zero', async () => {
    const dto = await analyseAs(taxUser);
    const row = dto.cost.byFund.find((r) => r.schemeCode === S_TAX)!;
    expect(row.terPct).toBeNull();
    expect(row.annualSavingsInr).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// §9.5 — tax lots
// ---------------------------------------------------------------------------

describe('§5 tax lots', () => {
  it('splits lots either side of the long-term line and counts down to it', async () => {
    const dto = await analyseAs(taxUser);
    const fund = fundOf(dto, S_TAX);
    expect(fund.lots).toHaveLength(2);

    // Lots are valued at the unit price the holding implies (₹22,500 / 150
    // units = ₹150), so the lots add up to the position they came from.
    const longLot = fund.lots.find((l) => l.gainType === 'LTCG')!;
    const shortLot = fund.lots.find((l) => l.gainType === 'STCG')!;

    expect(longLot.holdingDays).toBe(467);
    expect(longLot.cost).toBe('10000.0000');
    expect(longLot.currentValue).toBe('15000.0000');
    expect(longLot.gain).toBe('5000.0000');
    // Already long-term: the countdown does not apply, and null says so.
    expect(longLot.daysToLtcg).toBeNull();
    // Past the 365-day tier — a *known* zero load, distinct from an unknown.
    expect(longLot.exitLoadPct).toBe('0.000000');
    expect(longLot.exitLoadInr).toBe('0.0000');
    // 12.5% statutory §112A rate, never the slab (`CONTEXT.md §9.8`).
    expect(longLot.taxIfSoldTodayInr).toBe(
      new Decimal(5000).times(EQUITY_LTCG_PCT).dividedBy(100).toFixed(4),
    );

    expect(shortLot.holdingDays).toBe(100);
    expect(shortLot.cost).toBe('6000.0000');
    expect(shortLot.currentValue).toBe('7500.0000');
    // The 12-month threshold is applied as 360 days, matching
    // `capitalGains.service.ts`, so the countdown is 360 − 100.
    expect(shortLot.daysToLtcg).toBe(260);
    // Inside the 365-day tier: 1% of ₹7,500.
    expect(shortLot.exitLoadPct).toBe('1.000000');
    expect(shortLot.exitLoadInr).toBe('75.0000');
    expect(shortLot.taxIfSoldTodayInr).toBe(
      new Decimal(1500).times(EQUITY_STCG_PCT).dividedBy(100).toFixed(4),
    );
  });

  it('reports an unknown exit-load ladder as null, never as a zero load', async () => {
    const dto = await analyseAs(taxUser);
    const fund = fundOf(dto, S_NOLOAD);
    expect(fund.lots).toHaveLength(1);
    expect(fund.lots[0]!.exitLoadPct).toBeNull();
    expect(fund.lots[0]!.exitLoadInr).toBeNull();
  });

  it('applies §112A grandfathering to a pre-2018 equity lot', async () => {
    const dto = await analyseAs(taxUser);
    const fund = fundOf(dto, S_GF);
    const lot = fund.lots[0]!;

    // §55(2)(ac): cost = max(actual 5,000, min(FMV 100 x ₹80 = 8,000,
    // proceeds 12,000)) = 8,000. The inner min() is what stops an FMV above
    // today's value from fabricating a loss.
    expect(lot.grandfatheredCost).toBe('8000.0000');
    expect(lot.gainType).toBe('LTCG');
    // Tax is charged on 12,000 − 8,000, not on 12,000 − 5,000.
    expect(lot.taxIfSoldTodayInr).toBe(
      new Decimal(4000).times(EQUITY_LTCG_PCT).dividedBy(100).toFixed(4),
    );
    // The accounting gain is still measured against actual cost — only the
    // taxable basis moves.
    expect(lot.gain).toBe('7000.0000');
  });

  it('nets unrealised gains and publishes the FY-dependent §112A headroom', async () => {
    const dto = await analyseAs(taxUser);

    // LTCG lots: ₹5,000 (tax fund) + ₹7,000 (grandfathered fund) = ₹12,000.
    expect(dto.tax.unrealisedLtcg).toBe('12000.0000');
    // STCG lots: ₹1,500 (tax fund) − ₹100 (the loss-making one) = ₹1,400.
    expect(dto.tax.unrealisedStcg).toBe('1400.0000');

    expect(dto.tax.financialYear).toBe(FY);
    // ₹1,25,000 for FY2026-27, from `ltcg112aExemptionForFy` — the allowance
    // is FY-dependent (₹1,00,000 through FY2023-24) and must never be a
    // literal. Nothing has been realised, so the whole allowance is free.
    expect(dto.tax.ltcgExemptionHeadroomInr).toBe('125000.0000');

    // The loss-making lot is the only harvest candidate.
    expect(dto.tax.harvestCandidates).toHaveLength(1);
    expect(dto.tax.harvestCandidates[0]!.harvestableLossInr).toBe('100.0000');
    expect(dto.tax.harvestCandidates[0]!.schemeCode).toBe(S_NOLOAD);
  });

  it('leaves FIFO lots opened by a partial redemption in date order', () => {
    // A pure check on the lot engine: 100 units bought, then 60 sold, must
    // leave 40 of the *first* lot and all of the second — not a pro-rata
    // slice of both, which is the weighted-average model the projection uses.
    const mk = (id: string, day: number, qty: string, amount: string) =>
      ({
        id,
        tradeDate: utc(2025, 0, day),
        quantity: new Decimal(qty),
        netAmount: new Decimal(amount),
        transactionType: 'BUY' as TransactionType,
      }) as never;

    const lots = openLotsFifo([
      mk('a', 1, '100', '10000'),
      mk('b', 2, '100', '20000'),
      {
        id: 'c',
        tradeDate: utc(2025, 0, 3),
        quantity: new Decimal('60'),
        netAmount: new Decimal('9000'),
        transactionType: 'SELL' as TransactionType,
      } as never,
    ]);

    expect(lots).toHaveLength(2);
    expect(lots[0]!.buyTxId).toBe('a');
    expect(lots[0]!.units.toString()).toBe('40');
    expect(lots[0]!.costPerUnit.toString()).toBe('100');
    expect(lots[1]!.buyTxId).toBe('b');
    expect(lots[1]!.units.toString()).toBe('100');
  });
});

// ---------------------------------------------------------------------------
// §9.6 — family view: the null-vs-[] fail-open regression
// ---------------------------------------------------------------------------

describe('§7 household view — visibility caps', () => {
  /** Rewrite the viewer's caps, then resolve a fresh scope for them. */
  async function viewerScope(visibleAssetClasses: string[]): Promise<EffectiveScope> {
    await runAsSystem(() =>
      prisma.familyMember.updateMany({
        where: { familyId, userId: famViewer.userId },
        data: { visibleAssetClasses: visibleAssetClasses as never },
      }),
    );
    return famViewer.runAs(() => getEffectiveScope(famViewer.userId, { familyId }));
  }

  it('OWNER (allowedAssetClasses === null) sees the whole household book', async () => {
    const dto = await famOwner.runAs(async () => {
      const eff = await getEffectiveScope(famOwner.userId, { familyId });
      // The contract, asserted rather than assumed: an OWNER's caps are null,
      // which means UNRESTRICTED. Every branch below depends on this being a
      // different value from `[]`.
      expect(eff.allowedAssetClasses).toBeNull();
      return computeMfPortfolioAnalysis(eff, { asOf: AS_OF });
    });

    expect(dto.funds.map((f) => f.schemeCode)).toContain(S_FAM);
    expect(dto.totals.currentValue).toBe('120000.0000');
    // Nothing hidden, so nothing to disclose — and `partial` false means the
    // UI may render these as totals rather than as floors.
    expect(dto.scope.partial).toBe(false);
    expect(dto.scope.hiddenCategories).toEqual([]);
    expect(dto.scope.memberCount).toBe(2);
  });

  it('VIEWER whose caps exclude MUTUAL_FUND gets an empty book that says it is partial', async () => {
    const eff = await viewerScope(['EQUITY']);
    expect(eff.allowedAssetClasses).toEqual(['EQUITY']);

    const dto = await famViewer.runAs(() => computeMfPortfolioAnalysis(eff, { asOf: AS_OF }));

    expect(dto.funds).toEqual([]);
    expect(dto.totals.currentValue).toBe('0.0000');
    // The whole point: an empty list here means "not shared with you", and the
    // consumer can only tell that from `partial` + `hiddenCategories`.
    expect(dto.scope.partial).toBe(true);
    expect(dto.scope.hiddenCategories).toContain('MUTUAL_FUND');
    expect(dto.scope.hiddenCategories).toContain('ETF');
    expect(dto.scope.hiddenCategories).toContain('NET_WORTH');
  });

  it('VIEWER with `[]` caps is DENIED ALL — the fail-open regression', async () => {
    // `FamilyMember.visibleAssetClasses` is `@default([])`, so this is the
    // state of every member invited without someone ticking boxes. Treating
    // the empty array as "no restriction" showed those members the entire
    // household's finances, and it shipped (`CONTEXT.md §6`). This is the
    // regression test for that specific inversion, and it is the reason
    // `isAssetClassVisible` tests `=== null` instead of truthiness.
    const eff = await viewerScope([]);
    expect(eff.allowedAssetClasses).toEqual([]);
    expect(eff.allowedAssetClasses).not.toBeNull();

    const dto = await famViewer.runAs(() => computeMfPortfolioAnalysis(eff, { asOf: AS_OF }));

    expect(dto.funds).toEqual([]);
    expect(dto.totals.currentValue).toBe('0.0000');
    expect(dto.lookThrough.topStocks).toEqual([]);
    expect(dto.overlap.pairs).toEqual([]);
    expect(dto.tax.lots).toEqual([]);
    expect(dto.scope.partial).toBe(true);
    expect(dto.scope.hiddenCategories).toContain('MUTUAL_FUND');
  });

  it('VIEWER granted MUTUAL_FUND sees the household book, still labelled a floor', async () => {
    const eff = await viewerScope(['MUTUAL_FUND', 'ETF']);
    const dto = await famViewer.runAs(() => computeMfPortfolioAnalysis(eff, { asOf: AS_OF }));

    // The owner's fund is readable through the family fan-out.
    expect(dto.funds.map((f) => f.schemeCode)).toContain(S_FAM);
    // But a capped view is still a capped view: every non-MF class is hidden,
    // so the net-worth denominator behind `weightInNetWorth` is a floor and
    // the DTO says so rather than presenting the weight as final.
    expect(dto.scope.partial).toBe(true);
    expect(dto.scope.hiddenCategories).toEqual(['NET_WORTH']);
    expect(dto.scope.hiddenCategories).not.toContain('MUTUAL_FUND');
  });
});

// ---------------------------------------------------------------------------
// §9.7 — RLS
// ---------------------------------------------------------------------------

describe('RLS isolation', () => {
  it("never surfaces another user's holdings in a personal scope", async () => {
    const dto = await analyseAs(rlsUserA);
    expect(dto.funds.map((f) => f.schemeCode)).not.toContain(S_RLS);
    expect(dto.funds).toEqual([]);
    expect(dto.totals.currentValue).toBe('0.0000');
    // A solo user is not restricted — an empty book here means an empty book,
    // and conflating that with "hidden from you" would be the mirror image of
    // the caps bug above.
    expect(dto.scope.partial).toBe(false);
    expect(dto.scope.memberCount).toBeNull();

    // And the fixture really does exist — otherwise the assertion above would
    // pass against a database that simply never got seeded.
    const other = await analyseAs(rlsUserB);
    expect(other.funds.map((f) => f.schemeCode)).toContain(S_RLS);
  });
});
