import { describe, it, expect } from 'vitest';
import { Decimal } from 'decimal.js';
import {
  summarizeCapitalGains,
  type CapitalGainRow,
} from '../../src/services/capitalGains.service.js';
import { computePropertyCapitalGain } from '../../src/services/propertyCapitalGain.js';

function row(type: CapitalGainRow['capitalGainType'], gain: string, assetClass: CapitalGainRow['assetClass'] = 'EQUITY'): CapitalGainRow {
  const g = new Decimal(gain);
  return {
    portfolioId: 'p',
    sellTransactionId: 's',
    buyTransactionId: 'b',
    assetClass,
    assetName: 'x',
    isin: null,
    buyDate: new Date('2024-01-01T00:00:00Z'),
    sellDate: new Date('2024-09-01T00:00:00Z'),
    quantity: new Decimal(1),
    buyPrice: new Decimal(0),
    sellPrice: new Decimal(0),
    buyAmount: new Decimal(0),
    sellAmount: new Decimal(0),
    indexedCostOfAcquisition: null,
    capitalGainType: type,
    gainLoss: g,
    taxableGain: g,
    financialYear: '2024-25',
    isEquityOriented: true,
    needsReview: false,
    reviewReason: null,
  };
}

describe('summary taxable applies set-off rules instead of netting everything', () => {
  it('a long-term loss does not reduce short-term gains; an intraday loss stays within speculation', () => {
    const s = summarizeCapitalGains([
      row('LONG_TERM', '-80000'),
      row('SHORT_TERM', '100000'),
      row('INTRADAY', '-20000'),
    ])['2024-25']!;
    expect(s.taxable.toString()).toBe('100000');
    expect(s.ltcg.toString()).toBe('-80000');
    expect(s.intraday.toString()).toBe('-20000');
  });

  it('a short-term loss reduces long-term gains', () => {
    const s = summarizeCapitalGains([row('SHORT_TERM', '-30000'), row('LONG_TERM', '100000')])['2024-25']!;
    expect(s.taxable.toString()).toBe('70000');
  });

  it('crypto losses offset nothing', () => {
    const s = summarizeCapitalGains([
      row('SHORT_TERM', '50000', 'CRYPTOCURRENCY'),
      row('SHORT_TERM', '-40000', 'CRYPTOCURRENCY'),
      row('SHORT_TERM', '-10000'),
    ])['2024-25']!;
    expect(s.taxable.toString()).toBe('50000');
  });
});

const property = (purchaseDate: string, saleDate: string, price = '5000000', sale = '8000000') => ({
  id: 'p1',
  purchaseDate: new Date(`${purchaseDate}T00:00:00Z`),
  purchasePrice: price,
  stampDuty: null,
  registrationFee: null,
  brokerage: null,
  otherCosts: null,
  ownershipPercent: null,
  saleDate: new Date(`${saleDate}T00:00:00Z`),
  salePrice: sale,
  saleBrokerage: null,
});

describe('property capital gain regimes', () => {
  it('held exactly 24 months is short-term; a day more is long-term', () => {
    expect(computePropertyCapitalGain(property('2022-05-10', '2024-05-10'))!.isLongTerm).toBe(false);
    expect(computePropertyCapitalGain(property('2022-05-10', '2024-05-11'))!.isLongTerm).toBe(true);
  });

  it('sold before 23-Jul-2024: only the indexed 20% regime, no 12.5% option', () => {
    const cg = computePropertyCapitalGain(property('2020-06-01', '2023-06-01'))!;
    expect(cg.regime).toBe('INDEXED_20');
    expect(cg.hasIndexationChoice).toBe(false);
    // CII 2020-21 = 301, 2023-24 = 348.
    expect(cg.indexedCost).toBe('5780730.9000');
  });

  it('bought before and sold after 23-Jul-2024: choice of either regime', () => {
    const cg = computePropertyCapitalGain(property('2020-06-01', '2025-01-15'))!;
    expect(cg.regime).toBe('CHOICE');
    expect(cg.hasIndexationChoice).toBe(true);
  });

  it('bought on/after 23-Jul-2024: 12.5% only', () => {
    const cg = computePropertyCapitalGain(property('2024-08-01', '2026-09-01'))!;
    expect(cg.regime).toBe('NON_INDEXED_12_5');
    expect(cg.ciiUnavailable).toBe(false);
  });

  it('a missing CII value is flagged instead of being shown as "bought after 23-Jul-2024"', () => {
    const cg = computePropertyCapitalGain(property('1998-01-01', '2024-06-01'))!;
    expect(cg.regime).toBe('INDEXED_20');
    expect(cg.ciiUnavailable).toBe(true);
  });
});
