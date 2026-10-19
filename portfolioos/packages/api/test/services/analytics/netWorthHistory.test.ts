import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestScope, prisma, type TestScope } from '../../helpers/db.js';
import { runAsSystem } from '../../../src/lib/requestContext.js';
import { getNetWorthHistory } from '../../../src/services/analytics/netWorthHistory.service.js';

describe('netWorthHistory.service', () => {
  let scope: TestScope;

  beforeAll(async () => {
    scope = await createTestScope('nw-history');

    // Seed snapshots at day-100, day-50, day-10, day-1 (relative to "today")
    // so period filtering has something to cut against.
    const daysAgo = (n: number) => {
      const d = new Date();
      d.setUTCDate(d.getUTCDate() - n);
      return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    };

    await runAsSystem(() =>
      prisma.netWorthSnapshot.createMany({
        data: [
          { userId: scope.userId, asOf: daysAgo(100), totalNetWorth: '1000000', totalLiabilities: '0', netWorthAfterLiabilities: '1000000', breakdownJson: [] },
          { userId: scope.userId, asOf: daysAgo(50), totalNetWorth: '1100000', totalLiabilities: '0', netWorthAfterLiabilities: '1100000', breakdownJson: [] },
          { userId: scope.userId, asOf: daysAgo(10), totalNetWorth: '1200000', totalLiabilities: '0', netWorthAfterLiabilities: '1200000', breakdownJson: [] },
          { userId: scope.userId, asOf: daysAgo(1), totalNetWorth: '1250000', totalLiabilities: '0', netWorthAfterLiabilities: '1250000', breakdownJson: [] },
        ],
      }),
    );
  });

  afterAll(async () => {
    await runAsSystem(() => prisma.netWorthSnapshot.deleteMany({ where: { userId: scope.userId } }));
    await scope.cleanup();
  });

  it('ALL returns every snapshot ordered by asOf ascending', async () => {
    const result = await scope.runAs(() => getNetWorthHistory(scope.userId, 'ALL'));
    expect(result.points).toHaveLength(4);
    expect(result.points[0].netWorthAfterLiabilities).toBe('1000000.0000');
    expect(result.points[3].netWorthAfterLiabilities).toBe('1250000.0000');
  });

  it('1M excludes snapshots older than 30 days', async () => {
    const result = await scope.runAs(() => getNetWorthHistory(scope.userId, '1M'));
    expect(result.points).toHaveLength(2); // day-10 and day-1
  });

  it('summary compares first vs last point in the window', async () => {
    const result = await scope.runAs(() => getNetWorthHistory(scope.userId, 'ALL'));
    // 1250000 - 1000000 = 250000
    expect(result.summary.changeAbsolute).toBe('250000.0000');
    expect(result.summary.changePct).toBeCloseTo(25, 5);
    expect(result.summary.periodLabel).toBe('ALL');
  });

  it('returns a null changePct (not zero-div) with a single point', async () => {
    // Force a single-point case with a fresh scope
    const single = await createTestScope('nw-history-single');
    try {
      const daysAgo0 = new Date();
      const asOf = new Date(Date.UTC(daysAgo0.getUTCFullYear(), daysAgo0.getUTCMonth(), daysAgo0.getUTCDate()));
      await runAsSystem(() =>
        prisma.netWorthSnapshot.create({
          data: { userId: single.userId, asOf, totalNetWorth: '500000', totalLiabilities: '0', netWorthAfterLiabilities: '500000', breakdownJson: [] },
        }),
      );
      const r = await single.runAs(() => getNetWorthHistory(single.userId, 'ALL'));
      expect(r.points).toHaveLength(1);
      expect(r.summary.changePct).toBeNull();
      expect(r.summary.changeAbsolute).toBe('0.0000');
    } finally {
      await runAsSystem(() => prisma.netWorthSnapshot.deleteMany({ where: { userId: single.userId } }));
      await single.cleanup();
    }
  });

  it('1M includes a snapshot at exactly the 30-day boundary (UTC midnight)', async () => {
    // Regression test: the period cutoff must be truncated to UTC midnight before
    // being used in the `gte` filter. A snapshot dated exactly `days` ago (which
    // NetWorthSnapshot.asOf always stores at 00:00 UTC) must be included regardless
    // of the wall-clock time the query runs at.
    const boundary = await createTestScope('nw-history-boundary');
    try {
      const now = new Date();
      const asOf30DaysAgo = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 30),
      );
      await runAsSystem(() =>
        prisma.netWorthSnapshot.create({
          data: {
            userId: boundary.userId,
            asOf: asOf30DaysAgo,
            totalNetWorth: '700000',
            totalLiabilities: '0',
            netWorthAfterLiabilities: '700000',
            breakdownJson: [],
          },
        }),
      );
      const r = await boundary.runAs(() => getNetWorthHistory(boundary.userId, '1M'));
      expect(r.points).toHaveLength(1);
      expect(r.points[0].asOf).toBe(asOf30DaysAgo.toISOString().slice(0, 10));
    } finally {
      await runAsSystem(() => prisma.netWorthSnapshot.deleteMany({ where: { userId: boundary.userId } }));
      await boundary.cleanup();
    }
  });
});
