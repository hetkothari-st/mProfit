import { describe, it, expect } from 'vitest';
import { Decimal } from 'decimal.js';
import { validateTallyBook } from '../../../src/services/tally/tallyValidate.js';
import type { TallyBook, TallyVoucher } from '../../../src/services/tally/tallyBook.js';

// Tally's import rules, checked before a file is ever produced: every voucher
// balances, every ledger exists, names are unique, Contra touches only cash
// and bank, Payment and Receipt always involve one, and every date sits in
// its own year's file.

const d = (v: string) => new Decimal(v);

function book(vouchers: TallyVoucher[], over: Partial<TallyBook> = {}): TallyBook {
  return {
    booksBeginning: '2024-04-01',
    groups: [{ name: 'Equity Shares', parent: 'Investments' }],
    ledgers: [
      { name: 'HDFC Bank 1234', parent: 'Bank Accounts', openingBalance: d('100'), isCashOrBank: true },
      { name: "Owner's Capital", parent: 'Capital Account', openingBalance: d('-100'), isCashOrBank: false },
      { name: 'Infosys Ltd', parent: 'Equity Shares', openingBalance: d('0'), isCashOrBank: false },
      { name: 'Unallocated Funds', parent: 'Suspense A/c', openingBalance: d('0'), isCashOrBank: false },
    ],
    years: [{ fy: '2024-25', vouchers }],
    issues: [],
    ...over,
  };
}

const journal = (lines: Array<[string, string]>, date = '2024-05-01'): TallyVoucher => ({
  type: 'Journal',
  number: '1',
  date,
  narration: 'x',
  lines: lines.map(([ledger, amount]) => ({ ledger, amount: d(amount) })),
});

describe('validateTallyBook', () => {
  it('passes a clean book', () => {
    expect(validateTallyBook(book([journal([['Infosys Ltd', '100'], ['Unallocated Funds', '-100']])]))).toEqual([]);
  });

  it('rejects a voucher whose debits and credits differ', () => {
    const issues = validateTallyBook(book([journal([['Infosys Ltd', '100'], ['Unallocated Funds', '-99.99']])]));
    expect(issues.join()).toMatch(/does not balance/);
  });

  it('rejects a voucher naming a ledger that is not in the file', () => {
    expect(validateTallyBook(book([journal([['Nobody', '1'], ['Unallocated Funds', '-1']])])).join()).toMatch(/Nobody/);
  });

  it('rejects a voucher with one line, or with a zero line', () => {
    expect(validateTallyBook(book([journal([['Infosys Ltd', '0']])])).length).toBeGreaterThan(0);
    expect(validateTallyBook(book([journal([['Infosys Ltd', '1'], ['Unallocated Funds', '-1'], ['HDFC Bank 1234', '0']])])).join()).toMatch(/zero/);
  });

  it('rejects amounts with more than two decimal places', () => {
    expect(validateTallyBook(book([journal([['Infosys Ltd', '1.005'], ['Unallocated Funds', '-1.005']])])).join()).toMatch(/decimal/);
  });

  it('rejects a Contra touching anything but cash and bank', () => {
    const contra = { ...journal([['Infosys Ltd', '1'], ['HDFC Bank 1234', '-1']]), type: 'Contra' as const };
    expect(validateTallyBook(book([contra])).join()).toMatch(/Contra/);
  });

  it('rejects a Payment that does not pay out of cash or bank, and a Receipt that does not receive into one', () => {
    const payment = { ...journal([['Infosys Ltd', '1'], ['Unallocated Funds', '-1']]), type: 'Payment' as const };
    const receipt = { ...journal([['HDFC Bank 1234', '-1'], ['Infosys Ltd', '1']]), type: 'Receipt' as const };
    expect(validateTallyBook(book([payment])).join()).toMatch(/Payment/);
    expect(validateTallyBook(book([receipt])).join()).toMatch(/Receipt/);
  });

  it('rejects a voucher dated outside its own year, or before the books begin', () => {
    expect(validateTallyBook(book([journal([['Infosys Ltd', '1'], ['Unallocated Funds', '-1']], '2025-04-01')])).join()).toMatch(/2025-04-01/);
    expect(
      validateTallyBook(book([journal([['Infosys Ltd', '1'], ['Unallocated Funds', '-1']], '2024-05-01')], { booksBeginning: '2024-06-01' })).join(),
    ).toMatch(/before the books begin/);
  });

  it('rejects duplicate names, reserved names, and a ledger in a group that does not exist', () => {
    const bad = book([], {
      ledgers: [
        { name: 'Infosys Ltd', parent: 'Equity Shares', openingBalance: d('0'), isCashOrBank: false },
        { name: 'infosys ltd', parent: 'Equity Shares', openingBalance: d('0'), isCashOrBank: false },
        { name: 'Investments', parent: 'Equity Shares', openingBalance: d('0'), isCashOrBank: false },
        { name: 'Stray', parent: 'No Such Group', openingBalance: d('0'), isCashOrBank: false },
      ],
    });
    const text = validateTallyBook(bad).join('\n');
    expect(text).toMatch(/infosys ltd/i);
    expect(text).toMatch(/Investments/);
    expect(text).toMatch(/No Such Group/);
  });

  it('rejects opening balances that do not add up to zero', () => {
    const bad = book([], {
      ledgers: [{ name: 'HDFC Bank 1234', parent: 'Bank Accounts', openingBalance: d('100'), isCashOrBank: true }],
    });
    expect(validateTallyBook(bad).join()).toMatch(/Opening balances/);
  });
});
