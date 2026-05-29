import { describe, it, expect, afterEach } from 'vitest';
import { createTestScope, seedStockMaster, prisma } from '../helpers/db.js';
import { runAsSystem } from '../../src/lib/requestContext.js';
import { computeAssetKey } from '../../src/services/assetKey.js';
import { recomputeForPortfolio } from '../../src/services/holdingsProjection.js';
import { applyCorporateActionsForPortfolio } from '../../src/services/corporateActionApply.service.js';

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()!();
});

describe('corporate action auto-apply', () => {
  it('1:2 split on 10 shares → 20 shares, avg cost halved, cost basis unchanged', async () => {
    const scope = await createTestScope('ca-split');
    cleanups.push(scope.cleanup);
    const { symbol } = await seedStockMaster(scope, { symbol: 'CASPLIT', name: 'CA Split Co' });
    const stockId = scope.stockMasterIds[0]!;
    const assetKey = computeAssetKey({ stockId });

    await runAsSystem(async () => {
      // BUY 10 @ 1000 → totalCost 10000
      await prisma.transaction.create({
        data: {
          portfolioId: scope.portfolioId,
          assetClass: 'EQUITY',
          transactionType: 'BUY',
          stockId,
          assetName: symbol,
          assetKey,
          tradeDate: new Date('2026-01-01'),
          quantity: '10',
          price: '1000',
          grossAmount: '10000',
          netAmount: '10000',
        },
      });
      // 1:2 split (each share becomes 2) recorded with ex-date in the past.
      await prisma.corporateAction.create({
        data: { stockId, type: 'SPLIT', exDate: new Date('2026-03-01'), ratio: '2' },
      });

      await recomputeForPortfolio(scope.portfolioId);
      const applied = await applyCorporateActionsForPortfolio(scope.portfolioId);
      expect(applied).toBe(1);

      const h = await prisma.holdingProjection.findFirst({
        where: { portfolioId: scope.portfolioId, stockId },
      });
      expect(Number(h!.quantity)).toBe(20);
      expect(Number(h!.totalCost)).toBe(10000);
      expect(Number(h!.avgCostPrice)).toBeCloseTo(500, 2);
    });
  });

  it('is idempotent — re-running applies nothing the second time', async () => {
    const scope = await createTestScope('ca-idem');
    cleanups.push(scope.cleanup);
    const { symbol } = await seedStockMaster(scope, { symbol: 'CAIDEM', name: 'CA Idem Co' });
    const stockId = scope.stockMasterIds[0]!;
    const assetKey = computeAssetKey({ stockId });

    await runAsSystem(async () => {
      await prisma.transaction.create({
        data: {
          portfolioId: scope.portfolioId,
          assetClass: 'EQUITY',
          transactionType: 'BUY',
          stockId,
          assetName: symbol,
          assetKey,
          tradeDate: new Date('2026-01-01'),
          quantity: '10',
          price: '1000',
          grossAmount: '10000',
          netAmount: '10000',
        },
      });
      await prisma.corporateAction.create({
        data: { stockId, type: 'SPLIT', exDate: new Date('2026-03-01'), ratio: '2' },
      });
      await recomputeForPortfolio(scope.portfolioId);

      expect(await applyCorporateActionsForPortfolio(scope.portfolioId)).toBe(1);
      expect(await applyCorporateActionsForPortfolio(scope.portfolioId)).toBe(0);

      const h = await prisma.holdingProjection.findFirst({
        where: { portfolioId: scope.portfolioId, stockId },
      });
      expect(Number(h!.quantity)).toBe(20); // not 40 — split applied once
    });
  });
});
