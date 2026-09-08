/**
 * `jobs/benchmarkPriceJob.ts` + `jobs/riskFreeRateJob.ts` — end-to-end against
 * the database. `07` Task 1.3, `06 §1` (`mf-benchmark-tri-only`), `06 §7`
 * (staleness alert), `01 §3` (no forward-fill into storage).
 *
 * ---------------------------------------------------------------------------
 * SHARED DATABASE — READ BEFORE ADDING A TEST HERE
 * ---------------------------------------------------------------------------
 * Several agents run against this local database at once. Every row this file
 * creates lives in a reserved namespace — index codes and series names prefixed
 * `TEST_BM_` — and `afterAll` deletes only rows it created. There is no
 * unscoped `deleteMany` anywhere in this file, and in particular the 14 real
 * seeded `BenchmarkIndex` rows come from migration
 * `20260904180000_benchmark_index_seed` and are asserted on but NEVER deleted.
 *
 * ---------------------------------------------------------------------------
 * NO NETWORK
 * ---------------------------------------------------------------------------
 * Both jobs take an injectable fetcher. Every test supplies one, so nothing
 * here can reach niftyindices.com, bseindia.com or data.rbi.org.in — the three
 * endpoints whose URLs are explicitly marked UNVERIFIED in the `.v1.ts` files.
 *
 * DB access is under `runAsSystem` for the assertions: `IngestionFailure` and
 * `Alert` are user-scoped, so without an ambient context RLS fails closed and
 * every count comes back 0, which looks exactly like a logic bug
 * (`CONTEXT.md §5`).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { toDecimal } from '@portfolioos/shared';

import { prisma } from '../../src/lib/prisma.js';
import { runAsSystem } from '../../src/lib/requestContext.js';
import { createTestScope, type TestScope } from '../helpers/db.js';
import {
  BENCHMARK_INDEX_SEED,
  BENCHMARK_TRI_NOT_FREELY_AVAILABLE,
  assertTotalReturnIndex,
  PriceReturnIndexRejectedError,
} from '../../src/priceFeeds/benchmarkIndexSeed.js';
import type { IndexPriceRow } from '../../src/priceFeeds/nseIndices.parse.js';
import type { IndexFetchOutcome, IndexFetchRange } from '../../src/priceFeeds/nseIndices.v1.js';
import type { RiskFreeFetchOutcome } from '../../src/priceFeeds/fbilTbillCurve.v1.js';
import {
  runBenchmarkPrices,
  STALE_BUSINESS_DAY_THRESHOLD,
  __resetBenchmarkOpsUserCache,
} from '../../src/jobs/benchmarkPriceJob.js';
import {
  runRiskFreeRates,
  __resetRiskFreeOpsUserCache,
} from '../../src/jobs/riskFreeRateJob.js';

/** Reserved namespace. Nothing outside this prefix is created or deleted. */
const NS = `TEST_BM_${randomUUID().slice(0, 8).toUpperCase()}`;
const IDX_MAIN = `${NS}_MAIN`;
const IDX_STALE = `${NS}_STALE`;
const IDX_WEEKEND = `${NS}_WEEKEND`;
const IDX_PRI = `${NS}_PRI`;
const RF_SERIES = `${NS}_TBILL_91D`;

/** A real seeded code that is known to have no free daily feed. Used to prove
 *  the suppression list is wired to the real constant — read only, never
 *  written to, never deleted. */
const SUPPRESSED_REAL_CODE = 'CRISIL_COMPOSITE_BOND';

const utc = (y: number, m: number, d: number): Date => new Date(Date.UTC(y, m - 1, d));
const iso = (d: Date): string => d.toISOString().slice(0, 10);

let scope: TestScope;

/** Consecutive weekdays starting from `start`. */
function weekdays(start: Date, count: number): Date[] {
  const out: Date[] = [];
  const cursor = new Date(start.getTime());
  while (out.length < count) {
    const dow = cursor.getUTCDay();
    if (dow !== 0 && dow !== 6) out.push(new Date(cursor.getTime()));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}

/** A fetcher that answers from an in-memory series, per index code. */
function fixtureFetcher(
  seriesByCode: Readonly<Record<string, IndexPriceRow[]>>,
): (index: { code: string; provider: string }, range: IndexFetchRange) => Promise<IndexFetchOutcome> {
  return (index, range) => {
    const rows = seriesByCode[index.code];
    if (!rows) {
      return Promise.resolve({
        ok: false,
        reason: 'NOT_CONFIGURED',
        detail: `no fixture for ${index.code}`,
        sourceRef: index.code,
      });
    }
    const inRange = rows.filter(
      (r) => r.date.getTime() >= range.from.getTime() && r.date.getTime() <= range.to.getTime(),
    );
    return Promise.resolve({
      ok: true,
      rows: inRange,
      failures: [],
      sourceRef: `${index.code}@fixture`,
      adapterId: 'test.fixture',
      adapterVersion: '1',
    });
  };
}

beforeAll(async () => {
  scope = await createTestScope('benchmark-jobs');
  // The ops-user caches are process-wide and may already hold a real admin
  // resolved by a sibling test file. Every call below passes `opsUserId`
  // explicitly, but resetting keeps the caches from leaking across files.
  __resetBenchmarkOpsUserCache();
  __resetRiskFreeOpsUserCache();

  await runAsSystem(async () => {
    await prisma.benchmarkIndex.createMany({
      data: [
        { code: IDX_MAIN, name: `${IDX_MAIN} TRI`, provider: 'NSE', isTotalReturn: true },
        { code: IDX_STALE, name: `${IDX_STALE} TRI`, provider: 'NSE', isTotalReturn: true },
        { code: IDX_WEEKEND, name: `${IDX_WEEKEND} TRI`, provider: 'NSE', isTotalReturn: true },
      ],
      skipDuplicates: true,
    });
  });
});

afterAll(async () => {
  await runAsSystem(async () => {
    // Scoped deletes only: our namespace, our ops user. Never a bare
    // deleteMany, and never the 14 real seeded rows.
    await prisma.benchmarkIndexPrice.deleteMany({ where: { indexCode: { startsWith: NS } } });
    await prisma.benchmarkIndex.deleteMany({ where: { code: { startsWith: NS } } });
    await prisma.riskFreeRate.deleteMany({ where: { series: { startsWith: NS } } });
    await prisma.alert.deleteMany({ where: { userId: scope.userId } });
    await prisma.ingestionFailure.deleteMany({ where: { userId: scope.userId } });
  });
  await scope.cleanup();
});

// ---------------------------------------------------------------------------
// the seed migration
// ---------------------------------------------------------------------------

describe('benchmark index seed migration', () => {
  it('produced exactly the 14 BENCHMARK_INDEX_SEED rows, all total-return', async () => {
    const codes = BENCHMARK_INDEX_SEED.map((e) => e.code);
    expect(codes).toHaveLength(14);

    const rows = await runAsSystem(() =>
      prisma.benchmarkIndex.findMany({
        where: { code: { in: codes } },
        orderBy: { code: 'asc' },
      }),
    );

    expect(rows).toHaveLength(14);
    // Name and provider must match the TS seed too — the migration's VALUES
    // list is a hand-copy of `BENCHMARK_INDEX_SEED`, and a drift between them
    // is exactly the sort of thing nobody notices until a fetcher asks the
    // wrong provider for an index.
    for (const entry of BENCHMARK_INDEX_SEED) {
      const row = rows.find((r) => r.code === entry.code);
      expect(row, `missing seeded row ${entry.code}`).toBeDefined();
      expect(row!.name).toBe(entry.name);
      expect(row!.provider).toBe(entry.provider);
      expect(row!.isTotalReturn).toBe(true);
    }
  });

  it('rejects a price-return index in SQL, not only in TypeScript', async () => {
    // The TypeScript guard.
    expect(() => assertTotalReturnIndex({ code: IDX_PRI, isTotalReturn: false })).toThrow(
      PriceReturnIndexRejectedError,
    );

    // The guard that cannot be bypassed. A PRI benchmark inflates alpha by
    // roughly the market's dividend yield for every fund measured against it,
    // undetectably, so application-level enforcement alone is not enough —
    // a migration, an ops script or a psql session would walk straight past it.
    await expect(
      runAsSystem(() =>
        prisma.benchmarkIndex.create({
          data: { code: IDX_PRI, name: 'price return probe', provider: 'NSE', isTotalReturn: false },
        }),
      ),
    ).rejects.toThrow();

    const leaked = await runAsSystem(() =>
      prisma.benchmarkIndex.count({ where: { code: IDX_PRI } }),
    );
    expect(leaked).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// benchmarkPriceJob — upsert and idempotency
// ---------------------------------------------------------------------------

describe('benchmarkPriceJob', () => {
  const dates = weekdays(utc(2024, 4, 1), 10);
  const series: IndexPriceRow[] = dates.map((date, i) => ({
    date,
    value: toDecimal(`33000.${String(100 + i).padStart(4, '0')}`),
  }));
  // "Today" for these assertions is the last observation, so the series is
  // perfectly fresh and the staleness alert is out of the picture.
  const asOf = dates[dates.length - 1]!;

  it('upserts prices from a fixture', async () => {
    const result = await runBenchmarkPrices({
      indexCodes: [IDX_MAIN],
      opsUserId: scope.userId,
      now: asOf,
      from: dates[0]!,
      to: asOf,
      fetchIndex: fixtureFetcher({ [IDX_MAIN]: series }),
    });

    const summary = result.indices[0]!;
    expect(summary.status).toBe('OK');
    expect(summary.rowsSeen).toBe(series.length);
    expect(summary.rowsInserted).toBe(series.length);
    expect(summary.rowsUpdated).toBe(0);
    expect(summary.rowsSkipped).toBe(0);
    expect(summary.latestDate).toBe(iso(asOf));

    const stored = await runAsSystem(() =>
      prisma.benchmarkIndexPrice.findMany({
        where: { indexCode: IDX_MAIN },
        orderBy: { date: 'asc' },
      }),
    );
    expect(stored).toHaveLength(series.length);
    expect(stored.map((r) => iso(r.date))).toEqual(dates.map(iso));
    // Money-like values survive the round trip exactly — compared as strings,
    // never as JS numbers (§3.1).
    expect(stored[0]!.value.toString()).toBe('33000.01');
    expect(stored.every((r) => r.sourceHash.length === 64)).toBe(true);
  });

  it('is a no-op on a same-day re-run', async () => {
    const before = await runAsSystem(() =>
      prisma.benchmarkIndexPrice.findMany({
        where: { indexCode: IDX_MAIN },
        select: { id: true, sourceHash: true },
        orderBy: { date: 'asc' },
      }),
    );

    const result = await runBenchmarkPrices({
      indexCodes: [IDX_MAIN],
      opsUserId: scope.userId,
      now: asOf,
      from: dates[0]!,
      to: asOf,
      fetchIndex: fixtureFetcher({ [IDX_MAIN]: series }),
    });

    const summary = result.indices[0]!;
    expect(summary.rowsInserted).toBe(0);
    expect(summary.rowsUpdated).toBe(0);
    expect(summary.rowsSkipped).toBe(series.length);

    const after = await runAsSystem(() =>
      prisma.benchmarkIndexPrice.findMany({
        where: { indexCode: IDX_MAIN },
        select: { id: true, sourceHash: true },
        orderBy: { date: 'asc' },
      }),
    );
    // Same row ids and same hashes: not merely "the same count", but literally
    // untouched. A job that deletes and reinserts would pass a count check.
    expect(after).toEqual(before);
  });
});

// ---------------------------------------------------------------------------
// staleness alert (06 §7)
// ---------------------------------------------------------------------------

describe('benchmarkPriceJob staleness alert', () => {
  it('does NOT alert across an ordinary weekend', async () => {
    // Fri 2024-04-05 is the last observation; "today" is Mon 2024-04-08.
    // Business days strictly between = 0, which is how a normal weekend must
    // read. An alert here would fire every Monday, forever.
    const friday = utc(2024, 4, 5);
    const monday = utc(2024, 4, 8);
    expect(friday.getUTCDay()).toBe(5);
    expect(monday.getUTCDay()).toBe(1);

    const result = await runBenchmarkPrices({
      indexCodes: [IDX_WEEKEND],
      opsUserId: scope.userId,
      now: monday,
      from: friday,
      to: friday,
      fetchIndex: fixtureFetcher({
        [IDX_WEEKEND]: [{ date: friday, value: toDecimal('19500.5') }],
      }),
    });

    const summary = result.indices[0]!;
    expect(summary.latestDate).toBe(iso(friday));
    expect(summary.staleBusinessDays).toBe(0);
    expect(summary.staleBusinessDays).toBeLessThanOrEqual(STALE_BUSINESS_DAY_THRESHOLD);
    expect(summary.staleAlertRaised).toBe(false);

    const alerts = await runAsSystem(() =>
      prisma.alert.count({
        where: { userId: scope.userId, title: { contains: IDX_WEEKEND } },
      }),
    );
    expect(alerts).toBe(0);
  });

  it('alerts when an index has no new row for more than 3 business days', async () => {
    // Last observation Mon 2024-04-01; "today" is Mon 2024-04-08. Business days
    // strictly between = 4 (Tue-Fri), which is > 3.
    const lastSeen = utc(2024, 4, 1);
    const today = utc(2024, 4, 8);

    const result = await runBenchmarkPrices({
      indexCodes: [IDX_STALE],
      opsUserId: scope.userId,
      now: today,
      from: lastSeen,
      to: lastSeen,
      fetchIndex: fixtureFetcher({
        [IDX_STALE]: [{ date: lastSeen, value: toDecimal('21000.25') }],
      }),
    });

    const summary = result.indices[0]!;
    expect(summary.latestDate).toBe(iso(lastSeen));
    expect(summary.staleBusinessDays).toBe(4);
    expect(summary.staleAlertSuppressed).toBe(false);
    expect(summary.staleAlertRaised).toBe(true);

    const alerts = await runAsSystem(() =>
      prisma.alert.findMany({
        where: { userId: scope.userId, title: { contains: IDX_STALE } },
      }),
    );
    expect(alerts).toHaveLength(1);
    expect(alerts[0]!.description).toContain(iso(lastSeen));

    // Deduplicated: a second run the same day must not add a second alert.
    await runBenchmarkPrices({
      indexCodes: [IDX_STALE],
      opsUserId: scope.userId,
      now: today,
      from: lastSeen,
      to: lastSeen,
      fetchIndex: fixtureFetcher({
        [IDX_STALE]: [{ date: lastSeen, value: toDecimal('21000.25') }],
      }),
    });
    const after = await runAsSystem(() =>
      prisma.alert.count({ where: { userId: scope.userId, title: { contains: IDX_STALE } } }),
    );
    expect(after).toBe(1);
  });

  it('does NOT alert for a code in BENCHMARK_TRI_NOT_FREELY_AVAILABLE', async () => {
    // A real seeded code with no free daily TRI source and, deliberately, no
    // stored prices at all — the worst possible staleness. Alerting daily for a
    // feed we know we do not have trains people to close alerts unread, and the
    // next one it hides is the real one.
    expect(BENCHMARK_TRI_NOT_FREELY_AVAILABLE).toContain(SUPPRESSED_REAL_CODE);

    const today = utc(2024, 4, 8);
    const result = await runBenchmarkPrices({
      indexCodes: [SUPPRESSED_REAL_CODE],
      opsUserId: scope.userId,
      now: today,
      // No fixture for this code ⇒ NOT_CONFIGURED, which is the real-world
      // outcome too (CRISIL licenses its history; there is no free download).
      fetchIndex: fixtureFetcher({}),
    });

    const summary = result.indices[0]!;
    expect(summary.code).toBe(SUPPRESSED_REAL_CODE);
    // Suppression comes from the module's own default, not from a test-supplied
    // list — that is what makes this a test of the wiring.
    expect(summary.staleAlertSuppressed).toBe(true);
    expect(summary.staleAlertRaised).toBe(false);
    // `null`, never 0: "we have never had this data" is not "we are up to date".
    expect(summary.latestDate).toBeNull();
    expect(summary.staleBusinessDays).toBeNull();
    // A permanent, documented gap is configuration, not a failure — no DLQ row.
    expect(summary.status).toBe('SKIPPED_NOT_CONFIGURED');
    expect(result.dlqRowsWritten).toBe(0);

    const alerts = await runAsSystem(() =>
      prisma.alert.count({
        where: { userId: scope.userId, title: { contains: SUPPRESSED_REAL_CODE } },
      }),
    );
    expect(alerts).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// riskFreeRateJob — observed rows only (01 §3)
// ---------------------------------------------------------------------------

describe('riskFreeRateJob', () => {
  // Four consecutive Fridays. A forward-fill into storage would turn these into
  // ~20 daily rows; the whole point of the test is that it does not.
  const observed = [utc(2024, 4, 5), utc(2024, 4, 12), utc(2024, 4, 19), utc(2024, 4, 26)];
  const rates = ['6.8912', '6.8750', '6.9005', '6.8840'];

  const fetcher = (range: IndexFetchRange): Promise<RiskFreeFetchOutcome> =>
    Promise.resolve({
      ok: true,
      series: 'TBILL_91D',
      rows: observed
        .map((date, i) => ({ date, ratePct: toDecimal(rates[i]!) }))
        .filter(
          (r) =>
            r.date.getTime() >= range.from.getTime() && r.date.getTime() <= range.to.getTime(),
        ),
      failures: [],
      sourceRef: 'fixture',
      adapterId: 'test.fixture',
      adapterVersion: '1',
    });

  it('stores exactly the observed weekly rows — no forward-fill into storage', async () => {
    const result = await runRiskFreeRates({
      series: RF_SERIES,
      opsUserId: scope.userId,
      from: utc(2024, 4, 1),
      to: utc(2024, 4, 30),
      now: utc(2024, 4, 30),
      fetchSeries: fetcher,
    });

    expect(result.status).toBe('OK');
    expect(result.rowsSeen).toBe(4);
    expect(result.rowsInserted).toBe(4);

    const stored = await runAsSystem(() =>
      prisma.riskFreeRate.findMany({ where: { series: RF_SERIES }, orderBy: { date: 'asc' } }),
    );

    // Exactly four rows for a month-long window. `01 §3`: forward-fill happens
    // in the math layer (`forwardFillToDates`), never in storage — otherwise an
    // observation becomes indistinguishable from an interpolation, a
    // restatement has four derived rows to chase, and a dead feed keeps
    // manufacturing fresh-looking rows forever.
    expect(stored).toHaveLength(4);
    expect(stored.map((r) => iso(r.date))).toEqual(observed.map(iso));
    // Compared as Decimals, not strings: Prisma's Decimal drops trailing zeros
    // on `toString()` ("6.8750" -> "6.875"), which is a formatting difference,
    // not a value one. Never compared as JS numbers (§3.1).
    expect(stored.map((r) => toDecimal(r.ratePct.toString()).toFixed(4))).toEqual(rates);

    // No row exists on any day between two observations.
    const midweek = await runAsSystem(() =>
      prisma.riskFreeRate.count({
        where: { series: RF_SERIES, date: { gt: observed[0]!, lt: observed[1]! } },
      }),
    );
    expect(midweek).toBe(0);
  });

  it('is a no-op on re-run', async () => {
    const before = await runAsSystem(() =>
      prisma.riskFreeRate.findMany({
        where: { series: RF_SERIES },
        select: { id: true, sourceHash: true },
        orderBy: { date: 'asc' },
      }),
    );

    const result = await runRiskFreeRates({
      series: RF_SERIES,
      opsUserId: scope.userId,
      from: utc(2024, 4, 1),
      to: utc(2024, 4, 30),
      now: utc(2024, 4, 30),
      fetchSeries: fetcher,
    });

    expect(result.rowsInserted).toBe(0);
    expect(result.rowsUpdated).toBe(0);
    expect(result.rowsSkipped).toBe(4);

    const after = await runAsSystem(() =>
      prisma.riskFreeRate.findMany({
        where: { series: RF_SERIES },
        select: { id: true, sourceHash: true },
        orderBy: { date: 'asc' },
      }),
    );
    expect(after).toEqual(before);
  });
});
