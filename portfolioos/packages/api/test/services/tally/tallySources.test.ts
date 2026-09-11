import { describe, it, expect } from 'vitest';
import { Decimal } from 'decimal.js';
import { cardStatementDate, mapTrade, rentFromLedger, type TradeRow } from '../../../src/services/tally/tallySources.js';

// The loader's rules, as pure functions over database-shaped rows.

const dec = (v: string) => new Decimal(v);

function row(over: Partial<TradeRow> = {}): TradeRow {
  return {
    id: 't1',
    assetClass: 'EQUITY',
    transactionType: 'BUY',
    tradeDate: new Date('2024-04-15T00:00:00Z'),
    quantity: dec('10'),
    price: dec('1450'),
    grossAmount: dec('14500'),
    brokerage: dec('15'),
    stt: dec('3'),
    stampDuty: dec('1'),
    exchangeCharges: dec('0.5'),
    gst: dec('0.3'),
    sebiCharges: dec('0.2'),
    otherCharges: dec('0'),
    currency: null,
    fxRateAtTrade: null,
    assetKey: 'stock:inf',
    stockId: 's1',
    fundId: null,
    assetName: 'INFY',
    stock: { name: 'Infosys Ltd' },
    fund: null,
    capitalGains: [],
    ...over,
  };
}

describe('mapTrade', () => {
  it('adds up every charge on the contract note', () => {
    expect(mapTrade(row())).toMatchObject({
      trade: {
        id: 't1',
        date: '2024-04-15',
        kind: 'BUY',
        holdingKey: 'stock:inf',
        holdingName: 'Infosys Ltd',
        gross: '14500',
        charges: '20',
        cost: null,
      },
    });
  });

  it('names a fund by its scheme, and otherwise by the name typed in', () => {
    expect(mapTrade(row({ stock: null, fund: { schemeName: 'Axis Bluechip Fund - Direct Growth' } }))).toMatchObject({
      trade: { holdingName: 'Axis Bluechip Fund - Direct Growth' },
    });
    expect(mapTrade(row({ stock: null, fund: null, assetName: 'Gold coins' }))).toMatchObject({
      trade: { holdingName: 'Gold coins' },
    });
  });

  it('keys a holding with no asset key by its stock, fund or name', () => {
    expect(mapTrade(row({ assetKey: null }))).toMatchObject({ trade: { holdingKey: 'stock:s1' } });
    expect(mapTrade(row({ assetKey: null, stockId: null, fundId: 'f9' }))).toMatchObject({ trade: { holdingKey: 'fund:f9' } });
    expect(mapTrade(row({ assetKey: null, stockId: null, assetName: '  Gold Coins ' }))).toMatchObject({
      trade: { holdingKey: 'name:gold coins' },
    });
  });

  it('takes cost and gains for a sale from its capital-gains records', () => {
    const sale = mapTrade(
      row({
        transactionType: 'SELL',
        capitalGains: [
          { buyAmount: dec('3000'), gainLoss: dec('200'), capitalGainType: 'SHORT_TERM' },
          { buyAmount: dec('2800'), gainLoss: dec('390'), capitalGainType: 'LONG_TERM' },
        ],
      }),
    );
    expect(sale).toMatchObject({ trade: { cost: '5800', shortTermGain: '200', longTermGain: '390' } });
  });

  it('converts a foreign-currency trade to rupees at the rate on the trade', () => {
    const usd = mapTrade(
      row({
        currency: 'USD',
        fxRateAtTrade: dec('83.5'),
        price: dec('10'),
        grossAmount: dec('100'),
        brokerage: dec('1'),
        stt: dec('0'),
        stampDuty: dec('0'),
        exchangeCharges: dec('0'),
        gst: dec('0'),
        sebiCharges: dec('0'),
      }),
    );
    expect(usd).toMatchObject({ trade: { gross: '8350', charges: '83.5', price: '835' } });
  });

  it('leaves out a foreign trade with no rate, and says why', () => {
    const out = mapTrade(row({ currency: 'USD', fxRateAtTrade: null }));
    expect('skip' in out && out.skip).toMatch(/rate/);
  });
});

describe('cardStatementDate', () => {
  it("dates a statement on the card's statement day, within the month", () => {
    expect(cardStatementDate('2024-05', 5)).toBe('2024-05-05');
    expect(cardStatementDate('2024-02', 31)).toBe('2024-02-29');
    expect(cardStatementDate('2023-02', 30)).toBe('2023-02-28');
  });
});

describe('rentFromLedger', () => {
  it('reads money from the rent ledger, and from receipts only where the ledger has no payments', () => {
    const out = rentFromLedger(
      [
        { id: 'e1', tenancyId: 'ten1', entryType: 'PAYMENT', amount: dec('25000'), entryDate: new Date('2024-05-03'), property: 'Andheri Flat', tenant: 'Ravi' },
        { id: 'e2', tenancyId: 'ten1', entryType: 'DISCOUNT', amount: dec('500'), entryDate: new Date('2024-05-03'), property: 'Andheri Flat', tenant: 'Ravi' },
        { id: 'e3', tenancyId: 'ten1', entryType: 'DEPOSIT', amount: dec('50000'), entryDate: new Date('2024-04-01'), property: 'Andheri Flat', tenant: 'Ravi' },
      ],
      [
        { id: 'r1', tenancyId: 'ten1', receivedAmount: dec('25000'), receivedOn: new Date('2024-05-03'), property: 'Andheri Flat', tenant: 'Ravi' },
        { id: 'r2', tenancyId: 'ten2', receivedAmount: dec('18000'), receivedOn: new Date('2023-11-05'), property: 'Pune Flat', tenant: 'Asha' },
        { id: 'r3', tenancyId: 'ten2', receivedAmount: null, receivedOn: null, property: 'Pune Flat', tenant: 'Asha' },
      ],
    );
    expect(out).toEqual([
      { id: 'e1', date: '2024-05-03', property: 'Andheri Flat', tenant: 'Ravi', kind: 'PAYMENT', amount: '25000' },
      { id: 'e3', date: '2024-04-01', property: 'Andheri Flat', tenant: 'Ravi', kind: 'DEPOSIT', amount: '50000' },
      { id: 'r2', date: '2023-11-05', property: 'Pune Flat', tenant: 'Asha', kind: 'PAYMENT', amount: '18000' },
    ]);
  });
});
