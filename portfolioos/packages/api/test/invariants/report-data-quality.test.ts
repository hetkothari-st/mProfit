import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTransaction } from '../../src/services/holdings/transaction.service.js';
import { recomputeForPortfolio } from '../../src/services/holdings/holdingsProjection.js';
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
    // Close 100 two days ago, 1000 yesterday: a 10x move with no split.
    const jumpy = (await seedStockMaster(dirty, { name: 'DQ Jumpy' })).symbol;
    const twoDaysAgo = dateOnly(new Date(Date.now() - 2 * DAY));
    const yesterday = dateOnly(new Date(Date.now() - DAY));
    await runAsSystem(async () => {
      const stock = await prisma.stockMaster.findUniqueOrThrow({ where: { symbol: jumpy } });
      await prisma.stockPrice.createMany({
        data: [
          { stockId: stock.id, date: twoDaysAgo, open: '100', high: '100', low: '100', close: '100' },
          { stockId: stock.id, date: yesterday, open: '1000', high: '1000', low: '1000', close: '1000' },
        ],
      });
    });

    await dirty.runAs(async () => {
      // Bought at 300 on a day the market closed at 100 — a typo, three times over.
      await createTransaction(dirty.userId, {
        portfolioId: dirty.portfolioId,
        transactionType: 'BUY',
        assetClass: 'EQUITY',
        stockSymbol: jumpy,
        exchange: 'NSE',
        tradeDate: twoDaysAgo.toISOString().slice(0, 10),
        quantity: '1',
        price: '300',
      });
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
      // A second unbought sale whose purchase IS in the app — an email BUY
      // awaiting review. The banner should point at it, not at a blank form.
      await prisma.transaction.create({
        data: {
          ...raw,
          assetClass: 'EQUITY',
          transactionType: 'SELL',
          assetName: 'DQ Pending',
          isin: 'INE000PEND01',
          assetKey: 'isin:INE000PEND01',
          tradeDate: new Date('2024-05-02'),
          quantity: '3',
          price: '10',
          grossAmount: '30',
          netAmount: '30',
        },
      });
      await prisma.canonicalEvent.create({
        data: {
          userId: dirty.userId,
          sourceAdapter: 'gmail.generic.v1',
          sourceAdapterVer: '1',
          sourceRef: 'msg-buy',
          sourceHash: `dq-pending-${dirty.userId}`,
          eventType: 'BUY',
          eventDate: new Date('2024-04-01'),
          instrumentIsin: 'INE000PEND01',
          status: 'PENDING_REVIEW',
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
      // One failure from the user's own import, one from a reference-data job
      // that happens to be attributed to them (as admin): only the first counts.
      await prisma.ingestionFailure.create({
        data: { userId: dirty.userId, sourceAdapter: 'gmail.generic.v1', adapterVersion: '1', sourceRef: 'msg-1', errorMessage: 'unreadable' },
      });
      await prisma.ingestionFailure.create({
        data: { userId: dirty.userId, sourceAdapter: 'mf.metrics', adapterVersion: '1', sourceRef: 'scheme-1', errorMessage: 'no nav' },
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
        [
          'EVENTS_AWAITING_REVIEW',
          'IMPORTS_NOT_FINISHED',
          'MISSING_PRICE',
          'OVERSOLD',
          'STALE_PRICE',
          'STATEMENT_MISMATCH',
          'SUSPICIOUS_PRICE',
          'TRADE_PRICE_OFF_MARKET',
          'UNRESOLVED_FAILURES',
        ].sort(),
      );
      expect(byCode.get('SUSPICIOUS_PRICE')!.items.map((i) => i.label)).toEqual(['DQ Jumpy']);
      expect(byCode.get('TRADE_PRICE_OFF_MARKET')!.items).toHaveLength(1);
      expect(byCode.get('TRADE_PRICE_OFF_MARKET')!.items[0]!.detail).toMatch(/^buy on .* at 300; market price that day 100$/);
      expect(byCode.get('UNRESOLVED_FAILURES')!.count).toBe(1);
      expect(byCode.get('UNRESOLVED_FAILURES')!.items).toEqual([{ label: 'gmail.generic.v1', detail: '1 unresolved' }]);
      const oversold = byCode.get('OVERSOLD')!;
      const ghost = oversold.items.find((i) => i.label === 'DQ Ghost')!;
      expect(ghost.action).toEqual({
        kind: 'ADD_PURCHASE',
        portfolioId: dirty.portfolioId,
        assetClass: 'EQUITY',
        assetName: 'DQ Ghost',
        symbol: null,
        isin: null,
        quantity: '7',
        onOrBefore: '2024-05-01',
      });
      const pending = oversold.items.find((i) => i.label === 'DQ Pending')!;
      expect(pending.action).toEqual({ kind: 'REVIEW_EVENTS', count: 1 });
      expect(byCode.get('STALE_PRICE')!.count).toBe(1);
      // The unpriced stock and the fund (no NAV loaded).
      expect(byCode.get('MISSING_PRICE')!.count).toBe(2);
      expect(byCode.get('STATEMENT_MISMATCH')!.items[0]!.detail).toBe(
        'statement (2024-03-31): 150 units, transactions: 100 units',
      );
      expect(q.dataAsOf.lastTransactionDate).toBe(new Date(Date.now() - 2 * DAY).toISOString().slice(0, 10));
    }), 120_000);

  it('notices stored holdings that no longer match the transactions', () =>
    dirty.runAs(async () => {
      const h = await prisma.holdingProjection.findFirstOrThrow({ where: { portfolioId: dirty.portfolioId } });
      await prisma.holdingProjection.update({ where: { id: h.id }, data: { quantity: '1234' } });
      const q = await checkReportDataQuality(dirty.userId, dirty.portfolioId);
      const drift = q.issues.find((i) => i.code === 'HOLDINGS_OUT_OF_SYNC');
      expect(drift?.count).toBe(1);
      expect(drift?.items[0]?.detail).toMatch(/saved holding says 1234$/);
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
