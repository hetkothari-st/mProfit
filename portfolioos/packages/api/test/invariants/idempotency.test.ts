import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTransaction } from '../../src/services/transaction.service.js';
import { createTestScope, seedStockMaster, prisma, type TestScope } from '../helpers/db.js';

/**
 * INVARIANT: Re-submitting the same source-tracked transaction is a no-op.
 *
 * Failing today by design (BUG-003):
 * - Transaction has no sourceHash column.
 * - There is no unique constraint on (portfolio, broker, orderNo, tradeNo) or
 *   any natural key, so calling createTransaction twice with identical payloads
 *   produces two rows in the database.
 *
 * This test will start passing once §5.1 task 5 ("Idempotent importers") lands
 * and the createTransaction / import path de-dupes on sourceHash.
 */
describe('invariant: ingestion idempotency (BUG-003)', () => {
  let scope: TestScope;
  let stockSymbol: string;

  beforeAll(async () => {
    scope = await createTestScope('idempotency');
    const seeded = await seedStockMaster(scope, {
      symbol: 'TSTIDEMP',
      name: 'Idempotency Test Stock',
      isin: 'INE0TEST0001',
    });
    stockSymbol = seeded.symbol;
  });

  afterAll(async () => {
    await scope.cleanup();
  });

  // Each `it()` runs in a fresh async scope; wrap the body in `scope.runAs`
  // so RLS policies see `app.current_user_id` for the duration of the test.
  it('re-submitting the same (broker, orderNo, tradeNo) triplet creates zero new rows', () => scope.runAs(async () => {
    const payload = {
      portfolioId: scope.portfolioId,
      transactionType: 'BUY' as const,
      assetClass: 'EQUITY' as const,
      stockSymbol,
      exchange: 'NSE' as const,
      tradeDate: '2024-07-15',
      quantity: '10',
      price: '250.50',
      brokerage: '12.50',
      broker: 'Zerodha',
      orderNo: 'ORD-IDEMP-0001',
      tradeNo: 'TRD-IDEMP-0001',
    };

    await createTransaction(scope.userId, payload);
    await expect(createTransaction(scope.userId, payload)).resolves.toBeDefined();

    const count = await prisma.transaction.count({
      where: {
        portfolioId: scope.portfolioId,
        broker: 'Zerodha',
        orderNo: 'ORD-IDEMP-0001',
        tradeNo: 'TRD-IDEMP-0001',
      },
    });

    expect(count).toBe(1);
  }));
});
