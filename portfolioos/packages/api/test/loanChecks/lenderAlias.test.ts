import { describe, it, expect } from 'vitest';
import { MATCHED_LENDERS, canonicalLender, normaliseLenderName } from '../../src/services/loans/loanChecks/lenderAlias.js';
import { LOAN_RATE_SOURCES } from '../../src/services/loans/loanRates/sourceList.js';

describe('canonicalLender (spec s6.1 LenderAlias)', () => {
  it.each([
    ['SBI', 'SBI'],
    ['State Bank of India', 'SBI'],
    ['state bank of india ltd.', 'SBI'],
    ['  The  State Bank of India  ', 'SBI'],
    ['HDFC', 'HDFC Bank'],
    ['HDFC LTD', 'HDFC Bank'],
    ['HDFC Bank Limited', 'HDFC Bank'],
    ['ICICI Bank', 'ICICI Bank'],
    ['Axis Bank Ltd', 'Axis Bank'],
    ['Kotak Mahindra Bank', 'Kotak'],
    ['kotak', 'Kotak'],
    ['Punjab National Bank', 'PNB'],
    ['PNB', 'PNB'],
    ['Bank of Baroda', 'Bank of Baroda'],
    ['BoB', 'Bank of Baroda'],
    ['Canara Bank', 'Canara Bank'],
    ['Union Bank of India', 'Union Bank'],
    ['LIC Housing Finance Ltd', 'LIC Housing Finance'],
    ['LICHFL', 'LIC Housing Finance'],
  ])('%j -> %s', (name, want) => expect(canonicalLender(name)).toBe(want));

  it.each([
    'PNB Housing Finance', 'ICICI Home Finance', 'Can Fin Homes', 'HDFC Credila', 'IDFC First Bank',
    'Bajaj Finance', 'Bajaj Housing Finance', 'LIC', 'Union', 'toString', '', '   ',
    // Look-alikes of tracked lenders (final review).
    'State Bank of Mauritius', 'HDFC Life', 'ICICI Prudential', 'Bank of India', 'United Bank of India', 'UBI',
  ])('%j is not a tracked lender', (name) => expect(canonicalLender(name)).toBeNull());

  it('null and undefined are unmatched', () => {
    expect(canonicalLender(null)).toBeNull();
    expect(canonicalLender(undefined)).toBeNull();
  });

  it('normalises case, punctuation, "&", a leading "the" and trailing ltd/limited', () => {
    expect(normaliseLenderName('The Kotak Mahindra Bank Ltd.')).toBe('kotak mahindra bank');
    expect(normaliseLenderName('L&T Finance Limited')).toBe('l and t finance');
  });

  it('every canonical name is a lender in the live-rates source list', () => {
    const lenders = new Set(LOAN_RATE_SOURCES.map((s) => s.lender));
    expect(MATCHED_LENDERS.filter((l) => !lenders.has(l))).toEqual([]);
    expect(MATCHED_LENDERS).toHaveLength(10);
  });
});
