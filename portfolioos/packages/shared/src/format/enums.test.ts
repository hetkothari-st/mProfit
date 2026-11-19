import { describe, it, expect } from 'vitest';
import { assetClassLabel, humanizeEnum, transactionTypeLabel, TRANSACTION_TYPE_LABELS } from './enums.js';

describe('humanizeEnum', () => {
  it('turns stored codes into readable words', () => {
    expect(humanizeEnum('BANK_ACCOUNT')).toBe('Bank Account');
    expect(humanizeEnum('LOAN_GIVEN')).toBe('Loan Given');
    expect(humanizeEnum('DIVIDEND_PAYOUT')).toBe('Dividend Payout');
    expect(humanizeEnum('under_review')).toBe('Under Review');
  });

  it('keeps acronyms upper-case and InvIT in its own spelling', () => {
    expect(humanizeEnum('NPS')).toBe('NPS');
    expect(humanizeEnum('POST_OFFICE_RD')).toBe('Post Office RD');
    expect(humanizeEnum('INVIT')).toBe('InvIT');
    // Import file types: file-format and fund words stay as people write them.
    expect(humanizeEnum('MF_CAS_PDF')).toBe('MF CAS PDF');
    expect(humanizeEnum('CONTRACT_NOTE_PDF')).toBe('Contract Note PDF');
    expect(humanizeEnum('GENERIC_XLSX')).toBe('Generic XLSX');
  });

  it('is empty for missing input', () => {
    expect(humanizeEnum(null)).toBe('');
    expect(humanizeEnum(undefined)).toBe('');
    expect(humanizeEnum('')).toBe('');
  });
});

describe('transactionTypeLabel', () => {
  it('uses the plain wording for known types', () => {
    expect(transactionTypeLabel('DIVIDEND_PAYOUT')).toBe('Dividend');
    expect(transactionTypeLabel('SWITCH_IN')).toBe('Switch in');
  });

  it('falls back to a humanized code for a type with no entry yet', () => {
    expect(transactionTypeLabel('SOMETHING_NEW')).toBe('Something New');
  });

  it('labels every type the database defines', () => {
    const defined = [
      'BUY', 'SELL', 'SWITCH_IN', 'SWITCH_OUT', 'SIP', 'DIVIDEND_REINVEST', 'DIVIDEND_PAYOUT', 'BONUS', 'SPLIT',
      'MERGER_IN', 'MERGER_OUT', 'DEMERGER_IN', 'DEMERGER_OUT', 'RIGHTS_ISSUE', 'INTEREST_RECEIVED', 'MATURITY',
      'REDEMPTION', 'DEPOSIT', 'WITHDRAWAL', 'OPENING_BALANCE',
    ];
    for (const t of defined) expect(TRANSACTION_TYPE_LABELS[t], t).toBeTruthy();
  });
});

describe('assetClassLabel', () => {
  it('uses the curated label, and covers the net-worth buckets that are not asset classes', () => {
    expect(assetClassLabel('MUTUAL_FUND')).toBe('Mutual Fund');
    expect(assetClassLabel('POST_OFFICE_TD')).toBe('Post Office Term Deposit');
    expect(assetClassLabel('BANK_ACCOUNT')).toBe('Bank Account');
    expect(assetClassLabel('LOAN_GIVEN')).toBe('Loan Given');
  });
});
