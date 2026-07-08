import { describe, it, expect } from 'vitest';
import { Decimal } from 'decimal.js';
import { AssetClass, type Transaction } from '@prisma/client';
import { CII_BY_FY } from '@portfolioos/shared';
import {
  computeFIFOGains,
  qualifiesForIndexation,
  type CapitalGainRow,
} from '../../src/services/capitalGains.service.js';

/**
 * TASK 02 — CII table gap must never silently disappear indexation.
 *
 * Before this fix, `indexedCost()` returned a bare `null` whenever the buy or
 * sell FY had no CII entry, and the caller silently fell through to a
 * non-indexed (higher, possibly wrong) `taxableGain` with no flag anywhere.
 * These tests pin the visible-outcome contract: any row where indexation was
 * supposed to apply but couldn't be computed must carry
 * `needsReview: true` + a `reviewReason`, never a plain look-alike row.
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
    assetName: p.assetName ?? 'TEST ASSET',
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
    assetKey: p.assetKey ?? 'test:asset',
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

function findRow(rows: CapitalGainRow[]): CapitalGainRow {
  expect(rows).toHaveLength(1);
  return rows[0]!;
}

describe('capitalGains.service — CII gap handling (TASK 02)', () => {
  it('bond bought in a covered year, sold in the last CII-covered FY → indexation applies, no flag', () => {
    const txs = [
      tx({ id: 'b1', assetClass: 'BOND', transactionType: 'BUY', tradeDate: '2010-06-01', quantity: '10', netAmount: '10000', assetKey: 'bond:1' }),
      tx({ id: 's1', assetClass: 'BOND', transactionType: 'SELL', tradeDate: '2025-01-15', quantity: '10', netAmount: '20000', assetKey: 'bond:1' }),
    ];
    const row = findRow(computeFIFOGains(txs));
    expect(row.capitalGainType).toBe('LONG_TERM');
    expect(row.indexedCostOfAcquisition).not.toBeNull();
    expect(row.needsReview).toBe(false);
    expect(row.reviewReason).toBeNull();
  });

  it('bond sold in a hypothetical future FY with no CII entry → flagged, non-indexed fallback, no crash', () => {
    const txs = [
      tx({ id: 'b1', assetClass: 'BOND', transactionType: 'BUY', tradeDate: '2010-06-01', quantity: '10', netAmount: '10000', assetKey: 'bond:2' }),
      tx({ id: 's1', assetClass: 'BOND', transactionType: 'SELL', tradeDate: '2040-06-01', quantity: '10', netAmount: '20000', assetKey: 'bond:2' }),
    ];
    const row = findRow(computeFIFOGains(txs));
    expect(row.capitalGainType).toBe('LONG_TERM');
    // Non-indexed fallback: taxableGain === gainLoss, not a crash, not silently "normal".
    expect(row.indexedCostOfAcquisition).toBeNull();
    expect(row.taxableGain.toString()).toBe(row.gainLoss.toString());
    expect(row.needsReview).toBe(true);
    expect(row.reviewReason).toContain('CII not available');
    expect(row.reviewReason).toContain('2040-41');
  });

  it('equity sale in the same uncovered future FY is unaffected — equity never used indexation', () => {
    const txs = [
      tx({ id: 'b1', assetClass: 'EQUITY', transactionType: 'BUY', tradeDate: '2010-06-01', quantity: '10', netAmount: '1000', assetKey: 'stock:1' }),
      tx({ id: 's1', assetClass: 'EQUITY', transactionType: 'SELL', tradeDate: '2040-06-01', quantity: '10', netAmount: '5000', assetKey: 'stock:1' }),
    ];
    const row = findRow(computeFIFOGains(txs));
    expect(row.capitalGainType).toBe('LONG_TERM');
    expect(row.needsReview).toBe(false);
    expect(row.reviewReason).toBeNull();
  });

  // Real estate: `Transaction` rows with assetClass REAL_ESTATE are a distinct
  // ingestion path from `OwnedProperty` sales (propertyCapitalGain.ts, which
  // has its own 20%-indexed/12.5%-non-indexed choice model driven by the same
  // `CII_BY_FY` table). A user who logs a property sale as a plain
  // Transaction instead of via OwnedProperty DOES flow through
  // `computeFIFOGains`/CII here — the two systems are not mutually
  // exclusive, so keep both reading from `CII_BY_FY` (see the comment above
  // the `CII` constant in capitalGains.service.ts).
  it('real estate booked as a plain Transaction also flows through computeFIFOGains (not exclusively OwnedProperty)', () => {
    const txs = [
      tx({ id: 'b1', assetClass: 'REAL_ESTATE', transactionType: 'BUY', tradeDate: '2010-06-01', quantity: '1', netAmount: '1000000', assetKey: 'name:flat' }),
      tx({ id: 's1', assetClass: 'REAL_ESTATE', transactionType: 'SELL', tradeDate: '2025-01-15', quantity: '1', netAmount: '2000000', assetKey: 'name:flat' }),
    ];
    const row = findRow(computeFIFOGains(txs));
    expect(row.capitalGainType).toBe('LONG_TERM');
    expect(row.indexedCostOfAcquisition).not.toBeNull();
    expect(row.needsReview).toBe(false);
  });

  it('never throws for any qualifying asset class sold in an uncovered FY', () => {
    for (const ac of Object.values(AssetClass)) {
      if (!qualifiesForIndexation(ac, new Date('2010-06-01'))) continue;
      const txs = [
        tx({ id: `b-${ac}`, assetClass: ac, transactionType: 'BUY', tradeDate: '2010-06-01', quantity: '10', netAmount: '10000', assetKey: `t:${ac}` }),
        tx({ id: `s-${ac}`, assetClass: ac, transactionType: 'SELL', tradeDate: '2040-06-01', quantity: '10', netAmount: '20000', assetKey: `t:${ac}` }),
      ];
      expect(() => computeFIFOGains(txs)).not.toThrow();
      const row = findRow(computeFIFOGains(txs));
      expect(row.needsReview).toBe(true);
      expect(row.reviewReason).toBeTruthy();
    }
  });

  /**
   * CI guard: every `AssetClass` for which `qualifiesForIndexation()` can
   * ever return `true` must be a class the author has deliberately reasoned
   * about here — if a future asset class is added to the enum and also
   * wired into `qualifiesForIndexation()`, this list must be updated in the
   * same change, or this test fails and forces the decision to be explicit
   * instead of silently falling into the `cii_unavailable` path unnoticed.
   */
  it('CII-coverage guard: every indexation-eligible asset class is a reviewed, documented decision', () => {
    const DOCUMENTED_INDEXATION_ELIGIBLE = new Set<AssetClass>([
      AssetClass.BOND,
      AssetClass.CORPORATE_BOND,
      AssetClass.GOVT_BOND,
      AssetClass.GOLD_BOND,
      AssetClass.GOLD_ETF,
      AssetClass.PHYSICAL_GOLD,
      AssetClass.PHYSICAL_SILVER,
      AssetClass.REAL_ESTATE,
      AssetClass.MUTUAL_FUND, // only pre-1-Apr-2023 buys; see DEBT_MF_INDEXATION_CUTOFF
    ]);
    const oldBuyDate = new Date('2010-06-01');
    const actuallyEligible = Object.values(AssetClass).filter((ac) =>
      qualifiesForIndexation(ac, oldBuyDate),
    );
    for (const ac of actuallyEligible) {
      expect(
        DOCUMENTED_INDEXATION_ELIGIBLE.has(ac),
        `AssetClass.${ac} newly qualifies for indexation but isn't in the reviewed list — ` +
          `update DOCUMENTED_INDEXATION_ELIGIBLE here after confirming CII coverage intentionally.`,
      ).toBe(true);
    }
    // Sanity: the CBDT source table itself isn't empty (would make every
    // indexation-eligible row silently fall into cii_unavailable).
    expect(Object.keys(CII_BY_FY).length).toBeGreaterThan(0);
  });
});
