import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestScope, prisma, type TestScope } from '../helpers/db.js';
import { runAsUser, runAsSystem } from '../../src/lib/requestContext.js';

/**
 * INVARIANT: Postgres Row-Level Security isolates tenants.
 *
 * §3.6 / §5.1 task 11 — even if a service forgets to filter by userId, the
 * database itself must refuse cross-tenant reads and writes.
 *
 * This test sets up two independent users (A, B), each with their own
 * portfolio + transactions, then verifies:
 *   1. Running as A cannot SEE B's rows (read isolation).
 *   2. Running as A cannot UPDATE B's rows (write isolation).
 *   3. Running as A cannot DELETE B's rows (write isolation).
 *   4. Running as A cannot INSERT a row that claims B's userId (WITH CHECK).
 *   5. Running with no context sees zero rows (fail-closed default).
 *   6. runAsSystem() can see both users (break-glass for scheduler jobs).
 */
describe('invariant: RLS tenant isolation (§3.6)', () => {
  let scopeA: TestScope;
  let scopeB: TestScope;
  let txnAId: string;
  let txnBId: string;

  beforeAll(async () => {
    scopeA = await createTestScope('rls-a');
    scopeB = await createTestScope('rls-b');

    // Seed one transaction under each user via system context so we know both
    // rows actually exist in the DB regardless of what RLS does afterwards.
    const { a, b } = await runAsSystem(async () => {
      const a = await prisma.transaction.create({
        data: {
          portfolioId: scopeA.portfolioId,
          transactionType: 'BUY',
          assetClass: 'EQUITY',
          assetName: 'RLS-A Stock',
          assetKey: 'name:rls-a-stock',
          exchange: 'NSE',
          tradeDate: new Date('2024-01-15'),
          quantity: '10',
          price: '100',
          grossAmount: '1000',
          netAmount: '1000',
        },
        select: { id: true },
      });
      const b = await prisma.transaction.create({
        data: {
          portfolioId: scopeB.portfolioId,
          transactionType: 'BUY',
          assetClass: 'EQUITY',
          assetName: 'RLS-B Stock',
          assetKey: 'name:rls-b-stock',
          exchange: 'NSE',
          tradeDate: new Date('2024-01-15'),
          quantity: '20',
          price: '200',
          grossAmount: '4000',
          netAmount: '4000',
        },
        select: { id: true },
      });
      return { a, b };
    });
    txnAId = a.id;
    txnBId = b.id;
  });

  afterAll(async () => {
    await scopeA.cleanup();
    await scopeB.cleanup();
  });

  it("user A cannot read user B's transactions", async () => {
    const rows = await runAsUser(scopeA.userId, () =>
      prisma.transaction.findMany({
        where: { id: { in: [txnAId, txnBId] } },
        select: { id: true },
      }),
    );
    const ids = rows.map((r) => r.id);
    expect(ids).toContain(txnAId);
    expect(ids).not.toContain(txnBId);
  });

  it("user A cannot read user B's portfolio by id", async () => {
    const row = await runAsUser(scopeA.userId, () =>
      prisma.portfolio.findUnique({ where: { id: scopeB.portfolioId } }),
    );
    expect(row).toBeNull();
  });

  it("user A cannot update user B's transaction", async () => {
    const result = await runAsUser(scopeA.userId, () =>
      prisma.transaction.updateMany({
        where: { id: txnBId },
        data: { price: '99999' },
      }),
    );
    expect(result.count).toBe(0);

    // Confirm from system view that the row is untouched.
    const check = await runAsSystem(() =>
      prisma.transaction.findUnique({ where: { id: txnBId }, select: { price: true } }),
    );
    expect(check?.price?.toString()).toBe('200');
  });

  it("user A cannot delete user B's transaction", async () => {
    const result = await runAsUser(scopeA.userId, () =>
      prisma.transaction.deleteMany({ where: { id: txnBId } }),
    );
    expect(result.count).toBe(0);

    const stillThere = await runAsSystem(() =>
      prisma.transaction.findUnique({ where: { id: txnBId } }),
    );
    expect(stillThere).not.toBeNull();
  });

  it("user A cannot insert a portfolio owned by user B (WITH CHECK)", async () => {
    await expect(
      runAsUser(scopeA.userId, () =>
        prisma.portfolio.create({
          data: {
            userId: scopeB.userId,
            name: 'Attempted hijack',
            currency: 'INR',
            type: 'INVESTMENT',
          },
        }),
      ),
    ).rejects.toThrow();
  });

  it('queries with no ambient user context return zero rows (fail-closed)', async () => {
    // Intentionally run outside both runAsUser and runAsSystem. RLS policy
    // evaluates `"userId" = current_setting('app.current_user_id', true)`
    // against NULL → filter drops every row.
    const rows = await prisma.transaction.findMany({
      where: { id: { in: [txnAId, txnBId] } },
    });
    expect(rows).toHaveLength(0);
  });

  it('runAsSystem sees both users (break-glass bypass)', async () => {
    const rows = await runAsSystem(() =>
      prisma.transaction.findMany({
        where: { id: { in: [txnAId, txnBId] } },
        select: { id: true },
      }),
    );
    expect(rows.map((r) => r.id).sort()).toEqual([txnAId, txnBId].sort());
  });
});
