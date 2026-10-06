import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * The scoring run loads its universe in batches.
 *
 * It did not always. One `findMany` over `MutualFundMaster` with `navHistory`
 * nested inside it worked for as long as the database was thin — 191 trading
 * days in development, 314 in production, about 859,000 NAV rows in total.
 *
 * When production finally held the history it was supposed to (1,821 trading
 * days, 9.7 million rows), the same query died:
 *
 *   PrismaClientKnownRequestError: Invalid `prisma.mutualFundMaster.findMany()`
 *   code: 'GenericFailure'  meta: { modelName: 'MutualFundMaster' }
 *
 * Nothing was out of memory — the container limit is 24 GB and the process was
 * nowhere near it. The query engine simply would not materialise a nested
 * result set that large, and the scoring run wrote zero snapshots.
 *
 * These tests do not need a database: the bug is in the SHAPE of the calls,
 * and the failure it prevents is one nobody can reproduce on a small fixture.
 * So the database is a fake table and the assertions are about paging —
 * including the off-by-one that cursor paging invites, where either one scheme
 * is dropped at the start or one is duplicated at every boundary.
 */

// Read at module load, so it has to be set before the dynamic import below.
process.env.FUND_SCORING_BATCH_SIZE = '50';

const mocks = vi.hoisted(() => ({ findMany: vi.fn() }));
vi.mock('../../../../src/lib/prisma.js', () => ({
  prisma: { mutualFundMaster: { findMany: mocks.findMany } },
}));
vi.mock('../../../../src/lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const { loadCandidates } = await import(
  '../../../../src/services/advisor/fundRanking/scoringRun.service.js'
);

const ASOF = new Date('2026-09-21T00:00:00Z');
const BATCH = 50;

/** A fake `MutualFundMaster` table, ordered by id like the real query asks. */
function fakeTable(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    // Zero-padded so lexical order matches numeric order, as cuid ordering
    // would not but the test's expectations rely on.
    id: `fund-${String(i).padStart(5, '0')}`,
    schemeCode: `SC${i}`,
    schemeName: `Test Fund ${i}`,
    amcName: 'Test AMC',
    category: 'EQUITY',
    subCategory: 'Open Ended Schemes(Equity Scheme - Flexi Cap Fund)',
    isin: null,
    isActive: true,
    planType: 'Direct Plan',
    optionType: 'Growth Option',
    terPct: '0.5000',
    terJoinStatus: 'MATCHED',
    aumInr: '50000000000',
    navHistory: [
      { date: new Date('2026-09-18T00:00:00Z'), nav: '101.2500' },
      { date: new Date('2026-09-21T00:00:00Z'), nav: '102.0000' },
    ],
  }));
}

/** Prisma's `take` / `cursor` / `skip` semantics, only as far as this uses them. */
function servedBy(rows: ReturnType<typeof fakeTable>) {
  return (args: { take?: number; cursor?: { id: string }; skip?: number }) => {
    let start = 0;
    if (args.cursor) {
      const at = rows.findIndex((r) => r.id === args.cursor!.id);
      if (at < 0) return Promise.resolve([]);
      start = at + (args.skip ?? 0);
    }
    return Promise.resolve(rows.slice(start, start + (args.take ?? rows.length)));
  };
}

beforeEach(() => {
  mocks.findMany.mockReset();
});

describe('loadCandidates paging', () => {
  it('never issues an unbounded query, which is the bug itself', async () => {
    mocks.findMany.mockImplementation(servedBy(fakeTable(120)));
    await loadCandidates(ASOF);

    expect(mocks.findMany).toHaveBeenCalled();
    for (const [args] of mocks.findMany.mock.calls) {
      expect(args.take).toBe(BATCH);
    }
  });

  it('returns every scheme exactly once across batch boundaries', async () => {
    // Deliberately not a multiple of the batch size: the last partial batch is
    // where a loop that trusts `length === take` runs forever or stops early.
    const rows = fakeTable(123);
    mocks.findMany.mockImplementation(servedBy(rows));

    const candidates = await loadCandidates(ASOF);

    expect(candidates).toHaveLength(123);
    const codes = candidates.map((c) => c.schemeCode);
    expect(new Set(codes).size).toBe(123);
    // Order is the cursor's order, and it must be the table's.
    expect(codes[0]).toBe('SC0');
    expect(codes.at(-1)).toBe('SC122');
  });

  it('steps past the cursor row only after the first batch', async () => {
    mocks.findMany.mockImplementation(servedBy(fakeTable(120)));
    await loadCandidates(ASOF);

    const [first, ...rest] = mocks.findMany.mock.calls.map(([a]) => a);
    // `skip: 1` on the first call would silently lose the lowest-id scheme.
    expect(first.cursor).toBeUndefined();
    expect(first.skip).toBeUndefined();
    for (const args of rest) {
      expect(args.cursor).toBeDefined();
      expect(args.skip).toBe(1);
    }
  });

  it('stops on an exact multiple instead of looping on an empty page', async () => {
    mocks.findMany.mockImplementation(servedBy(fakeTable(100)));
    const candidates = await loadCandidates(ASOF);

    expect(candidates).toHaveLength(100);
    // Two full batches, then one empty page that ends the loop. What must not
    // happen is a fourth call, or no third.
    expect(mocks.findMany).toHaveBeenCalledTimes(3);
  });

  it('handles an empty universe without a candidate or a crash', async () => {
    mocks.findMany.mockImplementation(servedBy(fakeTable(0)));
    expect(await loadCandidates(ASOF)).toEqual([]);
  });

  it('maps a row the same way paging or not', async () => {
    mocks.findMany.mockImplementation(servedBy(fakeTable(1)));
    const [c] = await loadCandidates(ASOF);

    expect(c!.schemeCode).toBe('SC0');
    expect(c!.planType).toBe('Direct Plan');
    // Dates become plain ISO days and NAVs plain numbers at this boundary —
    // the one Decimal crossing, unchanged by batching.
    expect(c!.navHistory).toEqual([
      { date: '2026-09-18', nav: 101.25 },
      { date: '2026-09-21', nav: 102 },
    ]);
    expect(c!.terPct).toBe(0.5);
    expect(c!.aumInr?.toString()).toBe('50000000000');
    // Never invented: there is no verified source for either.
    expect(c!.managerTenureYears).toBeNull();
    expect(c!.benchmarkTri).toBeNull();
  });

  it('asks only for the five-year window, not the whole history', async () => {
    mocks.findMany.mockImplementation(servedBy(fakeTable(1)));
    await loadCandidates(ASOF);

    const [args] = mocks.findMany.mock.calls[0]!;
    const where = args.select.navHistory.where.date;
    expect(where.lte).toEqual(ASOF);
    const years = (ASOF.getTime() - where.gte.getTime()) / (365.25 * 86_400_000);
    expect(years).toBeCloseTo(5, 5);
  });
});
