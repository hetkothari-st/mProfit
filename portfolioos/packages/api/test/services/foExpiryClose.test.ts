import { describe, it, expect, afterEach } from 'vitest';
import { createTestScope, prisma } from '../helpers/db.js';
import { runAsSystem } from '../../src/lib/requestContext.js';
import { recomputeDerivativePosition } from '../../src/services/derivativePosition.service.js';
import { approveExpiryClose } from '../../src/services/foExpiry.service.js';

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()!();
});

const ASSET_KEY = 'fno:NIFTY:FUT:000000:2026-09-24';

async function openLongFuture(settlementPrice: string | null) {
  const scope = await createTestScope(`fo-expiry-${settlementPrice ?? 'none'}`);
  cleanups.push(scope.cleanup);
  return runAsSystem(async () => {
    // One lot of 75 units, stored in units as every importer does.
    await prisma.transaction.create({
      data: {
        portfolioId: scope.portfolioId,
        assetClass: 'FUTURES',
        transactionType: 'BUY',
        assetName: 'NIFTY',
        assetKey: ASSET_KEY,
        tradeDate: new Date('2026-09-01'),
        expiryDate: new Date('2026-09-24'),
        lotSize: 75,
        quantity: '75',
        price: '24000',
        grossAmount: '1800000',
        netAmount: '1800000',
        exchange: 'NFO',
      },
    });
    await recomputeDerivativePosition(scope.portfolioId, ASSET_KEY);
    const position = await prisma.derivativePosition.findFirstOrThrow({
      where: { portfolioId: scope.portfolioId, assetKey: ASSET_KEY },
    });
    const job = await prisma.expiryCloseJob.create({
      data: {
        portfolioId: scope.portfolioId,
        positionId: position.id,
        assetKey: ASSET_KEY,
        expiryDate: new Date('2026-09-24'),
        openQty: position.netQuantity,
        settlementPrice,
      },
    });
    return { scope, job };
  });
}

describe('F&O expiry close', () => {
  it('closes the units actually held, not units × lot size', async () => {
    const { scope, job } = await openLongFuture('24100');
    await runAsSystem(() => approveExpiryClose(job.id));
    await runAsSystem(async () => {
      const close = await prisma.transaction.findFirstOrThrow({
        where: { portfolioId: scope.portfolioId, assetKey: ASSET_KEY, transactionType: 'SELL' },
      });
      expect(close.quantity.toString()).toBe('75');
      const position = await prisma.derivativePosition.findFirstOrThrow({
        where: { portfolioId: scope.portfolioId, assetKey: ASSET_KEY },
      });
      expect(position.netQuantity.toString()).toBe('0');
      expect(position.realizedPnl.toString()).toBe('7500');
    });
  });

  it('refuses to close without a settlement price instead of booking it at 0', async () => {
    const { scope, job } = await openLongFuture(null);
    await expect(runAsSystem(() => approveExpiryClose(job.id))).rejects.toThrow(/settlement price/i);
    await runAsSystem(async () => {
      const closes = await prisma.transaction.count({
        where: { portfolioId: scope.portfolioId, assetKey: ASSET_KEY, transactionType: 'SELL' },
      });
      expect(closes).toBe(0);
    });
  });
});
