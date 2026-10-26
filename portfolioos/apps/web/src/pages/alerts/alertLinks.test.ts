import { describe, it, expect } from 'vitest';
import { alertLink, isInformationalAlert } from './alertLinks';

describe('alertLink', () => {
  it('a will review reminder opens Will Maker and is a deadline, not news', () => {
    expect(alertLink('WILL_REVIEW_DUE', { key: 'k', willId: 'w1' })).toBe('/will');
    expect(isInformationalAlert('WILL_REVIEW_DUE')).toBe(false);
  });

  it('loan-check alerts open their loan', () => {
    expect(alertLink('LOAN_REFINANCE', { key: 'k', loanId: 'abc' })).toBe('/loans/abc');
    expect(alertLink('LOAN_BENCHMARK_CHANGE', { loanId: 'x y' })).toBe('/loans/x%20y');
  });
  it('falls back to the loan list without a usable loanId', () => {
    expect(alertLink('LOAN_REFINANCE', null)).toBe('/loans');
    expect(alertLink('LOAN_REFINANCE', { loanId: 42 })).toBe('/loans');
  });
  it('a fund rating change opens the held fund, or the analysis page without a scheme code', () => {
    expect(alertLink('MF_RATING_CHANGE', { key: 'k', schemeCode: '120503' })).toBe('/mutual-funds/120503');
    expect(alertLink('MF_RATING_CHANGE', {})).toBe('/mutual-funds/analysis');
    expect(isInformationalAlert('MF_RATING_CHANGE')).toBe(true);
  });
  it('other alert types have no link and are not informational', () => {
    expect(alertLink('FD_MATURITY', { loanId: 'abc' })).toBeNull();
    expect(isInformationalAlert('CUSTOM')).toBe(false);
    expect(isInformationalAlert('LOAN_REFINANCE')).toBe(true);
  });
});
