import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { prisma } from '../../src/lib/prisma.js';

export interface TestScope {
  userId: string;
  portfolioId: string;
  stockMasterIds: string[];
  cleanup: () => Promise<void>;
}

/**
 * Create an isolated user + portfolio for a single test. Returns a cleanup()
 * that tears down everything created under that user, in dependency order.
 * Safe to call in any environment with DATABASE_URL pointing at a dev/test DB.
 */
export async function createTestScope(label: string): Promise<TestScope> {
  const suffix = randomUUID().slice(0, 8);
  const email = `inv-${label}-${suffix}@test.local`;

  const user = await prisma.user.create({
    data: {
      email,
      passwordHash: 'test-not-a-real-hash',
      name: `Test ${label} ${suffix}`,
    },
  });

  const portfolio = await prisma.portfolio.create({
    data: {
      userId: user.id,
      name: `Test portfolio ${suffix}`,
      isDefault: true,
      currency: 'INR',
      type: 'INVESTMENT',
    },
  });

  const stockMasterIds: string[] = [];

  return {
    userId: user.id,
    portfolioId: portfolio.id,
    stockMasterIds,
    async cleanup() {
      // Unlink stock/fund masters from transactions? Not needed — cascade on portfolio/user handles owned rows.
      // Order: capital gains → holdings → transactions → portfolio → user. Master data is shared, leave alone
      // unless we explicitly created one.
      await prisma.capitalGain.deleteMany({ where: { portfolioId: portfolio.id } });
      await prisma.holding.deleteMany({ where: { portfolioId: portfolio.id } });
      await prisma.transaction.deleteMany({ where: { portfolioId: portfolio.id } });
      await prisma.portfolio.delete({ where: { id: portfolio.id } }).catch(() => {});
      await prisma.user.delete({ where: { id: user.id } }).catch(() => {});
      // Delete any StockMasters this scope explicitly seeded
      for (const id of stockMasterIds) {
        await prisma.stockMaster.delete({ where: { id } }).catch(() => {});
      }
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
