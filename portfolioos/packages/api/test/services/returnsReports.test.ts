import { describe, it, expect, afterEach } from 'vitest';
import { Decimal } from 'decimal.js';
import type { AssetClass, Transaction } from '@prisma/client';
import { createTestScope, prisma } from '../helpers/db.js';
import { runAsSystem } from '../../src/lib/requestContext.js';
import { recomputeForPortfolio } from '../../src/services/holdingsProjection.js';
import {
  computeHoldingXirrs,
  computePortfolioXirr,
  computeRollingXirr,
  modifiedDietzAnnualized,
} from '../../src/services/xirr.service.js';
import { buildPerformanceLayout } from '../../src/services/reportBuilder/special/index.js';

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()!();
});

const DAY = 86_400_000;
const daysAgo = (n: number) => {
  const d = new Date(Date.now() - n * DAY);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
};

type TxInput = {
  type: string;
  date: Date;
  name: string;
  net: string;
  qty?: string;
  assetClass?: AssetClass;
  assetKey?: string;
};

async function scopeWith(label: string, txs: TxInput[], values: Record<string, string> = {}) {
  const scope = await createTestScope(label);
  cleanups.push(scope.cleanup);
  await runAsSystem(async () => {
    for (const t of txs) {
      await prisma.transaction.create({
        data: {
          portfolioId: scope.portfolioId,
          assetClass: t.assetClass ?? 'REAL_ESTATE',
          transactionType: t.type as never,
          assetName: t.name,
          assetKey: t.assetKey ?? `name:${t.name}`,
          tradeDate: t.date,
          quantity: t.qty ?? '1',
          price: t.net,
          grossAmount: t.net,
          netAmount: t.net,
        },
      });
    }
    await recomputeForPortfolio(scope.portfolioId);
    // Current market values, as the price refresh would set them.
    for (const [name, value] of Object.entries(values)) {
      await prisma.holdingProjection.updateMany({
        where: { portfolioId: scope.portfolioId, assetKey: `name:${name}` },
        data: { currentValue: value },
      });
    }
  });
  return scope;
}

describe('rolling XIRR', () => {
  it('counts the holdings already owned at the start of the window', async () => {
    const scope = await scopeWith(
      'rolling',
      [{ type: 'BUY', date: daysAgo(730), name: 'Flat', net: '100000' }],
      { Flat: '121000' },
    );
    const r = await runAsSystem(() => computeRollingXirr(scope.portfolioId, 1));
    // Opening value (at cost, no price history) 1,00,000 → 1,21,000 a year later.
    expect(r.totalInvested).toBe('100000.0000');
    expect(r.xirr).not.toBeNull();
    expect(r.xirr!).toBeCloseTo(0.21, 2);
  });
});

describe('portfolio XIRR', () => {
  it('ignores futures notional and values F&O by its P&L', async () => {
    const scope = await scopeWith(
      'fno-xirr',
      [
        { type: 'BUY', date: daysAgo(366), name: 'Flat', net: '100000' },
        {
          type: 'BUY', date: daysAgo(30), name: 'NIFTY FUT', net: '1200000', qty: '75',
          assetClass: 'FUTURES', assetKey: 'fno:NIFTY:FUT:000000:2099-12-31',
        },
      ],
      { Flat: '110000' },
    );
    const r = await runAsSystem(() => computePortfolioXirr(scope.portfolioId));
    expect(r.totalInvested).toBe('100000.0000');
    expect(r.xirr!).toBeCloseTo(0.1, 2);
  });
});

describe('performance report', () => {
  it('absolute return includes sale proceeds', async () => {
    const scope = await scopeWith('performance', [
      { type: 'BUY', date: daysAgo(400), name: 'Flat', net: '100000' },
      { type: 'SELL', date: daysAgo(35), name: 'Flat', net: '150000' },
    ]);
    const layout = await runAsSystem(() => buildPerformanceLayout(scope.userId));
    const row = layout.sections[0]!.groups[0]!.rows[0]!;
    expect(new Decimal(String(row.cells['absRet'])).toString()).toBe('50000');
    expect(row.cells['absPct']).toBe('50.00');
  });
});

describe('XIRR building blocks', () => {
  const tx = (over: Partial<Transaction>): Transaction =>
    ({
      id: Math.random().toString(36),
      portfolioId: 'p',
      assetClass: 'FOREIGN_EQUITY',
      transactionType: 'BUY',
      assetKey: 'isin:US0378331005',
      tradeDate: daysAgo(365),
      quantity: new Decimal(10),
      netAmount: new Decimal(1000),
      currency: 'USD',
      inrEquivalent: new Decimal(83000),
      fxRateAtTrade: null,
      ...over,
    }) as unknown as Transaction;

  it('uses INR amounts and adds no flow for a reinvested dividend', () => {
    const results = computeHoldingXirrs(
      [
        tx({}),
        tx({ transactionType: 'DIVIDEND_REINVEST', tradeDate: daysAgo(100), netAmount: new Decimal(50), inrEquivalent: new Decimal(4150) }),
      ],
      new Map([['isin:US0378331005', new Decimal(90000)]]),
    );
    const r = results.get('isin:US0378331005')!;
    expect(r.totalInvested).toBe('83000.0000');
    expect(r.xirr!).toBeCloseTo(90000 / 83000 - 1, 2);
  });

  it('time-weighted return runs to the valuation date, not the last flow', () => {
    const start = daysAgo(Math.round(3 * 365.25));
    const r = modifiedDietzAnnualized(
      [{ date: start, amount: new Decimal(-100000) }],
      new Decimal(120000),
      new Decimal(0),
      { endDate: new Date() },
    );
    expect(r!).toBeCloseTo(Math.pow(1.2, 1 / 3) - 1, 2);
  });
});
