import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import express from 'express';
import type { AddressInfo } from 'node:net';
import { Decimal } from 'decimal.js';
import type { Transaction } from '@prisma/client';

/**
 * Asset valuation defects (audit group "asset valuation"):
 *  1. gold / silver priced at the 24K per-gram rate whatever the holding;
 *  3. withdrawals / maturities on deposit-style classes removing whole entries;
 *  4. transaction lists silently clipped at 200;
 *  5. "Refresh prices" re-pricing every user and the market syncs open to all.
 * (Defect 2 — unpriced classes shown as a −100% loss — is a page fix; its
 * test sits next to the page.)
 */

const GOLD_PER_GRAM = new Decimal('8000');
const SILVER_PER_GRAM = new Decimal('100');
const GOLDBEES_CLOSE = new Decimal('80');

vi.mock('../../src/priceFeeds/commodity.service.js', async (orig) => ({
  ...(await orig<object>()),
  getLatestCommodityQuote: vi.fn(async (c: string) => ({
    price: c === 'GOLD' ? GOLD_PER_GRAM : SILVER_PER_GRAM,
    asOf: new Date('2026-10-22'),
  })),
}));
vi.mock('../../src/priceFeeds/yahoo.service.js', async (orig) => ({
  ...(await orig<object>()),
  getLatestStockQuote: vi.fn(async (stockId: string) =>
    stockId === 'goldbees' ? { price: GOLDBEES_CLOSE, asOf: new Date('2026-10-22') } : null,
  ),
}));

const { routePriceQuote } = await import('../../src/priceFeeds/router.service.js');
const { replayTransactions, computeFdAccruedValue, goldEtfTicker } = await import(
  '../../src/services/holdings/holdingsProjection.js'
);
const { resolvePageSize } = await import('../../src/services/holdings/transaction.service.js');

describe('gold and silver are valued for what they are', () => {
  it('scales physical gold by its karat', async () => {
    const q = await routePriceQuote({ assetClass: 'PHYSICAL_GOLD', assetName: '22K Gold bracelet' });
    expect(q!.price.toString()).toBe(GOLD_PER_GRAM.times(22).div(24).toString());
  });

  it('values unmarked physical gold as 24K', async () => {
    const q = await routePriceQuote({ assetClass: 'PHYSICAL_GOLD', assetName: 'Gold coin' });
    expect(q!.price.toString()).toBe('8000');
  });

  it('scales silver by its grade', async () => {
    const q = await routePriceQuote({ assetClass: 'PHYSICAL_SILVER', assetName: '925 Silver anklet' });
    expect(q!.price.toString()).toBe('92.5');
  });

  it('prices a gold ETF unit at its own market price, not a gram of gold', async () => {
    const q = await routePriceQuote({ assetClass: 'GOLD_ETF', stockId: 'goldbees', assetName: 'GOLDBEES' });
    expect(q!.price.toString()).toBe('80');
  });

  it('leaves an unlinked gold ETF unpriced rather than at the per-gram rate', async () => {
    const q = await routePriceQuote({ assetClass: 'GOLD_ETF', stockId: null, assetName: 'Some gold ETF' });
    expect(q).toBeNull();
  });

  it('finds the ETF ticker in a free-text holding name', () => {
    expect(goldEtfTicker('Nippon India GoldBees')).toBe('GOLDBEES');
    expect(goldEtfTicker('My gold savings')).toBeNull();
  });

  it('prices an SGB unit as one gram of gold', async () => {
    const q = await routePriceQuote({ assetClass: 'GOLD_BOND', assetName: 'SGB 2023 Series I' });
    expect(q!.price.toString()).toBe('8000');
  });
});

let seq = 0;
function tx(p: Partial<Transaction> & Pick<Transaction, 'assetClass' | 'transactionType'>): Transaction {
  seq += 1;
  const amount = (p.netAmount ?? p.price ?? '0').toString();
  return {
    id: `t${seq}`,
    portfolioId: 'p',
    assetName: 'Deposit',
    quantity: '1',
    price: amount,
    netAmount: amount,
    tradeDate: new Date('2025-01-01'),
    createdAt: new Date(2025, 0, 1, 0, 0, seq),
    maturityDate: null,
    interestRate: null,
    interestFrequency: null,
    ...p,
  } as unknown as Transaction;
}

describe('withdrawals and maturities on deposit-style entries', () => {
  it('a partial FD withdrawal reduces the FD by the amount, not by a whole entry', () => {
    const agg = replayTransactions([
      tx({ assetClass: 'FIXED_DEPOSIT', transactionType: 'DEPOSIT', netAmount: '500000' as never }),
      tx({ assetClass: 'FIXED_DEPOSIT', transactionType: 'WITHDRAWAL', netAmount: '10000' as never, tradeDate: new Date('2025-06-01') }),
    ]);
    expect(agg.totalCost.toString()).toBe('490000');
    expect(agg.quantity.greaterThan(0)).toBe(true);
  });

  it('a withdrawal larger than the first entry carries on into the next', () => {
    const agg = replayTransactions([
      tx({ assetClass: 'NPS', transactionType: 'DEPOSIT', netAmount: '50000' as never }),
      tx({ assetClass: 'NPS', transactionType: 'DEPOSIT', netAmount: '50000' as never, tradeDate: new Date('2025-02-01') }),
      tx({ assetClass: 'NPS', transactionType: 'WITHDRAWAL', netAmount: '60000' as never, tradeDate: new Date('2025-06-01') }),
    ]);
    expect(agg.totalCost.toString()).toBe('40000');
  });

  it('an RD maturity payout closes the whole RD, not one installment', () => {
    const installments = Array.from({ length: 12 }, (_, i) =>
      tx({ assetClass: 'RECURRING_DEPOSIT', transactionType: 'DEPOSIT', netAmount: '5000' as never, tradeDate: new Date(Date.UTC(2024, i, 5)) }),
    );
    const agg = replayTransactions([
      ...installments,
      tx({ assetClass: 'RECURRING_DEPOSIT', transactionType: 'MATURITY', netAmount: '63000' as never, tradeDate: new Date('2025-01-05') }),
    ]);
    expect(agg.quantity.isZero()).toBe(true);
    expect(agg.realisedPnL.toString()).toBe('3000');
  });

  it('an FD maturity closes the deposit that matured, not a younger one under the same name', () => {
    const agg = replayTransactions([
      tx({ assetClass: 'FIXED_DEPOSIT', transactionType: 'DEPOSIT', netAmount: '100000' as never, tradeDate: new Date('2024-01-01'), maturityDate: new Date('2025-01-01') }),
      tx({ assetClass: 'FIXED_DEPOSIT', transactionType: 'DEPOSIT', netAmount: '200000' as never, tradeDate: new Date('2024-06-01'), maturityDate: new Date('2027-06-01') }),
      tx({ assetClass: 'FIXED_DEPOSIT', transactionType: 'MATURITY', netAmount: '107000' as never, tradeDate: new Date('2025-01-01') }),
    ]);
    expect(agg.totalCost.toString()).toBe('200000');
    expect(agg.realisedPnL.toString()).toBe('7000');
  });

  it('stocks still sell unit by unit', () => {
    const agg = replayTransactions([
      tx({ assetClass: 'EQUITY', transactionType: 'BUY', quantity: '10' as never, netAmount: '1000' as never }),
      tx({ assetClass: 'EQUITY', transactionType: 'SELL', quantity: '4' as never, netAmount: '600' as never, tradeDate: new Date('2025-02-01') }),
    ]);
    expect(agg.quantity.toString()).toBe('6');
    expect(agg.totalCost.toString()).toBe('600');
  });

  it('a drawn-down FD accrues interest only on what is left in it', () => {
    const start = new Date(Date.now() - 365.25 * 24 * 3600 * 1000);
    const full = computeFdAccruedValue([
      tx({ assetClass: 'FIXED_DEPOSIT', transactionType: 'DEPOSIT', netAmount: '100000' as never, tradeDate: start, interestRate: '0' as never, interestFrequency: 'ANNUAL' }),
    ]);
    const drawn = computeFdAccruedValue([
      tx({ assetClass: 'FIXED_DEPOSIT', transactionType: 'DEPOSIT', netAmount: '100000' as never, tradeDate: start, interestRate: '0' as never, interestFrequency: 'ANNUAL' }),
      tx({ assetClass: 'FIXED_DEPOSIT', transactionType: 'WITHDRAWAL', netAmount: '40000' as never, tradeDate: new Date() }),
    ]);
    expect(full!.toString()).toBe('100000');
    expect(drawn!.toString()).toBe('60000');
  });
});

describe('transaction list page size', () => {
  it('honours a request above 200, up to 1000', () => {
    expect(resolvePageSize(500)).toBe(500);
    expect(resolvePageSize(5000)).toBe(1000);
    expect(resolvePageSize(undefined)).toBe(50);
  });
});

describe('market-wide price syncs are admin tools', () => {
  let server: ReturnType<express.Express['listen']>;
  let base = '';
  beforeEach(async () => {
    const { assetsRouter } = await import('../../src/routes/assets.routes.js');
    const { errorHandler } = await import('../../src/middleware/errorHandler.js');
    const app = express();
    app.use(express.json());
    app.use('/api/assets', assetsRouter);
    app.use(errorHandler);
    server = app.listen(0);
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterEach(() => server.close());

  async function post(path: string, role: 'INVESTOR' | 'ADMIN') {
    const { signAccessToken } = await import('../../src/services/auth/jwt.service.js');
    const token = signAccessToken({ sub: `sync-test-${role}`, email: 's@test.local', role, plan: 'FREE' }).token;
    return fetch(`${base}${path}`, { method: 'POST', headers: { authorization: `Bearer ${token}` } });
  }

  for (const path of ['/api/assets/sync-prices', '/api/assets/sync-all', '/api/assets/sync-commodities', '/api/assets/amfi/sync']) {
    it(`${path} refuses a signed-in investor`, async () => {
      expect((await post(path, 'INVESTOR')).status).toBe(403);
    });
  }

  it('refuses an admin who has not signed in with two-factor', async () => {
    const res = await post('/api/assets/sync-prices', 'ADMIN');
    expect(res.status).toBe(403);
    expect(JSON.stringify(await res.json())).toContain('TWO_FACTOR_REQUIRED');
  });
});

describe("a user's Refresh prices touches only that user's holdings", () => {
  it('re-prices the caller and leaves another user alone', async () => {
    const { createTestScope, prisma } = await import('../helpers/db.js');
    const { runAsSystem } = await import('../../src/lib/requestContext.js');
    const { refreshUserProjectionPrices } = await import('../../src/services/holdings/holdingsProjection.js');
    const a = await createTestScope('refresh-a');
    const b = await createTestScope('refresh-b');
    try {
      const old = new Date('2020-01-01T00:00:00Z');
      await runAsSystem(async () => {
        for (const s of [a, b]) {
          await prisma.transaction.create({
            data: {
              portfolioId: s.portfolioId, assetClass: 'FIXED_DEPOSIT', transactionType: 'DEPOSIT',
              assetName: 'Bank FD', assetKey: 'name:bank-fd', tradeDate: new Date('2025-01-01'),
              quantity: '1', price: '100000', grossAmount: '100000', netAmount: '100000',
            },
          });
          await prisma.holdingProjection.create({
            data: {
              portfolioId: s.portfolioId, assetKey: 'name:bank-fd', assetClass: 'FIXED_DEPOSIT',
              assetName: 'Bank FD', quantity: '1', avgCostPrice: '100000', totalCost: '100000',
              sourceTxCount: 1, computedAt: old,
            },
          });
        }
      });

      await a.runAs(() => refreshUserProjectionPrices(a.userId));

      const [rowA, rowB] = await runAsSystem(() =>
        Promise.all([a, b].map((s) => prisma.holdingProjection.findFirstOrThrow({ where: { portfolioId: s.portfolioId } }))),
      );
      expect(rowA.computedAt.getTime()).toBeGreaterThan(old.getTime());
      expect(rowB.computedAt.getTime()).toBe(old.getTime());
    } finally {
      await a.cleanup();
      await b.cleanup();
    }
  });
});
