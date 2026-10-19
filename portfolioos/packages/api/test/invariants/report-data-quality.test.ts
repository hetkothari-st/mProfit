import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTransaction } from '../../src/services/transaction.service.js';
import { recomputeForPortfolio } from '../../src/services/holdingsProjection.js';
import { checkReportDataQuality } from '../../src/services/integrity/reportDataQuality.service.js';
import { runAsSystem } from '../../src/lib/requestContext.js';
import { createTestScope, seedStockMaster, prisma, type TestScope } from '../helpers/db.js';

/**
 * INVARIANT: a report never presents figures over a known gap silently. Every
 * class of gap — a sale with no purchase, a holding with no price or an old
 * one, a statement the transactions disagree with, an import that has not
 * finished — is reported by the data-quality check, and a portfolio with none
 * of them is reported clean.
 */

const DAY = 24 * 60 * 60 * 1000;
const dateOnly = (d: Date) => new Date(d.toISOString().slice(0, 10));
const MF_ISIN = 'INF000TEST01';

async function stockWithPrice(scope: TestScope, name: string, priceDate: Date | null): Promise<string> {
  const { symbol } = await seedStockMaster(scope, { name });
  if (priceDate) {
    await runAsSystem(async () => {
      const stock = await prisma.stockMaster.findUniqueOrThrow({ where: { symbol } });
      await prisma.stockPrice.create({
        data: { stockId: stock.id, date: dateOnly(priceDate), open: '100', high: '100', low: '100', close: '100' },
      });
    });
  }
  return symbol;
}

async function buy(scope: TestScope, symbol: string, qty: string) {
  await createTransaction(scope.userId, {
    portfolioId: scope.portfolioId,
    transactionType: 'BUY',
    assetClass: 'EQUITY',
    stockSymbol: symbol,
    exchange: 'NSE',
    tradeDate: '2024-01-10',
    quantity: qty,
    price: '90',
  });
}

describe('invariant: report data-quality check', () => {
  let dirty: TestScope;
  let clean: TestScope;

  beforeAll(async () => {
    dirty = await createTestScope('dq-dirty');
    clean = await createTestScope('dq-clean');

    const fresh = await stockWithPrice(dirty, 'DQ Fresh', new Date());
    const old = await stockWithPrice(dirty, 'DQ Old Price', new Date(Date.now() - 30 * DAY));
    const unpriced = await stockWithPrice(dirty, 'DQ No Price', null);

    await dirty.runAs(async () => {
      await buy(dirty, fresh, '10');
      await buy(dirty, old, '5');
      await buy(dirty, unpriced, '2');
      const raw = {
        portfolioId: dirty.portfolioId,
        settlementDate: null,
        price: '0',
        grossAmount: '0',
      };
      // A sale with no purchase behind it (written directly, as a broken
      // import would).
      await prisma.transaction.create({
        data: {
          ...raw,
          assetClass: 'EQUITY',
          transactionType: 'SELL',
          assetName: 'DQ Ghost',
          assetKey: 'name:dq-ghost',
          tradeDate: new Date('2024-05-01'),
          quantity: '7',
          price: '50',
          grossAmount: '350',
          netAmount: '350',
        },
      });
      // 100 units of a fund, where the statement below says 150.
      await prisma.transaction.create({
        data: {
          ...raw,
          assetClass: 'MUTUAL_FUND',
          transactionType: 'BUY',
          assetName: 'DQ Fund',
          isin: MF_ISIN,
          assetKey: `isin:${MF_ISIN}`,
          tradeDate: new Date('2024-02-01'),
          quantity: '100',
          price: '10',
          grossAmount: '1000',
          netAmount: '1000',
        },
      });
      await recomputeForPortfolio(dirty.portfolioId);
      await prisma.importJob.create({
        data: {
          userId: dirty.userId,
          portfolioId: dirty.portfolioId,
          type: 'MF_CAS_PDF',
          status: 'COMPLETED',
          fileName: 'cas-mar-2024.pdf',
          filePath: '/tmp/none',
          completedAt: new Date(),
          statementSnapshot: {
            asOf: '2024-03-31',
            holdings: [{ isin: MF_ISIN, folio: '1', schemeName: 'DQ Fund', units: '150' }],
          },
        },
      });
      await prisma.importJob.create({
        data: {
          userId: dirty.userId,
          type: 'MF_CAS_PDF',
          status: 'NEEDS_PASSWORD',
          fileName: 'locked.pdf',
          filePath: '/tmp/none',
        },
      });
    });

    const cleanStock = await stockWithPrice(clean, 'DQ Clean', new Date());
    await clean.runAs(() => buy(clean, cleanStock, '3'));
  }, 180_000);

  afterAll(async () => {
    await dirty.cleanup();
    await clean.cleanup();
  });

  it('reports every gap in a portfolio that has them', () =>
    dirty.runAs(async () => {
      const q = await checkReportDataQuality(dirty.userId);
      const byCode = new Map(q.issues.map((i) => [i.code, i]));
      expect(q.ok).toBe(false);
      expect([...byCode.keys()].sort()).toEqual(
        ['IMPORTS_NOT_FINISHED', 'MISSING_PRICE', 'OVERSOLD', 'STALE_PRICE', 'STATEMENT_MISMATCH'].sort(),
      );
      expect(byCode.get('OVERSOLD')!.items[0]!.label).toBe('DQ Ghost');
      expect(byCode.get('STALE_PRICE')!.count).toBe(1);
      // The unpriced stock and the fund (no NAV loaded).
      expect(byCode.get('MISSING_PRICE')!.count).toBe(2);
      expect(byCode.get('STATEMENT_MISMATCH')!.items[0]!.detail).toBe(
        'statement (2024-03-31): 150 units, transactions: 100 units',
      );
      expect(q.dataAsOf.lastTransactionDate).toBe('2024-05-01');
    }), 120_000);

  it('notices stored holdings that no longer match the transactions', () =>
    dirty.runAs(async () => {
      const h = await prisma.holdingProjection.findFirstOrThrow({ where: { portfolioId: dirty.portfolioId } });
      await prisma.holdingProjection.update({ where: { id: h.id }, data: { quantity: '1234' } });
      const q = await checkReportDataQuality(dirty.userId, dirty.portfolioId);
      expect(q.issues.find((i) => i.code === 'HOLDINGS_OUT_OF_SYNC')?.count).toBe(1);
      await recomputeForPortfolio(dirty.portfolioId);
    }), 120_000);

  it('a complete, priced portfolio is clean', () =>
    clean.runAs(async () => {
      const q = await checkReportDataQuality(clean.userId, clean.portfolioId);
      expect(q.issues).toEqual([]);
      expect(q.ok).toBe(true);
      expect(q.dataAsOf.newestPriceDate).toBe(new Date().toISOString().slice(0, 10));
    }), 60_000);
});
