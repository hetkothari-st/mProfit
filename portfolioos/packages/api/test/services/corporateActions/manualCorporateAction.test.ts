import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import express from 'express';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { createTestScope, seedStockMaster, prisma, type TestScope } from '../../helpers/db.js';
import { runAsSystem } from '../../../src/lib/requestContext.js';
import { computeAssetKey } from '../../../src/services/holdings/assetKey.js';
import { recomputeForPortfolio } from '../../../src/services/holdings/holdingsProjection.js';
import { addManualCorporateAction } from '../../../src/services/corporateActions/manualCorporateAction.service.js';
import { corporateActionsRouter } from '../../../src/routes/corporateActions.routes.js';
import { errorHandler } from '../../../src/middleware/errorHandler.js';
import { signAccessToken } from '../../../src/services/auth/jwt.service.js';

/**
 * Admin entry of a split or bonus the feeds missed. The case that prompted it:
 * 3 shares bought at 7,150 before a 1:2 split (face value 2 → 1) and a 4:1
 * bonus on the same ex-date must become 30 shares at 715, same total cost.
 * Synthetic stock; the numbers mirror that case.
 */
describe('manual corporate action entry', () => {
  let scope: TestScope;
  let stockId: string;
  let symbol: string;

  afterEach(async () => {
    await runAsSystem(() => prisma.corporateAction.deleteMany({ where: { stockId: { in: scope.stockMasterIds } } }));
    await scope.cleanup();
  });

  async function holdThree() {
    scope = await createTestScope('ca-manual');
    ({ symbol } = await seedStockMaster(scope, { symbol: 'CAMANUAL', isin: 'INE000M00015' }));
    stockId = scope.stockMasterIds[0]!;
    await runAsSystem(async () => {
      await prisma.transaction.create({
        data: {
          portfolioId: scope.portfolioId, assetClass: 'EQUITY', transactionType: 'BUY', stockId, assetName: symbol,
          assetKey: computeAssetKey({ stockId }), tradeDate: new Date('2024-03-04'),
          quantity: '3', price: '7150', grossAmount: '21450', netAmount: '21450',
        },
      });
      await recomputeForPortfolio(scope.portfolioId);
    });
  }

  it('a hand-entered split and bonus turn 3 shares at 7,150 into 30 at 715', async () => {
    await holdThree();
    const split = await addManualCorporateAction('admin-test', {
      type: 'SPLIT', stock: 'camanual', exDate: '2025-06-16', fromFaceValue: '2', toFaceValue: '1',
    });
    const bonus = await addManualCorporateAction('admin-test', {
      type: 'BONUS', stock: 'INE000M00015', exDate: '2025-06-16', bonusShares: '4', heldShares: '1',
    });
    expect([split.ratio, bonus.ratio]).toEqual(['2', '4']);
    expect(split.portfoliosApplied).toBeGreaterThanOrEqual(1);

    const h = await runAsSystem(() => prisma.holdingProjection.findFirst({ where: { portfolioId: scope.portfolioId, stockId } }));
    expect(h!.quantity.toString()).toBe('30');
    expect(h!.avgCostPrice.toString()).toBe('715');
    expect(h!.totalCost.toString()).toBe('21450');
  });

  it('entering the same action twice changes nothing the second time', async () => {
    await holdThree();
    const input = { type: 'SPLIT', stock: symbol, exDate: '2025-06-16', fromFaceValue: '2', toFaceValue: '1' } as const;
    await addManualCorporateAction('admin-test', input);
    const again = await addManualCorporateAction('admin-test', input);
    expect(again.created).toBe(false);
    expect(again.transactionsBooked).toBe(0);
    const h = await runAsSystem(() => prisma.holdingProjection.findFirst({ where: { portfolioId: scope.portfolioId, stockId } }));
    expect(h!.quantity.toString()).toBe('6');
  });

  it('refuses a second, different ratio for the same action, and a split that raises face value', async () => {
    await holdThree();
    await addManualCorporateAction('admin-test', { type: 'BONUS', stock: symbol, exDate: '2025-06-16', bonusShares: '4', heldShares: '1', applyNow: false });
    await expect(
      addManualCorporateAction('admin-test', { type: 'BONUS', stock: symbol, exDate: '2025-06-16', bonusShares: '1', heldShares: '1' }),
    ).rejects.toMatchObject({ statusCode: 409 });
    await expect(
      addManualCorporateAction('admin-test', { type: 'SPLIT', stock: symbol, exDate: '2025-06-16', fromFaceValue: '1', toFaceValue: '2' }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe('manual corporate action route', () => {
  let server: Server;
  let base: string;
  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.use('/api/corporate-actions', corporateActionsRouter);
    app.use(errorHandler);
    server = app.listen(0);
    await new Promise<void>((resolve) => server.once('listening', resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

  it('is refused to a non-admin', async () => {
    const token = signAccessToken({ sub: 'ca-manual-investor', email: 'ca-manual@test.local', role: 'INVESTOR', plan: 'FREE' }).token;
    const res = await fetch(`${base}/api/corporate-actions/manual`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ type: 'SPLIT', stock: 'X', exDate: '2025-06-16', fromFaceValue: '2', toFaceValue: '1' }),
    });
    expect(res.status).toBe(403);
  });
});
