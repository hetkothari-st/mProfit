import { describe, it, expect, afterEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import { prisma } from '../../../../src/lib/prisma.js';
import { runAsSystem, runAsUser } from '../../../../src/lib/requestContext.js';
import {
  bucketsInUse,
  modelPortfolioBuckets,
} from '../../../../src/services/advisor/fundRanking/coverage.js';
import { createTestScope, type TestScope } from '../../../helpers/db.js';

/**
 * The bug: the per-bucket minimum-candidate check silently never fired.
 *
 * `modelPortfolioBuckets()` queries `ModelPortfolio`, which is user-scoped and
 * carries an RLS policy of `app_is_system() OR "userId" = app_current_user_id()`.
 * It is called from the boot-time release gate, where nobody is logged in and
 * no context is set — so neither branch matched, the query returned zero rows,
 * and the check passed unconditionally.
 *
 * Found in production by asking the same question twice: as `portfolioos_app`
 * (0 active portfolios) and as the owner (4, with correct array-shaped weights
 * across five buckets).
 *
 * These fixtures are the production rows, shape and weights.
 */

const PRODUCTION_SHAPED: Array<{
  name: string;
  riskCategory: 'CONSERVATIVE' | 'BALANCED' | 'GROWTH' | 'AGGRESSIVE';
  weights: Array<{ bucket: string; targetPct: number }>;
}> = [
  {
    name: 'Conservative',
    riskCategory: 'CONSERVATIVE',
    weights: [
      { bucket: 'EQUITY_DOMESTIC', targetPct: 20 },
      { bucket: 'DEBT', targetPct: 50 },
      { bucket: 'GOLD', targetPct: 10 },
      { bucket: 'CASH_EQUIVALENT', targetPct: 20 },
    ],
  },
  {
    name: 'Balanced',
    riskCategory: 'BALANCED',
    weights: [
      { bucket: 'EQUITY_DOMESTIC', targetPct: 40 },
      { bucket: 'EQUITY_INTERNATIONAL', targetPct: 5 },
      { bucket: 'DEBT', targetPct: 37 },
      { bucket: 'GOLD', targetPct: 8 },
      { bucket: 'CASH_EQUIVALENT', targetPct: 10 },
    ],
  },
  {
    name: 'Growth',
    riskCategory: 'GROWTH',
    weights: [
      { bucket: 'EQUITY_DOMESTIC', targetPct: 58 },
      { bucket: 'EQUITY_INTERNATIONAL', targetPct: 10 },
      { bucket: 'DEBT', targetPct: 22 },
      { bucket: 'GOLD', targetPct: 5 },
      { bucket: 'CASH_EQUIVALENT', targetPct: 5 },
    ],
  },
  {
    name: 'Aggressive',
    riskCategory: 'AGGRESSIVE',
    weights: [
      { bucket: 'EQUITY_DOMESTIC', targetPct: 72 },
      { bucket: 'EQUITY_INTERNATIONAL', targetPct: 10 },
      { bucket: 'DEBT', targetPct: 12 },
      { bucket: 'GOLD', targetPct: 3 },
      { bucket: 'CASH_EQUIVALENT', targetPct: 3 },
    ],
  },
];

let scope: TestScope | null = null;
const madeIds: string[] = [];
const SUFFIX = randomUUID().slice(0, 6).toUpperCase();

async function seedProductionShaped(userId: string) {
  for (const mp of PRODUCTION_SHAPED) {
    const row = await runAsUser(userId, () =>
      prisma.modelPortfolio.create({
        data: {
          userId,
          name: `${mp.name} ${SUFFIX}`,
          riskCategory: mp.riskCategory,
          isActive: true,
          versions: { create: { version: 1, targetWeights: mp.weights as object } },
        },
      }),
    );
    madeIds.push(row.id);
  }
}

afterEach(async () => {
  if (madeIds.length) {
    await runAsSystem(() =>
      prisma.modelPortfolio.deleteMany({ where: { id: { in: madeIds } } }),
    );
    madeIds.length = 0;
  }
  if (scope) {
    await scope.cleanup();
    scope = null;
  }
});

describe('modelPortfolioBuckets', () => {
  it('sees production-shaped rows from a boot-time call with no user context', async () => {
    scope = await createTestScope('mpbuckets');
    await seedProductionShaped(scope.userId);

    // Called exactly as the release gate calls it: no context, nobody logged
    // in. Before the fix this returned an empty list.
    const portfolios = await modelPortfolioBuckets();
    const mine = portfolios.filter((p) => p.name.endsWith(SUFFIX));
    expect(mine).toHaveLength(4);

    const aggressive = mine.find((p) => p.name.startsWith('Aggressive'));
    expect(aggressive?.weights.map((w) => w.bucket).sort()).toEqual([
      'CASH_EQUIVALENT',
      'DEBT',
      'EQUITY_DOMESTIC',
      'EQUITY_INTERNATIONAL',
      'GOLD',
    ]);
    expect(aggressive?.weights.find((w) => w.bucket === 'EQUITY_DOMESTIC')?.targetPct).toBe(72);
  });

  it('reports the union of buckets any portfolio allocates to', async () => {
    scope = await createTestScope('mpunion');
    await seedProductionShaped(scope.userId);

    const portfolios = (await modelPortfolioBuckets()).filter((p) => p.name.endsWith(SUFFIX));
    const used = await bucketsInUse(portfolios);
    expect([...used].sort()).toEqual([
      'CASH_EQUIVALENT',
      'DEBT',
      'EQUITY_DOMESTIC',
      'EQUITY_INTERNATIONAL',
      'GOLD',
    ]);
    // Production allocates to neither. A thin REAL_ASSETS bucket must not
    // fail a gate for portfolios that never touch it.
    expect(used.has('REAL_ASSETS')).toBe(false);
    expect(used.has('OTHER_ALT')).toBe(false);
  });

  it('ignores zero and negative weights', async () => {
    scope = await createTestScope('mpzero');
    const row = await runAsUser(scope.userId, () =>
      prisma.modelPortfolio.create({
        data: {
          userId: scope!.userId,
          name: `Zeroed ${SUFFIX}`,
          riskCategory: 'BALANCED',
          isActive: true,
          versions: {
            create: {
              version: 1,
              targetWeights: [
                { bucket: 'EQUITY_DOMESTIC', targetPct: 0 },
                { bucket: 'DEBT', targetPct: -5 },
                { bucket: 'GOLD', targetPct: 12 },
              ] as object,
            },
          },
        },
      }),
    );
    madeIds.push(row.id);

    const mine = (await modelPortfolioBuckets()).find((p) => p.id === row.id);
    expect(mine?.weights.map((w) => w.bucket)).toEqual(['GOLD']);
  });

  it('reads the newest version, not the first', async () => {
    scope = await createTestScope('mpversion');
    const row = await runAsUser(scope.userId, () =>
      prisma.modelPortfolio.create({
        data: {
          userId: scope!.userId,
          name: `Versioned ${SUFFIX}`,
          riskCategory: 'GROWTH',
          isActive: true,
          versions: {
            create: [
              { version: 1, targetWeights: [{ bucket: 'GOLD', targetPct: 100 }] as object },
              { version: 2, targetWeights: [{ bucket: 'DEBT', targetPct: 100 }] as object },
            ],
          },
        },
      }),
    );
    madeIds.push(row.id);

    const mine = (await modelPortfolioBuckets()).find((p) => p.id === row.id);
    expect(mine?.weights.map((w) => w.bucket)).toEqual(['DEBT']);
  });

  // The shape the RLS bug produced, now a reportable condition rather than a
  // silent pass: a portfolio nobody can be rebalanced towards.
  it('reports a portfolio with no positive-weight bucket as empty', async () => {
    scope = await createTestScope('mpempty');
    const row = await runAsUser(scope.userId, () =>
      prisma.modelPortfolio.create({
        data: {
          userId: scope!.userId,
          name: `Empty ${SUFFIX}`,
          riskCategory: 'BALANCED',
          isActive: true,
          versions: { create: { version: 1, targetWeights: [] as object } },
        },
      }),
    );
    madeIds.push(row.id);

    const mine = (await modelPortfolioBuckets()).find((p) => p.id === row.id);
    expect(mine?.weights).toEqual([]);
  });

  it('skips inactive portfolios', async () => {
    scope = await createTestScope('mpinactive');
    const row = await runAsUser(scope.userId, () =>
      prisma.modelPortfolio.create({
        data: {
          userId: scope!.userId,
          name: `Retired ${SUFFIX}`,
          riskCategory: 'BALANCED',
          isActive: false,
          versions: { create: { version: 1, targetWeights: [{ bucket: 'DEBT', targetPct: 100 }] as object } },
        },
      }),
    );
    madeIds.push(row.id);

    expect((await modelPortfolioBuckets()).find((p) => p.id === row.id)).toBeUndefined();
  });
});
