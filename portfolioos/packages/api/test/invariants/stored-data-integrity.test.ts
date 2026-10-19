import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTransaction } from '../../src/services/holdings/transaction.service.js';
import { persistCapitalGainsForPortfolio } from '../../src/services/tax/capitalGains.service.js';
import { checkPortfolioIntegrity } from '../../src/services/integrity/storedDataIntegrity.service.js';
import { runDataIntegrityJob } from '../../src/jobs/dataIntegrityJob.js';
import { runAsSystem } from '../../src/lib/requestContext.js';
import { createTestScope, seedStockMaster, prisma, type TestScope } from '../helpers/db.js';

/**
 * INVARIANT: stored HoldingProjection and CapitalGain rows always follow from
 * the transactions. If a write path ever leaves them behind, the integrity
 * check finds it, and a repair (on demand, or the nightly job) rebuilds them
 * from the transactions.
 */
describe('invariant: stored holdings and gains match transactions', () => {
  let scope: TestScope;
  let symbol: string;

  beforeAll(async () => {
    scope = await createTestScope('stored-integrity');
    symbol = (await seedStockMaster(scope, { name: 'Integrity Test Stock' })).symbol;
    await scope.runAs(async () => {
      const base = { portfolioId: scope.portfolioId, assetClass: 'EQUITY' as const, stockSymbol: symbol, exchange: 'NSE' };
      await createTransaction(scope.userId, { ...base, transactionType: 'BUY', tradeDate: '2023-01-05', quantity: '10', price: '100' });
      await createTransaction(scope.userId, { ...base, transactionType: 'BUY', tradeDate: '2023-03-05', quantity: '10', price: '110' });
      await createTransaction(scope.userId, { ...base, transactionType: 'SELL', tradeDate: '2024-06-10', quantity: '15', price: '150' });
      await persistCapitalGainsForPortfolio(scope.portfolioId);
    });
  }, 120_000);

  afterAll(async () => {
    await scope.cleanup();
  });

  it('a freshly written portfolio is clean', () =>
    scope.runAs(async () => {
      const r = await checkPortfolioIntegrity(scope.portfolioId, { repair: false });
      expect(r.holdingDrifts).toEqual([]);
      expect(r.gainDrift).toEqual({ missing: 0, unexpected: 0 });
    }), 60_000);

  it('finds corrupted holdings and gains, and repair rebuilds them', () =>
    scope.runAs(async () => {
      const holding = await prisma.holdingProjection.findFirstOrThrow({ where: { portfolioId: scope.portfolioId } });
      // Someone wrote the holding directly, and a gain row went missing.
      await prisma.holdingProjection.update({ where: { id: holding.id }, data: { quantity: '999' } });
      const gain = await prisma.capitalGain.findFirstOrThrow({ where: { portfolioId: scope.portfolioId } });
      await prisma.capitalGain.delete({ where: { id: gain.id } });

      const found = await checkPortfolioIntegrity(scope.portfolioId, { repair: false });
      expect(found.holdingDrifts.map((d) => d.kind)).toEqual(['QUANTITY']);
      expect(found.holdingDrifts[0]!.expected!.quantity).toBe('5');
      expect(found.gainDrift.missing).toBe(1);
      expect(found.repaired).toBe(false);

      const fixed = await checkPortfolioIntegrity(scope.portfolioId, { repair: true });
      expect(fixed.repaired).toBe(true);

      const after = await checkPortfolioIntegrity(scope.portfolioId, { repair: false });
      expect(after.holdingDrifts).toEqual([]);
      expect(after.gainDrift).toEqual({ missing: 0, unexpected: 0 });
      const rebuilt = await prisma.holdingProjection.findFirstOrThrow({ where: { portfolioId: scope.portfolioId } });
      expect(rebuilt.quantity.toString()).toBe('5');
    }), 120_000);

  it('the nightly job repairs drift and logs the run', async () => {
    await scope.runAs(async () => {
      const holding = await prisma.holdingProjection.findFirstOrThrow({ where: { portfolioId: scope.portfolioId } });
      await prisma.holdingProjection.update({ where: { id: holding.id }, data: { totalCost: '1' } });
    });

    const summary = await runDataIntegrityJob();
    expect(summary).not.toBeNull();
    const run = await runAsSystem(() => prisma.dataIntegrityRun.findUniqueOrThrow({ where: { id: summary!.runId } }));
    expect(run.finishedAt).not.toBeNull();
    const mine = (run.details as Array<{ portfolioId: string; repaired?: boolean }>).find(
      (d) => d.portfolioId === scope.portfolioId,
    );
    expect(mine?.repaired).toBe(true);

    await scope.runAs(async () => {
      const r = await checkPortfolioIntegrity(scope.portfolioId, { repair: false });
      expect(r.holdingDrifts).toEqual([]);
    });
    await runAsSystem(() => prisma.dataIntegrityRun.delete({ where: { id: run.id } }));
  }, 300_000);
});
