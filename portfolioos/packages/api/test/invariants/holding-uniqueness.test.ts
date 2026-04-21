import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTransaction } from '../../src/services/transaction.service.js';
import { createTestScope, prisma, type TestScope } from '../helpers/db.js';

/**
 * INVARIANT: Two assets whose identity lives in `assetName` (FDs, bonds, PPF,
 * EPF, etc.) must produce two distinct Holding rows in the same portfolio.
 *
 * Failing today by design (BUG-001):
 * - Holding has @@unique([portfolioId, assetClass, stockId, fundId]).
 * - PostgreSQL's NULL-is-not-equal-to-NULL makes that constraint a no-op when
 *   both stockId and fundId are NULL, so the schema "allows" duplicates …
 * - … but `recalculateHoldingForKey` uses Prisma `findFirst` with NULL matching,
 *   which collapses the two FDs into one row keyed on (portfolio, FIXED_DEPOSIT,
 *   null, null, null). The second FD silently overwrites the first.
 *
 * This test will start passing once §5.1 task 6 lands: unique on
 * (portfolioId, assetKey) with a deterministic assetKey per identity.
 */
describe('invariant: holdings uniqueness for non-stock/non-MF assets (BUG-001)', () => {
  let scope: TestScope;

  beforeAll(async () => {
    scope = await createTestScope('holding-unique');
  });

  afterAll(async () => {
    await scope.cleanup();
  });

  it('two FDs with different names in one portfolio produce two Holding rows', async () => {
    await createTransaction(scope.userId, {
      portfolioId: scope.portfolioId,
      transactionType: 'BUY',
      assetClass: 'FIXED_DEPOSIT',
      assetName: 'HDFC Bank FD - 1 year @ 7.1%',
      tradeDate: '2024-01-15',
      quantity: '1',
      price: '100000',
      interestRate: '7.1',
      maturityDate: '2025-01-15',
    });

    await createTransaction(scope.userId, {
      portfolioId: scope.portfolioId,
      transactionType: 'BUY',
      assetClass: 'FIXED_DEPOSIT',
      assetName: 'ICICI Bank FD - 2 year @ 7.25%',
      tradeDate: '2024-02-01',
      quantity: '1',
      price: '200000',
      interestRate: '7.25',
      maturityDate: '2026-02-01',
    });

    // Read from HoldingProjection — the legacy Holding table is frozen per §4.10
    // step 6, and the projection is what downstream UI/reports query.
    const holdings = await prisma.holdingProjection.findMany({
      where: { portfolioId: scope.portfolioId, assetClass: 'FIXED_DEPOSIT' },
      orderBy: { computedAt: 'asc' },
    });

    expect(holdings).toHaveLength(2);
    const names = holdings.map((h) => h.assetName).sort();
    expect(names).toEqual([
      'HDFC Bank FD - 1 year @ 7.1%',
      'ICICI Bank FD - 2 year @ 7.25%',
    ]);
  });
});
