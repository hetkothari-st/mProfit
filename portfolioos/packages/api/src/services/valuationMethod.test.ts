import { describe, it, expect } from 'vitest';
import { valuationMethodFor } from './valuationMethod.js';

describe('valuationMethodFor', () => {
  it('equities/MF/crypto/gold are MARKET', () => {
    expect(valuationMethodFor('EQUITY')).toBe('MARKET');
    expect(valuationMethodFor('MUTUAL_FUND')).toBe('MARKET');
    expect(valuationMethodFor('CRYPTOCURRENCY')).toBe('MARKET');
    expect(valuationMethodFor('PHYSICAL_GOLD')).toBe('MARKET');
  });
  it('FD/RD/NSC/KVP/PO-compounding are ACCRUAL', () => {
    expect(valuationMethodFor('FIXED_DEPOSIT')).toBe('ACCRUAL');
    expect(valuationMethodFor('RECURRING_DEPOSIT')).toBe('ACCRUAL');
    expect(valuationMethodFor('NSC')).toBe('ACCRUAL');
    expect(valuationMethodFor('POST_OFFICE_TD')).toBe('ACCRUAL');
  });
  it('SCSS/MIS/savings are PAYOUT', () => {
    expect(valuationMethodFor('SCSS')).toBe('PAYOUT');
    expect(valuationMethodFor('POST_OFFICE_MIS')).toBe('PAYOUT');
    expect(valuationMethodFor('POST_OFFICE_SAVINGS')).toBe('PAYOUT');
  });
  it('real estate/insurance/other are COST', () => {
    expect(valuationMethodFor('REAL_ESTATE')).toBe('COST');
    expect(valuationMethodFor('INSURANCE')).toBe('COST');
    expect(valuationMethodFor('OTHER')).toBe('COST');
  });
});
