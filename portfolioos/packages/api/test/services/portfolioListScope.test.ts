import { describe, it, expect, afterEach } from 'vitest';
import { createTestScope, prisma, type TestScope } from '../helpers/db.js';
import { runAsSystem } from '../../src/lib/requestContext.js';
import { listPortfoliosForScope } from '../../src/services/portfolio.service.js';

/**
 * The family portfolio list is built from two sources: a fan-out over each
 * other member's personal portfolios, and a query for the caller's own rows.
 * They used to overlap, and nothing deduplicated the result — the overlap was
 * left to row-level security to trim.
 *
 * Where policies do not bite, every family member's portfolio appeared twice.
 * That is not hypothetical: production connects as a superuser, which bypasses
 * RLS, so the Portfolios page showed each member's portfolio as two identical
 * cards. These tests run the listing under the system identity for the same
 * reason — it is the configuration that exposed the bug.
 */

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()!();
});

async function member(label: string, portfolioName: string): Promise<TestScope> {
  const scope = await createTestScope(label);
  cleanups.push(scope.cleanup);
  await runAsSystem(() =>
    prisma.portfolio.update({ where: { id: scope.portfolioId }, data: { name: portfolioName } }),
  );
  return scope;
}

async function household(owner: TestScope, others: TestScope[]): Promise<string> {
  const familyId = await runAsSystem(async () => {
    const family = await prisma.family.create({ data: { name: 'Test Household', createdById: owner.userId } });
    await prisma.familyMember.create({ data: { familyId: family.id, userId: owner.userId, role: 'OWNER', status: 'ACTIVE' } });
    for (const o of others) {
      await prisma.familyMember.create({ data: { familyId: family.id, userId: o.userId, role: 'CONTRIBUTOR', status: 'ACTIVE' } });
    }
    return family.id;
  });
  cleanups.push(async () => {
    await runAsSystem(async () => {
      await prisma.familyMember.deleteMany({ where: { familyId } });
      await prisma.family.deleteMany({ where: { id: familyId } });
    });
  });
  return familyId;
}

describe('family portfolio list', () => {
  it('lists every portfolio once, even where RLS does not filter the overlap', async () => {
    const owner = await member('plist-owner', 'Owner Portfolio');
    const first = await member('plist-a', 'My Portfolio');
    const second = await member('plist-b', 'My Portfolio');
    const familyId = await household(owner, [first, second]);

    const rows = await runAsSystem(() => listPortfoliosForScope(owner.userId, familyId));
    const ids = rows.map((p) => p.id);

    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(expect.arrayContaining([owner.portfolioId, first.portfolioId, second.portfolioId]));
    // Two members share a portfolio name; both must still appear, once each.
    expect(rows.filter((p) => p.name === 'My Portfolio')).toHaveLength(2);
  });

  it('shows a family-shared portfolio once, not once per member', async () => {
    const owner = await member('plist-shared-owner', 'Owner Portfolio');
    const other = await member('plist-shared-other', 'My Portfolio');
    const familyId = await household(owner, [other]);

    const sharedId = await runAsSystem(async () => {
      const shared = await prisma.portfolio.create({
        data: { userId: owner.userId, name: 'Shared Pot', currency: 'INR', type: 'INVESTMENT', familyId },
      });
      return shared.id;
    });
    cleanups.push(async () => {
      await runAsSystem(() => prisma.portfolio.deleteMany({ where: { id: sharedId } }));
    });

    const rows = await runAsSystem(() => listPortfoliosForScope(owner.userId, familyId));
    expect(rows.filter((p) => p.id === sharedId)).toHaveLength(1);
    expect(new Set(rows.map((p) => p.id)).size).toBe(rows.length);
  });
});
