import { describe, it, expect } from 'vitest';
import { Decimal } from 'decimal.js';
import type { Transaction } from '@prisma/client';
import { computeFIFOGains } from '../../src/services/capitalGains.service.js';

/**
 * Sec 55(2)(ac) grandfathering: cost of acquisition for pre-31-Jan-2018
 * equity/MF = higher of (actual cost, lower of (FMV on 31-Jan-2018, full
 * value of consideration)). The "lower of FMV/proceeds" cap is what stops a
 * high FMV from manufacturing a bigger loss (or erasing a real one) than the
 * section allows — computing max(cost, FMV) without that cap is a distinct,
 * wrong formula that silently overstates the deductible loss.
 */
function tx(p: Partial<Transaction>): Transaction {
  const base: Transaction = {
    id: p.id ?? 'tx-' + Math.random().toString(36).slice(2),
    portfolioId: p.portfolioId ?? 'pf1',
    holdingId: null,
    assetClass: p.assetClass ?? 'EQUITY',
    transactionType: p.transactionType ?? 'BUY',
    stockId: p.stockId ?? null,
    fundId: null,
    assetName: p.assetName ?? 'TEST STOCK',
    isin: p.isin ?? 'INE000A00000',
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
    equityTaxOverride: null,
    createdAt: p.createdAt ?? new Date(),
    updatedAt: new Date(),
  };
  return base;
}

const ISIN = 'INE000A00000';

describe('capitalGains.service — Sec 55(2)(ac) grandfathering cap', () => {
  it('caps the FMV basis at sale proceeds when FMV > proceeds > actual cost', () => {
    // Bought pre-cutoff at ₹100, FMV on 31-Jan-2018 is ₹500 (way above what
    // it eventually sells for), sold post-cutoff at ₹300.
    const txs = [
      tx({ id: 'b1', transactionType: 'BUY', tradeDate: '2016-01-01', quantity: '10', netAmount: '1000', isin: ISIN }),
      tx({ id: 's1', transactionType: 'SELL', tradeDate: '2023-01-01', quantity: '10', netAmount: '3000', isin: ISIN }),
    ];
    const fmvMap = new Map([[ISIN, new Decimal('500')]]);
    const rows = computeFIFOGains(txs, fmvMap);

    expect(rows).toHaveLength(1);
    const row = rows[0]!;
    // Uncorrected economic gain is unaffected by grandfathering.
    expect(row.gainLoss.toString()).toBe('2000'); // 3000 - 1000
    // Adjusted basis = max(cost 1000, min(FMV-basis 5000, proceeds 3000)) = max(1000, 3000) = 3000.
    expect(row.indexedCostOfAcquisition!.toString()).toBe('3000');
    // Taxable gain must be zero, not negative — FMV cannot manufacture a loss
    // beyond what the actual sale supports.
    expect(row.taxableGain.toString()).toBe('0');
  });

  it('does not let a high FMV erase a real loss when actual cost exceeds proceeds', () => {
    // Bought pre-cutoff at ₹500/unit, FMV on 31-Jan-2018 was even higher at
    // ₹1000, but it's sold post-cutoff for only ₹200 — a real economic loss.
    const txs = [
      tx({ id: 'b1', transactionType: 'BUY', tradeDate: '2016-01-01', quantity: '10', netAmount: '5000', isin: ISIN }),
      tx({ id: 's1', transactionType: 'SELL', tradeDate: '2023-01-01', quantity: '10', netAmount: '2000', isin: ISIN }),
    ];
    const fmvMap = new Map([[ISIN, new Decimal('1000')]]);
    const rows = computeFIFOGains(txs, fmvMap);

    expect(rows).toHaveLength(1);
    const row = rows[0]!;
    expect(row.gainLoss.toString()).toBe('-3000'); // 2000 - 5000
    // Adjusted basis = max(cost 5000, min(FMV-basis 10000, proceeds 2000)) = max(5000, 2000) = 5000.
    // The buggy max(cost, FMV)-then-min(_, proceeds) ordering would instead
    // compute min(max(5000,10000), 2000) = 2000, erasing the real loss.
    expect(row.indexedCostOfAcquisition!.toString()).toBe('5000');
    expect(row.taxableGain.toString()).toBe('-3000');
  });

  it('applies plain max(cost, FMV) when FMV sits below the sale proceeds', () => {
    const txs = [
      tx({ id: 'b1', transactionType: 'BUY', tradeDate: '2016-01-01', quantity: '10', netAmount: '1000', isin: ISIN }),
      tx({ id: 's1', transactionType: 'SELL', tradeDate: '2023-01-01', quantity: '10', netAmount: '3000', isin: ISIN }),
    ];
    const fmvMap = new Map([[ISIN, new Decimal('200')]]); // FMV-basis 2000 < proceeds 3000
    const rows = computeFIFOGains(txs, fmvMap);

    const row = rows[0]!;
    // Adjusted basis = max(cost 1000, min(2000, 3000)) = max(1000, 2000) = 2000.
    expect(row.indexedCostOfAcquisition!.toString()).toBe('2000');
    expect(row.taxableGain.toString()).toBe('1000'); // 3000 - 2000
  });
});
