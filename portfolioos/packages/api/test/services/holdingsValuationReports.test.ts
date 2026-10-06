import { describe, it, expect, afterEach } from 'vitest';
import { Decimal } from 'decimal.js';
import type { AssetClass } from '@prisma/client';
import { createTestScope, prisma } from '../helpers/db.js';
import { runAsSystem } from '../../src/lib/requestContext.js';
import { holdingsAsOf } from '../../src/services/holdingsAsOf.service.js';
import { historicalValuation } from '../../src/services/reports.service.js';
import { dematHoldingReport } from '../../src/services/specialReports.service.js';
import {
  buildScriptLedgerLayout,
  buildScriptwiseQtywiseLayout,
} from '../../src/services/reportBuilder/special/index.js';

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()!();
});

type TxInput = {
  type: string;
  date: string;
  name: string;
  qty: string;
  price: string;
  net?: string;
  assetClass?: AssetClass;
  currency?: string;
  inrEquivalent?: string;
};

async function scopeWith(label: string, txs: TxInput[]) {
  const scope = await createTestScope(label);
  cleanups.push(scope.cleanup);
  await runAsSystem(async () => {
    for (const t of txs) {
      const net = t.net ?? new Decimal(t.qty).times(t.price).toString();
      await prisma.transaction.create({
        data: {
          portfolioId: scope.portfolioId,
          assetClass: t.assetClass ?? 'EQUITY',
          transactionType: t.type as never,
          assetName: t.name,
          assetKey: `name:${t.name}`,
          tradeDate: new Date(t.date),
          quantity: t.qty,
          price: t.price,
          grossAmount: net,
          netAmount: net,
          ...(t.currency ? { currency: t.currency } : {}),
          ...(t.inrEquivalent ? { inrEquivalent: t.inrEquivalent } : {}),
        },
      });
    }
  });
  return scope;
}

const money = (v: unknown) => new Decimal(String(v || '0'));

describe('as-of holdings', () => {
  it('shows what was held on a past date, not today', async () => {
    const scope = await scopeWith('asof', [
      { type: 'BUY', date: '2025-01-10', name: 'X', qty: '100', price: '10' },
      { type: 'SELL', date: '2025-06-10', name: 'X', qty: '100', price: '12' },
      { type: 'BUY', date: '2025-08-10', name: 'Y', qty: '50', price: '20' },
    ]);
    const rows = await runAsSystem(() => holdingsAsOf({ userId: scope.userId }, new Date('2025-04-01')));
    expect(rows.map((r) => r.assetName)).toEqual(['X']);
    expect(rows[0]!.quantity.toString()).toBe('100');
    expect(rows[0]!.totalCost.toString()).toBe('1000');
  });
});

describe('historical valuation', () => {
  it('keeps distinct unlisted assets apart and costs foreign trades in INR', async () => {
    const scope = await scopeWith('histval', [
      { type: 'BUY', date: '2025-01-05', name: 'Flat A', qty: '1', price: '5000000', assetClass: 'REAL_ESTATE' },
      { type: 'BUY', date: '2025-01-06', name: 'Flat B', qty: '1', price: '10000000', assetClass: 'REAL_ESTATE' },
      { type: 'SELL', date: '2025-02-10', name: 'Flat A', qty: '1', price: '6000000', assetClass: 'REAL_ESTATE' },
      {
        type: 'BUY', date: '2025-01-07', name: 'AAPL', qty: '10', price: '180', net: '1800',
        assetClass: 'FOREIGN_EQUITY', currency: 'USD', inrEquivalent: '150000',
      },
    ]);
    const { points } = await runAsSystem(() => historicalValuation(scope.portfolioId));
    const feb = points.find((p) => p.date.toISOString().startsWith('2025-02-28'))!;
    expect(feb.cost).toBe('10150000');
    expect(feb.value).toBe('10150000');
    expect(feb.holdings).toBe(2);
  });
});

describe('script ledger', () => {
  it('tracks splits, reduces closing cost on sales, and balances', async () => {
    const scope = await scopeWith('ledger', [
      { type: 'BUY', date: '2025-01-10', name: 'S', qty: '10', price: '100' },
      { type: 'SPLIT', date: '2025-02-10', name: 'S', qty: '10', price: '0', net: '0' },
      { type: 'SELL', date: '2025-03-10', name: 'S', qty: '5', price: '60' },
    ]);
    const layout = await runAsSystem(() => buildScriptLedgerLayout(scope.userId, new Date('2025-12-31')));
    const group = layout.sections[0]!.groups[0]!;
    const closing = group.rows.find((r) => r.cells['description'] === 'Closing Values')!;
    // 20 units after the split at 50 each; 5 sold leaves 15 × 50.
    expect(closing.cells['qty']).toBe('15');
    expect(money(closing.cells['credit']).toString()).toBe('750');
    // Bought 1000 = sold 300 + closing 750 − gain 50 → debit (1000 + 50) = credit (300 + 750).
    expect(money(group.subtotal!.values['debit']).toString()).toBe('1050');
    expect(money(group.subtotal!.values['credit']).toString()).toBe('1050');
  });
});

describe('scriptwise qty-wise', () => {
  it('counts split units so the closing quantity is right', async () => {
    const scope = await scopeWith('qtywise', [
      { type: 'BUY', date: '2025-01-10', name: 'S', qty: '10', price: '100' },
      { type: 'SPLIT', date: '2025-02-10', name: 'S', qty: '10', price: '0', net: '0' },
      { type: 'SELL', date: '2025-03-10', name: 'S', qty: '15', price: '60' },
    ]);
    const layout = await runAsSystem(() => buildScriptwiseQtywiseLayout(scope.userId, {}));
    const row = layout.sections.flatMap((s) => s.groups.flatMap((g) => g.rows))[0]!;
    expect(row.cells['netQty']).toBe('5');
    expect(money(row.cells['netAmount']).toString()).toBe('250');
  });
});

describe('demat holdings', () => {
  it('lists only demat securities, not deposits', async () => {
    const scope = await scopeWith('demat', [
      { type: 'BUY', date: '2025-01-10', name: 'TCS', qty: '100', price: '10' },
      { type: 'DEPOSIT', date: '2025-01-11', name: 'Bank FD', qty: '500000', price: '1', assetClass: 'FIXED_DEPOSIT' },
    ]);
    const report = await runAsSystem(() => dematHoldingReport(scope.userId));
    expect(JSON.stringify(report)).not.toContain('Bank FD');
    expect(JSON.stringify(report)).toContain('TCS');
  });
});
