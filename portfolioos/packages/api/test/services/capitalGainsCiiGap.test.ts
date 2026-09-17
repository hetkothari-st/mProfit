import { describe, it, expect } from 'vitest';
import { Decimal } from 'decimal.js';
import { AssetClass, type Transaction } from '@prisma/client';
import { CII_BY_FY } from '@everypaisa/shared';
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
  it('gold bought in a covered year and sold before 23-Jul-2024 → indexation applies, no flag', () => {
    const txs = [
      tx({ id: 'b1', assetClass: 'PHYSICAL_GOLD', transactionType: 'BUY', tradeDate: '2010-06-01', quantity: '10', netAmount: '10000', assetKey: 'gold:1' }),
      tx({ id: 's1', assetClass: 'PHYSICAL_GOLD', transactionType: 'SELL', tradeDate: '2024-06-01', quantity: '10', netAmount: '20000', assetKey: 'gold:1' }),
    ];
    const row = findRow(computeFIFOGains(txs));
    expect(row.capitalGainType).toBe('LONG_TERM');
    // CII 2010-11 = 167, 2024-25 = 363.
    expect(row.indexedCostOfAcquisition!.toFixed(2)).toBe('21736.53');
    expect(row.needsReview).toBe(false);
    expect(row.reviewReason).toBeNull();
  });

  it('gold sold on/after 23-Jul-2024 → no indexation (Finance (No. 2) Act 2024)', () => {
    const txs = [
      tx({ id: 'b1', assetClass: 'PHYSICAL_GOLD', transactionType: 'BUY', tradeDate: '2010-06-01', quantity: '10', netAmount: '10000', assetKey: 'gold:2' }),
      tx({ id: 's1', assetClass: 'PHYSICAL_GOLD', transactionType: 'SELL', tradeDate: '2025-01-15', quantity: '10', netAmount: '20000', assetKey: 'gold:2' }),
    ];
    const row = findRow(computeFIFOGains(txs));
    expect(row.capitalGainType).toBe('LONG_TERM');
    expect(row.indexedCostOfAcquisition).toBeNull();
    expect(row.taxableGain.toString()).toBe('10000');
    expect(row.needsReview).toBe(false);
  });

  it('purchase before the CII base year (FY 2001-02) → flagged, non-indexed fallback, no crash', () => {
    const txs = [
      tx({ id: 'b1', assetClass: 'PHYSICAL_GOLD', transactionType: 'BUY', tradeDate: '1995-06-01', quantity: '10', netAmount: '10000', assetKey: 'gold:3' }),
      tx({ id: 's1', assetClass: 'PHYSICAL_GOLD', transactionType: 'SELL', tradeDate: '2020-06-01', quantity: '10', netAmount: '20000', assetKey: 'gold:3' }),
    ];
    const row = findRow(computeFIFOGains(txs));
    expect(row.capitalGainType).toBe('LONG_TERM');
    // Non-indexed fallback: taxableGain === gainLoss, not a crash, not silently "normal".
    expect(row.indexedCostOfAcquisition).toBeNull();
    expect(row.taxableGain.toString()).toBe(row.gainLoss.toString());
    expect(row.needsReview).toBe(true);
    expect(row.reviewReason).toContain('CII not available');
    expect(row.reviewReason).toContain('1995-96');
  });

  it('bonds and debentures never get indexation (sec 48)', () => {
    const txs = [
      tx({ id: 'b1', assetClass: 'BOND', transactionType: 'BUY', tradeDate: '2010-06-01', quantity: '10', netAmount: '10000', assetKey: 'bond:1' }),
      tx({ id: 's1', assetClass: 'BOND', transactionType: 'SELL', tradeDate: '2020-01-15', quantity: '10', netAmount: '20000', assetKey: 'bond:1' }),
    ];
    const row = findRow(computeFIFOGains(txs));
    expect(row.capitalGainType).toBe('LONG_TERM');
    expect(row.indexedCostOfAcquisition).toBeNull();
    expect(row.taxableGain.toString()).toBe('10000');
  });

  it('equity sale in an uncovered future FY is unaffected — equity never used indexation', () => {
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
  // ingestion path from `OwnedProperty` sales (propertyCapitalGain.ts). Both
  // read `CII_BY_FY`.
  it('real estate booked as a plain Transaction also flows through computeFIFOGains (not exclusively OwnedProperty)', () => {
    const before = [
      tx({ id: 'b1', assetClass: 'REAL_ESTATE', transactionType: 'BUY', tradeDate: '2010-06-01', quantity: '1', netAmount: '1000000', assetKey: 'name:flat' }),
      tx({ id: 's1', assetClass: 'REAL_ESTATE', transactionType: 'SELL', tradeDate: '2024-06-15', quantity: '1', netAmount: '2000000', assetKey: 'name:flat' }),
    ];
    const indexedRow = findRow(computeFIFOGains(before));
    expect(indexedRow.capitalGainType).toBe('LONG_TERM');
    expect(indexedRow.indexedCostOfAcquisition).not.toBeNull();
    expect(indexedRow.needsReview).toBe(false);

    const after = [
      tx({ id: 'b2', assetClass: 'REAL_ESTATE', transactionType: 'BUY', tradeDate: '2010-06-01', quantity: '1', netAmount: '1000000', assetKey: 'name:flat2' }),
      tx({ id: 's2', assetClass: 'REAL_ESTATE', transactionType: 'SELL', tradeDate: '2025-01-15', quantity: '1', netAmount: '2000000', assetKey: 'name:flat2' }),
    ];
    const newRegime = findRow(computeFIFOGains(after));
    expect(newRegime.indexedCostOfAcquisition).toBeNull();
    expect(newRegime.taxableGain.toString()).toBe('1000000');
    // Resident sellers keep the 20%-with-indexation option for pre-cutoff land/buildings.
    expect(newRegime.needsReview).toBe(true);
    expect(newRegime.reviewReason).toContain('20% on the indexed gain');
  });

  it('never throws for any indexation-eligible asset class whose purchase predates the CII table', () => {
    for (const ac of Object.values(AssetClass)) {
      if (!qualifiesForIndexation(ac, new Date('2010-06-01'))) continue;
      const txs = [
        tx({ id: `b-${ac}`, assetClass: ac, transactionType: 'BUY', tradeDate: '1995-06-01', quantity: '10', netAmount: '10000', assetKey: `t:${ac}` }),
        tx({ id: `s-${ac}`, assetClass: ac, transactionType: 'SELL', tradeDate: '2020-06-01', quantity: '10', netAmount: '20000', assetKey: `t:${ac}` }),
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
      AssetClass.GOLD_BOND, // SGBs keep indexation (sec 48); other bonds and debentures never did
      AssetClass.FOREIGN_EQUITY,
      AssetClass.PRIVATE_EQUITY,
      AssetClass.PMS,
      AssetClass.AIF,
      AssetClass.ART_COLLECTIBLES,
      AssetClass.OTHER,
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
