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

  it('dividend → cash DIVIDEND_PAYOUT (perShare × qty), holding qty unchanged', async () => {
    const scope = await createTestScope('ca-div');
    cleanups.push(scope.cleanup);
    const { symbol } = await seedStockMaster(scope, { symbol: 'CADIV', name: 'CA Div Co' });
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
      // ₹5/share dividend on 10 shares → ₹50 cash.
      await prisma.corporateAction.create({
        data: { stockId, type: 'DIVIDEND', exDate: new Date('2026-03-01'), amount: '5' },
      });
      await recomputeForPortfolio(scope.portfolioId);
      expect(await applyCorporateActionsForPortfolio(scope.portfolioId)).toBe(1);

      const div = await prisma.transaction.findFirst({
        where: { portfolioId: scope.portfolioId, transactionType: 'DIVIDEND_PAYOUT' },
      });
      expect(div).not.toBeNull();
      expect(Number(div!.netAmount)).toBe(50);

      const h = await prisma.holdingProjection.findFirst({
        where: { portfolioId: scope.portfolioId, stockId },
      });
      expect(Number(h!.quantity)).toBe(10); // dividend doesn't change qty
    });
  });

  it('merger/rights/buyback are NOT auto-applied (need target data or user election)', async () => {
    const scope = await createTestScope('ca-skip');
    cleanups.push(scope.cleanup);
    const { symbol } = await seedStockMaster(scope, { symbol: 'CASKIP', name: 'CA Skip Co' });
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
      await prisma.corporateAction.createMany({
        data: [
          { stockId, type: 'MERGER', exDate: new Date('2026-03-01') },
          { stockId, type: 'RIGHTS', exDate: new Date('2026-03-01'), ratio: '0.5' },
          { stockId, type: 'BUYBACK', exDate: new Date('2026-03-01') },
        ],
      });
      await recomputeForPortfolio(scope.portfolioId);
      expect(await applyCorporateActionsForPortfolio(scope.portfolioId)).toBe(0);

      const h = await prisma.holdingProjection.findFirst({
        where: { portfolioId: scope.portfolioId, stockId },
      });
      expect(Number(h!.quantity)).toBe(10); // untouched
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
