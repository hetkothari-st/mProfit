import { Decimal } from 'decimal.js';

/**
 * GST pieces for a CA's invoices: state codes, GSTIN validation, totals and
 * the invoice number. Shared so the invoice form can preview exactly what the
 * server will store.
 */

/** GST state and union-territory codes (the first two characters of a GSTIN). */
export const GST_STATES: Readonly<Record<string, string>> = {
  '01': 'Jammu and Kashmir',
  '02': 'Himachal Pradesh',
  '03': 'Punjab',
  '04': 'Chandigarh',
  '05': 'Uttarakhand',
  '06': 'Haryana',
  '07': 'Delhi',
  '08': 'Rajasthan',
  '09': 'Uttar Pradesh',
  '10': 'Bihar',
  '11': 'Sikkim',
  '12': 'Arunachal Pradesh',
  '13': 'Nagaland',
  '14': 'Manipur',
  '15': 'Mizoram',
  '16': 'Tripura',
  '17': 'Meghalaya',
  '18': 'Assam',
  '19': 'West Bengal',
  '20': 'Jharkhand',
  '21': 'Odisha',
  '22': 'Chhattisgarh',
  '23': 'Madhya Pradesh',
  '24': 'Gujarat',
  '26': 'Dadra and Nagar Haveli and Daman and Diu',
  '27': 'Maharashtra',
  '29': 'Karnataka',
  '30': 'Goa',
  '31': 'Lakshadweep',
  '32': 'Kerala',
  '33': 'Tamil Nadu',
  '34': 'Puducherry',
  '35': 'Andaman and Nicobar Islands',
  '36': 'Telangana',
  '37': 'Andhra Pradesh',
  '38': 'Ladakh',
  '97': 'Other Territory',
};

const GSTIN_SHAPE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const CHARSET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/** The GSTIN check character: a Luhn-style mod-36 sum over the first 14. */
function gstinCheckChar(first14: string): string {
  let factor = 2;
  let sum = 0;
  for (let i = first14.length - 1; i >= 0; i--) {
    const product = factor * CHARSET.indexOf(first14[i]!);
    factor = factor === 2 ? 1 : 2;
    sum += Math.floor(product / 36) + (product % 36);
  }
  return CHARSET[(36 - (sum % 36)) % 36]!;
}

export function isValidGstin(raw: string | null | undefined): boolean {
  const g = (raw ?? '').trim().toUpperCase();
  if (!GSTIN_SHAPE.test(g)) return false;
  if (!(g.slice(0, 2) in GST_STATES)) return false;
  return gstinCheckChar(g.slice(0, 14)) === g[14];
}

export function gstinStateCode(gstin: string): string {
  return gstin.trim().slice(0, 2);
}

export interface InvoiceLineAmount {
  /** Taxable value, as a decimal string. */
  amount: string;
  /** GST rate in percent, e.g. "18". */
  gstRatePct: string;
}

export interface InvoiceTotals {
  taxable: string;
  cgst: string;
  sgst: string;
  igst: string;
  total: string;
}

const two = (d: Decimal) => d.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

/**
 * Totals for an invoice. Tax is worked out per rate on the summed taxable
 * value and rounded half-up to the paisa, each component on its own (as
 * invoices are printed): within a state CGST and SGST are each half the rate;
 * across states it is IGST. A supplier not registered for GST charges none.
 */
export function invoiceTotals(
  lines: InvoiceLineAmount[],
  opts: { sellerRegistered: boolean; intraState: boolean },
): InvoiceTotals {
  const byRate = new Map<string, Decimal>();
  for (const l of lines) {
    const rate = new Decimal(l.gstRatePct).toString();
    byRate.set(rate, (byRate.get(rate) ?? new Decimal(0)).plus(new Decimal(l.amount)));
  }
  let taxable = new Decimal(0);
  let cgst = new Decimal(0);
  let sgst = new Decimal(0);
  let igst = new Decimal(0);
  for (const [rate, base] of byRate) {
    taxable = taxable.plus(base);
    if (!opts.sellerRegistered) continue;
    const r = new Decimal(rate).dividedBy(100);
    if (opts.intraState) {
      const half = two(base.times(r).dividedBy(2));
      cgst = cgst.plus(half);
      sgst = sgst.plus(half);
    } else {
      igst = igst.plus(two(base.times(r)));
    }
  }
  const t = two(taxable);
  return {
    taxable: t.toFixed(2),
    cgst: cgst.toFixed(2),
    sgst: sgst.toFixed(2),
    igst: igst.toFixed(2),
    total: t.plus(cgst).plus(sgst).plus(igst).toFixed(2),
  };
}

/**
 * "INV/25-26/0001". GST wants a consecutive series, unique within a financial
 * year, at most 16 characters: a prefix of up to four characters keeps it so.
 */
export function nextInvoiceNumber(prefix: string, financialYear: string, issuedThisYear: number): string {
  const fy = `${financialYear.slice(2, 4)}-${financialYear.slice(5, 7)}`;
  return `${prefix}/${fy}/${String(issuedThisYear + 1).padStart(4, '0')}`;
}
