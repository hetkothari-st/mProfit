import { describe, it, expect } from 'vitest';
import { indexSource, verifyFigures } from '../../src/ingestion/verify/sourceVerification.js';

/**
 * AI-read figures must appear in the document they were read from. These
 * cases are the shapes real alerts and statements take (Indian grouping,
 * rounded display, several date styles) and the ways a model goes wrong
 * (an invented amount, a swapped digit, a product that does not add up).
 */
const ALERT = `Dear Customer, Rs.1,23,456.78 has been debited from A/c XX1234 on 05-Apr-2024
towards purchase of 150.234 units of HDFC Large Cap Fund (ISIN INF179K01YV8) at NAV 821.7891.`;

describe('verifyFigures', () => {
  const src = indexSource(ALERT);

  it('accepts figures that are printed, in Indian grouping', () => {
    expect(
      verifyFigures(
        { amount: '123456.78', quantity: '150.234', price: '821.7891', isin: 'INF179K01YV8', date: '2024-04-05', isTrade: true },
        src,
      ),
    ).toEqual([]);
  });

  it('rejects an amount the document never shows', () => {
    expect(verifyFigures({ amount: '123465.78' }, src)).toEqual([
      'amount 123465.78 does not appear in the document',
    ]);
  });

  it('rejects a date the document never shows', () => {
    expect(verifyFigures({ date: '2024-05-04' }, src)).toEqual(['date 2024-05-04 does not appear in the document']);
  });

  it('rejects an ISIN that is not in the document', () => {
    expect(verifyFigures({ isin: 'INF179K01YV9' }, src)).toEqual(['ISIN INF179K01YV9 does not appear in the document']);
  });

  it('flags quantity × price that does not make the amount', () => {
    const doc = indexSource('Bought 10 shares at 100.00, total 5000.00 on 2024-01-02');
    expect(verifyFigures({ amount: '5000', quantity: '10', price: '100', isTrade: true }, doc)).toEqual([
      'quantity × price (1000.00) does not match the amount 5000',
    ]);
  });

  it('allows charges inside the tolerance', () => {
    const doc = indexSource('Bought 10 shares at 100.00, total incl. charges 1012.40');
    expect(verifyFigures({ amount: '1012.40', quantity: '10', price: '100', isTrade: true }, doc)).toEqual([]);
  });

  it('accepts a figure the document shows rounded, not a different one', () => {
    const doc = indexSource('Units allotted: 150.23');
    expect(verifyFigures({ quantity: '150.234' }, doc)).toEqual([]);
    expect(verifyFigures({ quantity: '150.284' }, doc)).toEqual(['quantity 150.284 does not appear in the document']);
  });

  it('accepts a total printed without its parts (FD principal, price 1)', () => {
    const doc = indexSource('Fixed Deposit of Rs 2,00,000.00 booked on 01/01/2024 at 7.10%');
    expect(verifyFigures({ quantity: '200000', price: '1', date: '2024-01-01' }, doc)).toEqual([]);
  });

  it('reads the common date styles', () => {
    for (const text of ['on 2024-03-31', 'on 31/03/2024', 'on 31-Mar-2024', 'on 31 March 2024', 'on Mar 31, 2024']) {
      expect(indexSource(text).dates.has('2024-03-31'), text).toBe(true);
    }
  });
});
