import { describe, it, expect, afterEach } from 'vitest';
import { createTestScope, seedStockMaster, prisma } from '../helpers/db.js';
import { runAsSystem } from '../../src/lib/requestContext.js';
import { computeAssetKey } from '../../src/services/assetKey.js';
import { recomputeForPortfolio } from '../../src/services/holdingsProjection.js';
import { applyCorporateActionsForPortfolio } from '../../src/services/corporateActionApply.service.js';
import { getCorporateActionsReport } from '../../src/services/corporateActionsReport.service.js';

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()!();
});

async function seedHoldingWithActions() {
  const scope = await createTestScope('ca-report');
  cleanups.push(scope.cleanup);
  const { symbol } = await seedStockMaster(scope, { symbol: 'CARPT', name: 'CA Report Co' });
  const stockId = scope.stockMasterIds[0]!;
  const assetKey = computeAssetKey({ stockId });

  await runAsSystem(async () => {
    await prisma.transaction.create({
      data: {
        portfolioId: scope.portfolioId, assetClass: 'EQUITY', transactionType: 'BUY',
        stockId, assetName: symbol, assetKey, tradeDate: new Date('2026-01-01'),
        quantity: '10', price: '1000', grossAmount: '10000', netAmount: '10000',
      },
    });
    await prisma.corporateAction.createMany({
      data: [
        { stockId, type: 'SPLIT', exDate: new Date('2026-03-01'), ratio: '2' },
        { stockId, type: 'DIVIDEND', exDate: new Date('2026-03-05'), amount: '5' },
        { stockId, type: 'MERGER', exDate: new Date('2026-03-10') },
        { stockId, type: 'BONUS', exDate: new Date('2027-12-01'), ratio: '1' }, // future
      ],
    });
    await recomputeForPortfolio(scope.portfolioId);
  });
  return scope;
}

describe('getCorporateActionsReport', () => {
  it('classifies status + computes impact before applying', async () => {
    const scope = await seedHoldingWithActions();
    const report = await runAsSystem(() => getCorporateActionsReport(scope.userId));

    expect(report.summary.total).toBe(4);
    expect(report.summary.pending).toBe(2);      // split + dividend (past, appliable, not yet applied)
    expect(report.summary.needsAction).toBe(1);  // merger
    expect(report.summary.upcoming).toBe(1);     // future bonus
    expect(report.summary.applied).toBe(0);

    const split = report.rows.find((r) => r.type === 'SPLIT')!;
    expect(split.qtyDelta).toBe('10'); // 10 × (2 − 1)
    const div = report.rows.find((r) => r.type === 'DIVIDEND')!;
    expect(div.cashImpact).toBe('50'); // 5 × 10
    expect(report.summary.byType.find((b) => b.type === 'SPLIT')!.count).toBe(1);
  });

  it('reflects applied actions + dividend income after apply', async () => {
    const scope = await seedHoldingWithActions();
    await runAsSystem(() => applyCorporateActionsForPortfolio(scope.portfolioId));
    const report = await runAsSystem(() => getCorporateActionsReport(scope.userId));

    expect(report.summary.applied).toBe(2);      // split + dividend now applied
    expect(report.summary.needsAction).toBe(1);  // merger still needs action
    expect(Number(report.summary.dividendIncome)).toBe(50);
    expect(report.dividendByMonth.length).toBeGreaterThanOrEqual(1);

    const split = report.rows.find((r) => r.type === 'SPLIT')!;
    expect(split.status).toBe('APPLIED');
    expect(split.appliedTxId).not.toBeNull();
  });
});
