import { describe, it, expect } from 'vitest';
import { Decimal } from 'decimal.js';
import type { Transaction } from '@prisma/client';
import { computeFoPnl, replayForFoPnl } from '../../src/services/foPnl.service.js';

function tx(p: Partial<Transaction>): Transaction {
  const base: Transaction = {
    id: p.id ?? 'tx-' + Math.random().toString(36).slice(2),
    portfolioId: p.portfolioId ?? 'pf1',
    holdingId: null,
    assetClass: p.assetClass ?? 'OPTIONS',
    transactionType: p.transactionType ?? 'BUY',
    stockId: null,
    fundId: null,
    assetName: p.assetName ?? 'NIFTY',
    isin: null,
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
    strikePrice: p.strikePrice
      ? (new Decimal(p.strikePrice.toString()) as unknown as Transaction['strikePrice'])
      : null,
    expiryDate: (p.expiryDate as Date) ?? new Date('2026-11-28T00:00:00Z'),
    optionType: p.optionType ?? 'CALL',
    lotSize: p.lotSize ?? 50,
    maturityDate: null,
    interestRate: null,
    interestFrequency: null,
    broker: null,
    exchange: 'NFO',
    orderNo: null,
    tradeNo: null,
    narration: null,
    importJobId: null,
    assetKey: p.assetKey ?? 'fno:NIFTY:CE:024500:2026-11-28',
    sourceAdapter: null,
    sourceAdapterVer: null,
    sourceHash: null,
    canonicalEventId: null,
    equityTaxOverride: null,
    createdAt: p.createdAt ?? new Date(),
    updatedAt: new Date(),
  };
  return base;
}

describe('foPnl.service — FIFO close events', () => {
  it('long-then-close yields realized P&L', () => {
    const txs: Transaction[] = [
      tx({ id: 'b1', transactionType: 'BUY', tradeDate: '2026-11-10', quantity: '50', netAmount: '5000' }),  // 100/contract
      tx({ id: 's1', transactionType: 'SELL', tradeDate: '2026-11-20', quantity: '50', netAmount: '7500' }), // 150/contract
    ];
    const evs = replayForFoPnl(txs);
    expect(evs).toHaveLength(1);
    expect(new Decimal(evs[0]!.realizedPnl).toString()).toBe('2500');
    expect(evs[0]!.isIntraday).toBe(false);
  });

  it('intraday is detected', () => {
    const txs: Transaction[] = [
      tx({ id: 'b1', transactionType: 'BUY', tradeDate: '2026-11-10', quantity: '50', netAmount: '5000' }),
      tx({ id: 's1', transactionType: 'SELL', tradeDate: '2026-11-10', quantity: '50', netAmount: '5500' }),
    ];
    const evs = replayForFoPnl(txs);
    expect(evs[0]!.isIntraday).toBe(true);
  });

  it('short-then-cover yields realized P&L', () => {
    const txs: Transaction[] = [
      tx({ id: 's1', transactionType: 'SELL', tradeDate: '2026-11-10', quantity: '50', netAmount: '7500' }), // 150
      tx({ id: 'b1', transactionType: 'BUY', tradeDate: '2026-11-12', quantity: '50', netAmount: '5000' }),  // 100
    ];
    const evs = replayForFoPnl(txs);
    expect(new Decimal(evs[0]!.realizedPnl).toString()).toBe('2500');
  });

  it('partial close leaves residual lot', () => {
    const txs: Transaction[] = [
      tx({ id: 'b1', transactionType: 'BUY', tradeDate: '2026-11-10', quantity: '100', netAmount: '10000' }), // 100/c
      tx({ id: 's1', transactionType: 'SELL', tradeDate: '2026-11-15', quantity: '40', netAmount: '6000' }),  // 150/c
    ];
    const evs = replayForFoPnl(txs);
    expect(evs).toHaveLength(1);
    expect(new Decimal(evs[0]!.realizedPnl).toString()).toBe('2000'); // 40 × 50
  });

  it('summary sums F&O P&L into NON_SPECULATIVE bucket', () => {
    const txs: Transaction[] = [
      tx({ id: 'b1', transactionType: 'BUY', tradeDate: '2026-04-10', quantity: '50', netAmount: '5000' }),
      tx({ id: 's1', transactionType: 'SELL', tradeDate: '2026-04-20', quantity: '50', netAmount: '4000' }),
    ];
    const r = computeFoPnl(txs);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]!.taxBucket).toBe('NON_SPECULATIVE');
    expect(new Decimal(r.summaryByFy['2026-27']!.totalPnl).toString()).toBe('-1000');
    expect(new Decimal(r.summaryByFy['2026-27']!.turnover).toString()).toBe('1000');
  });
});
