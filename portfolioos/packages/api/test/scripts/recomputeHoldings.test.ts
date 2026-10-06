import { describe, it, expect, afterEach } from 'vitest';
import { createTestScope, prisma } from '../helpers/db.js';
import { runAsSystem } from '../../src/lib/requestContext.js';
import { recomputeHoldings } from '../../src/scripts/recomputeHoldings.js';

/**
 * The boot hook that rebuilds derived holdings after a release changes how
 * cost is computed. What matters: it repairs a stale row, it runs under the
 * system identity (row-level security would otherwise hide every portfolio
 * and the pass would silently do nothing), and a second boot is a no-op.
 */

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()!();
});

const MARKER = 'holdings.recompute.2026-09-fifo-book-cost';

async function seeded() {
  const scope = await createTestScope('recompute-hook');
  cleanups.push(async () => {
    await runAsSystem(() => prisma.appSetting.deleteMany({ where: { key: MARKER } }));
    await scope.cleanup();
  });
  await runAsSystem(async () => {
    await prisma.appSetting.deleteMany({ where: { key: MARKER } });
    for (const [date, type, qty, price] of [
      ['2024-05-01', 'BUY', '100', '100'],
      ['2024-09-01', 'BUY', '50', '120'],
      ['2025-01-05', 'SELL', '60', '150'],
    ] as const) {
      await prisma.transaction.create({
        data: {
          portfolioId: scope.portfolioId,
          assetClass: 'EQUITY',
          transactionType: type,
          assetName: 'Rebuilt Ltd',
          assetKey: 'name:Rebuilt Ltd',
          tradeDate: new Date(date),
          quantity: qty,
          price,
          grossAmount: (Number(qty) * Number(price)).toString(),
          netAmount: (Number(qty) * Number(price)).toString(),
        },
      });
    }
    // A holding left behind by an earlier release: wrong cost, never rewritten
    // because nothing touched this asset since.
    await prisma.holdingProjection.create({
      data: {
        portfolioId: scope.portfolioId,
        assetKey: 'name:Rebuilt Ltd',
        assetClass: 'EQUITY',
        assetName: 'Rebuilt Ltd',
        quantity: '90',
        avgCostPrice: '108',
        totalCost: '9720',
        sourceTxCount: 3,
      },
    });
  });
  return scope;
}

const holding = (portfolioId: string) =>
  runAsSystem(() =>
    prisma.holdingProjection.findFirstOrThrow({ where: { portfolioId, assetKey: 'name:Rebuilt Ltd' } }),
  );

describe('holdings recompute hook', () => {
  it('rebuilds a stale holding, then skips on the next boot', async () => {
    const scope = await seeded();

    const first = await recomputeHoldings();
    expect(first.skipped).toBe(false);
    expect(first.assets).toBeGreaterThan(0);

    // FIFO: the 60 sold come out of the first lot, leaving 40 at 100 and 50 at 120.
    const rebuilt = await holding(scope.portfolioId);
    expect(rebuilt.quantity.toString()).toBe('90');
    expect(rebuilt.totalCost.toString()).toBe('10000');

    // A second boot must not repeat the pass.
    const second = await recomputeHoldings();
    expect(second).toMatchObject({ skipped: true, assets: 0 });

    // …and it records what it did, for whoever asks later.
    const marker = await runAsSystem(() => prisma.appSetting.findUniqueOrThrow({ where: { key: MARKER } }));
    expect(marker.value).toMatchObject({ portfolios: expect.any(Number), assets: expect.any(Number) });
  });

  it('runs again when forced, and lands on the same figures', async () => {
    const scope = await seeded();
    await recomputeHoldings();
    const once = await holding(scope.portfolioId);

    const forced = await recomputeHoldings({ force: true });
    expect(forced.skipped).toBe(false);

    const twice = await holding(scope.portfolioId);
    expect(twice.totalCost.toString()).toBe(once.totalCost.toString());
    expect(twice.quantity.toString()).toBe(once.quantity.toString());
  });
});
