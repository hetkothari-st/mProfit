import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestScope, prisma, type TestScope } from '../helpers/db.js';
import { runAsUser, runAsSystem } from '../../src/lib/requestContext.js';

/**
 * INVARIANT: Postgres RLS isolates NetWorthSnapshot rows by owner, same as
 * every other user-scoped table (§3.6). Follows the pattern established in
 * test/invariants/rls-isolation.test.ts.
 */
describe('invariant: NetWorthSnapshot RLS isolation (§3.6)', () => {
  let scopeA: TestScope;
  let scopeB: TestScope;
  const asOf = new Date(Date.UTC(2026, 5, 15));

  beforeAll(async () => {
    scopeA = await createTestScope('nw-rls-a');
    scopeB = await createTestScope('nw-rls-b');

    await runAsSystem(async () => {
      await prisma.netWorthSnapshot.create({
        data: {
          userId: scopeA.userId, asOf,
          totalNetWorth: '100', totalLiabilities: '0', netWorthAfterLiabilities: '100',
          breakdownJson: [],
        },
      });
      await prisma.netWorthSnapshot.create({
        data: {
          userId: scopeB.userId, asOf,
          totalNetWorth: '200', totalLiabilities: '0', netWorthAfterLiabilities: '200',
          breakdownJson: [],
        },
      });
    });
  });

  afterAll(async () => {
    await runAsSystem(() =>
      prisma.netWorthSnapshot.deleteMany({ where: { userId: { in: [scopeA.userId, scopeB.userId] } } }),
    );
    await scopeA.cleanup();
    await scopeB.cleanup();
  });

  it("user A cannot read user B's snapshot", async () => {
    const rows = await runAsUser(scopeA.userId, () =>
      prisma.netWorthSnapshot.findMany({ where: { asOf } }),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.userId).toBe(scopeA.userId);
  });

  it("user A cannot update user B's snapshot", async () => {
    const result = await runAsUser(scopeA.userId, () =>
      prisma.netWorthSnapshot.updateMany({
        where: { userId: scopeB.userId },
        data: { totalNetWorth: '999999' },
      }),
    );
    expect(result.count).toBe(0);
  });

  it('runAsSystem sees both rows', async () => {
    const rows = await runAsSystem(() =>
      prisma.netWorthSnapshot.findMany({ where: { asOf } }),
    );
    expect(rows).toHaveLength(2);
  });
});
