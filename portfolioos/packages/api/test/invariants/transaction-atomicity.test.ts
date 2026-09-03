/**
 * Transactions containing user-scoped writes must actually be atomic.
 *
 * They were not. The RLS hook in lib/prisma.ts re-dispatched every
 * user-scoped operation onto its own `basePrisma.$transaction`, with no check
 * for already being inside a caller's transaction. So a write issued through
 * the `tx` handle of `prisma.$transaction` executed on a DIFFERENT connection
 * and survived the caller's rollback.
 *
 * That is invisible when it happens: the code reads as transactional, the
 * happy path behaves correctly, and the damage only shows up as half-written
 * state after a failure. family.service.createFamily creates a Family and its
 * owner FamilyMember together — under the old behaviour a failure between the
 * two left a family nobody owned.
 *
 * `runInTransaction` sets the session variable once on the caller's own
 * transaction and marks the context, so the hook runs each query inline on
 * that same transaction.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma, runInTransaction } from '../../src/lib/prisma.js';
import { runAsSystem, runAsUser } from '../../src/lib/requestContext.js';

let userId: string;

beforeAll(async () => {
  const user = await runAsSystem(() =>
    prisma.user.create({
      data: {
        email: `tx-atomicity-${Date.now()}@test.local`,
        passwordHash: 'test-not-a-real-hash',
        name: 'Transaction Atomicity',
      },
    }),
  );
  userId = user.id;
}, 120_000);

afterAll(async () => {
  await runAsSystem(async () => {
    await prisma.portfolio.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
  });
}, 120_000);

async function portfoliosNamed(name: string): Promise<number> {
  const rows = await runAsSystem(() =>
    prisma.portfolio.findMany({ where: { name }, select: { id: true } }),
  );
  return rows.length;
}

describe('transaction atomicity for user-scoped models', () => {
  it('rolls back a user-scoped write when the transaction throws', async () => {
    const name = `atomicity-rollback-${Date.now()}`;

    await expect(
      runAsUser(userId, () =>
        runInTransaction(async (tx) => {
          await tx.portfolio.create({ data: { userId, name } });
          throw new Error('deliberate rollback');
        }),
      ),
    ).rejects.toThrow('deliberate rollback');

    // The whole point: zero, not one.
    expect(await portfoliosNamed(name)).toBe(0);
  }, 120_000);

  it('commits a user-scoped write when the transaction succeeds', async () => {
    const name = `atomicity-commit-${Date.now()}`;

    await runAsUser(userId, () =>
      runInTransaction(async (tx) => {
        await tx.portfolio.create({ data: { userId, name } });
      }),
    );

    expect(await portfoliosNamed(name)).toBe(1);
  }, 120_000);

  it('rolls back every write in a multi-row transaction, not just the last', async () => {
    // The createFamily shape: two rows that must live or die together.
    const nameA = `atomicity-multi-a-${Date.now()}`;
    const nameB = `atomicity-multi-b-${Date.now()}`;

    await expect(
      runAsUser(userId, () =>
        runInTransaction(async (tx) => {
          await tx.portfolio.create({ data: { userId, name: nameA } });
          await tx.portfolio.create({ data: { userId, name: nameB } });
          throw new Error('deliberate rollback');
        }),
      ),
    ).rejects.toThrow('deliberate rollback');

    expect(await portfoliosNamed(nameA)).toBe(0);
    expect(await portfoliosNamed(nameB)).toBe(0);
  }, 120_000);

  it('still enforces RLS inside the transaction', async () => {
    // Atomicity must not have been bought by dropping the session variable:
    // a read inside the transaction must still be scoped to this user.
    const name = `atomicity-rls-${Date.now()}`;
    await runAsUser(userId, () =>
      runInTransaction(async (tx) => {
        await tx.portfolio.create({ data: { userId, name } });
      }),
    );

    const otherVisible = await runAsUser(userId, () =>
      runInTransaction(async (tx) =>
        tx.portfolio.findMany({ where: { userId: { not: userId } }, select: { id: true } }),
      ),
    );
    expect(otherVisible).toHaveLength(0);
  }, 120_000);
});
