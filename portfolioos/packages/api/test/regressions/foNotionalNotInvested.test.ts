import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Decimal } from 'decimal.js';
import { prisma } from '../../src/lib/prisma.js';
import { createTestScope, type TestScope } from '../helpers/db.js';
import { getAssetClassXirr, getKpis } from '../../src/services/analytics/analytics.service.js';
import { computeUserXirr } from '../../src/services/analytics/xirr.service.js';

/**
 * Launch review B8: an AI insight said "Futures cost ₹24Cr, current value 0"
 * for an account with no open F&O. A futures trade's quantity × price is its
 * notional exposure, not money invested; counting it made closed contracts
 * look like a huge invested amount that had gone to zero. Since 2026-09-17
 * (b05c3ac7) F&O enters returns by realised P&L only. This pins that for the
 * figures the insight is built from.
 *
 * Synthetic numbers only.
 */
describe('closed futures never count notional as money invested', () => {
  let scope: TestScope;

  beforeEach(async () => {
    scope = await createTestScope('fo-notional');
    await scope.runAs(async () => {
      const base = {
        portfolioId: scope.portfolioId, assetClass: 'FUTURES' as const, assetName: 'TESTIDX FUT',
        assetKey: 'fo:TESTIDX-FUT', quantity: '100',
      };
      // Bought 100 at 20,000 (notional 20 lakh), sold at 20,100: +10,000 P&L.
      await prisma.transaction.create({
        data: { ...base, transactionType: 'BUY', tradeDate: new Date('2025-06-02'), price: '20000', grossAmount: '2000000', netAmount: '2000000' },
      });
      await prisma.transaction.create({
        data: { ...base, transactionType: 'SELL', tradeDate: new Date('2025-06-20'), price: '20100', grossAmount: '2010000', netAmount: '2010000' },
      });
    });
  });
  afterEach(async () => {
    await scope.cleanup();
  });

  it('the per-class figures the AI insight reads show no futures cost', async () => {
    const rows = await scope.runAs(() => getAssetClassXirr({ kind: 'user', userId: scope.userId }));
    const fut = rows.find((r) => r.assetClass === 'FUTURES');
    // Either no row, or a row whose invested amount is not the 20 lakh notional.
    expect(fut === undefined || new Decimal(fut.invested).lessThan(2000000)).toBe(true);
  });

  it('portfolio cost and invested ignore the notional', async () => {
    const kpis = await scope.runAs(() => getKpis({ kind: 'user', userId: scope.userId }));
    expect(new Decimal(kpis.totalCost).toFixed(2)).toBe('0.00');
    const x = await scope.runAs(() => computeUserXirr(scope.userId));
    expect(new Decimal(x.totalInvested).lessThan(2000000)).toBe(true);
  });
});
