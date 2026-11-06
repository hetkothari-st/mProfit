import { describe, it, expect } from 'vitest';
import { Decimal } from 'decimal.js';
import {
  compoundYearly,
  exitLoadEstimate,
  isBankCharge,
  yearlyTerCost,
} from '../../../src/services/hiddenCosts/hiddenCostMath.js';

describe('hidden cost maths', () => {
  it('a yearly cost repeated for 20 years at 12% grows to ₹27.7 lakh from ₹38,400', () => {
    expect(compoundYearly(new Decimal(38400)).toFixed(2)).toBe('2766813.79');
    expect(compoundYearly(new Decimal(0)).toFixed(2)).toBe('0.00');
  });

  it('a fund charges its expense ratio on its value every year', () => {
    expect(yearlyTerCost(new Decimal('250000'), 1.5).toFixed(2)).toBe('3750.00');
    expect(yearlyTerCost(new Decimal('100000'), 0).toFixed(2)).toBe('0.00');
  });

  it('recognises bank and card charges, not everyday fees', () => {
    for (const n of [
      'SMS ALERT CHARGES Q2',
      'ATM WDL CHRG',
      'Late Payment Fee',
      'FINANCE CHARGES ON CARD',
      'Annual fee - card',
      'MIN BAL NON MAINT CHG',
      'GST ON CHARGES',
      'DEBIT CARD AMC',
      'Cheque bounce penalty',
    ]) {
      expect(isBankCharge(n, null)).toBe(true);
    }
    for (const n of ['SCHOOL FEE TERM 2', 'Tuition fees', 'Swiggy order', 'Exam registration fee', 'Electricity charges BESCOM']) {
      expect(isBankCharge(n, n.startsWith('Electricity') ? 'utilities' : null)).toBe(false);
    }
    expect(isBankCharge('Late payment fee', 'education')).toBe(false);
    expect(isBankCharge('Charges reversal', null)).toBe(false);
  });

  it('estimates a 1% exit load only on equity and hybrid funds sold within a year', () => {
    const buy = new Date('2026-01-10');
    expect(exitLoadEstimate(new Decimal('200000'), buy, new Date('2026-06-10'), 'EQUITY')?.toFixed(2)).toBe('2000.00');
    expect(exitLoadEstimate(new Decimal('200000'), buy, new Date('2026-06-10'), 'HYBRID')?.toFixed(2)).toBe('2000.00');
    expect(exitLoadEstimate(new Decimal('200000'), buy, new Date('2027-01-11'), 'EQUITY')).toBeNull();
    expect(exitLoadEstimate(new Decimal('200000'), buy, new Date('2026-06-10'), 'LIQUID')).toBeNull();
    expect(exitLoadEstimate(new Decimal('200000'), buy, new Date('2026-06-10'), null)).toBeNull();
  });
});
