/**
 * FD / RD rows are cash ledgers (quantity 1, amount in price), not unit
 * positions. A unit-wise replay would let a ₹40,000 withdrawal consume a whole
 * ₹1,00,000 deposit and leave nothing accruing. These pin the amount-based
 * path: withdrawals reduce principal oldest-first, the remaining balance keeps
 * compounding, and maturity closes the deposit.
 *
 * `computeFdAccruedValue` values at today's IST date, so the clock is pinned.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { Decimal } from 'decimal.js';
import type { Transaction } from '@prisma/client';
import {
  replayTransactions,
  computeFdAccruedValue,
} from '../../src/services/holdings/holdingsProjection.js';

const AS_OF = new Date('2025-01-01T00:00:00.000Z');

beforeAll(() => {
  vi.useFakeTimers();
  // 06:00Z is 11:30 IST on the same calendar day, so accrualValuationDay()
  // lands on 2025-01-01 no matter which side of midnight the runner is on.
  vi.setSystemTime(new Date('2025-01-01T06:00:00.000Z'));
});

afterAll(() => {
  vi.useRealTimers();
});

function tx(p: Partial<Transaction>): Transaction {
  const decimal = (v: unknown, fallback = '0') =>
    new Decimal(v?.toString() ?? fallback) as unknown as Transaction['price'];
  return {
    id: p.id ?? 'tx-' + Math.random().toString(36).slice(2),
    portfolioId: p.portfolioId ?? 'pf1',
    holdingId: null,
    assetClass: p.assetClass ?? 'FIXED_DEPOSIT',
    transactionType: p.transactionType ?? 'DEPOSIT',
    stockId: null,
    fundId: null,
    assetName: p.assetName ?? 'TEST BANK FD',
    isin: null,
    tradeDate: p.tradeDate instanceof Date ? p.tradeDate : new Date(p.tradeDate as unknown as string),
    settlementDate: null,
    quantity: decimal(p.quantity, '1'),
    price: decimal(p.price),
    grossAmount: decimal(p.grossAmount, p.price?.toString()),
    brokerage: decimal(0),
    stt: decimal(0),
    stampDuty: decimal(0),
    exchangeCharges: decimal(0),
    gst: decimal(0),
    sebiCharges: decimal(0),
    otherCharges: decimal(0),
    netAmount: decimal(p.netAmount, p.price?.toString()),
    strikePrice: null,
    expiryDate: null,
    optionType: null,
    lotSize: null,
    maturityDate: p.maturityDate ?? null,
    interestRate:
      p.interestRate != null
        ? (new Decimal(p.interestRate.toString()) as unknown as Transaction['interestRate'])
        : null,
    interestFrequency: p.interestFrequency ?? 'QUARTERLY',
    broker: null,
    exchange: null,
    orderNo: null,
    tradeNo: null,
    narration: null,
    importJobId: null,
    assetKey: p.assetKey ?? 'name:fd-test',
    sourceAdapter: null,
    sourceAdapterVer: null,
    sourceHash: null,
    canonicalEventId: null,
    currency: null,
    fxRateAtTrade: null,
    inrEquivalent: null,
    equityTaxOverride: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

/** Independent re-statement of the compounding convention for assertions. */
function accrue(
  principal: string,
  annualPct: string,
  periodsPerYear: number,
  from: string,
  to: Date,
): Decimal {
  const years = new Decimal(
    (to.getTime() - new Date(from).getTime()) / (365.25 * 24 * 60 * 60 * 1000),
  ).toDP(6);
  const periodRate = new Decimal(annualPct).div(100).div(periodsPerYear);
  return new Decimal(principal).times(
    new Decimal(1).plus(periodRate).pow(years.times(periodsPerYear)),
  );
}

describe('FD accrual — partial withdrawals', () => {
  it('accrues the full principal when nothing is withdrawn', () => {
    const txs = [tx({ id: 'dep', tradeDate: '2024-01-01', price: '100000', interestRate: '12' })];
    const value = computeFdAccruedValue(txs)!;
    expect(value.toFixed(2)).toBe(accrue('100000', '12', 4, '2024-01-01', AS_OF).toFixed(2));
  });

  it('accrues only on what is left after a partial withdrawal', () => {
    const txs = [
      tx({ id: 'dep', tradeDate: '2024-01-01', price: '100000', interestRate: '12' }),
      tx({
        id: 'wd',
        transactionType: 'WITHDRAWAL',
        tradeDate: '2024-07-01',
        price: '40000',
        netAmount: '40000',
      }),
    ];
    const value = computeFdAccruedValue(txs)!;
    expect(value.toFixed(2)).toBe(accrue('60000', '12', 4, '2024-01-01', AS_OF).toFixed(2));
  });

  it('returns null once a withdrawal has taken the whole principal', () => {
    const txs = [
      tx({ id: 'dep', tradeDate: '2024-01-01', price: '100000', interestRate: '12' }),
      tx({
        id: 'wd',
        transactionType: 'WITHDRAWAL',
        tradeDate: '2024-07-01',
        price: '150000',
        netAmount: '150000',
      }),
    ];
    expect(computeFdAccruedValue(txs)).toBeNull();
  });

  it('stops accruing once the deposit has matured', () => {
    const txs = [
      tx({ id: 'dep', tradeDate: '2024-01-01', price: '100000', interestRate: '12' }),
      tx({
        id: 'mat',
        transactionType: 'MATURITY',
        tradeDate: '2024-12-01',
        price: '112000',
        netAmount: '112000',
      }),
    ];
    expect(computeFdAccruedValue(txs)).toBeNull();
  });

  it('takes a withdrawal from the oldest top-up first', () => {
    const txs = [
      tx({ id: 'dep1', tradeDate: '2024-01-01', price: '50000', interestRate: '12' }),
      tx({ id: 'dep2', tradeDate: '2024-03-01', price: '50000', interestRate: '6' }),
      tx({
        id: 'wd',
        transactionType: 'WITHDRAWAL',
        tradeDate: '2024-07-01',
        price: '30000',
        netAmount: '30000',
      }),
    ];
    const value = computeFdAccruedValue(txs)!;
    const expected = accrue('20000', '12', 4, '2024-01-01', AS_OF).plus(
      accrue('50000', '6', 4, '2024-03-01', AS_OF),
    );
    expect(value.toFixed(2)).toBe(expected.toFixed(2));
  });
});

describe('FD replay — withdrawal is cash, not one whole unit', () => {
  it('keeps the remaining principal after a partial withdrawal', () => {
    const txs = [
      tx({ id: 'dep', tradeDate: '2024-01-01', price: '100000' }),
      tx({
        id: 'wd',
        transactionType: 'WITHDRAWAL',
        tradeDate: '2024-07-01',
        price: '40000',
        netAmount: '40000',
      }),
    ];
    const agg = replayTransactions(txs);
    // Quantity stays proportional to principal (0.6 of the ₹1,00,000 row), so
    // the Qty column does not start printing rupees.
    expect(agg.quantity.toString()).toBe('0.6');
    expect(agg.totalCost.toString()).toBe('60000');
    expect(agg.realisedPnL.toString()).toBe('0');
  });

  it('closes the position and books the interest at maturity', () => {
    const txs = [
      tx({ id: 'dep', tradeDate: '2024-01-01', price: '100000' }),
      tx({
        id: 'mat',
        transactionType: 'MATURITY',
        tradeDate: '2025-01-01',
        price: '112000',
        netAmount: '112000',
      }),
    ];
    const agg = replayTransactions(txs);
    expect(agg.quantity.toString()).toBe('0');
    expect(agg.totalCost.toString()).toBe('0');
    expect(agg.realisedPnL.toString()).toBe('12000');
  });

  it('does not let a withdrawal flip the principal negative', () => {
    const txs = [
      tx({ id: 'dep', tradeDate: '2024-01-01', price: '50000' }),
      tx({
        id: 'wd',
        transactionType: 'WITHDRAWAL',
        tradeDate: '2024-07-01',
        price: '60000',
        netAmount: '60000',
      }),
    ];
    const agg = replayTransactions(txs);
    expect(agg.quantity.toString()).toBe('0');
    expect(agg.totalCost.toString()).toBe('0');
    expect(agg.realisedPnL.toString()).toBe('10000');
  });
});
