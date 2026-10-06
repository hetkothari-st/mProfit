import { describe, it, expect } from 'vitest';
import { Decimal } from 'decimal.js';
import type { CapitalGainRow } from '../../src/services/capitalGains.service.js';
import { listedEquityLtcgExemptionFor } from '@everypaisa/shared';
import { computeCapitalGainsTax } from '../../src/services/taxComputation.js';

function row(p: {
  type: CapitalGainRow['capitalGainType'];
  gain: string;
  taxable?: string;
  sell: string;
  equity?: boolean;
  assetClass?: CapitalGainRow['assetClass'];
  indexed?: boolean;
}): CapitalGainRow {
  return {
    portfolioId: 'p',
    sellTransactionId: 's',
    buyTransactionId: 'b',
    assetClass: p.assetClass ?? (p.equity === false ? 'PHYSICAL_GOLD' : 'EQUITY'),
    assetName: 'x',
    isin: null,
    buyDate: new Date('2015-01-01T00:00:00Z'),
    sellDate: new Date(`${p.sell}T00:00:00Z`),
    quantity: new Decimal(1),
    buyPrice: new Decimal(0),
    sellPrice: new Decimal(0),
    buyAmount: new Decimal(0),
    sellAmount: new Decimal(0),
    indexedCostOfAcquisition: p.indexed ? new Decimal(1) : null,
    capitalGainType: p.type,
    gainLoss: new Decimal(p.gain),
    taxableGain: new Decimal(p.taxable ?? p.gain),
    financialYear: '2024-25',
    isEquityOriented: p.equity ?? true,
    needsReview: false,
    reviewReason: null,
  };
}

describe('112A exemption by FY', () => {
  it('is 1 lakh until FY 2023-24 and 1.25 lakh from FY 2024-25', () => {
    expect(String(listedEquityLtcgExemptionFor('2023-24'))).toBe('100000');
    expect(String(listedEquityLtcgExemptionFor('2024-25'))).toBe('125000');
  });
});

describe('computeCapitalGainsTax', () => {
  it('taxes FY 2024-25 sales before 23-Jul-2024 at the old rates', () => {
    const t = computeCapitalGainsTax(
      [
        row({ type: 'SHORT_TERM', gain: '100000', sell: '2024-05-10' }),
        row({ type: 'LONG_TERM', gain: '325000', sell: '2024-06-15' }),
      ],
      '2024-25',
    );
    expect(t.s111A.tax.toString()).toBe('15000');
    // (3,25,000 − 1,25,000) × 10%
    expect(t.s112A.taxable.toString()).toBe('200000');
    expect(t.s112A.tax.toString()).toBe('20000');
  });

  it('uses the grandfathered taxable gain for 112A, not the raw gain', () => {
    const t = computeCapitalGainsTax(
      [row({ type: 'LONG_TERM', gain: '40000', taxable: '10000', sell: '2024-06-15' })],
      '2024-25',
    );
    expect(t.s112A.gain.toString()).toBe('10000');
    expect(t.s112A.tax.toString()).toBe('0');
  });

  it('sets off losses: sec 112 rows are netted, STCL reduces 112A before the exemption', () => {
    const t = computeCapitalGainsTax(
      [
        row({ type: 'LONG_TERM', gain: '100000', sell: '2025-06-01', equity: false }),
        row({ type: 'LONG_TERM', gain: '-60000', sell: '2025-07-01', equity: false, assetClass: 'BOND' }),
        row({ type: 'SHORT_TERM', gain: '-50000', sell: '2025-08-01' }),
        row({ type: 'LONG_TERM', gain: '300000', sell: '2025-09-01' }),
      ].map((r) => ({ ...r, financialYear: '2025-26' })),
      '2025-26',
    );
    // Gold +1,00,000 and bond −60,000 net to 40,000 within sec 112; the
    // 50,000 STCL then clears that 40,000 first and the last 10,000 reduces 112A.
    expect(t.s112.taxable.toString()).toBe('0');
    expect(t.s112.tax.toString()).toBe('0');
    expect(t.s112A.afterSetOff.toString()).toBe('290000');
    expect(t.s112A.taxable.toString()).toBe('165000');
  });

  it('a long-term loss never reduces short-term gains, and is carried forward', () => {
    const t = computeCapitalGainsTax(
      [
        row({ type: 'LONG_TERM', gain: '-80000', sell: '2024-09-01' }),
        row({ type: 'SHORT_TERM', gain: '100000', sell: '2024-09-01' }),
      ],
      '2024-25',
    );
    expect(t.s111A.taxable.toString()).toBe('100000');
    expect(t.carryForward.longTermLoss.toString()).toBe('80000');
  });

  it('keeps intraday losses within speculation', () => {
    const t = computeCapitalGainsTax(
      [
        row({ type: 'INTRADAY', gain: '-20000', sell: '2024-09-01' }),
        row({ type: 'SHORT_TERM', gain: '50000', sell: '2024-09-01' }),
      ],
      '2024-25',
    );
    expect(t.s111A.taxable.toString()).toBe('50000');
    expect(t.intraday.tax.toString()).toBe('0');
    expect(t.carryForward.speculativeLoss.toString()).toBe('20000');
  });
});
