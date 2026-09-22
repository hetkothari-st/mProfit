import { describe, it, expect, beforeAll, afterAll, afterEach, vi, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { MethodologyConfig } from '../../../../src/services/advisor/fundRanking/types.js';

/**
 * What a refusal has to do, end to end.
 *
 * The JUDGEMENT is unit-tested in calendarIntegrity.test.ts — a three-week
 * hole fails, a Diwali-shaped three-weekday hole passes. It belongs there and
 * not here: the calendar is derived from the WHOLE universe, and this suite
 * shares a database with fourteen thousand real schemes whose sparse seeded
 * history no fixture can cancel out. A test that fabricated a universe here
 * would really be asserting against whatever else was in the table that day.
 *
 * So this file tests the CONSEQUENCES, and drives the verdict with the
 * threshold rather than with fabricated data: when the calendar cannot be
 * trusted the run must write NO snapshots, record why, and tell somebody —
 * then get out of the way so the existing staleness gate falls back to
 * category advice on its own.
 *
 * That last part is the one worth being careful about. Writing a partial or
 * best-effort set of scores would be the worst outcome available: a ranking
 * computed over a market we stopped watching, looking exactly as confident as
 * one computed over a market we did.
 */

const sentryMock = vi.hoisted(() => ({ captureException: vi.fn() }));
vi.mock('../../../../src/lib/sentry.js', () => ({
  Sentry: { captureException: sentryMock.captureException },
  initSentry: vi.fn(),
}));

const { CalendarIntegrityError, runFundScoring } = await import(
  '../../../../src/services/advisor/fundRanking/scoringRun.service.js'
);
const { snapshotIsFresh, latestSnapshotDate } = await import(
  '../../../../src/services/advisor/fundRanking/methodology.service.js'
);
const { prisma } = await import('../../../../src/lib/prisma.js');
const { runAsSystem } = await import('../../../../src/lib/requestContext.js');

const SUFFIX = randomUUID().slice(0, 6).toUpperCase();
const schemeCodes: string[] = [];
const fundIds: string[] = [];
let methodologyId = '';
let config: MethodologyConfig;

const ASOF = new Date('2026-03-31T00:00:00.000Z');

function weekdaysBetween(fromIso: string, toIso: string): string[] {
  const out: string[] = [];
  const d = new Date(`${fromIso}T00:00:00.000Z`);
  const end = new Date(`${toIso}T00:00:00.000Z`);
  while (d <= end) {
    const day = d.getUTCDay();
    if (day !== 0 && day !== 6) out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

/** Two scoreable funds, so a run allowed to proceed has something to write. */
async function makeUniverse(dates: string[]) {
  let offset = 0;
  for (const label of ['A', 'B']) {
    const schemeCode = `CAL${label}${SUFFIX}`;
    const fund = await prisma.mutualFundMaster.create({
      data: {
        schemeCode,
        schemeName: `Calendar ${label} Flexi Cap Fund ${SUFFIX}`,
        // A mapped AMC, so the TER join has nothing to complain about.
        amcName: 'Kotak Mahindra Mutual Fund',
        category: 'EQUITY',
        subCategory: 'Open Ended Schemes(Equity Scheme - Flexi Cap Fund)',
        isActive: true,
        planType: 'Direct Plan',
        optionType: 'Growth Option',
        aumInr: '50000000000',
        terPct: '0.5000',
        navHistory: {
          create: dates.map((date, n) => ({
            date: new Date(`${date}T00:00:00.000Z`),
            nav: (100 + n * 0.1 + offset).toFixed(4),
          })),
        },
      },
    });
    schemeCodes.push(schemeCode);
    fundIds.push(fund.id);
    offset += 1;
  }
}

async function clearFixtureFunds() {
  if (fundIds.length === 0) return;
  await runAsSystem(async () => {
    await prisma.mFNav.deleteMany({ where: { fundId: { in: fundIds } } });
    await prisma.mutualFundMaster.deleteMany({ where: { id: { in: fundIds } } });
  });
  fundIds.length = 0;
  schemeCodes.length = 0;
}

beforeAll(async () => {
  await runAsSystem(async () => {
    const row = await prisma.rankingMethodologyVersion.findFirst({ orderBy: { version: 'desc' } });
    const base = (row?.config ?? {}) as unknown as MethodologyConfig;
    // A throwaway signed copy, so the seeded row other tests assert on is
    // left alone. The PER-FUND gap rules are relaxed: this file is about the
    // CALENDAR check, and per-fund gaps would exclude the fixtures before it
    // ever ran.
    config = {
      ...base,
      eligibility: {
        ...base.eligibility,
        minTrackRecordYearsActive: 0,
        minTrackRecordYearsPassive: 0,
        maxNavStalenessDays: 100_000,
        maxNavGapTradingDays: 100_000,
      },
    } as MethodologyConfig;
    const created = await prisma.rankingMethodologyVersion.create({
      data: {
        version: (row?.version ?? 0) + 2000,
        config: config as object,
        description: `calendar test methodology ${SUFFIX}`,
        signedOffBy: 'Test Principal Officer',
        signedOffAt: new Date(),
      },
    });
    methodologyId = created.id;
  });
}, 120_000);

afterAll(async () => {
  await clearFixtureFunds();
  await runAsSystem(async () => {
    await prisma.fundScoreSnapshot.deleteMany({ where: { methodologyVersionId: methodologyId } });
    await prisma.feedRunLog.deleteMany({ where: { kind: 'SCORING', feed: 'fund_scoring' } });
    await prisma.rankingMethodologyVersion.deleteMany({ where: { id: methodologyId } });
  });
}, 120_000);

beforeEach(async () => {
  sentryMock.captureException.mockClear();
  // Unconditionally, so one failing test cannot leave rows that make the next
  // one fail on a unique constraint and hide its real result.
  await clearFixtureFunds();
  // Snapshots too: the "previous snapshot stands" test asserts on
  // latestSnapshotDate, which an earlier test's successful run would
  // otherwise have moved forward.
  await runAsSystem(() =>
    prisma.fundScoreSnapshot.deleteMany({ where: { methodologyVersionId: methodologyId } }),
  );
});

afterEach(clearFixtureFunds);

/** A dense quarter of weekdays for the fixture funds themselves. */
const FIXTURE_DAYS = weekdaysBetween('2026-01-01', '2026-03-31');

/** Trips: the shared database's sparse seeded history has weekday holes far
 *  longer than any holiday cluster inside this window. */
const STRICT = () =>
  ({
    ...config,
    eligibility: { ...config.eligibility, maxCalendarGapWeekdays: 4 },
  }) as MethodologyConfig;

/** Never trips, whatever the database holds. */
const LENIENT = () =>
  ({
    ...config,
    eligibility: { ...config.eligibility, maxCalendarGapWeekdays: 100_000 },
  }) as MethodologyConfig;

describe('calendar integrity refusal', () => {
  it('refuses the run when the calendar cannot be trusted, and writes nothing', async () => {
    await runAsSystem(() => makeUniverse(FIXTURE_DAYS));

    const before = await runAsSystem(() =>
      prisma.fundScoreSnapshot.count({ where: { methodologyVersionId: methodologyId } }),
    );

    await expect(
      runAsSystem(() =>
        runFundScoring({ methodologyVersionId: methodologyId, config: STRICT(), asOf: ASOF }),
      ),
    ).rejects.toThrow(CalendarIntegrityError);

    // Nothing written. Not a partial set, not a best-effort set — none.
    const after = await runAsSystem(() =>
      prisma.fundScoreSnapshot.count({ where: { methodologyVersionId: methodologyId } }),
    );
    expect(after).toBe(before);

    // Recorded before the throw, so the refusal is not itself silent (§3.5).
    const log = await runAsSystem(() =>
      prisma.feedRunLog.findFirst({
        where: { kind: 'SCORING', feed: 'fund_scoring', check: 'calendar_integrity' },
        orderBy: { startedAt: 'desc' },
      }),
    );
    expect(log?.status).toBe('REFUSED');
    expect(log?.kind).toBe('SCORING');
    const details = log!.details as Record<string, unknown>;
    expect(details.gapWeekdays as number).toBeGreaterThan(4);
    expect(details.gapFrom).toBeTruthy();
    expect(details.gapTo).toBeTruthy();
    expect(log?.reason).toMatch(/consecutive weekdays/);
    expect(details.asOfDate).toBe('2026-03-31');

    // And somebody is told, through the same path the feed canary uses.
    expect(sentryMock.captureException).toHaveBeenCalledTimes(1);
    const [err, opts] = sentryMock.captureException.mock.calls[0]!;
    expect(err).toBeInstanceOf(CalendarIntegrityError);
    expect(opts.level).toBe('error');
    expect(opts.tags.run_kind).toBe('SCORING');
    expect(opts.tags.feed).toBe('fund_scoring');
    expect(opts.tags.run_check).toBe('calendar_integrity');
    expect(opts.tags.feed_run_id).toBe(log!.id);
    // Scoring keeps its own fingerprint: "AMFI came back thin" and "we
    // declined to rank on a calendar we do not trust" are different
    // incidents with different fixes.
    expect(opts.fingerprint).toEqual(['job-refused', 'fund_scoring', 'calendar_integrity']);
    expect(opts.contexts.feed_run).toMatchObject({
      kind: 'SCORING',
      maxCalendarGapWeekdays: 4,
      gapWeekdays: details.gapWeekdays,
    });
  }, 180_000);

  it('scores normally when the calendar clears the threshold', async () => {
    await runAsSystem(() => makeUniverse(FIXTURE_DAYS));

    await expect(
      runAsSystem(() =>
        runFundScoring({ methodologyVersionId: methodologyId, config: LENIENT(), asOf: ASOF }),
      ),
    ).resolves.toMatchObject({ schemesConsidered: expect.any(Number) });

    const written = await runAsSystem(() =>
      prisma.fundScoreSnapshot.count({
        where: { methodologyVersionId: methodologyId, schemeCode: { in: schemeCodes } },
      }),
    );
    expect(written).toBeGreaterThan(0);
    expect(sentryMock.captureException).not.toHaveBeenCalled();
  }, 180_000);

  /**
   * The previous snapshot stays in force, and the existing staleness gate is
   * what eventually drops advice to category level. Nothing new was built for
   * this — it is asserted so a future change to `snapshotMaxAgeDays` handling
   * cannot quietly remove the fallback a refusal depends on.
   */
  it('leaves the previous snapshot standing, and lets it age out on its own', async () => {
    const asOfDate = new Date('2026-03-30T00:00:00.000Z');
    await runAsSystem(() =>
      prisma.fundScoreSnapshot.create({
        data: {
          asOfDate,
          methodologyVersionId: methodologyId,
          schemeCode: `PRIOR${SUFFIX}`,
          bucket: 'EQUITY_DOMESTIC',
          eligible: true,
          exclusionReasons: [],
          metrics: {},
          dataGaps: [],
          score: '77.0000',
          rankInBucket: 1,
        },
      }),
    );

    await runAsSystem(() => makeUniverse(FIXTURE_DAYS));
    await runAsSystem(() =>
      runFundScoring({ methodologyVersionId: methodologyId, config: STRICT(), asOf: ASOF }),
    ).catch(() => undefined);

    // Untouched.
    const prior = await runAsSystem(() =>
      prisma.fundScoreSnapshot.findFirst({
        where: { methodologyVersionId: methodologyId, schemeCode: `PRIOR${SUFFIX}` },
      }),
    );
    // Decimal(10,4) round-trips as "77"; the point is that it is unchanged.
    expect(prior?.score).not.toBeNull();
    expect(Number(prior!.score!.toString())).toBe(77);
    expect(await runAsSystem(() => latestSnapshotDate(methodologyId))).toEqual(asOfDate);

    // Fresh for the first three days, then not — which is what flips the
    // advisor to `fallbackReason: 'snapshot_stale'` and category advice.
    const stale = { ...config, snapshotMaxAgeDays: 3 } as MethodologyConfig;
    expect(snapshotIsFresh(asOfDate, stale, new Date('2026-04-01T00:00:00.000Z'))).toBe(true);
    expect(snapshotIsFresh(asOfDate, stale, new Date('2026-04-02T00:00:00.000Z'))).toBe(true);
    expect(snapshotIsFresh(asOfDate, stale, new Date('2026-04-04T00:00:00.000Z'))).toBe(false);
  }, 180_000);
});
