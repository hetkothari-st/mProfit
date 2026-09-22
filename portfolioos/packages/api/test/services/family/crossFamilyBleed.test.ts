/**
 * A family view must not show money shared into a DIFFERENT family.
 *
 * The family fan-out reads each member's holdings as that member. Filtering by
 * `portfolio: { userId }` alone picks up every portfolio the member created —
 * including ones they shared into another household, holding money that
 * household's members put in. Someone viewing family X is not a member of
 * family Y and must not see (or have totalled) any of it.
 *
 *   owner  — OWNER of family X
 *   bridge — member of family X AND family Y; creates a family-Y portfolio
 *   other  — member of family Y only
 *
 * DB-backed and RLS-enforced (see db-role-guard.test.ts).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Decimal } from 'decimal.js';
import { prisma } from '../../../src/lib/prisma.js';
import { runAsSystem } from '../../../src/lib/requestContext.js';
import { getDashboardNetWorthForScope } from '../../../src/services/dashboard.service.js';
import { getFamilyWealth } from '../../../src/services/family/familyAggregate.service.js';
import { createTestScope, type TestScope } from '../../helpers/db.js';

const TIMEOUT = 120_000;

let owner: TestScope;
let bridge: TestScope;
let other: TestScope;
let familyX: string;
let familyY: string;
let familyYPortfolioId: string;

async function seedHolding(portfolioId: string, value: string, tag: string) {
  await runAsSystem(() =>
    prisma.holdingProjection.create({
      data: {
        portfolioId,
        assetKey: `EQUITY:${tag}`,
        assetClass: 'EQUITY',
        assetName: `Equity ${tag}`,
        sourceTxCount: 1,
        quantity: new Decimal(1),
        avgCostPrice: new Decimal(value),
        totalCost: new Decimal(value),
        currentValue: new Decimal(value),
        unrealisedPnL: new Decimal(0),
      },
    }),
  );
}

beforeAll(async () => {
  owner = await createTestScope('xf-owner');
  bridge = await createTestScope('xf-bridge');
  other = await createTestScope('xf-other');

  await seedHolding(owner.portfolioId, '100000', 'owner');
  await seedHolding(bridge.portfolioId, '20000', 'bridge-personal');

  ({ familyX, familyY } = await runAsSystem(async () => {
    const x = await prisma.family.create({ data: { name: 'Family X', createdById: owner.userId } });
    await prisma.familyMember.createMany({
      data: [
        { familyId: x.id, userId: owner.userId, role: 'OWNER', status: 'ACTIVE' },
        { familyId: x.id, userId: bridge.userId, role: 'CONTRIBUTOR', status: 'ACTIVE' },
      ],
    });
    const y = await prisma.family.create({ data: { name: 'Family Y', createdById: other.userId } });
    await prisma.familyMember.createMany({
      data: [
        { familyId: y.id, userId: other.userId, role: 'OWNER', status: 'ACTIVE' },
        { familyId: y.id, userId: bridge.userId, role: 'CONTRIBUTOR', status: 'ACTIVE' },
      ],
    });
    return { familyX: x.id, familyY: y.id };
  }));

  // Created by `bridge`, shared into family Y — the row that must stay out of X.
  familyYPortfolioId = await runAsSystem(async () => {
    const p = await prisma.portfolio.create({
      data: { userId: bridge.userId, familyId: familyY, name: 'Y pot', currency: 'INR', type: 'INVESTMENT' },
    });
    return p.id;
  });
  await seedHolding(familyYPortfolioId, '777000', 'family-y');
}, TIMEOUT);

afterAll(async () => {
  await runAsSystem(async () => {
    await prisma.holdingProjection.deleteMany({ where: { portfolioId: familyYPortfolioId } });
    await prisma.portfolio.deleteMany({ where: { id: familyYPortfolioId } });
    await prisma.familyMember.deleteMany({ where: { familyId: { in: [familyX, familyY] } } });
    await prisma.family.deleteMany({ where: { id: { in: [familyX, familyY] } } });
  });
  await Promise.all([owner.cleanup(), bridge.cleanup(), other.cleanup()]);
}, TIMEOUT);

describe('family X view excludes family-Y portfolios', () => {
  it('dashboard net worth for family X', async () => {
    const nw = await owner.runAs(() => getDashboardNetWorthForScope(owner.userId, { familyId: familyX }));
    expect(new Decimal(nw.portfolio.currentValue).toString()).toBe('120000');
  }, TIMEOUT);

  it('family wealth page for family X', async () => {
    const w = await owner.runAs(() => getFamilyWealth(owner.userId, familyX));
    expect(new Decimal(w.totals.netWorth).toString()).toBe('120000');
    const bridgeRow = w.members.find((m) => m.userId === bridge.userId)!;
    expect(new Decimal(bridgeRow.netWorth).toString()).toBe('20000');
  }, TIMEOUT);

  it('family Y still sees its own portfolio', async () => {
    const nw = await other.runAs(() => getDashboardNetWorthForScope(other.userId, { familyId: familyY }));
    // other's personal is empty; bridge's personal 20000 + the Y pot 777000.
    expect(new Decimal(nw.portfolio.currentValue).toString()).toBe('797000');
  }, TIMEOUT);
});
