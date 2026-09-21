import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';

/**
 * A tripped canary has to reach two places, and before this change it reached
 * neither.
 *
 *   1. Sentry, so somebody finds out tonight. Verified before writing the
 *      capture: `Sentry.setupExpressErrorHandler` covers request handlers, the
 *      Bull queues log their `failed` events without capturing them, and the
 *      AMFI sync is a node-cron job whose `runGuarded` wrapper caught, logged
 *      and swallowed. A trip produced one log line and no alert — which, for a
 *      feed that had already been quietly broken for weeks, is most of the
 *      original problem again.
 *
 *   2. The ops page, so somebody can see it tomorrow beside the user-level
 *      ingestion failures it sits next to but is not the same as.
 */

const sentryMock = vi.hoisted(() => ({ captureException: vi.fn() }));
vi.mock('../../src/lib/sentry.js', () => ({
  Sentry: { captureException: sentryMock.captureException },
  initSentry: vi.fn(),
}));

const { FeedCanaryError, runFeedWithCanary } = await import('../../src/priceFeeds/feedCanary.js');
const { listFeedRunFailures } = await import('../../src/services/ingestionFailures.service.js');
const { prisma } = await import('../../src/lib/prisma.js');
const { runAsSystem } = await import('../../src/lib/requestContext.js');

const feeds: string[] = [];
const newFeed = () => {
  const f = `test_alert_${randomUUID().slice(0, 8)}`;
  feeds.push(f);
  return f;
};

beforeEach(() => {
  sentryMock.captureException.mockClear();
});

afterAll(async () => {
  await runAsSystem(() => prisma.feedRunLog.deleteMany({ where: { feed: { in: feeds } } }));
});

describe('a tripped canary reaches Sentry and the ops page', () => {
  it('captures a Sentry event tagged with the feed, run id and verdict', async () => {
    const feed = newFeed();
    // A first healthy run, so the second has a baseline to collapse against.
    await runAsSystem(() =>
      runFeedWithCanary(feed, async () => ({ rowsParsed: 1000, rowsImported: 1000 }), (x) => x),
    );
    expect(sentryMock.captureException).not.toHaveBeenCalled();

    await expect(
      runAsSystem(() =>
        runFeedWithCanary(feed, async () => ({ rowsParsed: 1000, rowsImported: 10 }), (x) => x),
      ),
    ).rejects.toThrow(FeedCanaryError);

    expect(sentryMock.captureException).toHaveBeenCalledTimes(1);
    const [err, opts] = sentryMock.captureException.mock.calls[0]!;
    expect(err).toBeInstanceOf(FeedCanaryError);
    expect(opts.level).toBe('error');
    expect(opts.tags.feed).toBe(feed);
    expect(opts.tags.canary_verdict).toBe('tripped');
    expect(opts.tags.canary_reason).toMatch(/drop/);

    // The run id is the link between the alert and the row on the ops page,
    // so it has to be a real FeedRunLog id, not a placeholder.
    const runId = opts.tags.feed_run_id as string;
    expect(runId).not.toBe('unwritten');
    const row = await runAsSystem(() => prisma.feedRunLog.findUnique({ where: { id: runId } }));
    expect(row?.feed).toBe(feed);
    expect(row?.status).toBe('FAILED');

    // The counts a human needs to judge it, without being indexed as tags.
    expect(opts.contexts.feed_run).toMatchObject({
      runId,
      rowsImported: 10,
      previousImported: 1000,
    });
  });

  it('lists the same failure on the ops feed endpoint', async () => {
    const feed = newFeed();
    await runAsSystem(() =>
      runFeedWithCanary(feed, async () => ({ rowsParsed: 500, rowsImported: 500 }), (x) => x),
    );
    await runAsSystem(() =>
      runFeedWithCanary(feed, async () => ({ rowsParsed: 500, rowsImported: 1 }), (x) => x),
    ).catch(() => undefined);

    const { items } = await runAsSystem(() => listFeedRunFailures({ limit: 200 }));
    const listed = items.find((i) => i.feed === feed);
    expect(listed).toBeTruthy();
    expect(listed!.status).toBe('FAILED');
    expect(listed!.rowsImported).toBe(1);
    // The comparison is the finding: 1 row looks fine until you know it was
    // 500 yesterday, so the list carries both.
    expect(listed!.previousImported).toBe(500);
    expect(listed!.reason).toMatch(/drop/);

    // Same row, same id, in Sentry and on the page.
    const runId = sentryMock.captureException.mock.calls.at(-1)![1].tags.feed_run_id;
    expect(listed!.id).toBe(runId);
  });

  it('captures a run that threw before any verdict, and says so', async () => {
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

    expect(sentryMock.captureException).toHaveBeenCalledTimes(1);
    const [, opts] = sentryMock.captureException.mock.calls[0]!;
    expect(opts.tags.canary_verdict).toBe('threw');
    expect(opts.tags.feed).toBe(feed);

    const { items } = await runAsSystem(() => listFeedRunFailures({ limit: 200 }));
    const listed = items.find((i) => i.feed === feed);
    expect(listed?.reason).toBe('AMFI fetch failed: 503');
    // Nothing was counted, because the run never got as far as counting.
    expect(listed?.rowsImported).toBeNull();
  });

  it('says nothing to Sentry about a healthy run', async () => {
    const feed = newFeed();
    await runAsSystem(() =>
      runFeedWithCanary(feed, async () => ({ rowsParsed: 100, rowsImported: 100 }), (x) => x),
    );
    expect(sentryMock.captureException).not.toHaveBeenCalled();

    const { items } = await runAsSystem(() => listFeedRunFailures({ limit: 200 }));
    expect(items.find((i) => i.feed === feed)).toBeUndefined();
  });

  // A holiday is not an outage, and an alert that fires every Diwali is an
  // alert nobody reads by January.
  it('says nothing about a run the source had no data for', async () => {
    const feed = newFeed();
    await runAsSystem(() =>
      runFeedWithCanary(feed, async () => ({ rowsParsed: 900, rowsImported: 900 }), (x) => x),
    );
    await runAsSystem(() =>
      runFeedWithCanary(
        feed,
        async () => ({ rowsParsed: 0, rowsImported: 0 }),
        (x) => ({ ...x, sourceEmpty: true }),
      ),
    );
    expect(sentryMock.captureException).not.toHaveBeenCalled();

    const { items } = await runAsSystem(() => listFeedRunFailures({ limit: 200 }));
    expect(items.find((i) => i.feed === feed)).toBeUndefined();
  });

  // Groups a week of nightly failures into one issue rather than seven, which
  // is what makes "how long has this been broken" answerable at a glance.
  it('fingerprints by feed and failure mode', async () => {
    const feed = newFeed();
    await runAsSystem(() =>
      runFeedWithCanary(feed, async () => ({ rowsParsed: 100, rowsImported: 100 }), (x) => x),
    );
    await runAsSystem(() =>
      runFeedWithCanary(feed, async () => ({ rowsParsed: 100, rowsImported: 1 }), (x) => x),
    ).catch(() => undefined);

    const [, opts] = sentryMock.captureException.mock.calls[0]!;
    expect(opts.fingerprint).toEqual(['feed-canary', feed, 'tripped']);
  });
});

describe('listFeedRunFailures', () => {
  it('returns only failures, newest first', async () => {
    const feed = newFeed();
    await runAsSystem(async () => {
      await prisma.feedRunLog.createMany({
        data: [
          { feed, status: 'OK', startedAt: new Date('2026-09-01'), rowsImported: 10 },
          { feed, status: 'FAILED', startedAt: new Date('2026-09-02'), reason: 'older' },
          { feed, status: 'SKIPPED', startedAt: new Date('2026-09-03') },
          { feed, status: 'FAILED', startedAt: new Date('2026-09-04'), reason: 'newer' },
        ],
      });
    });

    const { items } = await runAsSystem(() => listFeedRunFailures({ limit: 200 }));
    const mine = items.filter((i) => i.feed === feed);
    expect(mine.map((m) => m.reason)).toEqual(['newer', 'older']);
  });

  it('honours the since filter', async () => {
    const feed = newFeed();
    await runAsSystem(() =>
      prisma.feedRunLog.createMany({
        data: [
          { feed, status: 'FAILED', startedAt: new Date('2026-01-01'), reason: 'ancient' },
          { feed, status: 'FAILED', startedAt: new Date('2026-09-04'), reason: 'recent' },
        ],
      }),
    );
    const { items } = await runAsSystem(() =>
      listFeedRunFailures({ since: new Date('2026-06-01'), limit: 200 }),
    );
    const mine = items.filter((i) => i.feed === feed);
    expect(mine.map((m) => m.reason)).toEqual(['recent']);
  });
});
