import { describe, it, expect } from 'vitest';
import { Decimal } from 'decimal.js';
import type { Transaction } from '@prisma/client';
import { computeHoldingXirrs } from '../../src/services/xirr.service.js';

/**
 * Fixture builder mirrors test/services/capitalGainsGrandfathering.test.ts so
 * a full Transaction row (all required Prisma fields) can be built tersely.
 */
function tx(p: Partial<Transaction>): Transaction {
  const base: Transaction = {
    id: p.id ?? 'tx-' + Math.random().toString(36).slice(2),
    portfolioId: p.portfolioId ?? 'pf1',
    holdingId: null,
    assetClass: p.assetClass ?? 'EQUITY',
    transactionType: p.transactionType ?? 'BUY',
    stockId: p.stockId ?? null,
    fundId: p.fundId ?? null,
    assetName: p.assetName ?? 'TEST STOCK',
    isin: p.isin ?? null,
    tradeDate: p.tradeDate instanceof Date ? p.tradeDate : new Date(p.tradeDate as unknown as string),
    settlementDate: null,
    quantity: new Decimal(p.quantity?.toString() ?? '0') as unknown as Transaction['quantity'],
    price: new Decimal(p.price?.toString() ?? '0') as unknown as Transaction['price'],
    grossAmount: new Decimal(p.grossAmount?.toString() ?? '0') as unknown as Transaction['grossAmount'],
    brokerage: new Decimal(0) as unknown as Transaction['brokerage'],
    stt: new Decimal(0) as unknown as Transaction['stt'],
    stampDuty: new Decimal(0) as unknown as Transaction['stampDuty'],
    exchangeCharges: new Decimal(0) as unknown as Transaction['exchangeCharges'],
    gst: new Decimal(0) as unknown as Transaction['gst'],
    sebiCharges: new Decimal(0) as unknown as Transaction['sebiCharges'],
    otherCharges: new Decimal(0) as unknown as Transaction['otherCharges'],
    netAmount: new Decimal(p.netAmount?.toString() ?? '0') as unknown as Transaction['netAmount'],
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
    assetKey: p.assetKey ?? 'stock:test',
    sourceAdapter: null,
    sourceAdapterVer: null,
    sourceHash: null,
    canonicalEventId: null,
    currency: null,
    fxRateAtTrade: null,
    inrEquivalent: null,
    equityTaxOverride: null,
    createdAt: p.createdAt ?? new Date(),
    updatedAt: new Date(),
  };
  return base;
}

describe('xirr.service — computeHoldingXirrs (per-holding fan-out)', () => {
  it('computes an independent XIRR per assetKey from one combined transaction list', () => {
    // Holding A: bought 2 years ago at 100k, now worth 150k → clearly positive XIRR.
    // Holding B: bought 2 years ago at 100k, now worth 80k → clearly negative XIRR.
    // Both fed through a single call so we can assert cross-contamination doesn't happen.
    const txs = [
      tx({ id: 'a-buy', assetKey: 'stock:A', tradeDate: '2024-01-01', transactionType: 'BUY', quantity: '100', netAmount: '100000' }),
      tx({ id: 'b-buy', assetKey: 'stock:B', tradeDate: '2024-01-01', transactionType: 'BUY', quantity: '100', netAmount: '100000' }),
    ];
    const terminals = new Map([
      ['stock:A', new Decimal('150000')],
      ['stock:B', new Decimal('80000')],
    ]);

    const results = computeHoldingXirrs(txs, terminals, new Date('2026-01-01'));

    expect(results.size).toBe(2);
    const a = results.get('stock:A')!;
    const b = results.get('stock:B')!;
    expect(a.xirr).not.toBeNull();
    expect(a.xirr!).toBeGreaterThan(0);
    expect(b.xirr).not.toBeNull();
    expect(b.xirr!).toBeLessThan(0);
    // Each group's totalInvested reflects only its own transactions, not the combined set.
    expect(a.totalInvested).toBe('100000.0000');
    expect(b.totalInvested).toBe('100000.0000');
  });

  it('groups transactions with a null assetKey via the same fallback derivation as HoldingProjection', () => {
    // Legacy rows written before the assetKey backfill leave assetKey null;
    // grouping must still land both BUY and SELL in the same bucket via
    // assetKeyFromTransaction's isin fallback, not split into two singleton groups.
    const txs = [
      tx({ id: 'buy', assetKey: null as unknown as string, isin: 'INE999Z00000', tradeDate: '2023-01-01', transactionType: 'BUY', quantity: '10', netAmount: '10000' }),
      tx({ id: 'sell', assetKey: null as unknown as string, isin: 'INE999Z00000', tradeDate: '2025-01-01', transactionType: 'SELL', quantity: '10', netAmount: '15000' }),
    ];
    const terminals = new Map<string, Decimal>();

    const results = computeHoldingXirrs(txs, terminals, new Date('2025-01-02'));

    expect(results.size).toBe(1);
    const result = [...results.values()][0]!;
    expect(result.cashflowCount).toBe(2);
    expect(result.xirr).not.toBeNull();
  });

  it('marks a holding with too little history as unreliable rather than a misleadingly precise number', () => {
    // Bought 5 days ago — far short of MIN_XIRR_DAYS (90). A tiny move over
    // a few days annualizes into an absurd rate; `reliable` must say so.
    const txs = [
      tx({ id: 'thin-buy', assetKey: 'stock:THIN', tradeDate: '2026-01-01', transactionType: 'BUY', quantity: '10', netAmount: '10000' }),
    ];
    const terminals = new Map([['stock:THIN', new Decimal('10100')]]);

    const results = computeHoldingXirrs(txs, terminals, new Date('2026-01-06'));

    const thin = results.get('stock:THIN')!;
    expect(thin.reliable).toBe(false);
  });

  it('returns an empty map for an empty transaction list', () => {
    const results = computeHoldingXirrs([], new Map());
    expect(results.size).toBe(0);
  });
});
