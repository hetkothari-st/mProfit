import { describe, it, expect } from 'vitest';
import { Decimal } from 'decimal.js';
import { buildTallyBook, emptyTallySources, type TallyBook, type TallySources, type TallyVoucher } from '../../../src/services/tally/tallyBook.js';

// From the app's records to a Tally book: one ledger per real account and
// holding, Payment/Receipt/Journal/Contra vouchers only, and money whose bank
// the app does not know booked against "Unallocated Funds" (a Suspense
// ledger) rather than guessed.

const sources = (over: Partial<TallySources>): TallySources => ({ ...emptyTallySources(), ...over });

function allVouchers(book: TallyBook): TallyVoucher[] {
  return book.years.flatMap((y) => y.vouchers);
}

function lineOf(v: TallyVoucher, ledger: string): string | undefined {
  return v.lines.find((l) => l.ledger === ledger)?.amount.toString();
}

function expectBalanced(book: TallyBook) {
  for (const v of allVouchers(book)) {
    const total = v.lines.reduce((s, l) => s.plus(l.amount), new Decimal(0));
    expect(total.toString(), `${v.type} ${v.number} ${v.narration}`).toBe('0');
  }
  const openings = book.ledgers.reduce((s, l) => s.plus(l.openingBalance), new Decimal(0));
  expect(openings.toString()).toBe('0');
}

function ledger(book: TallyBook, name: string) {
  return book.ledgers.find((l) => l.name === name);
}

describe('investments', () => {
  const book = buildTallyBook(
    sources({
      trades: [
        {
          id: 't1', date: '2024-04-15', kind: 'BUY', assetClass: 'EQUITY', holdingKey: 'stock:inf', holdingName: 'Infosys Ltd',
          quantity: '10', price: '1450', gross: '14500', charges: '20', cost: null, shortTermGain: '0', longTermGain: '0',
        },
        {
          id: 't2', date: '2025-01-10', kind: 'SELL', assetClass: 'EQUITY', holdingKey: 'stock:inf', holdingName: 'Infosys Ltd',
          quantity: '4', price: '1600', gross: '6400', charges: '10', cost: '5800', shortTermGain: '590', longTermGain: '0',
        },
        {
          id: 't3', date: '2024-09-01', kind: 'BONUS', assetClass: 'EQUITY', holdingKey: 'stock:inf', holdingName: 'Infosys Ltd',
          quantity: '10', price: '0', gross: '0', charges: '0', cost: null, shortTermGain: '0', longTermGain: '0',
        },
        {
          id: 't4', date: '2023-06-01', kind: 'SELL', assetClass: 'MUTUAL_FUND', holdingKey: 'fund:x', holdingName: 'Axis Bluechip Fund',
          quantity: '5', price: '200', gross: '1000', charges: '0', cost: null, shortTermGain: '0', longTermGain: '0',
        },
      ],
    }),
  );

  it('gives each holding its own ledger, in a group under Investments', () => {
    expect(book.groups).toContainEqual({ name: 'Equity Shares', parent: 'Investments' });
    expect(book.groups).toContainEqual({ name: 'Mutual Funds', parent: 'Investments' });
    expect(ledger(book, 'Infosys Ltd')?.parent).toBe('Equity Shares');
    expect(ledger(book, 'Axis Bluechip Fund')?.parent).toBe('Mutual Funds');
    expect(ledger(book, 'Unallocated Funds')?.parent).toBe('Suspense A/c');
  });

  it('books a buy as a journal against Unallocated Funds, charges included', () => {
    const buy = allVouchers(book).find((v) => v.narration.includes('Buy 10 Infosys Ltd'))!;
    expect(buy.type).toBe('Journal');
    expect(lineOf(buy, 'Infosys Ltd')).toBe('14500');
    expect(lineOf(buy, 'Brokerage & Charges')).toBe('20');
    expect(lineOf(buy, 'Unallocated Funds')).toBe('-14520');
  });

  it('books a sale at cost, with the gain to capital gains', () => {
    const sell = allVouchers(book).find((v) => v.narration.includes('Sell 4 Infosys Ltd'))!;
    expect(lineOf(sell, 'Unallocated Funds')).toBe('6390');
    expect(lineOf(sell, 'Infosys Ltd')).toBe('-5800');
    expect(lineOf(sell, 'Short-term Capital Gains')).toBe('-590');
  });

  it('books no voucher where no money moved (bonus, split)', () => {
    expect(allVouchers(book).some((v) => v.narration.toLowerCase().includes('bonus'))).toBe(false);
  });

  it('still balances a sale with no cost basis, and says so', () => {
    const sell = allVouchers(book).find((v) => v.narration.includes('Axis Bluechip Fund'))!;
    expect(lineOf(sell, 'Axis Bluechip Fund')).toBe('-1000');
    expect(book.issues.some((i) => i.severity === 'warning' && i.message.includes('Axis Bluechip Fund'))).toBe(true);
  });

  it('splits vouchers by financial year, numbering each type afresh every year', () => {
    expect(book.booksBeginning).toBe('2023-04-01');
    expect(book.years.map((y) => y.fy)).toEqual(['2023-24', '2024-25']);
    const fy2425 = book.years[1]!.vouchers.filter((v) => v.type === 'Journal').map((v) => v.number);
    expect(fy2425).toEqual(['1', '2']);
    expect(book.years[0]!.vouchers[0]!.number).toBe('1');
  });

  it('balances every voucher and the opening trial balance', () => expectBalanced(book));
});

describe('bank accounts', () => {
  const book = buildTallyBook(
    sources({
      bankAccounts: [{ id: 'b1', label: 'HDFC Bank Savings', last4: '1234', isOverdraft: false, currentBalance: '50000' }],
      cashFlows: [
        { id: 'c1', date: '2024-05-01', direction: 'IN', amount: '20000', description: 'Salary', bankAccountId: 'b1' },
        { id: 'c2', date: '2024-06-01', direction: 'OUT', amount: '5000', description: null, bankAccountId: 'b1' },
        { id: 'c3', date: '2024-07-01', direction: 'IN', amount: '1000', description: 'UPI credit', bankAccountId: null },
      ],
    }),
  );

  it('opens each bank ledger so Tally closes on the balance the app shows', () => {
    // ₹50,000 now, after +₹20,000 and −₹5,000 → ₹35,000 at the start.
    expect(ledger(book, 'HDFC Bank Savings 1234')).toMatchObject({ parent: 'Bank Accounts' });
    expect(ledger(book, 'HDFC Bank Savings 1234')?.openingBalance.toString()).toBe('35000');
    expect(ledger(book, "Owner's Capital")?.openingBalance.toString()).toBe('-35000');
  });

  it('uses Receipt and Payment vouchers for money in and out of a known bank', () => {
    const [receipt, payment, journal] = allVouchers(book);
    expect(receipt).toMatchObject({ type: 'Receipt', narration: 'Salary' });
    expect(lineOf(receipt!, 'HDFC Bank Savings 1234')).toBe('20000');
    expect(lineOf(receipt!, 'Unclassified Receipts')).toBe('-20000');
    expect(payment!.type).toBe('Payment');
    expect(lineOf(payment!, 'HDFC Bank Savings 1234')).toBe('-5000');
    expect(lineOf(payment!, 'Unclassified Payments')).toBe('5000');
    expect(journal!.type).toBe('Journal');
    expect(lineOf(journal!, 'Unallocated Funds')).toBe('1000');
  });

  it('balances', () => expectBalanced(book));
});

describe('loans, cards, rent, premiums and property expenses', () => {
  const book = buildTallyBook(
    sources({
      loans: [{ id: 'l1', label: 'SBI Home Loan 9876', principal: '3000000', disbursedOn: '2024-04-10' }],
      loanPayments: [
        { id: 'p1', loanId: 'l1', date: '2024-05-10', amount: '30000', principal: '10000', interest: '20000', kind: 'EMI' },
        { id: 'p2', loanId: 'l1', date: '2024-06-10', amount: '30000', principal: null, interest: null, kind: 'EMI' },
      ],
      cards: [{ id: 'k1', label: 'HDFC Regalia 4321' }],
      cardStatements: [
        { id: 's1', cardId: 'k1', date: '2024-05-05', statementAmount: '10000', paid: '10000', paidOn: '2024-05-20' },
        { id: 's2', cardId: 'k1', date: '2024-06-05', statementAmount: '15000', paid: '5000', paidOn: '2024-06-20' },
        { id: 's3', cardId: 'k1', date: '2024-07-05', statementAmount: '12000', paid: null, paidOn: null },
      ],
      rent: [
        { id: 'r1', date: '2024-05-03', property: 'Andheri Flat', tenant: 'Ravi', kind: 'PAYMENT', amount: '25000' },
        { id: 'r2', date: '2024-04-20', property: 'Andheri Flat', tenant: 'Ravi', kind: 'DEPOSIT', amount: '50000' },
      ],
      premiums: [{ id: 'q1', date: '2024-06-15', policy: 'LIC Term', amount: '12000' }],
      propertyExpenses: [{ id: 'e1', date: '2024-08-01', property: 'Andheri Flat', description: 'Society maintenance', amount: '3000' }],
    }),
  );
  const find = (text: string) => allVouchers(book).find((v) => v.narration.includes(text))!;

  it('books the loan and splits each EMI into principal and interest', () => {
    expect(ledger(book, 'SBI Home Loan 9876')?.parent).toBe('Loans (Liability)');
    expect(lineOf(find('Loan disbursed'), 'SBI Home Loan 9876')).toBe('-3000000');
    const emi = allVouchers(book).filter((v) => v.narration.startsWith('EMI'));
    expect(lineOf(emi[0]!, 'SBI Home Loan 9876')).toBe('10000');
    expect(lineOf(emi[0]!, 'Loan Interest')).toBe('20000');
    expect(lineOf(emi[1]!, 'SBI Home Loan 9876')).toBe('30000');
  });

  it('books card spends from statements, net of an unpaid balance carried forward', () => {
    expect(ledger(book, 'HDFC Regalia 4321')?.parent).toBe('Current Liabilities');
    const spends = allVouchers(book)
      .filter((v) => v.narration.startsWith('Card spends'))
      .map((v) => lineOf(v, 'HDFC Regalia 4321'));
    // ₹15,000 billed, ₹5,000 paid → ₹10,000 carried into the ₹12,000 bill.
    expect(spends).toEqual(['-10000', '-15000', '-2000']);
    const payments = allVouchers(book).filter((v) => v.narration.startsWith('Card payment'));
    expect(payments.map((v) => lineOf(v, 'HDFC Regalia 4321'))).toEqual(['10000', '5000']);
  });

  it('books rent per property and deposits as owed to the tenant', () => {
    expect(lineOf(find('Rent received'), 'Rent - Andheri Flat')).toBe('-25000');
    expect(ledger(book, 'Security Deposit - Ravi (Andheri Flat)')?.parent).toBe('Current Liabilities');
    expect(lineOf(find('Security deposit received'), 'Security Deposit - Ravi (Andheri Flat)')).toBe('-50000');
  });

  it('books premiums and property expenses', () => {
    expect(lineOf(find('Premium'), 'Insurance Premium - LIC Term')).toBe('12000');
    expect(lineOf(find('Society maintenance'), 'Property Expenses - Andheri Flat')).toBe('3000');
  });

  it('only ever uses Payment, Receipt, Journal and Contra', () => {
    for (const v of allVouchers(book)) expect(['Payment', 'Receipt', 'Journal', 'Contra']).toContain(v.type);
  });

  it('balances', () => expectBalanced(book));
});

describe('an empty account', () => {
  it('still produces a valid, balanced book with nothing in it', () => {
    const book = buildTallyBook(emptyTallySources(), { today: '2026-09-11' });
    expect(book.years).toEqual([]);
    expect(book.booksBeginning).toBe('2026-04-01');
    expectBalanced(book);
  });
});
