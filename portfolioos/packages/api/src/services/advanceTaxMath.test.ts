import { describe, it, expect } from 'vitest';
import { Decimal } from 'decimal.js';
import { advanceTaxSchedule, ADVANCE_TAX_THRESHOLD } from './advanceTaxMath.js';

const D = (n: number) => new Decimal(n);
const march = new Date(Date.UTC(2027, 2, 20)); // after every instalment of FY 2026-27
const july = new Date(Date.UTC(2026, 6, 1)); // after June only

/** Same tax visible at every instalment: income that existed from day one. */
function flat(n: number): [Decimal, Decimal, Decimal, Decimal] {
  return [D(n), D(n), D(n), D(n)];
}

describe('advanceTaxSchedule', () => {
  it('spreads the year 15 / 45 / 75 / 100', () => {
    const r = advanceTaxSchedule({ fyStartYear: 2026, taxAsAt: flat(100000), asOf: march });
    expect(r.instalments.map((i) => Number(i.cumulativeDue))).toEqual([15000, 45000, 75000, 100000]);
    expect(Number(r.payableNow)).toBe(100000);
  });

  it('dates the instalments inside the financial year, March in the next calendar year', () => {
    const r = advanceTaxSchedule({ fyStartYear: 2026, taxAsAt: flat(100000), asOf: march });
    expect(r.instalments.map((i) => i.dueDate)).toEqual([
      '2026-06-15',
      '2026-09-15',
      '2026-12-15',
      '2027-03-15',
    ]);
  });

  // The proviso to sec 234C: a gain that had not arisen cannot make an earlier
  // instalment late. A December sale must leave June and September at zero.
  it('does not backdate a gain booked after an instalment has passed', () => {
    const r = advanceTaxSchedule({
      fyStartYear: 2026,
      taxAsAt: [D(0), D(0), D(80000), D(80000)],
      asOf: march,
    });
    const [jun, sep, dec, mar] = r.instalments;
    expect(Number(jun!.cumulativeDue)).toBe(0);
    expect(Number(sep!.cumulativeDue)).toBe(0);
    expect(jun!.interest).toBe('0.00');
    expect(Number(dec!.cumulativeDue)).toBe(60000); // 75% of 80,000
    expect(Number(mar!.cumulativeDue)).toBe(80000);
  });

  it('charges 1% a month — three months on early shortfalls, one on March', () => {
    const r = advanceTaxSchedule({ fyStartYear: 2026, taxAsAt: flat(100000), asOf: march });
    const [jun, sep, dec, mar] = r.instalments;
    expect(Number(jun!.interest)).toBeCloseTo(450, 2); // 15,000 × 3%
    expect(Number(sep!.interest)).toBeCloseTo(1350, 2); // 45,000 × 3%
    expect(Number(dec!.interest)).toBeCloseTo(2250, 2); // 75,000 × 3%
    expect(Number(mar!.interest)).toBeCloseTo(1000, 2); // 100,000 × 1%
    expect(Number(r.estimatedInterest)).toBeCloseTo(5050, 2);
  });

  it('charges nothing on an instalment that has not fallen due yet', () => {
    const r = advanceTaxSchedule({ fyStartYear: 2026, taxAsAt: flat(100000), asOf: july });
    const [jun, sep] = r.instalments;
    expect(jun!.status).toBe('due'); // 15 June has passed unpaid
    expect(Number(jun!.interest)).toBeGreaterThan(0);
    expect(sep!.status).toBe('upcoming');
    expect(sep!.interest).toBe('0.00');
  });

  // Sec 208: no advance tax at all below ₹10,000 of liability.
  it('asks for nothing below the statutory threshold', () => {
    const r = advanceTaxSchedule({
      fyStartYear: 2026,
      taxAsAt: flat(ADVANCE_TAX_THRESHOLD - 1),
      asOf: march,
    });
    expect(r.belowThreshold).toBe(true);
    expect(Number(r.payableNow)).toBe(0);
    expect(Number(r.estimatedInterest)).toBe(0);
    expect(r.instalments.every((i) => i.status === 'met')).toBe(true);
  });

  it('counts tax already paid against the instalments', () => {
    const r = advanceTaxSchedule({
      fyStartYear: 2026,
      taxAsAt: flat(100000),
      paid: D(50000),
      asOf: march,
    });
    const [jun, sep, dec] = r.instalments;
    expect(jun!.status).toBe('met');
    expect(sep!.status).toBe('met'); // 45,000 due, 50,000 paid
    expect(Number(dec!.shortfall)).toBe(25000);
    expect(Number(r.payableNow)).toBe(50000);
  });

  it('reports no liability when nothing was booked', () => {
    const r = advanceTaxSchedule({ fyStartYear: 2026, taxAsAt: flat(0), asOf: march });
    expect(Number(r.totalTax)).toBe(0);
    expect(Number(r.payableNow)).toBe(0);
    expect(r.belowThreshold).toBe(true);
  });
});
