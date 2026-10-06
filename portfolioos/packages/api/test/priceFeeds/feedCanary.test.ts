import { describe, it, expect, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { prisma } from '../../src/lib/prisma.js';
import { runAsSystem } from '../../src/lib/requestContext.js';
import {
  FeedCanaryError,
  judgeFeedRun,
  previousSuccessfulImport,
  pruneFeedRunLogs,
  runFeedWithCanary,
} from '../../src/priceFeeds/feedCanary.js';

/**
 * The canary is the thing that was missing when AMFI changed NAVAll: the job
 * kept "succeeding" while importing nothing. So both directions matter here —
 * a healthy run must pass without drama, and each trip condition must fail
 * loudly and leave a record behind.
 */

const T = { maxParseFailurePct: 2, maxRowDropPct: 20 };

describe('judgeFeedRun', () => {
  it('passes a run that looks like the last one', () => {
    const v = judgeFeedRun({ rowsParsed: 14_400, rowsImported: 14_375, parseFailures: 25 }, 14_300, T);
    expect(v.ok).toBe(true);
    expect(v.reason).toBeNull();
  });

  it('passes a run that imported more than last time', () => {
    const v = judgeFeedRun({ rowsParsed: 20_000, rowsImported: 19_900 }, 14_375, T);
    expect(v.ok).toBe(true);
    expect(v.rowDropPct).toBeLessThan(0);
  });

  it('passes the first ever run, which has no baseline', () => {
    const v = judgeFeedRun({ rowsParsed: 100, rowsImported: 100 }, null, T);
    expect(v.ok).toBe(true);
    expect(v.previousImported).toBeNull();
  });

  it('fails when the parse-failure rate is over the limit', () => {
    const v = judgeFeedRun({ rowsParsed: 1000, rowsImported: 950, parseFailures: 50 }, 940, T);
    expect(v.ok).toBe(false);
    expect(v.parseFailureRatePct).toBe(5);
    expect(v.reason).toContain('failed to parse');
  });

  it('allows a failure rate exactly at the limit', () => {
    const v = judgeFeedRun({ rowsParsed: 1000, rowsImported: 980, parseFailures: 20 }, 980, T);
    expect(v.parseFailureRatePct).toBe(2);
    expect(v.ok).toBe(true);
  });

  it('fails when imported rows drop further than the limit below the last run', () => {
    const v = judgeFeedRun({ rowsParsed: 8000, rowsImported: 8000 }, 14_375, T);
    expect(v.ok).toBe(false);
    expect(v.reason).toContain('drop');
    expect(v.rowDropPct).toBeCloseTo(44.35, 1);
  });

  it('allows a drop exactly at the limit', () => {
    const v = judgeFeedRun({ rowsParsed: 800, rowsImported: 800 }, 1000, T);
    expect(v.rowDropPct).toBe(20);
    expect(v.ok).toBe(true);
  });

  // The original incident, on a database with no history to compare against.
  it('fails a run that parsed rows and imported none, with no baseline', () => {
    const v = judgeFeedRun({ rowsParsed: 14_400, rowsImported: 0, parseFailures: 0 }, null, T);
    expect(v.ok).toBe(false);
    expect(v.reason).toBe('parsed 14400 rows and imported none');
  });

  // The whole-file version of the same incident: every row unreadable.
  it('fails a run where nothing parsed at all', () => {
    const v = judgeFeedRun({ rowsParsed: 14_400, rowsImported: 0, parseFailures: 14_400 }, null, T);
    expect(v.ok).toBe(false);
    expect(v.parseFailureRatePct).toBe(100);
  });

  it('does not trip when the source says it published nothing', () => {
    const v = judgeFeedRun({ rowsParsed: 0, rowsImported: 0, sourceEmpty: true }, 210_000, T);
    expect(v.ok).toBe(true);
    expect(v.skipped).toBe(true);
  });

  it('does trip on an empty result the source did not explain', () => {
    const v = judgeFeedRun({ rowsParsed: 0, rowsImported: 0 }, 210_000, T);
    expect(v.ok).toBe(false);
  });

  it('reports a 100% failure rate when nothing parsed and failures were counted', () => {
    const v = judgeFeedRun({ rowsParsed: 0, rowsImported: 0, parseFailures: 7 }, null, T);
    expect(v.parseFailureRatePct).toBe(100);
    expect(v.ok).toBe(false);
  });
});

describe('runFeedWithCanary', () => {
  // Feed names are per-test so a run cannot read another test's baseline.
  const feeds: string[] = [];
  const newFeed = () => {
    const f = `test_feed_${randomUUID().slice(0, 8)}`;
    feeds.push(f);
    return f;
  };

  // FeedRunLog is market-level: no RLS policy, so these run under system
  // context only because `prisma` requires some context to be set.
  afterAll(async () => {
    await runAsSystem(() => prisma.feedRunLog.deleteMany({ where: { feed: { in: feeds } } }));
  });

  it('records an OK run and returns the feed result untouched', async () => {
    const feed = newFeed();
    const result = await runAsSystem(() =>
      runFeedWithCanary(
        feed,
        async () => ({ rowsParsed: 100, rowsImported: 100, parseFailures: 0, extra: 'kept' }),
        (x) => x,
      ),
    );
    expect(result.extra).toBe('kept');

    const row = await runAsSystem(() => prisma.feedRunLog.findFirst({ where: { feed } }));
    expect(row?.status).toBe('OK');
    expect(row?.rowsImported).toBe(100);
    expect(row?.reason).toBeNull();
    expect(await runAsSystem(() => previousSuccessfulImport(feed))).toBe(100);
  });

  it('throws and records FAILED when the row count collapses against the last run', async () => {
    const feed = newFeed();
    await runAsSystem(() =>
      runFeedWithCanary(feed, async () => ({ rowsParsed: 1000, rowsImported: 1000 }), (x) => x),
    );

    await expect(
      runAsSystem(() =>
        runFeedWithCanary(feed, async () => ({ rowsParsed: 1000, rowsImported: 10 }), (x) => x),
      ),
    ).rejects.toThrow(FeedCanaryError);

    const rows = await runAsSystem(() =>
      prisma.feedRunLog.findMany({ where: { feed }, orderBy: { startedAt: 'asc' } }),
    );
    expect(rows.map((r) => r.status)).toEqual(['OK', 'FAILED']);
    expect(rows[1]!.previousImported).toBe(1000);
    expect(rows[1]!.reason).toContain('drop');
  });

  it('throws and records FAILED when too many rows fail to parse', async () => {
    const feed = newFeed();
    await expect(
      runAsSystem(() =>
        runFeedWithCanary(
          feed,
          async () => ({ rowsParsed: 1000, rowsImported: 500, parseFailures: 500 }),
          (x) => x,
        ),
      ),
    ).rejects.toThrow(/failed to parse/);

    const row = await runAsSystem(() => prisma.feedRunLog.findFirst({ where: { feed } }));
    expect(row?.status).toBe('FAILED');
    expect(row?.parseFailures).toBe(500);
  });

  // A failed run must not become the baseline, or one bad night would
  // permanently lower the bar for every night after it.
  it('does not let a failed run become the baseline', async () => {
    const feed = newFeed();
    await runAsSystem(() =>
      runFeedWithCanary(feed, async () => ({ rowsParsed: 1000, rowsImported: 1000 }), (x) => x),
    );
    await runAsSystem(() =>
      runFeedWithCanary(feed, async () => ({ rowsParsed: 1000, rowsImported: 10 }), (x) => x),
    ).catch(() => undefined);

    expect(await runAsSystem(() => previousSuccessfulImport(feed))).toBe(1000);
  });

  it('records a run that threw, then rethrows the original error', async () => {
    const feed = newFeed();
    await expect(
      runAsSystem(() =>
        runFeedWithCanary(
          feed,
          async () => {
            throw new Error('AMFI fetch failed: 503');
          },
          (x: { rowsParsed: number; rowsImported: number }) => x,
        ),
      ),
    ).rejects.toThrow('AMFI fetch failed: 503');

    const row = await runAsSystem(() => prisma.feedRunLog.findFirst({ where: { feed } }));
    expect(row?.status).toBe('FAILED');
    expect(row?.reason).toBe('AMFI fetch failed: 503');
    expect(row?.rowsImported).toBeNull();
  });

  it('records a SKIPPED run when the source published nothing, and keeps the old baseline', async () => {
    const feed = newFeed();
    await runAsSystem(() =>
      runFeedWithCanary(feed, async () => ({ rowsParsed: 500, rowsImported: 500 }), (x) => x),
    );
    await runAsSystem(() =>
      runFeedWithCanary(
        feed,
        async () => ({ rowsParsed: 0, rowsImported: 0 }),
        (x) => ({ ...x, sourceEmpty: true }),
      ),
    );

    const rows = await runAsSystem(() =>
      prisma.feedRunLog.findMany({ where: { feed }, orderBy: { startedAt: 'asc' } }),
    );
    expect(rows.map((r) => r.status)).toEqual(['OK', 'SKIPPED']);
    expect(await runAsSystem(() => previousSuccessfulImport(feed))).toBe(500);
  });

  it('prunes run rows past the retention window', async () => {
    const feed = newFeed();
    const longAgo = new Date(Date.now() - 400 * 86_400_000);
    await runAsSystem(() =>
      prisma.feedRunLog.create({
        data: { feed, startedAt: longAgo, status: 'OK', rowsParsed: 1, rowsImported: 1 },
      }),
    );
    await runAsSystem(() =>
      runFeedWithCanary(feed, async () => ({ rowsParsed: 10, rowsImported: 10 }), (x) => x),
    );

    await runAsSystem(() => pruneFeedRunLogs());

    const rows = await runAsSystem(() => prisma.feedRunLog.findMany({ where: { feed } }));
    expect(rows.length).toBe(1);
    expect(rows[0]!.rowsImported).toBe(10);
  });
});
