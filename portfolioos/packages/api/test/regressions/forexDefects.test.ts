import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestScope, prisma, type TestScope } from '../helpers/db.js';
import { runAsSystem } from '../../src/lib/requestContext.js';
import {
  createForexBalance,
  updateForexBalance,
  revealForexAccountNumber,
  forexPairPnlFromTxs,
} from '../../src/services/forex/forex.service.js';

const tx = (date: string, type: 'BUY' | 'SELL', qty: string, net: string) => ({
  tradeDate: new Date(`${date}T00:00:00Z`),
  transactionType: type,
  quantity: qty,
  netAmount: net,
  isin: null,
  assetName: 'USDINR',
});

describe('forex pair P&L across financial years', () => {
  it('a position bought in one FY and sold in the next shows its P&L in the sell year', () => {
    // Buy 1000 USD @ 82 in FY 2024-25, sell @ 84 in FY 2025-26 → +2000.
    const rows = forexPairPnlFromTxs('p1', [
      tx('2025-02-10', 'BUY', '1000', '82000'),
      tx('2025-05-10', 'SELL', '1000', '84000'),
    ]);
    const byFy = new Map(rows.map((r) => [r.financialYear, r]));
    const buyYear = [...byFy.values()].find((r) => r.buyQty !== '0.000000')!;
    const sellYear = [...byFy.values()].find((r) => r.sellQty !== '0.000000')!;
    expect(buyYear.realisedPnl).toBe('0.0000');
    expect(buyYear.unrealisedPosition).toBe('1000.000000');
    expect(sellYear.realisedPnl).toBe('2000.0000');
    expect(sellYear.unrealisedPosition).toBe('0.000000');
  });

  it('matches FIFO, not averages', () => {
    // Buy 100 @ 80, buy 100 @ 90, sell 100 @ 95 → FIFO closes the 80 lot: +1500.
    const rows = forexPairPnlFromTxs('p1', [
      tx('2025-04-10', 'BUY', '100', '8000'),
      tx('2025-04-11', 'BUY', '100', '9000'),
      tx('2025-04-12', 'SELL', '100', '9500'),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.realisedPnl).toBe('1500.0000');
    expect(rows[0]!.unrealisedPosition).toBe('100.000000');
  });
});

describe('editing a forex balance keeps the saved account number', () => {
  let scope: TestScope;
  beforeAll(async () => {
    scope = await createTestScope('forex-acct');
  });
  afterAll(async () => {
    await runAsSystem(() => prisma.forexBalance.deleteMany({ where: { userId: scope.userId } }));
    await scope.cleanup();
  });

  it('a blank account number on edit leaves the stored one alone', async () => {
    await scope.runAs(async () => {
      const b = await createForexBalance(scope.userId, {
        currency: 'USD',
        balance: '100',
        accountNumber: '9876543210',
      });
      const updated = await updateForexBalance(scope.userId, b.id, { balance: '150', accountNumber: '' });
      expect(String(updated['balance'])).toBe('150');
      expect(await revealForexAccountNumber(scope.userId, b.id)).toBe('9876543210');
    });
  });
});
