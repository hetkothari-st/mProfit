import { describe, it, expect } from 'vitest';
import { Decimal } from 'decimal.js';
import type { MFCategory, Transaction } from '@prisma/client';
import { computeFIFOGains } from '../../src/services/capitalGains.service.js';

/**
 * TASK-01 fix-mf-debt-equity-tax-classification: capitalGains.service.ts
 * previously treated every MUTUAL_FUND row as equity-oriented regardless of
 * its real AMFI category. These tests pin the corrected behaviour: category
 * comes from a caller-supplied fundCategoryMap, and an unresolved category
 * falls back to debt-conservative treatment with `needsReview: true` rather
 * than silently defaulting to equity.
 */
function tx(p: Partial<Transaction>): Transaction {
  const base: Transaction = {
    id: p.id ?? 'tx-' + Math.random().toString(36).slice(2),
    portfolioId: p.portfolioId ?? 'pf1',
    holdingId: null,
    assetClass: p.assetClass ?? 'MUTUAL_FUND',
    transactionType: p.transactionType ?? 'BUY',
    stockId: null,
    fundId: p.fundId ?? null,
    assetName: p.assetName ?? 'TEST FUND',
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
    exchange: null,
    orderNo: null,
    tradeNo: null,
    narration: null,
    importJobId: null,
    assetKey: p.assetKey ?? `fund:${p.fundId ?? 'unknown'}`,
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

const DEBT_FUND = 'fund-debt-1';
const EQUITY_FUND = 'fund-equity-1';

function categoryMap(entries: Record<string, MFCategory>): Map<string, MFCategory> {
  return new Map(Object.entries(entries));
}

describe('capitalGains.service — MF debt/equity category classification', () => {
  it('DEBT-category MF sold long-term does NOT get 112A grandfathering, even bought pre-31-Jan-2018', () => {
    const txs = [
      tx({ id: 'b1', fundId: DEBT_FUND, transactionType: 'BUY', tradeDate: '2016-01-01', quantity: '100', netAmount: '1000' }),
      tx({ id: 's1', fundId: DEBT_FUND, transactionType: 'SELL', tradeDate: '2023-06-01', quantity: '100', netAmount: '5000' }),
    ];
    const fundCategoryMap = categoryMap({ [DEBT_FUND]: 'DEBT' });
    const rows = computeFIFOGains(txs, undefined, fundCategoryMap);

    expect(rows).toHaveLength(1);
    const row = rows[0]!;
    expect(row.capitalGainType).toBe('LONG_TERM'); // >36 months held
    expect(row.isEquityOriented).toBe(false);
    expect(row.needsReview).toBe(false);
    expect(row.gainLoss.toString()).toBe('4000'); // 5000 - 1000, raw and unaffected either way
    // Debt MF pre-1-Apr-2023 qualifies for §112 indexation — NOT §55(2)(ac)
    // grandfathering (that formula is equity-only and would otherwise cap
    // the cost basis at sale proceeds using FMV, a different — and here
    // inapplicable — computation).
    expect(row.indexedCostOfAcquisition).not.toBeNull();
    expect(row.indexedCostOfAcquisition!.toFixed(2)).toBe('1370.08'); // 1000 * 348/254
    expect(row.taxableGain.toFixed(2)).toBe('3629.92'); // 5000 - 1370.08
  });

  it('DEBT-category MF bought after the indexation cutoff, held >36 months, gets long-term slab treatment with no indexation', () => {
    const txs = [
      tx({ id: 'b1', fundId: DEBT_FUND, transactionType: 'BUY', tradeDate: '2023-05-01', quantity: '100', netAmount: '1000' }),
      tx({ id: 's1', fundId: DEBT_FUND, transactionType: 'SELL', tradeDate: '2027-01-01', quantity: '100', netAmount: '1500' }),
    ];
    const fundCategoryMap = categoryMap({ [DEBT_FUND]: 'DEBT' });
    const rows = computeFIFOGains(txs, undefined, fundCategoryMap);

    expect(rows).toHaveLength(1);
    const row = rows[0]!;
    expect(row.capitalGainType).toBe('LONG_TERM');
    expect(row.isEquityOriented).toBe(false);
    expect(row.indexedCostOfAcquisition).toBeNull(); // no indexation post-cutoff
    expect(row.taxableGain.toString()).toBe(row.gainLoss.toString()); // taxed at slab on raw gain
    expect(row.gainLoss.toString()).toBe('500');
  });

  it('EQUITY-category MF keeps existing behaviour: 12-month threshold, no indexation, 112A-eligible', () => {
    const isin = 'INF000A00001';
    const txs = [
      tx({ id: 'b1', fundId: EQUITY_FUND, isin, transactionType: 'BUY', tradeDate: '2016-01-01', quantity: '100', netAmount: '1000' }),
      tx({ id: 's1', fundId: EQUITY_FUND, isin, transactionType: 'SELL', tradeDate: '2023-06-01', quantity: '100', netAmount: '5000' }),
    ];
    const fundCategoryMap = categoryMap({ [EQUITY_FUND]: 'EQUITY' });
    const fmvMap = new Map([[isin, new Decimal('20')]]); // FMV basis 2000, between cost 1000 and proceeds 5000
    const rows = computeFIFOGains(txs, fmvMap, fundCategoryMap);

    expect(rows).toHaveLength(1);
    const row = rows[0]!;
    expect(row.capitalGainType).toBe('LONG_TERM'); // held >12 months
    expect(row.isEquityOriented).toBe(true);
    expect(row.needsReview).toBe(false);
    expect(row.indexedCostOfAcquisition).not.toBeNull(); // 112A grandfathering applied
    expect(row.indexedCostOfAcquisition!.toString()).toBe('2000'); // max(1000, min(2000,5000))
    expect(row.taxableGain.toString()).toBe('3000'); // 5000 - 2000
  });

  it('a MUTUAL_FUND transaction with no resolvable fund category is flagged needsReview and taxed debt-conservative', () => {
    const txs = [
      tx({ id: 'b1', fundId: null, transactionType: 'BUY', tradeDate: '2016-01-01', quantity: '100', netAmount: '1000' }),
      tx({ id: 's1', fundId: null, transactionType: 'SELL', tradeDate: '2023-06-01', quantity: '100', netAmount: '5000' }),
    ];
    // Empty map — no category can be resolved for this fund.
    const fundCategoryMap = new Map<string, MFCategory>();
    const rows = computeFIFOGains(txs, undefined, fundCategoryMap);

    expect(rows).toHaveLength(1);
    const row = rows[0]!;
    expect(row.needsReview).toBe(true);
    expect(row.isEquityOriented).toBe(false);
    expect(row.capitalGainType).toBe('LONG_TERM'); // 36-month threshold, held >7 years
    // Debt-conservative treatment: bought pre-1-Apr-2023, so it still
    // qualifies for indexation under the date rule (same as a confirmed
    // DEBT fund) — it must NOT get 112A grandfathering (that's equity-only).
    expect(row.indexedCostOfAcquisition).not.toBeNull();
    expect(row.indexedCostOfAcquisition!.toFixed(2)).toBe('1370.08'); // 1000 * 348/254
    expect(row.taxableGain.toString()).not.toBe(row.gainLoss.toString());
  });

  it('a fundId present but absent from fundCategoryMap is also flagged needsReview (not silently defaulted to equity)', () => {
    const txs = [
      tx({ id: 'b1', fundId: 'unknown-fund', transactionType: 'BUY', tradeDate: '2020-01-01', quantity: '50', netAmount: '500' }),
      tx({ id: 's1', fundId: 'unknown-fund', transactionType: 'SELL', tradeDate: '2023-06-01', quantity: '50', netAmount: '900' }),
    ];
    const fundCategoryMap = categoryMap({ [DEBT_FUND]: 'DEBT' }); // deliberately missing 'unknown-fund'
    const rows = computeFIFOGains(txs, undefined, fundCategoryMap);

    expect(rows).toHaveLength(1);
    const row = rows[0]!;
    expect(row.needsReview).toBe(true);
    expect(row.isEquityOriented).toBe(false);
  });
});
