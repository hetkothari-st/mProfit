/**
 * Integration tests for `mfMetrics.service.ts` + `mfMetricsJob.ts`
 * (`07-IMPLEMENTATION-PLAN.md` Task 2.3, `02-METRICS.md §10.5-10.9`).
 *
 * These run against the local database on purpose. The *math* is covered by
 * `mfMetricsMath.test.ts`, which is pure and needs no DB; what is under test
 * here is the half that cannot be tested without one — the two-hop NAV join,
 * the window/observation/benchmark/staleness gates that decide an
 * `MfMetricStatus`, and the upsert that makes a second run of the job a no-op.
 *
 * Every fixture series is generated deterministically (no randomness, no
 * `Date.now()` in the data) so the "same inputs twice ⇒ identical JSON"
 * assertion means what it says.
 *
 * The MF analytics reference tables are NOT user-scoped (CONTEXT.md §5 — a
 * scheme's Sharpe is the same number for every user), so seeding runs under
 * `runAsSystem` and no `scope.runAs` is needed anywhere below. The one
 * user-scoped table this suite touches is `Alert`, via the coverage alert, and
 * that path is not exercised here.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Decimal } from '@portfolioos/shared';
import type { MfHorizonMetrics, MfCurrentProfile } from '@portfolioos/shared';

import { prisma } from '../../../src/lib/prisma.js';
import { runAsSystem } from '../../../src/lib/requestContext.js';
import { computeMetricsForScheme } from '../../../src/services/mfAnalytics/mfMetrics.service.js';
import { runMfMetricsJob } from '../../../src/jobs/mfMetricsJob.js';

// ---------------------------------------------------------------------------
// Fixture identity
// ---------------------------------------------------------------------------

const P = 'TSTMFM'; // prefix, so a failed run's leftovers are identifiable
const SCHEME_FULL = `${P}-FULL`; // 11 years of NAV — every horizon computable
const SCHEME_SHORT = `${P}-SHORT`; // 24 months — 1y OK, 3y INSUFFICIENT_DATA
const SCHEME_GAP = `${P}-GAP`; // benchmark with a 10-business-day hole
const SCHEME_STALE = `${P}-STALE`; // snapshot older than 60 days
const SCHEME_QUAR = `${P}-QUAR`; // quarantined NAV rows inside the 1y window
const ALL_SCHEMES = [SCHEME_FULL, SCHEME_SHORT, SCHEME_GAP, SCHEME_STALE, SCHEME_QUAR];

const BENCH_OK = `${P}_BENCH_TRI`;
const BENCH_GAPPED = `${P}_BENCH_GAP_TRI`;

/**
 * A month end, so `toMonthEndSeries` has no partial trailing month to discard
 * and the observation counts are the maximum the window can support.
 * 2025-06-30 is a Monday.
 */
const AS_OF = new Date(Date.UTC(2025, 5, 30));

const RF_SERIES = 'TBILL_91D';

// ---------------------------------------------------------------------------
// Deterministic series generation
// ---------------------------------------------------------------------------

function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 86_400_000);
}

function minusYears(d: Date, y: number): Date {
  return new Date(Date.UTC(d.getUTCFullYear() - y, d.getUTCMonth(), d.getUTCDate()));
}

/** Business days (Mon-Fri) from `from` to `to` inclusive. No holiday calendar —
 *  the gap detector counts business days, and inventing holidays here would
 *  make the benchmark-gap assertion depend on which holidays we chose. */
function businessDays(from: Date, to: Date): Date[] {
  const out: Date[] = [];
  const cursor = new Date(from.getTime());
  while (cursor.getTime() <= to.getTime()) {
    const dow = cursor.getUTCDay();
    if (dow !== 0 && dow !== 6) out.push(new Date(cursor.getTime()));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}

/**
 * A trending series with a deterministic wobble on top.
 *
 * The wobble is not decoration: a perfectly smooth compounding series has a
 * near-zero standard deviation and a sub-1% drawdown, which sends Sharpe into
 * `degenerate_denominator` and Calmar into `not_applicable` — so a test built on
 * one would assert the *unavailable* branch of every risk-adjusted metric while
 * appearing to assert the healthy one.
 */
function makeSeries(
  dates: readonly Date[],
  opts: { base: number; dailyDrift: number; amplitude: number; phase: number; period: number },
): Array<{ date: Date; value: Decimal }> {
  return dates.map((date, i) => {
    const trend = opts.base * Math.pow(1 + opts.dailyDrift, i);
    const wobble = 1 + opts.amplitude * Math.sin((i + opts.phase) / opts.period);
    // The series is fixture data, not money in flight: it is built in JS
    // doubles and handed to Decimal once, at the boundary, exactly as a feed
    // value would be.
    //
    // Four decimal places, matching what AMFI actually publishes and what
    // `MFNav.nav` (`Decimal(18,4)`) can hold. The fixture then writes the SAME
    // string to `nav` and `adjustedNav`, so a concurrent IDCW-adjustment
    // backfill that recomputes `adjustedNav` from `nav` is a no-op on this
    // data rather than a silent one-ulp rewrite — the local database is shared,
    // and a fixture that only survives an empty one is not a fixture.
    return { date, value: new Decimal((trend * wobble).toFixed(4)) };
  });
}

// ---------------------------------------------------------------------------
// Seeding
// ---------------------------------------------------------------------------

interface SchemeSeed {
  schemeCode: string;
  navFrom: Date;
  benchmarkCode: string | null;
  /** Days before `AS_OF` the portfolio snapshot is dated; null = no snapshot. */
  snapshotAgeDays: number | null;
}

async function seedBenchmark(code: string, holeStart: Date | null): Promise<void> {
  await prisma.benchmarkIndex.create({
    data: { code, name: `${code} fixture`, provider: 'NSE', isTotalReturn: true },
  });
  const dates = businessDays(minusYears(AS_OF, 12), AS_OF);
  const series = makeSeries(dates, {
    base: 20_000,
    dailyDrift: 0.00042,
    amplitude: 0.04,
    phase: 40,
    period: 23,
  });

  // The hole is cut as ten *consecutive business days*, which is what
  // `maxGapBusinessDays` counts and what `02 §1`'s "> 5 business days" rule
  // trips on.
  let rows = series;
  if (holeStart !== null) {
    const holeDates = new Set(
      businessDays(holeStart, addDays(holeStart, 20))
        .slice(0, 10)
        .map((d) => d.getTime()),
    );
    rows = series.filter((r) => !holeDates.has(r.date.getTime()));
  }

  await prisma.benchmarkIndexPrice.createMany({
    data: rows.map((r) => ({
      indexCode: code,
      date: r.date,
      value: r.value.toFixed(6),
      sourceHash: `${code}:${r.date.toISOString().slice(0, 10)}`,
    })),
  });
}

async function seedScheme(seed: SchemeSeed): Promise<void> {
  await prisma.mfSchemeMeta.create({
    data: {
      schemeCode: seed.schemeCode,
      schemeName: `${seed.schemeCode} Fixture Fund - Direct Growth`,
      amcCode: `${P}AMC`,
      amcName: 'Fixture AMC',
      sebiCategory: 'EQUITY',
      sebiSubCategory: 'Large Cap Fund',
      planType: 'DIRECT',
      optionType: 'GROWTH',
      benchmarkIndexCode: seed.benchmarkCode,
      inceptionDate: seed.navFrom,
      status: 'ACTIVE',
      exitLoadRules: [{ daysUpTo: 365, pct: '1.000000' }],
      sourceHash: `${seed.schemeCode}:meta`,
      fetchedAt: AS_OF,
    },
  });

  const master = await prisma.mutualFundMaster.create({
    data: {
      schemeCode: seed.schemeCode,
      schemeName: `${seed.schemeCode} Fixture Fund`,
      amcName: 'Fixture AMC',
      category: 'EQUITY',
    },
  });

  const dates = businessDays(seed.navFrom, AS_OF);
  const navs = makeSeries(dates, {
    base: 100,
    dailyDrift: 0.00045,
    amplitude: 0.05,
    phase: 0,
    period: 19,
  });
  await prisma.mFNav.createMany({
    data: navs.map((n) => ({
      fundId: master.id,
      date: n.date,
      nav: n.value.toFixed(4),
      // Return math reads `adjustedNav`, never `nav` (`02 §1`). For a GROWTH
      // option the two are equal, which is what a real backfill writes.
      adjustedNav: n.value.toFixed(4),
    })),
  });

  await prisma.mfSchemeTer.create({
    data: {
      schemeCode: seed.schemeCode,
      effectiveFrom: minusYears(AS_OF, 1),
      terPct: '0.680000',
      sourceHash: `${seed.schemeCode}:ter`,
      fetchedAt: AS_OF,
    },
  });

  // Two AUM points 12 months apart so `aumGrowth12mPct` has both operands.
  await prisma.mfSchemeAum.createMany({
    data: [
      {
        schemeCode: seed.schemeCode,
        asOf: minusYears(AS_OF, 1),
        aum: '10000000000.0000',
        sourceHash: `${seed.schemeCode}:aum1`,
        fetchedAt: AS_OF,
      },
      {
        schemeCode: seed.schemeCode,
        asOf: AS_OF,
        aum: '12500000000.0000',
        sourceHash: `${seed.schemeCode}:aum2`,
        fetchedAt: AS_OF,
      },
    ],
  });

  await prisma.mfSchemeManager.create({
    data: {
      schemeCode: seed.schemeCode,
      managerName: 'Fixture Manager',
      role: 'Lead',
      fromDate: minusYears(AS_OF, 4),
      toDate: null,
      sourceHash: `${seed.schemeCode}:mgr`,
      fetchedAt: AS_OF,
    },
  });

  if (seed.snapshotAgeDays !== null) {
    const snapshotAsOf = addDays(AS_OF, -seed.snapshotAgeDays);
    await prisma.mfPortfolioSnapshot.create({
      data: {
        schemeCode: seed.schemeCode,
        asOf: snapshotAsOf,
        totalHoldings: 4,
        cashPct: '3.500000',
        sourceHash: `${seed.schemeCode}:snap`,
        fetchedAt: AS_OF,
        holdings: {
          create: [
            {
              kind: 'EQUITY',
              isin: 'INE000A01001',
              securityName: 'Fixture Large A',
              weightPct: '30.000000',
              sector: 'Financials',
              marketCapBucket: 'LARGE',
            },
            {
              kind: 'EQUITY',
              isin: 'INE000A01002',
              securityName: 'Fixture Large B',
              weightPct: '25.000000',
              sector: 'Technology',
              marketCapBucket: 'LARGE',
            },
            {
              kind: 'EQUITY',
              isin: 'INE000A01003',
              securityName: 'Fixture Mid C',
              weightPct: '21.500000',
              sector: 'Financials',
              marketCapBucket: 'MID',
            },
            {
              kind: 'CASH',
              isin: null,
              securityName: 'TREPS',
              weightPct: '23.500000',
              sector: null,
              marketCapBucket: null,
            },
          ],
        },
      },
    });
  }
}

async function cleanup(): Promise<void> {
  await runAsSystem(async () => {
    await prisma.mfSchemeMetrics.deleteMany({ where: { schemeCode: { in: ALL_SCHEMES } } });
    await prisma.mfPortfolioSnapshot.deleteMany({ where: { schemeCode: { in: ALL_SCHEMES } } });
    await prisma.mfSchemeTer.deleteMany({ where: { schemeCode: { in: ALL_SCHEMES } } });
    await prisma.mfSchemeAum.deleteMany({ where: { schemeCode: { in: ALL_SCHEMES } } });
    await prisma.mfSchemeManager.deleteMany({ where: { schemeCode: { in: ALL_SCHEMES } } });
    await prisma.mfSchemeMeta.deleteMany({ where: { schemeCode: { in: ALL_SCHEMES } } });
    // MFNav cascades from MutualFundMaster.
    await prisma.mutualFundMaster.deleteMany({ where: { schemeCode: { in: ALL_SCHEMES } } });
    // BenchmarkIndexPrice cascades from BenchmarkIndex.
    await prisma.benchmarkIndex.deleteMany({ where: { code: { in: [BENCH_OK, BENCH_GAPPED] } } });
    await prisma.riskFreeRate.deleteMany({
      where: { series: RF_SERIES, sourceHash: { startsWith: `${P}:` } },
    });
  });
}

beforeAll(async () => {
  await cleanup();
  await runAsSystem(async () => {
    await seedBenchmark(BENCH_OK, null);
    // The hole sits inside every horizon window, including the shortest.
    await seedBenchmark(BENCH_GAPPED, addDays(AS_OF, -120));

    // Weekly 91-day T-bill at a flat 6.5%. Flat because the risk-free path is
    // not what these tests are pinning down, and a moving rate would make the
    // Sharpe assertions depend on the shape of a curve nobody verified.
    const rfDates = businessDays(minusYears(AS_OF, 12), AS_OF).filter(
      (d) => d.getUTCDay() === 1,
    );
    await prisma.riskFreeRate.createMany({
      data: rfDates.map((d) => ({
        series: RF_SERIES,
        date: d,
        ratePct: '6.500000',
        sourceHash: `${P}:rf:${d.toISOString().slice(0, 10)}`,
      })),
    });

    await seedScheme({
      schemeCode: SCHEME_FULL,
      navFrom: minusYears(AS_OF, 11),
      benchmarkCode: BENCH_OK,
      snapshotAgeDays: 20,
    });
    await seedScheme({
      schemeCode: SCHEME_SHORT,
      navFrom: minusYears(AS_OF, 2),
      benchmarkCode: BENCH_OK,
      snapshotAgeDays: null,
    });
    await seedScheme({
      schemeCode: SCHEME_GAP,
      navFrom: minusYears(AS_OF, 2),
      benchmarkCode: BENCH_GAPPED,
      snapshotAgeDays: 10,
    });
    await seedScheme({
      schemeCode: SCHEME_STALE,
      navFrom: minusYears(AS_OF, 2),
      benchmarkCode: BENCH_OK,
      snapshotAgeDays: 95,
    });
    await seedScheme({
      schemeCode: SCHEME_QUAR,
      navFrom: minusYears(AS_OF, 2),
      benchmarkCode: BENCH_OK,
      snapshotAgeDays: 10,
    });

    // `01 §6` keeps a rejected NAV as a quarantined row rather than deleting
    // it, so the gap stays visible. Three of them, inside the one-year window.
    const quarMaster = await prisma.mutualFundMaster.findUniqueOrThrow({
      where: { schemeCode: SCHEME_QUAR },
      select: { id: true },
    });
    const quarantineFrom = addDays(AS_OF, -100);
    const quarantineDates = businessDays(quarantineFrom, addDays(quarantineFrom, 10)).slice(0, 3);
    await prisma.mFNav.updateMany({
      where: { fundId: quarMaster.id, date: { in: quarantineDates } },
      data: { isQuarantined: true, quarantineReason: 'nav_jump' },
    });
  });
}, 300_000);

afterAll(async () => {
  await cleanup();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function byHorizon(rows: MfHorizonMetrics[], years: number): MfHorizonMetrics {
  const row = rows.find((r) => r.horizonYears === years);
  if (!row) throw new Error(`no horizon row for ${years}y`);
  return row;
}

/**
 * Keys whose values are genuine integer counts or day-differences and are
 * therefore `number` by design in the shared types (`mfAnalytics.types.ts`:
 * "The exceptions are genuine counts and day-differences, which are integers by
 * nature and carry no precision risk"). Everything else that is numeric must be
 * a Decimal string, or CONTEXT.md §3.1 is broken at the DB boundary.
 */
const INTEGER_COUNT_KEYS = new Set([
  'horizonYears',
  'observationsMonthly',
  'observations',
  'windowYears',
  'maxDrawdownDurationDays',
  'recoveryDays',
  'year',
  'rank',
  'universeSize',
  'quartile',
  'numHoldings',
  'managerChangesLast3y',
  'exitLoadMaxDays',
]);

/** Walk a parsed JSON value and collect every `number` that is not an allowed count. */
function findNumberLeaks(value: unknown, path = '$'): string[] {
  if (typeof value === 'number') return [`${path} = ${value}`];
  if (Array.isArray(value)) {
    return value.flatMap((v, i) => findNumberLeaks(v, `${path}[${i}]`));
  }
  if (value !== null && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).flatMap(([k, v]) =>
      INTEGER_COUNT_KEYS.has(k) ? [] : findNumberLeaks(v, `${path}.${k}`),
    );
  }
  return [];
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('computeMetricsForScheme', () => {
  it('produces a row for every horizon plus the horizon-0 profile', async () => {
    const result = await runAsSystem(() => computeMetricsForScheme(SCHEME_FULL, AS_OF));

    expect(result.horizons.map((h) => h.horizonYears)).toEqual([1, 3, 5, 7, 10]);
    expect(result.profile).toBeTruthy();
    expect(result.benchmarkCode).toBe(BENCH_OK);
    expect(result.riskFreeSeries).toBe(RF_SERIES);

    for (const row of result.horizons) {
      // 11 years of clean NAV against a complete benchmark: nothing should be
      // degraded. If this ever flips, the reason string names which gate fired.
      expect(`${row.horizonYears}y:${row.status}:${row.statusReason ?? ''}`).toBe(
        `${row.horizonYears}y:OK:`,
      );
      expect(row.observationsMonthly).toBeGreaterThanOrEqual(row.horizonYears * 12 - 1);
      expect(row.mathVersion).toBe(result.mathVersion);
    }

    const tenYear = byHorizon(result.horizons, 10);
    // Absolute metrics present.
    expect(tenYear.returns.cagr).not.toBeNull();
    expect(tenYear.risk.stdDevAnn).not.toBeNull();
    expect(tenYear.risk.maxDrawdown).not.toBeNull();
    expect(tenYear.riskAdjusted.sharpe).not.toBeNull();
    // Benchmark-relative metrics present, because the benchmark is complete.
    expect(tenYear.riskAdjusted.beta).not.toBeNull();
    expect(tenYear.relative.upCapture).not.toBeNull();
    expect(tenYear.returns.benchmarkCagr).not.toBeNull();
    expect(tenYear.returns.calendarYears.length).toBeGreaterThanOrEqual(9);

    // `02 §2.1` / the `MfReturnMetrics` contract: one year reports the absolute
    // return, longer horizons report the annualised one. Never both.
    const oneYear = byHorizon(result.horizons, 1);
    expect(oneYear.returns.absolute).not.toBeNull();
    expect(oneYear.returns.cagr).toBeNull();
    // Suppressed by design (SEBI states sub-1y performance absolute), so it
    // gets NOT_APPLICABLE rather than OK. OK would license a consumer to
    // render the null as 0.00 under 00-README invariant 4 — the whole point
    // of the status vocabulary is that it never has to.
    expect(oneYear.fieldStatus['returns.cagr']).toBe('NOT_APPLICABLE');
    expect(byHorizon(result.horizons, 3).returns.absolute).toBeNull();
  }, 180_000);

  it('gives 1y OK and 3y INSUFFICIENT_DATA for a 24-month-old scheme, without throwing', async () => {
    const result = await runAsSystem(() => computeMetricsForScheme(SCHEME_SHORT, AS_OF));

    const oneYear = byHorizon(result.horizons, 1);
    expect(oneYear.status).toBe('OK');
    expect(oneYear.returns.absolute).not.toBeNull();

    for (const years of [3, 5, 7, 10]) {
      const row = byHorizon(result.horizons, years);
      expect(`${years}y:${row.status}`).toBe(`${years}y:INSUFFICIENT_DATA`);
      expect(row.statusReason).toMatch(/nav_history_covers_\d+_of_\d+_months/);
      // The unavailable row is null everywhere, never zero — the single most
      // important behaviour in this layer.
      expect(row.returns.cagr).toBeNull();
      expect(row.risk.stdDevAnn).toBeNull();
      expect(row.riskAdjusted.sharpe).toBeNull();
      expect(row.fieldStatus['riskAdjusted.sharpe']).toBe('INSUFFICIENT_DATA');
    }
  }, 120_000);

  it('marks relative metrics BENCHMARK_UNAVAILABLE on a 10-business-day index hole while absolute metrics stay OK', async () => {
    const result = await runAsSystem(() => computeMetricsForScheme(SCHEME_GAP, AS_OF));
    const oneYear = byHorizon(result.horizons, 1);

    expect(oneYear.status).toBe('BENCHMARK_UNAVAILABLE');
    expect(oneYear.statusReason).toMatch(/benchmark_gap_\d+_business_days/);

    // Absolute metrics are untouched — a gapped index says nothing about the
    // fund's own NAV series (`02 §1`).
    expect(oneYear.returns.absolute).not.toBeNull();
    expect(oneYear.risk.stdDevAnn).not.toBeNull();
    expect(oneYear.risk.maxDrawdown).not.toBeNull();
    expect(oneYear.risk.pctNegativeMonths).not.toBeNull();

    // Every benchmark-relative field is null AND says why.
    for (const path of [
      'returns.benchmarkCagr',
      'riskAdjusted.beta',
      'riskAdjusted.jensenAlphaAnn',
      'riskAdjusted.trackingErrorAnn',
      'riskAdjusted.informationRatio',
      'riskAdjusted.m2',
      'relative.upCapture',
      'relative.downCapture',
      'relative.battingAverage',
      'relative.outperformanceAnn',
    ]) {
      expect(`${path}=${oneYear.fieldStatus[path]}`).toBe(`${path}=BENCHMARK_UNAVAILABLE`);
    }
    expect(oneYear.riskAdjusted.beta).toBeNull();
    expect(oneYear.relative.upCapture).toBeNull();
  }, 120_000);
});

describe('quarantined NAV', () => {
  it('surfaces a quarantined row in the window as QUARANTINED, still computing from the clean rows', async () => {
    const result = await runAsSystem(() => computeMetricsForScheme(SCHEME_QUAR, AS_OF));
    const oneYear = byHorizon(result.horizons, 1);

    // Surfaced, not silently computed around (`01 §6`). The status names the
    // count and the first affected date so an operator can find the rows.
    expect(oneYear.status).toBe('QUARANTINED');
    expect(oneYear.statusReason).toMatch(/^3_quarantined_nav_rows_in_window_from_\d{4}-\d{2}-\d{2}$/);

    // The surviving rows still produce numbers — three bad prints must not
    // blank a year of history, they must caveat it.
    expect(oneYear.returns.absolute).not.toBeNull();
    expect(oneYear.risk.stdDevAnn).not.toBeNull();
    expect(oneYear.risk.maxDrawdown).not.toBeNull();
    expect(oneYear.relative.battingAverage).not.toBeNull();

    // A horizon whose window predates the quarantine is unaffected... and one
    // that cannot reach back that far is INSUFFICIENT_DATA, which outranks
    // QUARANTINED because the window is the more fundamental problem.
    expect(byHorizon(result.horizons, 5).status).toBe('INSUFFICIENT_DATA');
  }, 120_000);
});

describe('horizon-0 profile', () => {
  it('is present with null portfolio fields (not zeros) when the scheme has no snapshot', async () => {
    const result = await runAsSystem(() => computeMetricsForScheme(SCHEME_SHORT, AS_OF));
    const profile: MfCurrentProfile = result.profile;

    expect(profile.snapshotAsOf).toBeNull();
    expect(profile.status).toBe('INSUFFICIENT_DATA');
    expect(profile.statusReason).toBe('no_portfolio_snapshot');

    for (const [field, value] of [
      ['numHoldings', profile.numHoldings],
      ['top10WeightPct', profile.top10WeightPct],
      ['hhi', profile.hhi],
      ['effectiveHoldings', profile.effectiveHoldings],
      ['cashPct', profile.cashPct],
      ['marketCapSplit', profile.marketCapSplit],
      ['sectorWeights', profile.sectorWeights],
      ['turnoverPct', profile.turnoverPct],
      ['creditQualitySplit', profile.creditQualitySplit],
    ] as const) {
      // `null`, emphatically not `0` / `{}` / `[]` — a fund with no disclosure
      // does not hold 0% cash across 0 holdings.
      expect(`${field}=${JSON.stringify(value)}`).toBe(`${field}=null`);
      expect(profile.fieldStatus[field]).toBeDefined();
    }
    expect(profile.topHoldings).toEqual([]);

    // Structural facts come from the meta tables and survive the missing
    // snapshot — blanking them too would hide data we actually have.
    expect(profile.terPct).toBe('0.680000');
    expect(profile.fundAgeYears).not.toBeNull();
    expect(profile.managerTenureYears).not.toBeNull();
    expect(profile.exitLoadMaxDays).toBe(365);
  }, 120_000);

  it('computes the portfolio block from a fresh snapshot', async () => {
    const result = await runAsSystem(() => computeMetricsForScheme(SCHEME_FULL, AS_OF));
    const profile = result.profile;

    expect(profile.status).toBe('OK');
    expect(profile.statusReason).toBeUndefined();
    // Cash and derivatives are excluded from the holding count.
    expect(profile.numHoldings).toBe(3);
    expect(profile.top10WeightPct).toBe('76.500000');
    expect(profile.cashPct).toBe('3.500000');
    expect(profile.marketCapSplit?.large).toBe('55.000000');
    expect(profile.marketCapSplit?.mid).toBe('21.500000');
    expect(profile.sectorWeights).toEqual({
      Financials: '51.500000',
      Technology: '25.000000',
    });
    expect(profile.styleBox).toEqual({ cap: 'LARGE', style: null });
    expect(profile.topHoldings).toHaveLength(3);
    expect(profile.aumGrowth12mPct).toBe('25.000000');

    // Active share needs benchmark constituents, which no table carries yet —
    // BENCHMARK_UNAVAILABLE, not an invented zero.
    expect(profile.activeShare).toBeNull();
    expect(profile.fieldStatus['activeShare']).toBe('BENCHMARK_UNAVAILABLE');
  }, 180_000);

  it('marks the profile STALE when the snapshot is older than 60 days', async () => {
    const result = await runAsSystem(() => computeMetricsForScheme(SCHEME_STALE, AS_OF));
    const profile = result.profile;

    expect(profile.status).toBe('STALE');
    expect(profile.statusReason).toBe('snapshot_95_days_old');
    // STALE means "these numbers describe a portfolio that may have moved on",
    // not "these numbers are missing" — the block is still populated.
    expect(profile.numHoldings).toBe(3);
    expect(profile.snapshotAsOf).toBe(
      addDays(AS_OF, -95).toISOString().slice(0, 10),
    );
  }, 120_000);
});

describe('mfMetricsJob', () => {
  it('writes six rows per scheme and is a byte-identical no-op on re-run', async () => {
    const read = () =>
      runAsSystem(() =>
        prisma.mfSchemeMetrics.findMany({
          where: { schemeCode: { in: ALL_SCHEMES }, asOf: AS_OF },
          orderBy: [{ schemeCode: 'asc' }, { horizonYears: 'asc' }],
          select: {
            schemeCode: true,
            horizonYears: true,
            status: true,
            statusReason: true,
            metrics: true,
            benchmarkCode: true,
            mathVersion: true,
          },
        }),
      );

    const first = await runMfMetricsJob({ asOf: AS_OF, schemeCodes: ALL_SCHEMES });
    expect(first.totalSchemes).toBe(ALL_SCHEMES.length);
    expect(first.failed).toBe(0);
    expect(first.computed).toBe(ALL_SCHEMES.length);
    // Five horizons + the horizon-0 profile.
    expect(first.rowsWritten).toBe(ALL_SCHEMES.length * 6);
    expect(first.coverage).toBe(1);
    expect(first.alerted).toBe(false);

    const afterFirst = await read();
    expect(afterFirst).toHaveLength(ALL_SCHEMES.length * 6);
    expect(afterFirst.map((r) => r.horizonYears).filter((h) => h === 0)).toHaveLength(
      ALL_SCHEMES.length,
    );

    const second = await runMfMetricsJob({ asOf: AS_OF, schemeCodes: ALL_SCHEMES });
    expect(second.rowsWritten).toBe(first.rowsWritten);

    const afterSecond = await read();
    // Same row count (upsert on (schemeCode, asOf, horizonYears), `01 §5`) and
    // identical content — the computation is deterministic, so a re-run cannot
    // move a number without a code change.
    expect(afterSecond).toHaveLength(afterFirst.length);
    expect(JSON.stringify(afterSecond)).toBe(JSON.stringify(afterFirst));
  }, 600_000);

  it('stores every numeric in the metrics JSON as a Decimal string', async () => {
    await runMfMetricsJob({ asOf: AS_OF, schemeCodes: ALL_SCHEMES });
    const rows = await runAsSystem(() =>
      prisma.mfSchemeMetrics.findMany({
        where: { schemeCode: { in: ALL_SCHEMES }, asOf: AS_OF },
        select: { schemeCode: true, horizonYears: true, metrics: true },
      }),
    );
    expect(rows.length).toBeGreaterThan(0);

    const leaks: string[] = [];
    for (const row of rows) {
      for (const leak of findNumberLeaks(row.metrics)) {
        leaks.push(`${row.schemeCode}/h${row.horizonYears}: ${leak}`);
      }
    }
    // A JSON number round-trips through IEEE-754 on the way back out, so a
    // single leak here is a precision bug at the DB boundary (CONTEXT.md §3.1).
    expect(leaks).toEqual([]);

    // And the strings really are Decimal-parseable, not "N/A" or "".
    // SCHEME_FULL specifically: it is the only fixture with ten years of NAV,
    // so it is the only one whose 10-year CAGR is a value rather than a
    // correctly-null INSUFFICIENT_DATA.
    const sample = rows.find(
      (r) => r.schemeCode === SCHEME_FULL && r.horizonYears === 10,
    )?.metrics as unknown as MfHorizonMetrics;
    expect(sample.returns.cagr).toBeTruthy();
    expect(new Decimal(sample.returns.cagr as string).isFinite()).toBe(true);
  }, 600_000);
});
