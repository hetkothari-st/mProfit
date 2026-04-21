import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { prisma } from '../../src/lib/prisma.js';
import {
  enterUserContext,
  runAsSystem,
  runAsUser,
} from '../../src/lib/requestContext.js';

export interface TestScope {
  userId: string;
  portfolioId: string;
  stockMasterIds: string[];
  cleanup: () => Promise<void>;
  /** Run the given callback under this scope's user context (RLS-enforced). */
  runAs: <T>(fn: () => Promise<T>) => Promise<T>;
}

/**
 * Create an isolated user + portfolio for a single test. Returns a cleanup()
 * that tears down everything created under that user, in dependency order.
 * Safe to call in any environment with DATABASE_URL pointing at a dev/test DB.
 *
 * Setup and cleanup both run under `runAsSystem` so RLS doesn't block the
 * bootstrap inserts/deletes. Tests that want to exercise RLS isolation should
 * call `scope.runAs(fn)` to run queries as the scope's user.
 */
export async function createTestScope(label: string): Promise<TestScope> {
  const suffix = randomUUID().slice(0, 8);
  const email = `inv-${label}-${suffix}@test.local`;

  const { user, portfolio } = await runAsSystem(async () => {
    const u = await prisma.user.create({
      data: {
        email,
        passwordHash: 'test-not-a-real-hash',
        name: `Test ${label} ${suffix}`,
      },
    });
    const p = await prisma.portfolio.create({
      data: {
        userId: u.id,
        name: `Test portfolio ${suffix}`,
        isDefault: true,
        currency: 'INR',
        type: 'INVESTMENT',
      },
    });
    return { user: u, portfolio: p };
  });

  const stockMasterIds: string[] = [];

  // Set ambient context for the remainder of this test's async scope so
  // subsequent prisma.* calls made outside any explicit `runAs` wrapper still
  // see RLS-compliant rows. Cleanup switches to system context.
  enterUserContext(user.id);

  return {
    userId: user.id,
    portfolioId: portfolio.id,
    stockMasterIds,
    runAs<T>(fn: () => Promise<T>): Promise<T> {
      return runAsUser(user.id, fn);
    },
    async cleanup() {
      await runAsSystem(async () => {
        // Order: capital gains → holdings → transactions → portfolio → user.
        await prisma.capitalGain.deleteMany({ where: { portfolioId: portfolio.id } });
        await prisma.holdingProjection.deleteMany({ where: { portfolioId: portfolio.id } });
        await prisma.holding.deleteMany({ where: { portfolioId: portfolio.id } });
        await prisma.transaction.deleteMany({ where: { portfolioId: portfolio.id } });
        await prisma.portfolio.delete({ where: { id: portfolio.id } }).catch(() => {});
        await prisma.user.delete({ where: { id: user.id } }).catch(() => {});
        for (const id of stockMasterIds) {
          await prisma.stockMaster.delete({ where: { id } }).catch(() => {});
        }
      });
    },
  };
}

/**
 * Pre-seed a StockMaster row so tests can create EQUITY transactions without
 * triggering the Yahoo lookup inside ensureStockMaster(). Returns the symbol
 * to pass to createTransaction.
 */
export async function seedStockMaster(
  scope: TestScope,
  opts: { symbol?: string; name?: string; isin?: string } = {},
): Promise<{ symbol: string; isin: string | null }> {
  const suffix = randomUUID().slice(0, 6).toUpperCase();
  const symbol = opts.symbol ?? `TST${suffix}`;
  const existing = await prisma.stockMaster.findUnique({ where: { symbol } });
  if (existing) return { symbol, isin: existing.isin };

  const created = await prisma.stockMaster.create({
    data: {
      symbol,
      exchange: 'NSE',
      name: opts.name ?? `Test Stock ${suffix}`,
      isin: opts.isin ?? null,
    },
  });
  scope.stockMasterIds.push(created.id);
  return { symbol, isin: created.isin };
}

export { prisma };
