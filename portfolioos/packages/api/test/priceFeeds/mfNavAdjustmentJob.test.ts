/**
 * `jobs/mfNavAdjustmentJob.ts` — end-to-end against the database.
 *
 * The point of this file is `CONTEXT.md §3.3`: running the job twice over
 * unchanged data must write nothing the second time — no NAV updates, no
 * duplicate `IngestionFailure` rows, no duplicate alert. That is the property
 * that makes both the nightly cron and the backfill script safe to re-run.
 *
 * It also pins the three column outcomes the rest of the analytics layer
 * depends on: GROWTH ⇒ `adjustedNav === nav`, IDCW ⇒ a sibling-derived series,
 * and a bad NAV ⇒ quarantined with a reason plus a DLQ row.
 *
 * DB access here is via the job's own `runAsSystem` for the writes and an
 * explicit `runAsSystem` for the assertions — `IngestionFailure` and `Alert`
 * are user-scoped, so without an ambient context RLS fails closed and every
 * count comes back 0, which looks exactly like a logic bug (`CONTEXT.md §5`).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { Decimal } from 'decimal.js';

import { prisma } from '../../src/lib/prisma.js';
import { runAsSystem } from '../../src/lib/requestContext.js';
import { createTestScope, type TestScope } from '../helpers/db.js';
import {
  runMfNavAdjustment,
  MF_NAV_ADJUSTMENT_ADAPTER_ID,
} from '../../src/jobs/mfNavAdjustmentJob.js';

const OBSERVATIONS = 30;
const PAYOUT_INDEX = 15;
const BAD_ROW_INDEX = 20;

/** Consecutive weekdays from Mon 2024-01-01, so the weekend rule never fires. */
function businessDays(count: number): Date[] {
  const out: Date[] = [];
  const cursor = new Date(Date.UTC(2024, 0, 1));
  while (out.length < count) {
    const dow = cursor.getUTCDay();
    if (dow !== 0 && dow !== 6) out.push(new Date(cursor.getTime()));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}

interface Fixture {
  growthFundId: string;
  idcwFundId: string;
  badFundId: string;
  growthCode: string;
  idcwCode: string;
  badCode: string;
  dates: Date[];
}

let scope: TestScope;
let fx: Fixture;

beforeAll(async () => {
  scope = await createTestScope('mf-nav-adj');
  const suffix = randomUUID().slice(0, 8).toUpperCase();
  const dates = businessDays(OBSERVATIONS);

  // Scheme codes are processed in ascending order by the job, so the growth
  // sibling is evaluated (and its own rows validated) before the IDCW option
  // reads it. `A` < `B` < `C` encodes that ordering explicitly.
  const growthCode = `ZZTEST${suffix}A`;
  const idcwCode = `ZZTEST${suffix}B`;
  const badCode = `ZZTEST${suffix}C`;

  fx = await runAsSystem(async () => {
    const growth = await prisma.mutualFundMaster.create({
      data: {
        schemeCode: growthCode,
        schemeName: 'PortfolioOS Test Scheme - Direct Plan - Growth',
        amcName: 'PortfolioOS Test AMC',
        category: 'EQUITY',
      },
    });
    const idcw = await prisma.mutualFundMaster.create({
      data: {
        schemeCode: idcwCode,
        schemeName: 'PortfolioOS Test Scheme - Direct Plan - IDCW Payout',
        amcName: 'PortfolioOS Test AMC',
        category: 'EQUITY',
      },
    });
    const bad = await prisma.mutualFundMaster.create({
      data: {
        schemeCode: badCode,
        schemeName: 'PortfolioOS Broken Scheme - Direct Plan - Growth',
        amcName: 'PortfolioOS Test AMC',
        category: 'EQUITY',
      },
    });

    const meta = (code: string, optionType: 'GROWTH' | 'IDCW_PAYOUT', sibling: string | null) => ({
      schemeCode: code,
      schemeName: 'PortfolioOS Test Scheme',
      amcCode: 'PFOSTEST',
      amcName: 'PortfolioOS Test AMC',
      sebiCategory: 'EQUITY' as const,
      sebiSubCategory: 'Large Cap Fund',
      planType: 'DIRECT' as const,
      optionType,
      inceptionDate: dates[0]!,
      growthSiblingSchemeCode: sibling,
      sourceHash: `test-${code}`,
      fetchedAt: new Date(),
    });
    await prisma.mfSchemeMeta.createMany({
      data: [
        meta(growthCode, 'GROWTH', null),
        meta(idcwCode, 'IDCW_PAYOUT', growthCode),
        meta(badCode, 'GROWTH', null),
      ],
    });

    // Growth compounds 0.1%/day; the IDCW option tracks it exactly and then
    // drops to 90% of it from the payout date onward. The broken scheme is the
    // growth series with one +60% spike, which must be quarantined as nav_jump.
    const navRows: { fundId: string; date: Date; nav: string }[] = [];
    let g = new Decimal('100');
    for (let i = 0; i < OBSERVATIONS; i += 1) {
      if (i > 0) g = g.times('1.001');
      const date = dates[i]!;
      navRows.push({ fundId: growth.id, date, nav: g.toFixed(4) });
      const idcwNav = i < PAYOUT_INDEX ? g : g.times('0.9');
      navRows.push({ fundId: idcw.id, date, nav: idcwNav.toFixed(4) });
      const badNav = i === BAD_ROW_INDEX ? g.times('1.6') : g;
      navRows.push({ fundId: bad.id, date, nav: badNav.toFixed(4) });
    }
    await prisma.mFNav.createMany({ data: navRows });

    return {
      growthFundId: growth.id,
      idcwFundId: idcw.id,
      badFundId: bad.id,
      growthCode,
      idcwCode,
      badCode,
      dates,
    };
  });
});

afterAll(async () => {
  await runAsSystem(async () => {
    await prisma.alert.deleteMany({ where: { userId: scope.userId } });
    await prisma.ingestionFailure.deleteMany({ where: { userId: scope.userId } });
    await prisma.mfSchemeMeta.deleteMany({
      where: { schemeCode: { in: [fx.growthCode, fx.idcwCode, fx.badCode] } },
    });
    // MFNav cascades from MutualFundMaster.
    await prisma.mutualFundMaster.deleteMany({
      where: { id: { in: [fx.growthFundId, fx.idcwFundId, fx.badFundId] } },
    });
  });
  await scope.cleanup();
});

const runOnFixture = (overrides: Record<string, unknown> = {}) =>
  runMfNavAdjustment({
    fundIds: [fx.growthFundId, fx.idcwFundId, fx.badFundId],
    opsUserId: scope.userId,
    ...overrides,
  });

const countDlq = () =>
  runAsSystem(() =>
    prisma.ingestionFailure.count({
      where: { userId: scope.userId, sourceAdapter: MF_NAV_ADJUSTMENT_ADAPTER_ID },
    }),
  );

describe('mfNavAdjustmentJob', () => {
  it('first run: adjusts, quarantines and writes one DLQ row per new quarantine', async () => {
    const r = await runOnFixture();

    expect(r.fundsSeen).toBe(3);
    expect(r.rowsSeen).toBe(OBSERVATIONS * 3);
    expect(r.rowsWritten).toBeGreaterThan(0);
    expect(r.rowsQuarantined).toBe(1);
    expect(r.rowsNewlyQuarantined).toBe(1);
    expect(r.dlqRowsWritten).toBe(1);
    expect(await countDlq()).toBe(1);

    // GROWTH: adjustedNav === nav, exactly.
    const growthRows = await runAsSystem(() =>
      prisma.mFNav.findMany({ where: { fundId: fx.growthFundId }, orderBy: { date: 'asc' } }),
    );
    expect(growthRows).toHaveLength(OBSERVATIONS);
    for (const row of growthRows) {
      expect(row.adjustedNav).not.toBeNull();
      expect(new Decimal(row.adjustedNav!.toString()).eq(new Decimal(row.nav.toString()))).toBe(
        true,
      );
      expect(row.isQuarantined).toBe(false);
    }

    // The broken scheme: exactly the spike row is quarantined, with a reason.
    const badRows = await runAsSystem(() =>
      prisma.mFNav.findMany({ where: { fundId: fx.badFundId }, orderBy: { date: 'asc' } }),
    );
    const flagged = badRows.filter((row) => row.isQuarantined);
    expect(flagged).toHaveLength(1);
    expect(flagged[0]?.quarantineReason).toBe('nav_jump');
    expect(flagged[0]?.date.toISOString().slice(0, 10)).toBe(
      fx.dates[BAD_ROW_INDEX]!.toISOString().slice(0, 10),
    );
    // A quarantined row never carries a derived value — null, never 0.
    expect(flagged[0]?.adjustedNav).toBeNull();

    // IDCW: derived from the growth sibling, and the payout is put back so the
    // adjusted series lands on the growth NAV (02 §10.7, through the DB).
    const idcwRows = await runAsSystem(() =>
      prisma.mFNav.findMany({ where: { fundId: fx.idcwFundId }, orderBy: { date: 'asc' } }),
    );
    expect(r.basisCounts.GROWTH_SIBLING_DERIVED).toBe(1);
    const lastIdcw = idcwRows[idcwRows.length - 1]!;
    const lastGrowth = growthRows[growthRows.length - 1]!;
    expect(lastIdcw.adjustedNav).not.toBeNull();
    const relDiff = new Decimal(lastIdcw.adjustedNav!.toString())
      .minus(new Decimal(lastGrowth.nav.toString()))
      .abs()
      .div(new Decimal(lastGrowth.nav.toString()));
    expect(relDiff.lt(new Decimal('0.0001'))).toBe(true);
    // The raw NAV is still the published one — `nav` is never rewritten.
    expect(new Decimal(lastIdcw.nav.toString()).lt(new Decimal(lastGrowth.nav.toString()))).toBe(
      true,
    );
  });

  it('second run over unchanged data writes nothing (idempotent)', async () => {
    const before = await runAsSystem(() =>
      prisma.mFNav.findMany({
        where: { fundId: { in: [fx.growthFundId, fx.idcwFundId, fx.badFundId] } },
        orderBy: [{ fundId: 'asc' }, { date: 'asc' }],
        select: { id: true, adjustedNav: true, isQuarantined: true, quarantineReason: true },
      }),
    );

    const r = await runOnFixture();

    expect(r.rowsWritten).toBe(0);
    expect(r.rowsNewlyQuarantined).toBe(0);
    expect(r.dlqRowsWritten).toBe(0);
    expect(await countDlq()).toBe(1);

    const after = await runAsSystem(() =>
      prisma.mFNav.findMany({
        where: { fundId: { in: [fx.growthFundId, fx.idcwFundId, fx.badFundId] } },
        orderBy: [{ fundId: 'asc' }, { date: 'asc' }],
        select: { id: true, adjustedNav: true, isQuarantined: true, quarantineReason: true },
      }),
    );
    expect(after.map((row) => ({ ...row, adjustedNav: row.adjustedNav?.toString() ?? null }))).toEqual(
      before.map((row) => ({ ...row, adjustedNav: row.adjustedNav?.toString() ?? null })),
    );
  });

  it('raises one alert when the quarantine rate exceeds the threshold, and only one', async () => {
    // 1 of 90 rows = 1.11%. Below the 2% production threshold (so the runs
    // above raised nothing), above this deliberately low one.
    const opts = { quarantineAlertThreshold: new Decimal('0.001'), now: new Date() };

    const first = await runOnFixture(opts);
    expect(first.alertRaised).toBe(true);

    const second = await runOnFixture(opts);
    expect(second.alertRaised).toBe(true);

    const alerts = await runAsSystem(() =>
      prisma.alert.findMany({ where: { userId: scope.userId, type: 'CUSTOM' } }),
    );
    expect(alerts).toHaveLength(1);
    expect(alerts[0]?.title).toBe('MF NAV quarantine rate above threshold');
  });

  it('does not alert when the quarantine rate is under the threshold', async () => {
    await runAsSystem(() => prisma.alert.deleteMany({ where: { userId: scope.userId } }));
    const r = await runOnFixture({ quarantineAlertThreshold: new Decimal('0.5') });
    expect(r.alertRaised).toBe(false);
    const alerts = await runAsSystem(() =>
      prisma.alert.count({ where: { userId: scope.userId } }),
    );
    expect(alerts).toBe(0);
  });
});
