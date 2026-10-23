/**
 * F&O defect regressions:
 *   - broker sync reported trades already on the books as "new trades";
 *   - rejecting an expiry close left the position "EXPIRY ?" forever, and the
 *     next scan re-flagged it with a fresh job.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { createTestScope, prisma } from '../helpers/db.js';
import { runAsSystem } from '../../src/lib/requestContext.js';
import type { FnoNormalizedTrade } from '../../src/ingestion/fno/types.js';

const syncDay = vi.fn();
vi.mock('../../src/ingestion/fno/broker-registry.js', () => ({
  getFnoConnector: () => ({ brokerId: 'upstox', syncDay }),
}));

const { syncFnoBroker } = await import('../../src/services/fo/foBrokerSync.service.js');
const { recomputeDerivativePosition } = await import(
  '../../src/services/fo/derivativePosition.service.js'
);
const { scanExpiringPositions, rejectExpiryClose } = await import(
  '../../src/services/fo/foExpiry.service.js'
);

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()!();
  syncDay.mockReset();
});

function trade(n: number): FnoNormalizedTrade {
  return {
    brokerId: 'upstox',
    side: 'BUY',
    underlying: 'NIFTY',
    instrumentType: 'FUTURES',
    strikePrice: null,
    expiryDate: '2026-12-31',
    lotSize: 75,
    quantityContracts: '1',
    pricePerUnit: '24000',
    tradeDate: '2026-10-01',
    orderNo: `ORD-${n}`,
    tradeNo: `TRD-${n}-${Math.random().toString(36).slice(2, 8)}`,
    tradingSymbol: 'NIFTY26DECFUT',
    exchange: 'NFO',
    sourceHash: `fo-defects-${n}-${Math.random().toString(36).slice(2)}`,
    sourceAdapter: 'fno.upstox.test',
    sourceAdapterVer: '1',
  } as FnoNormalizedTrade;
}

describe('F&O broker sync count', () => {
  it('counts only trades it inserted, not ones already stored', async () => {
    const scope = await createTestScope('fo-sync-count');
    cleanups.push(scope.cleanup);
    await runAsSystem(() =>
      prisma.brokerCredential.create({
        data: { userId: scope.userId, brokerId: 'upstox', apiKey: 'k', accessToken: 't' },
      }),
    );
    const first = trade(1);
    const second = trade(2);

    syncDay.mockResolvedValueOnce({ trades: [first], margin: null });
    const r1 = await runAsSystem(() =>
      syncFnoBroker({ userId: scope.userId, brokerId: 'upstox', portfolioId: scope.portfolioId }),
    );
    expect(r1.tradesIngested).toBe(1);

    // Second sync returns the day's full trade book again plus one new fill.
    syncDay.mockResolvedValueOnce({ trades: [first, second], margin: null });
    const r2 = await runAsSystem(() =>
      syncFnoBroker({ userId: scope.userId, brokerId: 'upstox', portfolioId: scope.portfolioId }),
    );
    expect(r2.tradesIngested).toBe(1);

    // And a sync with nothing new reports zero.
    syncDay.mockResolvedValueOnce({ trades: [first, second], margin: null });
    const r3 = await runAsSystem(() =>
      syncFnoBroker({ userId: scope.userId, brokerId: 'upstox', portfolioId: scope.portfolioId }),
    );
    expect(r3.tradesIngested).toBe(0);
  });
});

describe('F&O expiry close rejection', () => {
  it('returns the position to OPEN and is not re-flagged by the next scan', async () => {
    const scope = await createTestScope('fo-expiry-reject');
    cleanups.push(scope.cleanup);
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const iso = today.toISOString().slice(0, 10);
    const assetKey = `fno:FODEFECT${scope.portfolioId.slice(-6)}:FUT:000000:${iso}`;

    await runAsSystem(async () => {
      await prisma.transaction.create({
        data: {
          portfolioId: scope.portfolioId,
          assetClass: 'FUTURES',
          transactionType: 'BUY',
          assetName: 'FODEFECT',
          assetKey,
          tradeDate: new Date('2026-09-01'),
          expiryDate: today,
          lotSize: 75,
          quantity: '75',
          price: '100',
          grossAmount: '7500',
          netAmount: '7500',
          exchange: 'NFO',
        },
      });
      await recomputeDerivativePosition(scope.portfolioId, assetKey);
    });

    await runAsSystem(() => scanExpiringPositions());
    const job = await runAsSystem(() =>
      prisma.expiryCloseJob.findFirstOrThrow({ where: { portfolioId: scope.portfolioId, assetKey } }),
    );
    const flagged = await runAsSystem(() =>
      prisma.derivativePosition.findFirstOrThrow({ where: { portfolioId: scope.portfolioId, assetKey } }),
    );
    expect(flagged.status).toBe('PENDING_EXPIRY_APPROVAL');

    await runAsSystem(() => rejectExpiryClose(job.id));
    const afterReject = await runAsSystem(() =>
      prisma.derivativePosition.findFirstOrThrow({ where: { portfolioId: scope.portfolioId, assetKey } }),
    );
    expect(afterReject.status).toBe('OPEN');

    // Same open quantity → the scan leaves the user's decision alone.
    await runAsSystem(() => scanExpiringPositions());
    const jobs = await runAsSystem(() =>
      prisma.expiryCloseJob.count({ where: { portfolioId: scope.portfolioId, assetKey } }),
    );
    expect(jobs).toBe(1);
    const stillOpen = await runAsSystem(() =>
      prisma.derivativePosition.findFirstOrThrow({ where: { portfolioId: scope.portfolioId, assetKey } }),
    );
    expect(stillOpen.status).toBe('OPEN');
  });
});
