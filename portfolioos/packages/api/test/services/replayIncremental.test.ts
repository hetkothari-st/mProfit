import { describe, it, expect } from 'vitest';
import type { Transaction } from '@prisma/client';
import {
  compareReplayOrder,
  createReplay,
  replayTransactions,
} from '../../src/services/holdings/holdingsProjection.js';

/** A running fold must give, after every prefix, exactly what a fresh replay of that prefix gives. */
let n = 0;
function tx(over: Partial<Transaction> & { transactionType: Transaction['transactionType']; day: number }): Transaction {
  const { day, ...rest } = over as Record<string, unknown> & { day: number };
  n++;
  return {
    id: `t${String(n).padStart(4, '0')}`,
    assetClass: 'EQUITY',
    quantity: '10',
    price: '100',
    netAmount: '1000',
    tradeDate: new Date(Date.UTC(2023, 0, day as number)),
    createdAt: new Date(Date.UTC(2023, 0, 1, 0, 0, n)),
    maturityDate: null,
    ...rest,
  } as unknown as Transaction;
}

function assertSamePrefixes(rows: Transaction[]) {
  const sorted = [...rows].sort(compareReplayOrder);
  const run = createReplay(sorted);
  sorted.forEach((t, i) => {
    run.apply(t);
    const got = run.aggregate();
    const want = replayTransactions(sorted.slice(0, i + 1));
    expect(got.quantity.toString(), `qty after ${i + 1}`).toBe(want.quantity.toString());
    expect(got.totalCost.toString(), `cost after ${i + 1}`).toBe(want.totalCost.toString());
    expect(got.realisedPnL.toString(), `pnl after ${i + 1}`).toBe(want.realisedPnL.toString());
    expect(got.avgCostPrice.toString(), `avg after ${i + 1}`).toBe(want.avgCostPrice.toString());
    expect(got.sourceTxCount).toBe(want.sourceTxCount);
  });
}

describe('createReplay', () => {
  it('matches replayTransactions after every prefix: buys, partial sells, split, bonus, oversell', () => {
    assertSamePrefixes([
      tx({ transactionType: 'BUY', day: 1, quantity: '10', netAmount: '1000' }),
      tx({ transactionType: 'BUY', day: 1, quantity: '5', netAmount: '600' }),
      tx({ transactionType: 'SELL', day: 3, quantity: '12', netAmount: '1500' }),
      tx({ transactionType: 'SPLIT', day: 5, quantity: '3', netAmount: '0' }),
      tx({ transactionType: 'BONUS', day: 6, quantity: '2', netAmount: '0' }),
      tx({ transactionType: 'BUY', day: 7, quantity: '4', netAmount: '480' }),
      tx({ transactionType: 'SELL', day: 9, quantity: '50', netAmount: '9000' }),
    ]);
  });

  it('matches for an amount-based deposit with a partial withdrawal and a maturity', () => {
    const open = tx({
      transactionType: 'BUY',
      day: 1,
      assetClass: 'FIXED_DEPOSIT',
      quantity: '1',
      netAmount: '500000',
      maturityDate: new Date(Date.UTC(2023, 0, 20)),
    });
    assertSamePrefixes([
      open,
      tx({ transactionType: 'BUY', day: 2, assetClass: 'FIXED_DEPOSIT', quantity: '1', netAmount: '100000' }),
      tx({ transactionType: 'WITHDRAWAL', day: 4, assetClass: 'FIXED_DEPOSIT', quantity: '1', netAmount: '10000' }),
      tx({ transactionType: 'MATURITY', day: 25, assetClass: 'FIXED_DEPOSIT', quantity: '1', netAmount: '540000' }),
    ]);
  });
});
