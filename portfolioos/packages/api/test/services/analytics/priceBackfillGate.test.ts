import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const fetchHistorical = vi.fn();
vi.mock('../../../src/priceFeeds/yahoo.service.js', async (orig) => ({
  ...(await orig<typeof import('../../../src/priceFeeds/yahoo.service.js')>()),
  fetchHistorical: (...a: unknown[]) => fetchHistorical(...a),
}));

import { createTestScope, prisma, type TestScope } from '../../helpers/db.js';
import { runAsSystem } from '../../../src/lib/requestContext.js';
import {
  ensureHistoricalPricesForPortfolio,
  resetBackfillAttempts,
} from '../../../src/services/analytics/analytics.priceBackfill.js';

/**
 * Analytics reads backfill price history inside the request. A provider that returns nothing for an asset
 * (delisted, renamed, throttled) used to be asked again on every request; these pin the gate.
 */
let scope: TestScope;
beforeEach(async () => {
  resetBackfillAttempts();
  fetchHistorical.mockReset();
  scope = await createTestScope('bfgate');
  await runAsSystem(async () => {
    const s = await prisma.stockMaster.create({
      data: { symbol: `BFG${Date.now().toString(36)}`, name: 'Backfill gate', exchange: 'NSE' },
    });
    await prisma.transaction.create({
      data: {
        portfolioId: scope.portfolioId,
        assetClass: 'EQUITY',
        transactionType: 'BUY',
        stockId: s.id,
        assetKey: `stock:${s.id}`,
        tradeDate: new Date(Date.UTC(2023, 0, 2)),
        quantity: '1',
        price: '100',
        grossAmount: '100',
        netAmount: '100',
        exchange: 'NSE',
      },
    });
  });
});
afterEach(async () => {
  await scope.cleanup();
});

describe('price backfill gate', () => {
  const from = new Date(Date.UTC(2023, 0, 1));
  const run = (d = from) => runAsSystem(() => ensureHistoricalPricesForPortfolio(scope.portfolioId, d));

  it('does not ask the provider again for an asset it returned nothing for', async () => {
    fetchHistorical.mockResolvedValue([]);
    await run();
    await run();
    await run();
    expect(fetchHistorical).toHaveBeenCalledTimes(1);
  });

  it('does not retry a provider that is failing, and the request still completes', async () => {
    fetchHistorical.mockRejectedValue(new Error('429'));
    await expect(run()).resolves.toBeUndefined();
    await run();
    expect(fetchHistorical).toHaveBeenCalledTimes(1);
  });

  it('shares one fetch between concurrent requests', async () => {
    let release: () => void = () => {};
    fetchHistorical.mockImplementation(() => new Promise((r) => (release = () => r([]))));
    const calls = Promise.all([run(), run(), run()]);
    await new Promise((r) => setTimeout(r, 100));
    release();
    await calls;
    expect(fetchHistorical).toHaveBeenCalledTimes(1);
  });

  it('a different window is a different attempt', async () => {
    fetchHistorical.mockResolvedValue([]);
    await run();
    await run(new Date(Date.UTC(2022, 0, 1)));
    expect(fetchHistorical).toHaveBeenCalledTimes(2);
  });
});
