import { describe, it, expect, afterEach } from 'vitest';
import { createTestScope, prisma, type TestScope } from '../helpers/db.js';
import { runAsSystem } from '../../src/lib/requestContext.js';
import { listPortfolios } from '../../src/services/holdings/portfolio.service.js';

/**
 * The list reports how many transactions and holdings each portfolio has. It used Prisma's relation
 * `_count`, which aggregates the whole child table (3 s with 500k rows in the database) for a user who owns a
 * few dozen; it now counts only the listed portfolios. These pin the numbers and the per-user separation.
 */
const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()!();
});

async function seed(label: string, txns: number): Promise<TestScope> {
  const scope = await createTestScope(label);
  cleanups.push(scope.cleanup);
  await runAsSystem(async () => {
    const stock = await prisma.stockMaster.create({
      data: { symbol: `CNT${label}${Date.now().toString(36)}`, name: `Count ${label}`, exchange: 'NSE' },
    });
    await prisma.transaction.createMany({
      data: Array.from({ length: txns }, (_, i) => ({
        portfolioId: scope.portfolioId,
        assetClass: 'EQUITY' as const,
        transactionType: 'BUY' as const,
        stockId: stock.id,
        assetKey: `stock:${stock.id}`,
        tradeDate: new Date(Date.UTC(2024, 0, 1 + i)),
        quantity: '1',
        price: String(100 + i),
        grossAmount: String(100 + i),
        netAmount: String(100 + i),
        exchange: 'NSE' as const,
      })),
    });
    await prisma.holdingProjection.create({
      data: {
        portfolioId: scope.portfolioId,
        assetKey: `stock:${stock.id}`,
        assetClass: 'EQUITY',
        stockId: stock.id,
        quantity: String(txns),
        avgCostPrice: '100',
        totalCost: String(100 * txns),
        sourceTxCount: txns,
      },
    });
  });
  return scope;
}

describe('portfolio list child counts', () => {
  it('reports each portfolio its own transaction and holding counts', async () => {
    const a = await seed('cnta', 3);
    const b = await seed('cntb', 5);
    const listA = await runAsSystem(() => listPortfolios(a.userId));
    const listB = await runAsSystem(() => listPortfolios(b.userId));
    const mine = (list: typeof listA, id: string) => list.find((p) => p.id === id);
    expect(mine(listA, a.portfolioId)).toMatchObject({ transactionCount: 3, holdingCount: 1 });
    expect(mine(listB, b.portfolioId)).toMatchObject({ transactionCount: 5, holdingCount: 1 });
    expect(mine(listA, b.portfolioId)).toBeUndefined();
  });
});
