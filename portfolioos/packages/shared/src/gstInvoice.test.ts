import { describe, it, expect } from 'vitest';
import { GST_STATES, gstinStateCode, invoiceTotals, isValidGstin, nextInvoiceNumber } from './gstInvoice';

describe('GSTIN', () => {
  it('accepts a well-formed GSTIN with a correct check character', () => {
    expect(isValidGstin('27AAPFU0939F1ZV')).toBe(true);
    expect(gstinStateCode('27AAPFU0939F1ZV')).toBe('27');
  });
  it('rejects a wrong check character, a bad shape or an unknown state', () => {
    expect(isValidGstin('27AAPFU0939F1ZW')).toBe(false);
    expect(isValidGstin('27AAPFU0939F1Z')).toBe(false);
    expect(isValidGstin('99AAPFU0939F1ZV')).toBe(false);
  });
  it('knows the state codes', () => {
    expect(GST_STATES['27']).toBe('Maharashtra');
    expect(GST_STATES['29']).toBe('Karnataka');
  });
});

describe('invoiceTotals', () => {
  const lines = [
    { amount: '10000', gstRatePct: '18' },
    { amount: '2500.50', gstRatePct: '18' },
  ];

  it('splits GST into CGST and SGST within the state', () => {
    expect(invoiceTotals(lines, { sellerRegistered: true, intraState: true })).toEqual({
      taxable: '12500.50',
      cgst: '1125.05',
      sgst: '1125.05',
      igst: '0.00',
      total: '14750.60',
    });
  });

  it('charges IGST across states', () => {
    expect(invoiceTotals(lines, { sellerRegistered: true, intraState: false })).toEqual({
      taxable: '12500.50',
      cgst: '0.00',
      sgst: '0.00',
      igst: '2250.09',
      total: '14750.59',
    });
  });

  it('charges no tax when the seller is not registered', () => {
    expect(invoiceTotals(lines, { sellerRegistered: false, intraState: true })).toEqual({
      taxable: '12500.50',
      cgst: '0.00',
      sgst: '0.00',
      igst: '0.00',
      total: '12500.50',
    });
  });
});

describe('nextInvoiceNumber', () => {
  it('numbers per financial year, within GST’s 16 characters', () => {
    expect(nextInvoiceNumber('INV', '2025-26', 0)).toBe('INV/25-26/0001');
    expect(nextInvoiceNumber('AB', '2026-27', 41)).toBe('AB/26-27/0042');
    expect(nextInvoiceNumber('INV', '2025-26', 0).length).toBeLessThanOrEqual(16);
  });
});
