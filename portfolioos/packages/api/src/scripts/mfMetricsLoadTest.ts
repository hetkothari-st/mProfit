/**
 * Load test for `mfMetricsJob` and `mfPeerRankJob` — Task 6.4 of
 * `docs/mf-analytics/07-IMPLEMENTATION-PLAN.md`.
 *
 * `mfMetricsJob.CHUNK_SIZE = 100` is justified in its own doc comment by an
 * *estimated* per-scheme cost of "0.2–0.5 s". Nobody had measured it. This
 * script exists so the number in that comment is a measurement rather than a
 * guess, and so it can be re-measured when the metric set grows.
 *
 * It seeds a synthetic scheme universe, times the real
 * `computeMetricsForScheme` + `persistSchemeMetrics` pair per scheme, times a
 * real `runMfPeerRankForUniverses` pass over the same universe, and deletes
 * everything it wrote. The results are recorded in
 * `docs/mf-analytics/LOAD-TEST.md`.
 *
 * ## Run it (LOCAL Postgres only)
 *
 *   DATABASE_URL="postgresql://portfolioos_app:portfolioos_app_dev@localhost:55433/portfolioos" \
 *   DIRECT_URL="postgresql://postgres:postgres@localhost:55433/portfolioos" \
 *   pnpm --filter @portfolioos/api run loadtest:mf-metrics
 *
 * The repo `.env` points at production Neon and `dotenv` does not override an
 * already-set variable, so the shell prefix above is what keeps this off the
 * production database. The script additionally refuses to run against a host
 * that is not localhost — see `assertLocalDatabase`.
 *
 * ## Namespacing and cleanup
 *
 * Every row written carries the `LT9` prefix (scheme codes `LT9…`, a
 * `LT9_BENCH_1` benchmark index, `LT9…` source hashes on the risk-free
 * series). Cleanup deletes strictly by that prefix — there is no unscoped
 * `deleteMany` anywhere in this file, because this script is meant to be
 * runnable against a developer database that has real reference data in it.
 *
 * `MfPeerRank` is the one table that needs an explicit delete: it holds
 * `schemeCode` as a plain string with no FK, so it does not cascade off
 * `MfSchemeMeta`. Everything else does.
 *
 * ## Determinism
 *
 * The NAV / benchmark walks come from a seeded PRNG, so two runs of this
 * script seed byte-identical series and a timing difference is a machine
 * difference, not a data difference. The series is a random walk with drift
 * rather than a constant: a flat series makes volatility zero, and every
 * risk-adjusted metric then short-circuits on a degenerate denominator, which
 * would measure the cheap path and report it as the cost of the job.
 */

import { Decimal, toDecimal, MF_HORIZONS } from '@portfolioos/shared';
import type { Prisma, MfHoldingKind } from '@prisma/client';

import { prisma } from '../lib/prisma.js';
import { runAsSystem } from '../lib/requestContext.js';
import {
  computeMetricsForScheme,
  persistSchemeMetrics,
} from '../services/mfAnalytics/mfMetrics.service.js';
import { CHUNK_SIZE, runMfMetricsJob } from '../jobs/mfMetricsJob.js';
import { UNIVERSE_CHUNK_SIZE, runMfPeerRankForUniverses } from '../jobs/mfPeerRankJob.js';
import { universeKey } from '@portfolioos/shared';

// ---------------------------------------------------------------------------
// Namespace + shape of the synthetic universe
// ---------------------------------------------------------------------------

/** Every row this script writes is findable by this prefix. Cleanup uses it. */
const PREFIX = 'LT9';

const BENCHMARK_CODE = `${PREFIX}_BENCH_1`;
const RISK_FREE_SERIES = 'TBILL_91D';

/**
 * One sub-category / plan pair, so the seeded schemes form exactly one peer
 * universe. 30 members sits in the middle of the 20–70 band
 * `mfPeerRankJob.UNIVERSE_CHUNK_SIZE`'s comment assumes, and above
 * `MIN_UNIVERSE_SIZE` (10) so the ranks are actually computed rather than
 * short-circuited as "category too small".
 */
const SUB_CATEGORY = 'Large Cap Fund';
const PLAN_TYPE = 'DIRECT' as const;

/**
 * Overridable so the peer-rank half can be re-measured at the top of the
 * 20–70 band `mfPeerRankJob`'s comment assumes, without re-timing the metrics
 * half at a size that is no longer representative of one scheme's cost.
 */
const SCHEME_COUNT = Number.parseInt(process.env.LOADTEST_SCHEMES ?? '30', 10);

/**
 * Fixed, so the seeded date range does not drift between runs. A Tuesday, and
 * one day after a month end, so the newest portfolio snapshot is 1 day old and
 * the horizon-0 profile comes out `OK` rather than `STALE` — the `STALE` path
 * skips nothing expensive, but a run where half the profiles are stale is not
 * the run production does.
 */
const AS_OF = new Date(Date.UTC(2026, 8, 1));

/**
 * `mfMetrics.service.MAX_LOOKBACK_YEARS`: the widest horizon (10y) plus the
 * widest rolling window (5y). The loader reads exactly this much NAV, so this
 * is the series length that decides the job's cost.
 */
const LOOKBACK_YEARS = Math.max(...MF_HORIZONS) + 5;

/** Securities per portfolio snapshot, plus one cash and one derivative sleeve. */
const HOLDINGS_PER_SNAPSHOT = 55;

/** `mfMetrics.service.TURNOVER_SNAPSHOT_COUNT` — the loader reads 12. */
const SNAPSHOT_COUNT = 12;

const SECTORS = [
  'Financial Services', 'Information Technology', 'Oil Gas & Consumable Fuels',
  'Fast Moving Consumer Goods', 'Automobile and Auto Components', 'Healthcare',
  'Construction', 'Metals & Mining', 'Power', 'Telecommunication', 'Capital Goods',
];

const CAP_BUCKETS = ['LARGE', 'MID', 'SMALL'] as const;

// ---------------------------------------------------------------------------
// Small deterministic helpers
// ---------------------------------------------------------------------------

/** mulberry32 — 32-bit, seedable, good enough for a synthetic price series. */
function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Box–Muller. Two uniforms in, one standard normal out. */
function gaussian(rng: () => number): number {
  const u1 = Math.max(rng(), Number.EPSILON);
  const u2 = rng();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

function utcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function minusYears(d: Date, years: number): Date {
  return new Date(Date.UTC(d.getUTCFullYear() - years, d.getUTCMonth(), d.getUTCDate()));
}

/**
 * Business days between two dates, inclusive of `from`, exclusive of `to`.
 *
 * AMFI publishes one NAV per business day, so a calendar-daily series would
 * overstate the row count by 40% and understate nothing — but it would also
 * stop being the series the job actually sees. ~15 years of business days is
 * ~3,900 points, which is the "~3,800 daily points" the `CHUNK_SIZE` comment
 * assumes.
 */
function businessDays(from: Date, to: Date): Date[] {
  const out: Date[] = [];
  const cur = utcDay(from);
  const end = to.getTime();
  while (cur.getTime() <= end) {
    const dow = cur.getUTCDay();
    if (dow !== 0 && dow !== 6) out.push(new Date(cur.getTime()));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}

/** Month ends, newest last, counting back `count` months from `before`. */
function monthEndsBefore(before: Date, count: number): Date[] {
  const out: Date[] = [];
  for (let i = count; i >= 1; i--) {
    out.push(new Date(Date.UTC(before.getUTCFullYear(), before.getUTCMonth() - i + 1, 0)));
  }
  return out;
}

function dec(x: number, places: number): Decimal {
  // The PRNG produces JS numbers; they become Decimals at this one boundary
  // and never take part in money arithmetic as floats.
  return toDecimal(x.toFixed(places));
}

async function createManyChunked<T>(
  label: string,
  rows: T[],
  insert: (batch: T[]) => Promise<unknown>,
  batchSize = 5000,
): Promise<void> {
  for (let i = 0; i < rows.length; i += batchSize) {
    await insert(rows.slice(i, i + batchSize));
  }
  console.log(`  seeded ${rows.length.toLocaleString('en-IN')} ${label}`);
}

// ---------------------------------------------------------------------------
// Guard: never production
// ---------------------------------------------------------------------------

/**
 * This script writes ~150k rows and then deletes them. Doing that against the
 * production Neon database because a shell prefix was forgotten is the one
 * failure mode worth a hard stop rather than a warning.
 */
function assertLocalDatabase(): void {
  const url = process.env.DATABASE_URL ?? '';
  const host = url.replace(/^[^@]*@/, '').split('/')[0] ?? '';
  if (!/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host)) {
    throw new Error(
      `mfMetricsLoadTest refuses to run against host "${host}". ` +
        'Set DATABASE_URL/DIRECT_URL to the local docker Postgres (localhost:55433) first.',
    );
  }
}

// ---------------------------------------------------------------------------
// Seed
// ---------------------------------------------------------------------------

function schemeCodeAt(i: number): string {
  return `${PREFIX}${String(100000 + i)}`;
}

async function seed(): Promise<void> {
  const t0 = Date.now();
  const earliest = minusYears(AS_OF, LOOKBACK_YEARS);
  const days = businessDays(earliest, AS_OF);
  console.log(
    `seeding ${SCHEME_COUNT} schemes x ${days.length} business days ` +
      `(${earliest.toISOString().slice(0, 10)} → ${AS_OF.toISOString().slice(0, 10)})`,
  );

  // ── Benchmark index + its price series ────────────────────────────────
  await prisma.benchmarkIndex.upsert({
    where: { code: BENCHMARK_CODE },
    create: {
      code: BENCHMARK_CODE,
      name: 'Load-test synthetic large-cap TRI',
      provider: 'LOADTEST',
      isTotalReturn: true,
    },
    update: {},
  });

  {
    const rng = makeRng(1001);
    let level = 10000;
    const rows: Prisma.BenchmarkIndexPriceCreateManyInput[] = days.map((date) => {
      level *= 1 + 0.00042 + 0.0092 * gaussian(rng);
      return {
        indexCode: BENCHMARK_CODE,
        date,
        value: dec(level, 6),
        sourceHash: `${PREFIX}:bench:${date.toISOString().slice(0, 10)}`,
      };
    });
    await createManyChunked('benchmark prices', rows, (batch) =>
      prisma.benchmarkIndexPrice.createMany({ data: batch, skipDuplicates: true }),
    );
  }

  // ── Risk-free series ──────────────────────────────────────────────────
  //
  // `RISK_FREE_SERIES` is hard-coded to TBILL_91D in the service, so this one
  // cannot be namespaced by key. It is namespaced by `sourceHash` instead and
  // cleanup deletes on that prefix.
  {
    const rng = makeRng(2002);
    const rows: Prisma.RiskFreeRateCreateManyInput[] = days.map((date, i) => {
      const rate = 6.4 + 1.4 * Math.sin(i / 420) + 0.05 * gaussian(rng);
      return {
        series: RISK_FREE_SERIES,
        date,
        ratePct: dec(rate, 6),
        sourceHash: `${PREFIX}:rf:${date.toISOString().slice(0, 10)}`,
      };
    });
    await createManyChunked('risk-free rates', rows, (batch) =>
      prisma.riskFreeRate.createMany({ data: batch, skipDuplicates: true }),
    );
  }

  // ── Schemes: meta + master ────────────────────────────────────────────
  const metaRows: Prisma.MfSchemeMetaCreateManyInput[] = [];
  const masterRows: Prisma.MutualFundMasterCreateManyInput[] = [];
  for (let i = 0; i < SCHEME_COUNT; i++) {
    const code = schemeCodeAt(i);
    metaRows.push({
      schemeCode: code,
      isin: `${PREFIX}F0${String(1000000 + i)}`,
      schemeName: `Load Test Large Cap Fund ${i + 1} - Direct Growth`,
      amcCode: `${PREFIX}AMC`,
      amcName: 'Load Test Asset Management',
      sebiCategory: 'EQUITY',
      sebiSubCategory: SUB_CATEGORY,
      planType: PLAN_TYPE,
      optionType: 'GROWTH',
      isEtf: false,
      benchmarkIndexCode: BENCHMARK_CODE,
      inceptionDate: earliest,
      status: 'ACTIVE',
      riskometer: 'VERY_HIGH',
      exitLoadText: '1% if redeemed within 365 days',
      exitLoadRules: { tiers: [{ maxDays: 365, loadPct: '1.00' }] },
      sourceHash: `${PREFIX}:meta:${code}`,
      fetchedAt: AS_OF,
      updatedAt: AS_OF,
    });
    masterRows.push({
      schemeCode: code,
      schemeName: `Load Test Large Cap Fund ${i + 1} - Direct Growth`,
      amcName: 'Load Test Asset Management',
      category: 'EQUITY',
      subCategory: SUB_CATEGORY,
      isin: `${PREFIX}F0${String(1000000 + i)}`,
      isActive: true,
      updatedAt: AS_OF,
    });
  }
  await prisma.mfSchemeMeta.createMany({ data: metaRows, skipDuplicates: true });
  await prisma.mutualFundMaster.createMany({ data: masterRows, skipDuplicates: true });
  console.log(`  seeded ${SCHEME_COUNT} MfSchemeMeta + MutualFundMaster`);

  const funds = await prisma.mutualFundMaster.findMany({
    where: { schemeCode: { startsWith: PREFIX } },
    select: { id: true, schemeCode: true },
  });
  const fundIdByCode = new Map(funds.map((f) => [f.schemeCode, f.id]));

  // ── NAV series ────────────────────────────────────────────────────────
  for (let i = 0; i < SCHEME_COUNT; i++) {
    const code = schemeCodeAt(i);
    const fundId = fundIdByCode.get(code);
    if (fundId === undefined) throw new Error(`no MutualFundMaster row for ${code}`);
    const rng = makeRng(5000 + i);
    // A per-scheme drift spread so the universe has a real dispersion to rank
    // over — an identical walk for every member makes every percentile a tie.
    const drift = 0.00030 + (i % 7) * 0.00004;
    const sigma = 0.0085 + (i % 5) * 0.0006;
    let nav = 10 + i * 0.35;
    const rows: Prisma.MFNavCreateManyInput[] = days.map((date) => {
      nav *= 1 + drift + sigma * gaussian(rng);
      const d = dec(nav, 6);
      return { fundId, date, nav: d, adjustedNav: d, isQuarantined: false };
    });
    for (let j = 0; j < rows.length; j += 5000) {
      await prisma.mFNav.createMany({ data: rows.slice(j, j + 5000), skipDuplicates: true });
    }
  }
  console.log(
    `  seeded ${(SCHEME_COUNT * days.length).toLocaleString('en-IN')} MFNav rows ` +
      `(${days.length} per scheme)`,
  );

  // ── TER / AUM / managers ──────────────────────────────────────────────
  const terRows: Prisma.MfSchemeTerCreateManyInput[] = [];
  const aumRows: Prisma.MfSchemeAumCreateManyInput[] = [];
  const managerRows: Prisma.MfSchemeManagerCreateManyInput[] = [];
  const aumMonths = monthEndsBefore(AS_OF, 12 * LOOKBACK_YEARS);

  for (let i = 0; i < SCHEME_COUNT; i++) {
    const code = schemeCodeAt(i);
    for (let y = 0; y < 4; y++) {
      terRows.push({
        schemeCode: code,
        effectiveFrom: new Date(Date.UTC(2022 + y, 3, 1)),
        terPct: dec(0.55 + (i % 9) * 0.05 - y * 0.02, 6),
        sourceHash: `${PREFIX}:ter:${code}:${y}`,
        fetchedAt: AS_OF,
      });
    }
    const rng = makeRng(9000 + i);
    let aum = 1200 + i * 340;
    for (const asOf of aumMonths) {
      aum *= 1 + 0.006 + 0.02 * gaussian(rng);
      aumRows.push({
        schemeCode: code,
        asOf,
        aum: dec(Math.abs(aum) * 1e7, 4),
        sourceHash: `${PREFIX}:aum:${code}:${asOf.toISOString().slice(0, 10)}`,
        fetchedAt: AS_OF,
      });
    }
    managerRows.push(
      {
        schemeCode: code,
        managerName: `Load Test Manager A${i}`,
        role: 'Lead Fund Manager',
        fromDate: new Date(Date.UTC(2018, 3, 1)),
        toDate: null,
        sourceHash: `${PREFIX}:mgr:${code}:a`,
        fetchedAt: AS_OF,
      },
      {
        schemeCode: code,
        managerName: `Load Test Manager B${i}`,
        role: 'Co Fund Manager',
        fromDate: new Date(Date.UTC(2021, 6, 1)),
        toDate: null,
        sourceHash: `${PREFIX}:mgr:${code}:b`,
        fetchedAt: AS_OF,
      },
      {
        schemeCode: code,
        managerName: `Load Test Manager C${i}`,
        role: 'Co Fund Manager',
        fromDate: new Date(Date.UTC(2016, 0, 1)),
        toDate: new Date(Date.UTC(2024, 5, 30)),
        sourceHash: `${PREFIX}:mgr:${code}:c`,
        fetchedAt: AS_OF,
      },
    );
  }
  await createManyChunked('TER rows', terRows, (b) =>
    prisma.mfSchemeTer.createMany({ data: b, skipDuplicates: true }),
  );
  await createManyChunked('AUM rows', aumRows, (b) =>
    prisma.mfSchemeAum.createMany({ data: b, skipDuplicates: true }),
  );
  await createManyChunked('manager rows', managerRows, (b) =>
    prisma.mfSchemeManager.createMany({ data: b, skipDuplicates: true }),
  );

  // ── Portfolio snapshots + holdings ────────────────────────────────────
  const snapshotDates = monthEndsBefore(AS_OF, SNAPSHOT_COUNT);
  const snapshotRows: Prisma.MfPortfolioSnapshotCreateManyInput[] = [];
  const holdingRows: Prisma.MfPortfolioHoldingCreateManyInput[] = [];

  for (let i = 0; i < SCHEME_COUNT; i++) {
    const code = schemeCodeAt(i);
    for (let s = 0; s < snapshotDates.length; s++) {
      const snapId = `${PREFIX}snap-${code}-${s}`;
      const rng = makeRng(20000 + i * 100 + s);
      // Raw weights, then normalised, so the sleeve sums to ~100% the way a
      // real disclosure does. The per-snapshot RNG seed means consecutive
      // snapshots differ, which is what makes `turnoverPct` non-trivial
      // instead of a constant zero.
      const raw: number[] = [];
      for (let h = 0; h < HOLDINGS_PER_SNAPSHOT; h++) {
        raw.push(0.4 + Math.abs(gaussian(rng)) * (h < 10 ? 3.2 : 0.9));
      }
      const cashPct = 2 + rng() * 2;
      const total = raw.reduce((a, b) => a + b, 0);
      const scale = (100 - cashPct) / total;

      snapshotRows.push({
        id: snapId,
        schemeCode: code,
        asOf: snapshotDates[s]!,
        totalHoldings: HOLDINGS_PER_SNAPSHOT,
        cashPct: dec(cashPct, 6),
        sourceHash: `${PREFIX}:snap:${code}:${s}`,
        fetchedAt: AS_OF,
      });

      for (let h = 0; h < HOLDINGS_PER_SNAPSHOT; h++) {
        // 50 equities, 3 debt, 1 cash, 1 derivative — a large-cap fund's
        // actual shape. The debt sleeve is what exercises the duration /
        // YTM / credit-quality half of the horizon-0 profile.
        const kind: MfHoldingKind =
          h < 50 ? 'EQUITY' : h < 53 ? 'DEBT' : h === 53 ? 'CASH' : 'DERIVATIVE';
        const isDebt = kind === 'DEBT';
        holdingRows.push({
          snapshotId: snapId,
          kind,
          isin: `${PREFIX}E0${String(500000 + ((i * 137 + h * 13 + s) % 900))}`,
          securityName: `LoadTest Security ${(i * 137 + h * 13 + s) % 900}`,
          weightPct: dec(raw[h]! * scale, 6),
          sector: kind === 'EQUITY' ? SECTORS[(h + s) % SECTORS.length]! : null,
          marketCapBucket:
            kind === 'EQUITY' ? CAP_BUCKETS[h < 38 ? 0 : h < 47 ? 1 : 2]! : null,
          issuer: isDebt ? `LoadTest Issuer ${h % 4}` : null,
          creditRating: isDebt ? (h % 3 === 0 ? 'AAA' : h % 3 === 1 ? 'AA+' : 'A') : null,
          maturityDate: isDebt
            ? new Date(Date.UTC(2028 + (h % 5), (h * 3) % 12, 15))
            : null,
          ytmPct: isDebt ? dec(7.1 + (h % 4) * 0.35, 6) : null,
        });
      }
    }
  }
  await createManyChunked('portfolio snapshots', snapshotRows, (b) =>
    prisma.mfPortfolioSnapshot.createMany({ data: b, skipDuplicates: true }),
  );
  await createManyChunked('portfolio holdings', holdingRows, (b) =>
    prisma.mfPortfolioHolding.createMany({ data: b, skipDuplicates: true }),
  );

  console.log(`seed done in ${((Date.now() - t0) / 1000).toFixed(1)}s\n`);
}

// ---------------------------------------------------------------------------
// Measure
// ---------------------------------------------------------------------------

function percentile(sortedMs: readonly number[], p: number): number {
  if (sortedMs.length === 0) return 0;
  // Nearest-rank. With 30 samples p95 is the 29th, which is the honest reading
  // of "the second-worst scheme" — an interpolated p95 on a sample this small
  // would invent a number between two observations.
  const idx = Math.min(sortedMs.length - 1, Math.ceil((p / 100) * sortedMs.length) - 1);
  return sortedMs[idx]!;
}

interface Timings {
  min: number;
  median: number;
  p95: number;
  max: number;
  total: number;
  n: number;
}

function summarise(samples: readonly number[]): Timings {
  const sorted = [...samples].sort((a, b) => a - b);
  return {
    min: sorted[0] ?? 0,
    median: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    max: sorted[sorted.length - 1] ?? 0,
    total: samples.reduce((a, b) => a + b, 0),
    n: samples.length,
  };
}

function printTimings(label: string, t: Timings): void {
  console.log(
    `${label}: n=${t.n}  min=${t.min}ms  median=${t.median}ms  ` +
      `p95=${t.p95}ms  max=${t.max}ms  total=${(t.total / 1000).toFixed(1)}s`,
  );
}

async function measure(): Promise<void> {
  const schemeCodes = Array.from({ length: SCHEME_COUNT }, (_, i) => schemeCodeAt(i));

  // Pass 1 — cold. Discarded: it pays for Postgres's first read of every page
  // of the NAV series and for Prisma's first-query connection setup, neither of
  // which a nightly job on a warm box pays.
  console.log('pass 1 (cold, discarded)…');
  const cold = await runMfMetricsJob({ asOf: AS_OF, schemeCodes });
  console.log(
    `  computed=${cold.computed} failed=${cold.failed} rows=${cold.rowsWritten} ` +
      `in ${(cold.durationMs / 1000).toFixed(1)}s`,
  );
  if (cold.failed > 0) {
    throw new Error(
      `${cold.failed} schemes failed on the cold pass — the seeded universe is wrong, ` +
        'and a run made of DLQ writes measures the error path, not the job.',
    );
  }

  // Pass 2 — warm, per-scheme. This is the same pair of calls
  // `mfMetricsJob.runForScheme` makes, timed individually so the distribution
  // is real rather than a total divided by a count.
  console.log('pass 2 (warm, per-scheme timing)…');
  const samples: number[] = [];
  const computeSamples: number[] = [];
  const persistSamples: number[] = [];
  let rowsWritten = 0;
  await runAsSystem(async () => {
    for (const schemeCode of schemeCodes) {
      const t = Date.now();
      const result = await computeMetricsForScheme(schemeCode, AS_OF);
      const tCompute = Date.now();
      rowsWritten += await persistSchemeMetrics(result);
      const tEnd = Date.now();
      computeSamples.push(tCompute - t);
      persistSamples.push(tEnd - tCompute);
      samples.push(tEnd - t);
    }
  });
  const perScheme = summarise(samples);
  printTimings('  per-scheme (compute+persist)', perScheme);
  printTimings('    of which computeMetricsForScheme', summarise(computeSamples));
  printTimings('    of which persistSchemeMetrics  ', summarise(persistSamples));
  console.log(`  rows written: ${rowsWritten} (${rowsWritten / SCHEME_COUNT} per scheme)`);

  // How much of `computeMetricsForScheme` is database and how much is math?
  // The chunk size is defended in the code comment as "roughly six indexed
  // reads plus in-memory math"; if the reads are a rounding error then a
  // faster database does not rescue an over-large chunk, and that changes what
  // the threats-to-validity section is allowed to claim.
  const ioSamples: number[] = [];
  await runAsSystem(async () => {
    for (const schemeCode of schemeCodes) {
      const t = Date.now();
      const master = await prisma.mutualFundMaster.findUnique({
        where: { schemeCode },
        select: { id: true },
      });
      await prisma.mFNav.findMany({
        where: {
          fundId: master!.id,
          date: { gte: minusYears(AS_OF, LOOKBACK_YEARS), lte: AS_OF },
        },
        select: { date: true, adjustedNav: true, isQuarantined: true },
        orderBy: { date: 'asc' },
      });
      ioSamples.push(Date.now() - t);
    }
  });
  printTimings('    (reference) NAV read alone     ', summarise(ioSamples));

  // Pass 3 — warm, whole job. Cross-checks pass 2 and captures the job's own
  // overhead (the scheme-list query, the chunk loop, the coverage check).
  console.log('pass 3 (warm, whole runMfMetricsJob)…');
  const warm = await runMfMetricsJob({ asOf: AS_OF, schemeCodes });
  console.log(
    `  computed=${warm.computed} failed=${warm.failed} rows=${warm.rowsWritten} ` +
      `coverage=${(warm.coverage * 100).toFixed(0)}% in ${(warm.durationMs / 1000).toFixed(1)}s ` +
      `(${Math.round(warm.durationMs / SCHEME_COUNT)}ms/scheme)`,
  );

  await measurePeerRank(false);

  // ── Chunk arithmetic ──────────────────────────────────────────────────
  const budgetMs = 4 * 60 * 1000;
  const lockMs = 5 * 60 * 1000;
  console.log('\n--- chunk arithmetic -------------------------------------');
  console.log(`mfMetricsJob.CHUNK_SIZE = ${CHUNK_SIZE}`);
  for (const [label, ms] of [
    ['median', perScheme.median],
    ['p95', perScheme.p95],
    ['max', perScheme.max],
  ] as const) {
    const chunkMs = CHUNK_SIZE * ms;
    console.log(
      `  ${CHUNK_SIZE} x ${label} ${ms}ms = ${(chunkMs / 1000).toFixed(1)}s  ` +
        `budget headroom x${(budgetMs / chunkMs).toFixed(1)}  ` +
        `lock headroom x${(lockMs / chunkMs).toFixed(1)}`,
    );
  }
  console.log(
    `  1500 schemes @ p95 ${perScheme.p95}ms = ` +
      `${((1500 * perScheme.p95) / 60000).toFixed(1)} min over ` +
      `${Math.ceil(1500 / CHUNK_SIZE)} chunks (9000 rows)`,
  );
  console.log('----------------------------------------------------------\n');
}

/**
 * Time one peer-rank universe. `populate` runs the metrics job first, because
 * `runPeerRankForUniverse` ranks the `MfSchemeMetrics` rows that job leaves
 * behind and a universe with no metrics rows measures an empty loop.
 */
async function measurePeerRank(populate: boolean): Promise<void> {
  if (populate) {
    console.log(`populating metrics for ${SCHEME_COUNT} schemes…`);
    const codes = Array.from({ length: SCHEME_COUNT }, (_, i) => schemeCodeAt(i));
    const s = await runMfMetricsJob({ asOf: AS_OF, schemeCodes: codes });
    if (s.failed > 0) throw new Error(`${s.failed} schemes failed while populating metrics`);
  }
  const ref = {
    universeKey: universeKey(SUB_CATEGORY, PLAN_TYPE),
    sebiSubCategory: SUB_CATEGORY,
    planType: PLAN_TYPE,
  };
  console.log('peer rank pass 1 (cold, discarded)…');
  await runAsSystem(() => runMfPeerRankForUniverses([ref], AS_OF));
  console.log('peer rank pass 2 (warm, measured)…');
  const prStart = Date.now();
  const pr = await runAsSystem(() => runMfPeerRankForUniverses([ref], AS_OF));
  const prMs = Date.now() - prStart;
  console.log(
    `  universes=${pr.universes} ok=${pr.succeeded} failed=${pr.failed} ` +
      `rows=${pr.rowsWritten} profilesPatched=${pr.profilesPatched} in ${prMs}ms`,
  );

  console.log(`\nmfPeerRankJob.UNIVERSE_CHUNK_SIZE = ${UNIVERSE_CHUNK_SIZE}`);
  console.log(
    `  ${UNIVERSE_CHUNK_SIZE} x measured ${SCHEME_COUNT}-scheme universe ${prMs}ms = ` +
      `${((UNIVERSE_CHUNK_SIZE * prMs) / 1000).toFixed(1)}s  ` +
      `slice-budget(150s) headroom x${(150_000 / (UNIVERSE_CHUNK_SIZE * prMs)).toFixed(1)}  ` +
      `lock(300s) headroom x${(300_000 / (UNIVERSE_CHUNK_SIZE * prMs)).toFixed(1)}\n`,
  );
}

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

/**
 * Prefix-scoped, in FK order. `MfPeerRank` first because it holds `schemeCode`
 * as a bare string with no FK and therefore does not cascade; everything under
 * `MfSchemeMeta` and `MutualFundMaster` does.
 */
async function cleanup(): Promise<void> {
  const peerRanks = await prisma.mfPeerRank.deleteMany({
    where: { schemeCode: { startsWith: PREFIX } },
  });
  const meta = await prisma.mfSchemeMeta.deleteMany({
    where: { schemeCode: { startsWith: PREFIX } },
  });
  const master = await prisma.mutualFundMaster.deleteMany({
    where: { schemeCode: { startsWith: PREFIX } },
  });
  const bench = await prisma.benchmarkIndex.deleteMany({ where: { code: { startsWith: PREFIX } } });
  const rf = await prisma.riskFreeRate.deleteMany({
    where: { series: RISK_FREE_SERIES, sourceHash: { startsWith: PREFIX } },
  });
  console.log(
    `cleanup: MfPeerRank=${peerRanks.count} MfSchemeMeta=${meta.count} ` +
      `MutualFundMaster=${master.count} BenchmarkIndex=${bench.count} RiskFreeRate=${rf.count}`,
  );

  const residual = {
    MfSchemeMeta: await prisma.mfSchemeMeta.count({ where: { schemeCode: { startsWith: PREFIX } } }),
    MutualFundMaster: await prisma.mutualFundMaster.count({
      where: { schemeCode: { startsWith: PREFIX } },
    }),
    MfSchemeMetrics: await prisma.mfSchemeMetrics.count({
      where: { schemeCode: { startsWith: PREFIX } },
    }),
    MfPeerRank: await prisma.mfPeerRank.count({ where: { schemeCode: { startsWith: PREFIX } } }),
    BenchmarkIndexPrice: await prisma.benchmarkIndexPrice.count({
      where: { indexCode: { startsWith: PREFIX } },
    }),
    RiskFreeRate: await prisma.riskFreeRate.count({ where: { sourceHash: { startsWith: PREFIX } } }),
  };
  console.log('residual rows under the LT9 prefix:', JSON.stringify(residual));
  const leftovers = Object.entries(residual).filter(([, n]) => n > 0);
  if (leftovers.length > 0) {
    throw new Error(`cleanup incomplete: ${JSON.stringify(leftovers)}`);
  }
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  assertLocalDatabase();
  const mode = process.argv[2] ?? 'all';
  if (mode === 'cleanup') {
    await cleanup();
    return;
  }
  if (mode === 'peer') {
    // Peer-rank only, against an already-seeded universe of `LOADTEST_SCHEMES`.
    await measurePeerRank(true);
    return;
  }
  if (mode !== 'all' && mode !== 'seed' && mode !== 'measure') {
    throw new Error(`unknown mode "${mode}" — expected: all | seed | measure | peer | cleanup`);
  }
  if (mode === 'all' || mode === 'seed') await seed();
  if (mode === 'all' || mode === 'measure') await measure();
  if (mode === 'all') await cleanup();
}

main()
  .catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
