import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Decimal } from 'decimal.js';
import {
  createTransaction,
  updateTransaction,
} from '../../src/services/transaction.service.js';
import { persistCapitalGainsForPortfolio } from '../../src/services/capitalGains.service.js';
import { createTestScope, seedStockMaster, prisma, type TestScope } from '../helpers/db.js';

/**
 * INVARIANT: Editing a transaction that is referenced by a CapitalGain row
 * must trigger recomputation of every CapitalGain row that touches the same
 * (portfolio, asset) pair. Persisted CG rows cannot silently go stale.
 *
 * Failing today by design (BUG-004):
 * - `updateTransaction` only calls `recalculateHoldingForKey`.
 * - There is no cascade into `capitalGains.service` when the underlying BUY or
 *   SELL transaction is edited (or deleted).
 * - A user who edits the price on an old BUY will see the holding update, but
 *   the persisted CapitalGain rows (and therefore Schedule 112A totals) keep
 *   the pre-edit cost basis until someone manually re-runs
 *   `persistCapitalGainsForPortfolio`.
 *
 * This test will start passing once §5.1 task 10 lands ("cascade capital-gains
 * recompute on transaction edit/delete").
 */
describe('invariant: capital-gains cascade on transaction edit (BUG-004)', () => {
  let scope: TestScope;
  let stockSymbol: string;

  beforeAll(async () => {
    scope = await createTestScope('cg-recompute');
    const seeded = await seedStockMaster(scope, {
      symbol: 'TSTCGR',
      name: 'CG Recompute Test Stock',
    });
    stockSymbol = seeded.symbol;
  });

  afterAll(async () => {
    await scope.cleanup();
  });

  it('editing a matched BUY updates the persisted CapitalGain row', async () => {
    // BUY 100 @ ₹100 on 2022-01-05 → cost basis ₹10,000.
    const buy = await createTransaction(scope.userId, {
      portfolioId: scope.portfolioId,
      transactionType: 'BUY',
      assetClass: 'EQUITY',
      stockSymbol,
      exchange: 'NSE',
      tradeDate: '2022-01-05',
      quantity: '100',
      price: '100',
    });

    // SELL 100 @ ₹120 on 2023-06-10 → LONG_TERM, gainLoss ₹2,000.
    const sell = await createTransaction(scope.userId, {
      portfolioId: scope.portfolioId,
      transactionType: 'SELL',
      assetClass: 'EQUITY',
      stockSymbol,
      exchange: 'NSE',
      tradeDate: '2023-06-10',
      quantity: '100',
      price: '120',
    });

    const persistedCount = await persistCapitalGainsForPortfolio(scope.portfolioId);
    expect(persistedCount).toBe(1);

    const initial = await prisma.capitalGain.findFirst({
      where: { portfolioId: scope.portfolioId, sellTransactionId: sell.id },
    });
    expect(initial).not.toBeNull();
    expect(initial!.buyTransactionId).toBe(buy.id);
    expect(new Decimal(initial!.buyAmount.toString()).equals(new Decimal('10000'))).toBe(true);
    expect(new Decimal(initial!.gainLoss.toString()).equals(new Decimal('2000'))).toBe(true);
    expect(initial!.capitalGainType).toBe('LONG_TERM');

    // User edits the original BUY: price goes from ₹100 to ₹110, quantity
    // unchanged. New cost basis should be ₹11,000, gainLoss ₹1,000.
    await updateTransaction(scope.userId, buy.id, {
      portfolioId: scope.portfolioId,
      transactionType: 'BUY',
      assetClass: 'EQUITY',
      stockSymbol,
      exchange: 'NSE',
      tradeDate: '2022-01-05',
      quantity: '100',
      price: '110',
    });

    const afterEdit = await prisma.capitalGain.findFirst({
      where: { portfolioId: scope.portfolioId, sellTransactionId: sell.id },
    });
    expect(afterEdit).not.toBeNull();
    // Under BUG-004 the row is stale: buyAmount stays at 10000, gainLoss at 2000.
    expect(new Decimal(afterEdit!.buyAmount.toString()).equals(new Decimal('11000'))).toBe(true);
    expect(new Decimal(afterEdit!.gainLoss.toString()).equals(new Decimal('1000'))).toBe(true);
  });
});
