import { describe, it, expect } from 'vitest';
import {
  classifyTransactionGroup,
  isSeparateFill,
  groupRentDuplicates,
  groupTransactionDuplicates,
  rentFingerprint,
  transactionFingerprint,
  type DuplicateRentRow,
  type DuplicateTxnRow,
} from '../../src/services/duplicateMatch.js';

function txn(over: Partial<DuplicateTxnRow> = {}): DuplicateTxnRow {
  return {
    id: 't1',
    portfolioId: 'p1',
    portfolioName: 'My Portfolio',
    assetClass: 'EQUITY',
    assetKey: 'stock:inf',
    assetName: 'Infosys Ltd',
    transactionType: 'BUY',
    tradeDate: '2025-11-04',
    quantity: '10',
    price: '1450',
    netAmount: '14520',
    broker: null,
    orderNo: null,
    tradeNo: null,
    importJobId: null,
    importFileName: null,
    sourceAdapter: null,
    createdAt: '2025-11-05T10:00:00.000Z',
    ...over,
  };
}

function rent(over: Partial<DuplicateRentRow> = {}): DuplicateRentRow {
  return {
    id: 'r1',
    tenancyId: 'ten1',
    property: 'Bandra Flat',
    tenant: 'Ravi',
    entryType: 'PAYMENT',
    entryDate: '2026-05-05',
    amount: '20000',
    forMonth: '2026-05',
    note: null,
    createdAt: '2026-05-05T09:00:00.000Z',
    ...over,
  };
}

describe('fingerprints', () => {
  it('reads the same quantity written two ways as one', () => {
    const a = transactionFingerprint(txn({ quantity: '10.000000', price: '1450.0000' }));
    const b = transactionFingerprint(txn({ quantity: '10', price: '1450' }));
    expect(a).toBe(b);
  });

  it('keeps charges out of it, so a CAS row and a contract-note row still match', () => {
    const a = transactionFingerprint(txn({ netAmount: '14500' }));
    const b = transactionFingerprint(txn({ netAmount: '14520.75' }));
    expect(a).toBe(b);
  });

  it('separates a different day, price, asset or portfolio', () => {
    const base = transactionFingerprint(txn());
    expect(transactionFingerprint(txn({ tradeDate: '2025-11-05' }))).not.toBe(base);
    expect(transactionFingerprint(txn({ price: '1451' }))).not.toBe(base);
    expect(transactionFingerprint(txn({ assetKey: 'stock:tcs' }))).not.toBe(base);
    expect(transactionFingerprint(txn({ portfolioId: 'p2' }))).not.toBe(base);
    expect(transactionFingerprint(txn({ transactionType: 'SELL' }))).not.toBe(base);
  });

  it('pins a rent payment to its month, day and amount', () => {
    expect(rentFingerprint(rent())).toBe(rentFingerprint(rent({ id: 'r2', note: 'cash' })));
    expect(rentFingerprint(rent({ forMonth: '2026-06' }))).not.toBe(rentFingerprint(rent()));
  });
});

describe('classifyTransactionGroup', () => {
  it('lets two fills of one order through — each has its own trade number', () => {
    const out = classifyTransactionGroup([
      txn({ id: 'a', broker: 'Zerodha', orderNo: '111', tradeNo: '1' }),
      txn({ id: 'b', broker: 'Zerodha', orderNo: '111', tradeNo: '2' }),
    ]);
    expect(out.confidence).toBe('low');
    expect(out.reason).toMatch(/trade number/);
  });

  it('lets a file that lists the same trade twice through', () => {
    const out = classifyTransactionGroup([
      txn({ id: 'a', importJobId: 'job1', importFileName: 'cas.pdf' }),
      txn({ id: 'b', importJobId: 'job1', importFileName: 'cas.pdf' }),
    ]);
    expect(out.confidence).toBe('low');
  });

  it('calls it a duplicate when one trade arrived from two places', () => {
    const out = classifyTransactionGroup([
      txn({ id: 'a', importJobId: 'job1', importFileName: 'cas.pdf' }),
      txn({ id: 'b', importJobId: 'job2', importFileName: 'contract-note.pdf' }),
    ]);
    expect(out.confidence).toBe('high');
    expect(out.reason).toMatch(/cas\.pdf/);
    expect(out.reason).toMatch(/contract-note\.pdf/);
  });

  it('calls a hand-typed repeat of an imported trade a duplicate', () => {
    const out = classifyTransactionGroup([
      txn({ id: 'a', importJobId: 'job1', importFileName: 'cas.pdf' }),
      txn({ id: 'b' }),
    ]);
    expect(out.confidence).toBe('high');
    expect(out.reason).toMatch(/entered by hand/);
  });
});

describe('groupTransactionDuplicates', () => {
  it('leaves rows that stand alone out of the list', () => {
    expect(groupTransactionDuplicates([txn({ id: 'a' }), txn({ id: 'b', tradeDate: '2025-11-06' })])).toEqual([]);
  });

  it('keeps the oldest row and offers the rest for removal', () => {
    const groups = groupTransactionDuplicates([
      txn({ id: 'c', createdAt: '2025-11-07T10:00:00.000Z' }),
      txn({ id: 'a', createdAt: '2025-11-05T10:00:00.000Z', importJobId: 'job1', importFileName: 'cas.pdf' }),
      txn({ id: 'b', createdAt: '2025-11-06T10:00:00.000Z' }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.keepId).toBe('a');
    expect(groups[0]!.suggestedRemovalIds).toEqual(['b', 'c']);
    expect(groups[0]!.label).toContain('3 × BUY 10 Infosys Ltd on 2025-11-04');
  });

  it('shows a deliberate-looking repeat but ticks nothing', () => {
    const groups = groupTransactionDuplicates([
      txn({ id: 'a', broker: 'Zerodha', orderNo: '111', tradeNo: '1' }),
      txn({ id: 'b', broker: 'Zerodha', orderNo: '111', tradeNo: '2' }),
    ]);
    expect(groups[0]!.confidence).toBe('low');
    expect(groups[0]!.suggestedRemovalIds).toEqual([]);
  });

  it('puts the certain duplicates first', () => {
    const groups = groupTransactionDuplicates([
      txn({ id: 'a', assetKey: 'stock:tcs', broker: 'Z', orderNo: '1', tradeNo: '1' }),
      txn({ id: 'b', assetKey: 'stock:tcs', broker: 'Z', orderNo: '1', tradeNo: '2' }),
      txn({ id: 'c' }),
      txn({ id: 'd' }),
    ]);
    expect(groups.map((g) => g.confidence)).toEqual(['high', 'low']);
  });
});

describe('groupRentDuplicates', () => {
  it('collects a button pressed ten times into one group', () => {
    const rows = Array.from({ length: 10 }, (_, i) =>
      rent({ id: `r${i}`, createdAt: `2026-05-05T09:0${i}:00.000Z` }),
    );
    const groups = groupRentDuplicates(rows);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.keepId).toBe('r0');
    expect(groups[0]!.suggestedRemovalIds).toHaveLength(9);
    expect(groups[0]!.label).toContain('10 × payment of 20000');
  });

  it('leaves a genuine second payment on another day alone', () => {
    expect(groupRentDuplicates([rent({ id: 'a' }), rent({ id: 'b', entryDate: '2026-05-12' })])).toEqual([]);
  });
});

describe('isSeparateFill', () => {
  const existing = (over: Partial<{ orderNo: string | null; tradeNo: string | null }> = {}) => ({
    id: 'x',
    tradeDate: new Date('2025-11-04T00:00:00Z'),
    importJobId: null,
    broker: 'Zerodha',
    orderNo: '111',
    tradeNo: '1',
    ...over,
  });

  it('keeps a second fill of one order out of the duplicate net', () => {
    expect(isSeparateFill({ broker: 'Zerodha', orderNo: '111', tradeNo: '2' }, existing())).toBe(true);
  });

  it('calls the identical trade number a duplicate', () => {
    expect(isSeparateFill({ broker: 'Zerodha', orderNo: '111', tradeNo: '1' }, existing())).toBe(false);
  });

  it('cannot tell fills apart when either side has no trade number', () => {
    expect(isSeparateFill(undefined, existing())).toBe(false);
    expect(isSeparateFill({ orderNo: '111', tradeNo: null }, existing())).toBe(false);
    expect(isSeparateFill({ orderNo: '111', tradeNo: '2' }, existing({ tradeNo: null }))).toBe(false);
  });
});
