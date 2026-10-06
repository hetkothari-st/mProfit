import { describe, it, expect } from 'vitest';
import { Decimal } from 'decimal.js';
import type { MFCategory, Transaction } from '@prisma/client';
import { computeFIFOGains, type CapitalGainRow } from '../../src/services/capitalGains.service.js';

/**
 * Capital gains engine against the holding-period, 23-Jul-2024, sec 50AA,
 * corporate-action, foreign-currency and set-off rules (reports audit).
 */
let seq = 0;
function tx(p: Partial<Omit<Transaction, 'tradeDate'>> & { tradeDate: string }): Transaction {
  seq += 1;
  const d = (v: unknown, fallback = '0') => new Decimal((v ?? fallback).toString()) as unknown as Transaction['quantity'];
  return {
    id: p.id ?? `tx-${seq}`,
    portfolioId: p.portfolioId ?? 'pf1',
    holdingId: null,
    assetClass: p.assetClass ?? 'EQUITY',
    transactionType: p.transactionType ?? 'BUY',
    stockId: p.stockId ?? null,
    fundId: p.fundId ?? null,
    assetName: p.assetName ?? 'TEST',
    isin: p.isin ?? null,
    tradeDate: new Date(`${p.tradeDate}T00:00:00Z`),
    settlementDate: null,
    quantity: d(p.quantity),
    price: d(p.price),
    grossAmount: d(p.grossAmount ?? p.netAmount),
    brokerage: d(0),
    stt: d(0),
    stampDuty: d(0),
    exchangeCharges: d(0),
    gst: d(0),
    sebiCharges: d(0),
    otherCharges: d(0),
    netAmount: d(p.netAmount),
    strikePrice: null,
    expiryDate: null,
    optionType: null,
    lotSize: null,
    maturityDate: null,
    interestRate: null,
    interestFrequency: null,
    broker: null,
    exchange: 'NSE',
    orderNo: null,
    tradeNo: null,
    narration: null,
    importJobId: null,
    assetKey: p.assetKey ?? 'stock:A',
    sourceAdapter: null,
    sourceAdapterVer: null,
    sourceHash: null,
    canonicalEventId: null,
    equityTaxOverride: null,
    currency: (p as { currency?: string | null }).currency ?? null,
    fxRateAtTrade: (p as { fxRateAtTrade?: unknown }).fxRateAtTrade ?? null,
    inrEquivalent: (p as { inrEquivalent?: unknown }).inrEquivalent ?? null,
    createdAt: new Date(`2020-01-01T00:00:${String(seq % 60).padStart(2, '0')}Z`),
    updatedAt: new Date(),
  } as unknown as Transaction;
}

const one = (rows: CapitalGainRow[]) => {
  expect(rows).toHaveLength(1);
  return rows[0]!;
};

describe('holding period counts calendar months, strictly more than the threshold', () => {
  it('equity held 360 days is short-term (was long-term at 12×30 days)', () => {
    const row = one(
      computeFIFOGains([
        tx({ transactionType: 'BUY', tradeDate: '2023-01-10', quantity: '100', netAmount: '10000' }),
        tx({ transactionType: 'SELL', tradeDate: '2024-01-05', quantity: '100', netAmount: '15000' }),
      ]),
    );
    expect(row.capitalGainType).toBe('SHORT_TERM');
  });

  it('exactly 12 months is short-term; 12 months and a day is long-term', () => {
    const exact = one(
      computeFIFOGains([
        tx({ transactionType: 'BUY', tradeDate: '2023-01-10', quantity: '1', netAmount: '100', assetKey: 'stock:X' }),
        tx({ transactionType: 'SELL', tradeDate: '2024-01-10', quantity: '1', netAmount: '150', assetKey: 'stock:X' }),
      ]),
    );
    expect(exact.capitalGainType).toBe('SHORT_TERM');
    const dayAfter = one(
      computeFIFOGains([
        tx({ transactionType: 'BUY', tradeDate: '2023-01-10', quantity: '1', netAmount: '100', assetKey: 'stock:Y' }),
        tx({ transactionType: 'SELL', tradeDate: '2024-01-11', quantity: '1', netAmount: '150', assetKey: 'stock:Y' }),
      ]),
    );
    expect(dayAfter.capitalGainType).toBe('LONG_TERM');
  });
});

describe('transfers on/after 23-Jul-2024', () => {
  it('debt MF bought before 1-Apr-2023 is long-term after 24 months with no indexation', () => {
    const cats = new Map<string, MFCategory>([['f1', 'DEBT']]);
    const row = one(
      computeFIFOGains(
        [
          tx({ assetClass: 'MUTUAL_FUND', fundId: 'f1', assetKey: 'fund:f1', transactionType: 'BUY', tradeDate: '2022-06-01', quantity: '100', netAmount: '1000' }),
          tx({ assetClass: 'MUTUAL_FUND', fundId: 'f1', assetKey: 'fund:f1', transactionType: 'SELL', tradeDate: '2025-01-10', quantity: '100', netAmount: '1300' }),
        ],
        undefined,
        cats,
      ),
    );
    expect(row.capitalGainType).toBe('LONG_TERM');
    expect(row.indexedCostOfAcquisition).toBeNull();
    expect(row.taxableGain.toString()).toBe('300');
  });

  it('the same sale before 23-Jul-2024 still needed 36 months and got indexation', () => {
    const cats = new Map<string, MFCategory>([['f1', 'DEBT']]);
    const row = one(
      computeFIFOGains(
        [
          tx({ assetClass: 'MUTUAL_FUND', fundId: 'f1', assetKey: 'fund:f1', transactionType: 'BUY', tradeDate: '2021-06-01', quantity: '100', netAmount: '1000' }),
          tx({ assetClass: 'MUTUAL_FUND', fundId: 'f1', assetKey: 'fund:f1', transactionType: 'SELL', tradeDate: '2024-07-01', quantity: '100', netAmount: '1300' }),
        ],
        undefined,
        cats,
      ),
    );
    // 37 months held, sold before the cutoff.
    expect(row.capitalGainType).toBe('LONG_TERM');
    expect(row.indexedCostOfAcquisition).not.toBeNull();
  });

  it('an index fund is flagged for review instead of silently taxed as debt', () => {
    const cats = new Map<string, MFCategory>([['idx', 'INDEX_FUND']]);
    const row = one(
      computeFIFOGains(
        [
          tx({ assetClass: 'MUTUAL_FUND', fundId: 'idx', assetKey: 'fund:idx', transactionType: 'BUY', tradeDate: '2021-01-01', quantity: '100', netAmount: '100000' }),
          tx({ assetClass: 'MUTUAL_FUND', fundId: 'idx', assetKey: 'fund:idx', transactionType: 'SELL', tradeDate: '2023-06-01', quantity: '100', netAmount: '160000' }),
        ],
        undefined,
        cats,
      ),
    );
    expect(row.needsReview).toBe(true);
    expect(row.reviewReason).toContain('equity- or debt-oriented');
  });

  it('sovereign gold bond redeemed at maturity is exempt', () => {
    const row = one(
      computeFIFOGains([
        tx({ assetClass: 'GOLD_BOND', assetKey: 'isin:SGB', transactionType: 'BUY', tradeDate: '2016-08-05', quantity: '10', netAmount: '30000' }),
        tx({ assetClass: 'GOLD_BOND', assetKey: 'isin:SGB', transactionType: 'MATURITY', tradeDate: '2024-08-05', quantity: '10', netAmount: '62000' }),
      ]),
    );
    expect(row.gainLoss.toString()).toBe('32000');
    expect(row.taxableGain.toString()).toBe('0');
    expect(row.reviewReason).toContain('47(viic)');
  });

  it('equity long-term gain transferred before 1-Apr-2018 is exempt under 10(38)', () => {
    const row = one(
      computeFIFOGains([
        tx({ transactionType: 'BUY', tradeDate: '2015-01-01', quantity: '10', netAmount: '100000' }),
        tx({ transactionType: 'SELL', tradeDate: '2017-11-01', quantity: '10', netAmount: '200000' }),
      ]),
    );
    expect(row.capitalGainType).toBe('LONG_TERM');
    expect(row.taxableGain.toString()).toBe('0');
  });

  it('fixed-deposit maturities are not capital gains', () => {
    const rows = computeFIFOGains([
      tx({ assetClass: 'FIXED_DEPOSIT', assetKey: 'name:fd', transactionType: 'BUY', tradeDate: '2023-01-01', quantity: '1', netAmount: '100000' }),
      tx({ assetClass: 'FIXED_DEPOSIT', assetKey: 'name:fd', transactionType: 'MATURITY', tradeDate: '2024-01-01', quantity: '1', netAmount: '107000' }),
    ]);
    expect(rows).toHaveLength(0);
  });
});

describe('corporate actions', () => {
  it('a split spreads the extra units over the original lot, keeping cost and purchase date', () => {
    const row = one(
      computeFIFOGains([
        tx({ transactionType: 'BUY', tradeDate: '2022-01-10', quantity: '10', netAmount: '10000' }),
        tx({ transactionType: 'SPLIT', tradeDate: '2023-01-01', quantity: '10', netAmount: '0' }),
        tx({ transactionType: 'SELL', tradeDate: '2024-06-01', quantity: '20', netAmount: '12000' }),
      ]),
    );
    expect(row.quantity.toString()).toBe('20');
    expect(row.buyAmount.toString()).toBe('10000');
    expect(row.gainLoss.toString()).toBe('2000');
    expect(row.capitalGainType).toBe('LONG_TERM');
  });

  it('a merger carries cost and holding period to the new shares instead of booking a sale', () => {
    const rows = computeFIFOGains([
      tx({ assetKey: 'stock:A', transactionType: 'BUY', tradeDate: '2019-01-01', quantity: '100', netAmount: '50000' }),
      tx({ assetKey: 'stock:A', transactionType: 'MERGER_OUT', tradeDate: '2023-06-01', quantity: '100', netAmount: '0' }),
      tx({ assetKey: 'stock:B', transactionType: 'MERGER_IN', tradeDate: '2023-06-01', quantity: '50', netAmount: '0' }),
      tx({ assetKey: 'stock:B', transactionType: 'SELL', tradeDate: '2023-12-01', quantity: '50', netAmount: '90000' }),
    ]);
    const row = one(rows);
    expect(row.buyAmount.toString()).toBe('50000');
    expect(row.buyDate.toISOString().slice(0, 10)).toBe('2019-01-01');
    expect(row.capitalGainType).toBe('LONG_TERM');
    expect(row.gainLoss.toString()).toBe('40000');
    expect(row.needsReview).toBe(false);
  });
});

describe('matching', () => {
  it('an intraday square-off matches the same-day purchase, leaving older delivery lots untouched', () => {
    const rows = computeFIFOGains([
      tx({ transactionType: 'BUY', tradeDate: '2022-01-01', quantity: '100', netAmount: '150000' }),
      tx({ transactionType: 'BUY', tradeDate: '2024-02-01', quantity: '50', netAmount: '80000' }),
      tx({ transactionType: 'SELL', tradeDate: '2024-02-01', quantity: '50', netAmount: '82500' }),
      tx({ transactionType: 'SELL', tradeDate: '2024-03-01', quantity: '100', netAmount: '170000' }),
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[0]!.capitalGainType).toBe('INTRADAY');
    expect(rows[0]!.gainLoss.toString()).toBe('2500');
    expect(rows[1]!.buyDate.toISOString().slice(0, 10)).toBe('2022-01-01');
    expect(rows[1]!.capitalGainType).toBe('LONG_TERM');
  });

  it('a sale with no matching purchase stays in the report, flagged, at nil cost', () => {
    const row = one(
      computeFIFOGains([tx({ transactionType: 'SELL', tradeDate: '2024-09-01', quantity: '50', netAmount: '140000' })]),
    );
    expect(row.sellAmount.toString()).toBe('140000');
    expect(row.buyAmount.toString()).toBe('0');
    expect(row.needsReview).toBe(true);
    expect(row.reviewReason).toContain('more units than the recorded purchases');
  });

  it('groups by assetKey: two name-only gold items are separate, and an ISIN-less buy meets its ISIN sell', () => {
    const gold = computeFIFOGains([
      tx({ assetClass: 'PHYSICAL_GOLD', assetKey: 'name:coins', transactionType: 'BUY', tradeDate: '2015-01-01', quantity: '1', netAmount: '100000' }),
      tx({ assetClass: 'PHYSICAL_GOLD', assetKey: 'name:bar', transactionType: 'BUY', tradeDate: '2022-01-01', quantity: '1', netAmount: '500000' }),
      tx({ assetClass: 'PHYSICAL_GOLD', assetKey: 'name:bar', transactionType: 'SELL', tradeDate: '2023-01-01', quantity: '1', netAmount: '550000' }),
    ]);
    expect(one(gold).gainLoss.toString()).toBe('50000');

    const stock = computeFIFOGains([
      tx({ assetKey: 'stock:R', isin: null, transactionType: 'BUY', tradeDate: '2023-01-01', quantity: '10', netAmount: '1000' }),
      tx({ assetKey: 'stock:R', isin: 'INE002A01018', transactionType: 'SELL', tradeDate: '2023-03-01', quantity: '10', netAmount: '1500' }),
    ]);
    expect(one(stock).buyAmount.toString()).toBe('1000');
  });

  it('foreign equity gains are computed in INR at the trade-date rates', () => {
    const row = one(
      computeFIFOGains([
        tx({ assetClass: 'FOREIGN_EQUITY', assetKey: 'stock:AAPL', transactionType: 'BUY', tradeDate: '2021-01-04', quantity: '10', netAmount: '1500', currency: 'USD', fxRateAtTrade: '75' } as never),
        tx({ assetClass: 'FOREIGN_EQUITY', assetKey: 'stock:AAPL', transactionType: 'SELL', tradeDate: '2024-03-01', quantity: '10', netAmount: '2000', currency: 'USD', fxRateAtTrade: '83' } as never),
      ]),
    );
    expect(row.gainLoss.toString()).toBe('53500');
  });
});
