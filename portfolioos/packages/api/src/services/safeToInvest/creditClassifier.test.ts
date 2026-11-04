import { describe, it, expect } from 'vitest';
import { classifyCredit, isEverydaySpend, nameTokens, type MoneyEventText } from './creditClassifier.js';

/**
 * Shapes as the Gmail parser stores them: counterparty is the payer/payee
 * name from the alert, parserNotes the model's one-line description.
 */
const ev = (counterparty: string | null, parserNotes: string | null = null, currency = 'INR'): MoneyEventText => ({
  counterparty, parserNotes, instrumentName: null, currency,
});
const me = nameTokens('Rahul Vikram Sharma');

describe('classifyCredit', () => {
  it('counts salary, client payments and rent as income', () => {
    expect(classifyCredit(ev('ACME TECHNOLOGIES PVT LTD', 'NEFT credit - salary for Oct 2026'), me)).toBeNull();
    expect(classifyCredit(ev('Brightline Media LLP', 'Invoice INV-204 payment received'), me)).toBeNull();
    expect(classifyCredit(ev('PRIYA MEHTA', 'UPI credit, rent for flat 3B'), me)).toBeNull();
  });

  it('leaves out transfers from the user\'s own account', () => {
    expect(classifyCredit(ev('RAHUL V SHARMA', 'IMPS from HDFC a/c XX1234'), me)).toBe('own_transfer');
    expect(classifyCredit(ev('Self', 'Fund transfer to own account'), me)).toBe('own_transfer');
    expect(classifyCredit(ev(null, 'Sweep-in from FD 4421'), me)).toBe('own_transfer');
  });

  it('does not mistake someone sharing a first name for the user', () => {
    expect(classifyCredit(ev('RAHUL KAPOOR', 'UPI credit'), me)).toBeNull();
  });

  it('leaves out refunds, loan payouts and investment money', () => {
    expect(classifyCredit(ev('AMAZON PAY', 'Refund for order 402-11'), me)).toBe('refund');
    expect(classifyCredit(ev('Swiggy', 'UPI reversal'), me)).toBe('refund');
    expect(classifyCredit(ev('Bajaj Finance', 'Loan disbursement credited'), me)).toBe('loan');
    expect(classifyCredit(ev('HDFC Mutual Fund', 'Redemption proceeds'), me)).toBe('investment');
    expect(classifyCredit(ev('NSE Clearing Ltd', 'Payout'), me)).toBe('investment');
    expect(classifyCredit(ev('HDFC Bank', 'Interest credited for the quarter'), me)).toBe('investment');
    expect(classifyCredit(ev('INFY', 'Dividend 2026-27'), me)).toBe('investment');
  });

  it('leaves out non-rupee credits', () => {
    expect(classifyCredit(ev('Upwork', 'Payment', 'USD'), me)).toBe('foreign_currency');
  });
});

describe('isEverydaySpend', () => {
  it('counts shopping, groceries and eating out', () => {
    expect(isEverydaySpend(ev('BIGBASKET', 'UPI debit groceries'), me)).toBe(true);
    expect(isEverydaySpend(ev('Zomato', 'Card purchase'), me)).toBe(true);
  });
  it('leaves out SIPs, card bills, EMIs and self transfers', () => {
    expect(isEverydaySpend(ev('BSE STAR MF', 'SIP debit'), me)).toBe(false);
    expect(isEverydaySpend(ev('HDFC Credit Card', 'Card bill payment'), me)).toBe(false);
    expect(isEverydaySpend(ev('HDFC Ltd', 'Home loan EMI'), me)).toBe(false);
    expect(isEverydaySpend(ev('RAHUL SHARMA', 'IMPS to ICICI'), me)).toBe(false);
  });
});
