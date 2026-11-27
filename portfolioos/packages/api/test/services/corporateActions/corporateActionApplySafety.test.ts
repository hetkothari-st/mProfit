import { describe, it, expect, afterEach } from 'vitest';
import { createTestScope, seedStockMaster, prisma } from '../../helpers/db.js';
import { runAsSystem } from '../../../src/lib/requestContext.js';
import { computeAssetKey } from '../../../src/services/holdings/assetKey.js';
import { recomputeForPortfolio } from '../../../src/services/holdings/holdingsProjection.js';
import {
  applyCorporateActionsForPortfolio,
  NIGHTLY_DIVIDEND_LOOKBACK_DAYS,
} from '../../../src/services/corporateActions/corporateActionApply.service.js';

/**
 * The revived NSE feed reaches back about two years, and the nightly job
 * applies whatever it stores to every portfolio. These pin the guards that
 * keep that first run from writing years of duplicate dividends, a second
 * copy of a split the user already booked, or an unverified BSE row.
 */

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()!();
});

async function holdingWithBuy(label: string, symbol: string) {
  const scope = await createTestScope(label);
  cleanups.push(scope.cleanup);
  await seedStockMaster(scope, { symbol, name: `${symbol} Ltd` });
  const stockId = scope.stockMasterIds[0]!;
  const assetKey = computeAssetKey({ stockId });
  await runAsSystem(() =>
    prisma.transaction.create({
      data: {
        portfolioId: scope.portfolioId,
        assetClass: 'EQUITY',
        transactionType: 'BUY',
        stockId,
        assetName: symbol,
        assetKey,
        tradeDate: new Date('2024-01-10'),
        quantity: '10',
        price: '100',
        grossAmount: '1000',
        netAmount: '1000',
      },
    }),
  );
  return { scope, stockId, assetKey, symbol };
}

const caDividends = (portfolioId: string) =>
  prisma.transaction.findMany({
    where: { portfolioId, transactionType: 'DIVIDEND_PAYOUT', sourceAdapter: 'CORPORATE_ACTION' },
  });

describe('corporate action apply: first-run safety', () => {
  const now = new Date('2026-11-27T12:00:00Z');

  it('nightly window: books a recent dividend, leaves one older than the window alone', async () => {
    const { scope, stockId } = await holdingWithBuy('ca-safe-window', 'CASAFEWIN');
    await runAsSystem(async () => {
      await prisma.corporateAction.createMany({
        data: [
          { stockId, type: 'DIVIDEND', exDate: new Date('2026-11-17'), amount: '2' }, // 10 days ago
          { stockId, type: 'DIVIDEND', exDate: new Date('2025-08-01'), amount: '3' }, // well outside
        ],
      });
      await recomputeForPortfolio(scope.portfolioId);
      await applyCorporateActionsForPortfolio(scope.portfolioId, {
        now,
        dividendLookbackDays: NIGHTLY_DIVIDEND_LOOKBACK_DAYS,
      });
      const divs = await caDividends(scope.portfolioId);
      expect(divs).toHaveLength(1);
      expect(divs[0]!.netAmount.toString()).toBe('20');
    });
  });

  it('skips a dividend the user already has from another source near the ex-date', async () => {
    const { scope, stockId, assetKey, symbol } = await holdingWithBuy('ca-safe-dup', 'CASAFEDUP');
    await runAsSystem(async () => {
      // Imported from a CAS / bank feed, dated on the pay date three weeks after the ex-date.
      await prisma.transaction.create({
        data: {
          portfolioId: scope.portfolioId,
          assetClass: 'EQUITY',
          transactionType: 'DIVIDEND_PAYOUT',
          stockId,
          assetName: symbol,
          assetKey,
          tradeDate: new Date('2026-11-20'),
          quantity: '10',
          price: '2',
          grossAmount: '20',
          netAmount: '20',
        },
      });
      await prisma.corporateAction.create({
        data: { stockId, type: 'DIVIDEND', exDate: new Date('2026-10-30'), amount: '2' },
      });
      await recomputeForPortfolio(scope.portfolioId);
      await applyCorporateActionsForPortfolio(scope.portfolioId, { now });
      expect(await caDividends(scope.portfolioId)).toHaveLength(0);
    });
  });

  it('skips a split the user already booked by hand near the ex-date', async () => {
    const { scope, stockId, assetKey, symbol } = await holdingWithBuy('ca-safe-split', 'CASAFESPL');
    await runAsSystem(async () => {
      // The user's own workaround: a SPLIT row a few days off the ex-date.
      await prisma.transaction.create({
        data: {
          portfolioId: scope.portfolioId,
          assetClass: 'EQUITY',
          transactionType: 'SPLIT',
          stockId,
          assetName: symbol,
          assetKey,
          tradeDate: new Date('2025-06-18'),
          quantity: '10',
          price: '0',
          grossAmount: '0',
          netAmount: '0',
        },
      });
      await prisma.corporateAction.create({
        data: { stockId, type: 'SPLIT', exDate: new Date('2025-06-16'), ratio: '2' },
      });
      await recomputeForPortfolio(scope.portfolioId);
      expect(await applyCorporateActionsForPortfolio(scope.portfolioId, { now })).toBe(0);
      const h = await prisma.holdingProjection.findFirst({ where: { portfolioId: scope.portfolioId, stockId } });
      expect(h!.quantity.toString()).toBe('20');
    });
  });

  it('never auto-applies a row that came from the unverified BSE fallback', async () => {
    const { scope, stockId } = await holdingWithBuy('ca-safe-bse', 'CASAFEBSE');
    await runAsSystem(async () => {
      await prisma.corporateAction.create({
        data: { stockId, type: 'SPLIT', exDate: new Date('2025-06-16'), ratio: '2', details: { source: 'bse' } },
      });
      await recomputeForPortfolio(scope.portfolioId);
      expect(await applyCorporateActionsForPortfolio(scope.portfolioId, { now })).toBe(0);
      const h = await prisma.holdingProjection.findFirst({ where: { portfolioId: scope.portfolioId, stockId } });
      expect(h!.quantity.toString()).toBe('10');
    });
  });

  it('still applies an NSE split with no booking nearby', async () => {
    const { scope, stockId } = await holdingWithBuy('ca-safe-nse', 'CASAFENSE');
    await runAsSystem(async () => {
      await prisma.corporateAction.create({
        data: { stockId, type: 'SPLIT', exDate: new Date('2025-06-16'), ratio: '2', details: { source: 'nse' } },
      });
      await recomputeForPortfolio(scope.portfolioId);
      expect(await applyCorporateActionsForPortfolio(scope.portfolioId, { now })).toBe(1);
      const h = await prisma.holdingProjection.findFirst({ where: { portfolioId: scope.portfolioId, stockId } });
      expect(h!.quantity.toString()).toBe('20');
    });
  });
});
