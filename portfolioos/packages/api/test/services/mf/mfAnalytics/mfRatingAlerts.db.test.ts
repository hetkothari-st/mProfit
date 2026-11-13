import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../../../../src/lib/prisma.js';
import { runAsSystem } from '../../../../src/lib/requestContext.js';
import {
  findBandChanges,
  ratingAlertText,
  runMfRatingChangeAlerts,
} from '../../../../src/services/mf/mfAnalytics/mfRatingAlerts.service.js';
import { createTestScope, type TestScope } from '../../../helpers/db.js';

const DB_URL = process.env.DATABASE_URL ?? '';
if (!/localhost|127\.0\.0\.1/.test(DB_URL)) throw new Error('Refusing to run: DATABASE_URL must point at a local database');

// Month-ends far from any real score so the "previous asOf" is ours.
const PREV = new Date('2001-01-31T00:00:00Z');
const NOW_AS_OF = new Date('2001-02-28T00:00:00Z');
const RUN_AT = new Date('2001-03-15T02:00:00Z');

/** Growth schemes and what happens to their rating between the two months. */
const SCHEMES = {
  slipped: { code: '998801', name: 'TEST-RATING Slipped Fund - Direct Plan - Growth', prev: 3, now: 2 },
  sameBand: { code: '998802', name: 'TEST-RATING Same Band Fund - Direct Plan - Growth', prev: 4, now: 5 },
  improved: { code: '998803', name: 'TEST-RATING Improved Fund - Direct Plan - Growth', prev: 1, now: 3 },
  notHeld: { code: '998804', name: 'TEST-RATING Not Held Fund - Direct Plan - Growth', prev: 5, now: 1 },
} as const;
/** An IDCW option of `slipped`: borrows its growth sibling's rating. */
const IDCW = { code: '998805', name: 'TEST-RATING Slipped Fund - Direct Plan - IDCW' };

const sys = <T>(fn: () => Promise<T>) => runAsSystem(fn);
let scope: TestScope;
const masterIds: string[] = [];
const allCodes = [...Object.values(SCHEMES).map((s) => s.code), IDCW.code];

async function meta(code: string, name: string, optionType: 'GROWTH' | 'IDCW_PAYOUT', sibling: string | null) {
  await prisma.mfSchemeMeta.create({
    data: {
      schemeCode: code,
      schemeName: name,
      amcCode: 'TEST-RATING',
      amcName: 'TEST-RATING Mutual Fund',
      sebiCategory: 'EQUITY',
      sebiSubCategory: 'Large Cap Fund',
      planType: 'DIRECT',
      optionType,
      growthSiblingSchemeCode: sibling,
      inceptionDate: new Date(Date.UTC(1995, 0, 1)),
      status: 'ACTIVE',
      sourceHash: `test-rating-${code}`,
      fetchedAt: RUN_AT,
    },
  });
}

async function score(code: string, asOf: Date, rating: number) {
  await prisma.mfSchemeScore.create({
    data: {
      schemeCode: code,
      asOf,
      methodologyVersion: 'score-active-equity-v1',
      modelKey: 'ACTIVE_EQUITY',
      ratingStatus: 'RATED',
      composite: String(rating * 18),
      rating,
      pillars: {},
      universeKey: 'Large Cap Fund|DIRECT',
      universeSize: 40,
    },
  });
}

async function hold(code: string, name: string) {
  const master = await prisma.mutualFundMaster.create({
    data: { schemeCode: code, schemeName: name, amcName: 'TEST-RATING Mutual Fund', category: 'EQUITY' },
  });
  masterIds.push(master.id);
  await prisma.holdingProjection.create({
    data: {
      portfolioId: scope.portfolioId,
      assetKey: `fund:${master.id}`,
      assetClass: 'MUTUAL_FUND',
      fundId: master.id,
      assetName: name,
      quantity: '10',
      avgCostPrice: '100',
      totalCost: '1000',
      sourceTxCount: 1,
    },
  });
}

async function cleanupRows() {
  await sys(async () => {
    await prisma.mfSchemeScore.deleteMany({ where: { schemeCode: { in: allCodes } } });
    await prisma.mfSchemeMeta.deleteMany({ where: { schemeCode: { in: allCodes } } });
  });
}

beforeAll(async () => {
  await cleanupRows();
  scope = await createTestScope('mf-rating-alerts');
  await sys(async () => {
    for (const s of Object.values(SCHEMES)) {
      await meta(s.code, s.name, 'GROWTH', null);
      await score(s.code, PREV, s.prev);
      await score(s.code, NOW_AS_OF, s.now);
    }
    await meta(IDCW.code, IDCW.name, 'IDCW_PAYOUT', SCHEMES.slipped.code);
    await hold(SCHEMES.slipped.code, SCHEMES.slipped.name);
    await hold(SCHEMES.sameBand.code, SCHEMES.sameBand.name);
    await hold(SCHEMES.improved.code, SCHEMES.improved.name);
    await hold(IDCW.code, IDCW.name);
  });
});

afterAll(async () => {
  await scope.cleanup();
  await sys(() => prisma.mutualFundMaster.deleteMany({ where: { id: { in: masterIds } } }));
  await cleanupRows();
});

describe('findBandChanges', () => {
  it('reports a band move and ignores a move within one band', async () => {
    const { previousAsOf, changes } = await sys(() => findBandChanges(NOW_AS_OF));
    expect(previousAsOf?.toISOString().slice(0, 10)).toBe('2001-01-31');
    const ours = new Map(changes.filter((c) => allCodes.includes(c.schemeCode)).map((c) => [c.schemeCode, c]));
    expect(ours.get(SCHEMES.slipped.code)).toMatchObject({ from: 'STEADY', to: 'LAGGING' });
    expect(ours.get(SCHEMES.improved.code)).toMatchObject({ from: 'WEAK', to: 'STEADY' });
    expect(ours.get(SCHEMES.notHeld.code)).toMatchObject({ from: 'LEADING', to: 'WEAK' });
    // 4 -> 5 stars: both Leading, not news.
    expect(ours.has(SCHEMES.sameBand.code)).toBe(false);
  });
});

describe('runMfRatingChangeAlerts', () => {
  it('alerts the holder once per held scheme whose band moved, IDCW included', async () => {
    const result = await runMfRatingChangeAlerts(NOW_AS_OF, RUN_AT);
    expect(result.usersFailed).toBe(0);

    const alerts = await scope.runAs(() =>
      prisma.alert.findMany({ where: { userId: scope.userId, type: 'MF_RATING_CHANGE' }, orderBy: { title: 'asc' } }),
    );
    const bySchemeCode = new Map(alerts.map((a) => [(a.metadata as { schemeCode: string }).schemeCode, a]));
    expect([...bySchemeCode.keys()].sort()).toEqual(
      [SCHEMES.slipped.code, SCHEMES.improved.code, IDCW.code].sort(),
    );
    expect(bySchemeCode.get(SCHEMES.slipped.code)?.title).toBe(
      'TEST-RATING Slipped Fund - Direct Plan - Growth: slipped to Lagging',
    );
    expect(bySchemeCode.get(IDCW.code)?.metadata).toMatchObject({
      ratedSchemeCode: SCHEMES.slipped.code,
      fromBand: 'STEADY',
      toBand: 'LAGGING',
      asOf: '2001-02-28',
    });
    expect(bySchemeCode.get(SCHEMES.improved.code)?.title).toContain('improved to Steady');
  });

  it('is idempotent: a re-run creates nothing new', async () => {
    const result = await runMfRatingChangeAlerts(NOW_AS_OF, RUN_AT);
    expect(result.alertsCreated).toBe(0);
    expect(result.alertsSkippedDuplicate).toBeGreaterThanOrEqual(3);
    const count = await scope.runAs(() =>
      prisma.alert.count({ where: { userId: scope.userId, type: 'MF_RATING_CHANGE' } }),
    );
    expect(count).toBe(3);
  });
});

describe('ratingAlertText', () => {
  it('says which way it moved and that a rating is not advice', () => {
    const text = ratingAlertText('X Fund', { from: 'LEADING', to: 'STEADY', fromRating: 4, toRating: 3 });
    expect(text.title).toBe('X Fund: slipped to Steady');
    expect(text.description).toContain('from Leading (4 stars) to Steady (3 stars)');
    expect(text.description).toContain('not a recommendation');
  });
});
