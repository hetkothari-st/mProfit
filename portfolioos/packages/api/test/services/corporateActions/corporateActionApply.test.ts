import { describe, it, expect, afterEach } from 'vitest';
import { createTestScope, seedStockMaster, prisma } from '../../helpers/db.js';
import { runAsSystem } from '../../../src/lib/requestContext.js';
import { computeAssetKey } from '../../../src/services/holdings/assetKey.js';
import { recomputeForPortfolio } from '../../../src/services/holdings/holdingsProjection.js';
import { applyCorporateActionsForPortfolio } from '../../../src/services/corporateActions/corporateActionApply.service.js';
import { computePortfolioCapitalGains } from '../../../src/services/tax/capitalGains.service.js';

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

  // ── Launch review B3 ──────────────────────────────────────────────────
  // A holding bought before a split and a bonus that share an ex-date (NSE
  // files both on one day) showed the pre-action cost against the adjusted
  // price. Synthetic numbers.

  async function scopeWithBuy(label: string, symbolName: string, buys: Array<{ date: string; qty: string; price: string }>) {
    const scope = await createTestScope(label);
    cleanups.push(scope.cleanup);
    const { symbol } = await seedStockMaster(scope, { symbol: symbolName, name: `${symbolName} Co` });
    const stockId = scope.stockMasterIds[0]!;
    const assetKey = computeAssetKey({ stockId });
    await runAsSystem(async () => {
      for (const b of buys) {
        const amount = (Number(b.qty) * Number(b.price)).toFixed(2);
        await prisma.transaction.create({
          data: {
            portfolioId: scope.portfolioId, assetClass: 'EQUITY', transactionType: 'BUY', stockId,
            assetName: symbol, assetKey, tradeDate: new Date(b.date), quantity: b.qty, price: b.price,
            grossAmount: amount, netAmount: amount,
          },
        });
      }
    });
    return { scope, stockId, assetKey, symbol };
  }

  const holdingOf = (portfolioId: string, stockId: string) =>
    prisma.holdingProjection.findFirst({ where: { portfolioId, stockId } });

  it('1:1 bonus → twice the shares at the same total cost', async () => {
    const { scope, stockId } = await scopeWithBuy('ca-bonus', 'CABONUS', [{ date: '2026-01-01', qty: '10', price: '1000' }]);
    await runAsSystem(async () => {
      await prisma.corporateAction.create({ data: { stockId, type: 'BONUS', exDate: new Date('2026-03-01'), ratio: '1' } });
      await recomputeForPortfolio(scope.portfolioId);
      expect(await applyCorporateActionsForPortfolio(scope.portfolioId)).toBe(1);
      const h = await holdingOf(scope.portfolioId, stockId);
      expect(h!.quantity.toString()).toBe('20');
      expect(h!.totalCost.toString()).toBe('10000');
      expect(h!.avgCostPrice.toString()).toBe('500');
    });
  });

  it('a split and a bonus on the same ex-date compound: 3 shares → 30', async () => {
    const { scope, stockId } = await scopeWithBuy('ca-both', 'CABOTH', [{ date: '2024-01-10', qty: '3', price: '7000' }]);
    await runAsSystem(async () => {
      // 1:2 split (each share becomes 2) and a 4:1 bonus, same day.
      await prisma.corporateAction.createMany({
        data: [
          { stockId, type: 'SPLIT', exDate: new Date('2025-06-16'), ratio: '2' },
          { stockId, type: 'BONUS', exDate: new Date('2025-06-16'), ratio: '4' },
        ],
      });
      await recomputeForPortfolio(scope.portfolioId);
      expect(await applyCorporateActionsForPortfolio(scope.portfolioId)).toBe(2);
      const h = await holdingOf(scope.portfolioId, stockId);
      expect(h!.quantity.toString()).toBe('30');
      expect(h!.totalCost.toString()).toBe('21000');
      expect(h!.avgCostPrice.toString()).toBe('700');
    });
  });

  it('a buy after the ex-date is not adjusted', async () => {
    const { scope, stockId } = await scopeWithBuy('ca-after', 'CAAFTER', [
      { date: '2026-01-01', qty: '10', price: '1000' },
      { date: '2026-04-01', qty: '5', price: '600' },
    ]);
    await runAsSystem(async () => {
      await prisma.corporateAction.create({ data: { stockId, type: 'SPLIT', exDate: new Date('2026-03-01'), ratio: '2' } });
      await recomputeForPortfolio(scope.portfolioId);
      await applyCorporateActionsForPortfolio(scope.portfolioId);
      const h = await holdingOf(scope.portfolioId, stockId);
      expect(h!.quantity.toString()).toBe('25'); // 10 → 20, plus 5 bought after
      expect(h!.totalCost.toString()).toBe('13000');
    });
  });

  it('capital gains after the actions keep the original cost and buy date', async () => {
    const { scope, stockId, assetKey, symbol } = await scopeWithBuy('ca-cg', 'CACG', [{ date: '2024-01-10', qty: '3', price: '7000' }]);
    await runAsSystem(async () => {
      await prisma.corporateAction.createMany({
        data: [
          { stockId, type: 'SPLIT', exDate: new Date('2025-06-16'), ratio: '2' },
          { stockId, type: 'BONUS', exDate: new Date('2025-06-16'), ratio: '4' },
        ],
      });
      await recomputeForPortfolio(scope.portfolioId);
      await applyCorporateActionsForPortfolio(scope.portfolioId);
      // Sell all 30 adjusted shares at 1000.
      await prisma.transaction.create({
        data: {
          portfolioId: scope.portfolioId, assetClass: 'EQUITY', transactionType: 'SELL', stockId,
          assetName: symbol, assetKey, tradeDate: new Date('2025-08-01'), quantity: '30', price: '1000',
          grossAmount: '30000', netAmount: '30000',
        },
      });
      const { rows } = await computePortfolioCapitalGains(scope.portfolioId);
      const sell = rows.filter((r) => r.assetName === symbol);
      const qty = sell.reduce((a, r) => a + Number(r.quantity), 0);
      const cost = sell.reduce((a, r) => a + Number(r.buyAmount), 0);
      const gain = sell.reduce((a, r) => a + Number(r.gainLoss), 0);
      expect(qty).toBe(30);
      expect(gain).toBe(9000); // 30000 sale − 21000 original cost; never a phantom loss
      expect(cost).toBe(21000);
      // Split units keep the original 2024 buy date (long term). Bonus units
      // are acquired on allotment at nil cost (s.55(2)(aa)), so they are short
      // term here — and carry no cost, so there is no phantom loss either way.
      expect(sell.map((r) => [r.quantity.toString(), r.buyDate.toISOString().slice(0, 10), r.capitalGainType])).toEqual([
        ['6', '2024-01-10', 'LONG_TERM'],
        ['24', '2025-06-16', 'SHORT_TERM'],
      ]);
    });
  });
});

