import { describe, it, expect } from 'vitest';
import { estimateEquityCharges } from './charges.js';

describe('estimateEquityCharges', () => {
  it('delivery buy of Rs 1,00,000 on NSE: STT, stamp duty, exchange, SEBI and GST on the fees', () => {
    expect(estimateEquityCharges({ side: 'BUY', quantity: '100', price: '1000' })).toEqual({
      stt: '100.00', //            0.1%
      stampDuty: '15.00', //       0.015% on the buy side
      exchangeCharges: '2.97', //  0.00297%
      sebiCharges: '0.10', //      0.0001%
      gst: '0.55', //              18% of (2.97 + 0.10) = 0.5526
    });
  });

  it('delivery sell has STT but no stamp duty', () => {
    const e = estimateEquityCharges({ side: 'SELL', quantity: '100', price: '1000' })!;
    expect(e.stt).toBe('100.00');
    expect(e.stampDuty).toBe('0.00');
  });

  it('intraday: STT only on the sell side, lower stamp duty on the buy side', () => {
    expect(estimateEquityCharges({ side: 'SELL', quantity: '100', price: '1000', intraday: true })!.stt).toBe('25.00');
    const buy = estimateEquityCharges({ side: 'BUY', quantity: '100', price: '1000', intraday: true })!;
    expect(buy.stt).toBe('0.00');
    expect(buy.stampDuty).toBe('3.00');
  });

  it('rounds STT to the nearest rupee, as contract notes do', () => {
    // 0.1% of 1,23,456 = 123.456
    expect(estimateEquityCharges({ side: 'BUY', quantity: '1', price: '123456' })!.stt).toBe('123.00');
    // 0.1% of 1,23,500 = 123.5 -> 124
    expect(estimateEquityCharges({ side: 'BUY', quantity: '1', price: '123500' })!.stt).toBe('124.00');
  });

  it('puts the user\'s brokerage into the GST base', () => {
    // GST = 18% of (20 + 2.97 + 0.10) = 4.1526
    expect(estimateEquityCharges({ side: 'BUY', quantity: '100', price: '1000', brokerage: '20' })!.gst).toBe('4.15');
  });

  it('uses the BSE exchange rate when asked', () => {
    expect(estimateEquityCharges({ side: 'BUY', quantity: '100', price: '1000', exchange: 'BSE' })!.exchangeCharges).toBe('3.75');
  });

  it('keeps fractional quantities and prices exact', () => {
    const e = estimateEquityCharges({ side: 'BUY', quantity: '3', price: '33.33' })!; // turnover 99.99
    expect(e.stt).toBe('0.00'); // 0.09999 rounds to nothing
    expect(e.stampDuty).toBe('0.01'); // 0.0149985
  });

  it('returns null for inputs that are not a trade', () => {
    expect(estimateEquityCharges({ side: 'BUY', quantity: '0', price: '100' })).toBeNull();
    expect(estimateEquityCharges({ side: 'BUY', quantity: '10', price: '-1' })).toBeNull();
    expect(estimateEquityCharges({ side: 'BUY', quantity: 'abc', price: '100' })).toBeNull();
  });
});
