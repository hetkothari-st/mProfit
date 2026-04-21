import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Decimal } from 'decimal.js';
import { createTransaction } from '../../src/services/transaction.service.js';
import { computePortfolioXirr } from '../../src/services/xirr.service.js';
import { createTestScope, seedStockMaster, prisma, type TestScope } from '../helpers/db.js';

/**
 * INVARIANT: All money arithmetic retains arbitrary-precision decimal semantics
 * from DB through service layer through API boundary. JS Number must never be
 * used as an accumulator for monetary values.
 *
 * Two failing checks today by design (BUG-005, BUG-009):
 *
 * 1. `recalculateHoldingForKey` writes totalCost derived from Decimal.js math,
 *    so three BUYs of 1 unit @ ₹33.33 should yield totalCost = ₹99.99 exact.
 *    The holding.totalCost column is Decimal(18,4); round-tripping must preserve
 *    exactness.
 *
 * 2. `xirr.service.ts:111,148,185` calls `.toNumber()` on monetary Decimals and
 *    accumulates in JS floats (`total += …`, `invested += …`). 1000 BUYs of
 *    ₹0.10 each should yield totalInvested = ₹100 exact, but IEEE-754 drift
 *    means the current implementation returns 100.00000000000014 (or similar).
 *
 * These tests will pass after §5.1 task 2 ("Decimal hardening") removes every
 * `.toNumber()` / `parseFloat` on money paths.
 */
describe('invariant: decimal precision on money (BUG-005, BUG-009)', () => {
  let scope: TestScope;
  let stockSymbol: string;

  beforeAll(async () => {
    scope = await createTestScope('decimal');
    const seeded = await seedStockMaster(scope, {
      symbol: 'TSTDEC',
      name: 'Decimal Test Stock',
    });
    stockSymbol = seeded.symbol;
  });

  afterAll(async () => {
    await scope.cleanup();
  });

  it('3 BUYs × ₹33.33/unit → holding.totalCost is exactly 99.99', async () => {
    for (let i = 0; i < 3; i++) {
      await createTransaction(scope.userId, {
        portfolioId: scope.portfolioId,
        transactionType: 'BUY',
        assetClass: 'EQUITY',
        stockSymbol,
        exchange: 'NSE',
        tradeDate: '2024-03-0' + (i + 1),
        quantity: '1',
        price: '33.33',
      });
    }

    const holding = await prisma.holding.findFirst({
      where: { portfolioId: scope.portfolioId, assetClass: 'EQUITY' },
    });
    expect(holding).not.toBeNull();
    const totalCost = new Decimal(holding!.totalCost.toString());
    expect(totalCost.equals(new Decimal('99.99'))).toBe(true);
  });

  it('1000 BUYs × ₹0.10 each → XIRR.totalInvested is exactly ₹100 (no float drift)', async () => {
    // Use a fresh scope — earlier test in this file already has transactions.
    const s = await createTestScope('decimal-xirr');
    try {
      const seeded = await seedStockMaster(s, { symbol: 'TSTDRIFT' });

      // 1000 BUYs of 1 unit at 0.10, one per day so they're distinct dates.
      const base = new Date('2021-01-01T00:00:00Z');
      const rows = Array.from({ length: 1000 }, (_, i) => {
        const d = new Date(base.getTime() + i * 24 * 60 * 60 * 1000);
        return d.toISOString().slice(0, 10);
      });
      for (const tradeDate of rows) {
        await createTransaction(s.userId, {
          portfolioId: s.portfolioId,
          transactionType: 'BUY',
          assetClass: 'EQUITY',
          stockSymbol: seeded.symbol,
          exchange: 'NSE',
          tradeDate,
          quantity: '1',
          price: '0.10',
        });
      }

      const result = await computePortfolioXirr(s.portfolioId);
      // totalInvested MUST be exactly 100. IEEE-754 drift would give
      // 99.99999999999859 or 100.00000000000014 depending on accumulation order.
      expect(result.totalInvested).toBe(100);
    } finally {
      await s.cleanup();
    }
  });
});
