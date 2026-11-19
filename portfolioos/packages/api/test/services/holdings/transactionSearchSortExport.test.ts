import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Prisma } from '@prisma/client';
import {
  createTransaction,
  listTransactions,
  listTransactionsForExport,
  searchWhere,
  sortTransactionRows,
} from '../../../src/services/holdings/transaction.service.js';
import { csvText, transactionsToCsv } from '../../../src/services/holdings/transactionExport.js';
import { createTestScope, seedStockMaster, type TestScope } from '../../helpers/db.js';

const D = (v: string) => new Prisma.Decimal(v);

describe('searchWhere', () => {
  it('is null for blank input', () => {
    expect(searchWhere(undefined)).toBeNull();
    expect(searchWhere('   ')).toBeNull();
  });

  it('requires every word (AND) and caps the number of words', () => {
    const w = searchWhere('a b c d e f g') as { AND: unknown[] };
    expect(w.AND).toHaveLength(5);
  });
});

describe('sortTransactionRows', () => {
  const row = (date: string, net: string, name: string, type = 'BUY') => ({
    tradeDate: new Date(`${date}T00:00:00Z`),
    createdAt: new Date(`${date}T00:00:00Z`),
    transactionType: type,
    netAmount: D(net),
    quantity: D('1'),
    assetName: name,
  });
  const rows = [row('2026-01-01', '500', 'beta'), row('2026-03-01', '100', 'Alpha'), row('2026-02-01', '900', 'gamma', 'SELL')];

  it('sorts by date newest-first by default', () => {
    expect(sortTransactionRows(rows).map((r) => r.assetName)).toEqual(['Alpha', 'gamma', 'beta']);
  });
  it('sorts numerically by amount, not as text', () => {
    expect(sortTransactionRows(rows, 'amount', 'asc').map((r) => r.netAmount.toString())).toEqual(['100', '500', '900']);
    expect(sortTransactionRows(rows, 'amount', 'desc')[0]!.netAmount.toString()).toBe('900');
  });
  it('sorts assets case-insensitively', () => {
    expect(sortTransactionRows(rows, 'asset', 'asc').map((r) => r.assetName)).toEqual(['Alpha', 'beta', 'gamma']);
  });
  it('does not mutate its input', () => {
    const copy = [...rows];
    sortTransactionRows(rows, 'amount', 'asc');
    expect(rows).toEqual(copy);
  });
});

describe('CSV export', () => {
  it('neutralises spreadsheet formulas in text cells but leaves numbers raw', () => {
    expect(csvText('=HYPERLINK("http://x","y")')).toBe(`"'=HYPERLINK(""http://x"",""y"")"`);
    expect(csvText('@SUM(A1)')).toBe("'@SUM(A1)");
    expect(csvText('Tata, Motors')).toBe('"Tata, Motors"');
    expect(csvText(null)).toBe('');
  });

  it('writes one row per transaction with portfolio name, full-precision money and a header', () => {
    const csv = transactionsToCsv(
      [
        {
          tradeDate: '2026-02-01', transactionType: 'SELL', assetClass: 'EQUITY', assetName: '=evil()', symbol: 'ABC',
          schemeCode: null, isin: 'INE000A01010', portfolioId: 'p1', quantity: '10', price: '123.4567',
          grossAmount: '1234.567', brokerage: '1', stt: '0', stampDuty: '0', exchangeCharges: '0', gst: '0',
          sebiCharges: '0', otherCharges: '0', netAmount: '-1233.567', broker: null,
        },
      ],
      new Map([['p1', 'Main, family']]),
    );
    const [header, line] = csv.trim().split('\r\n');
    expect(header!.startsWith('Date,Type,Asset')).toBe(true);
    expect(line).toContain("'=evil()");
    expect(line).toContain('"Main, family"');
    expect(line).toContain(',-1233.567,'); // a negative number is not apostrophe-prefixed
  });
});

describe('listTransactions - search, filter, sort, export (DB)', () => {
  let scope: TestScope;

  beforeAll(async () => {
    scope = await createTestScope('tx-search');
    const reliance = await seedStockMaster(scope, { symbol: 'TSTRELI', name: 'Test Reliance Industries Limited' });
    const tcs = await seedStockMaster(scope, { symbol: 'TSTTCS', name: 'Test Tata Consultancy Services' });
    await scope.runAs(async () => {
      const add = (sym: string, type: 'BUY' | 'SELL', date: string, qty: string, price: string) =>
        createTransaction(scope.userId, {
          portfolioId: scope.portfolioId,
          transactionType: type,
          assetClass: 'EQUITY',
          stockSymbol: sym,
          exchange: 'NSE',
          tradeDate: date,
          quantity: qty,
          price,
        });
      await add(reliance.symbol, 'BUY', '2026-01-10', '10', '100');
      await add(reliance.symbol, 'BUY', '2026-02-10', '5', '200');
      await add(tcs.symbol, 'BUY', '2026-01-20', '2', '3000');
      await add(reliance.symbol, 'SELL', '2026-03-10', '3', '250');
    });
  });

  afterAll(async () => {
    await scope.cleanup();
  });

  const list = (q: Parameters<typeof listTransactions>[1]) => scope.runAs(() => listTransactions(scope.userId, q));

  it('finds rows by name words in any order, case-insensitively, and by symbol', async () => {
    expect((await list({ q: 'reliance' })).pagination.total).toBe(3);
    expect((await list({ q: 'LIMITED reliance' })).pagination.total).toBe(3);
    expect((await list({ q: 'tsttcs' })).pagination.total).toBe(1);
    expect((await list({ q: 'reliance consultancy' })).pagination.total).toBe(0); // every word must match
    expect((await list({ q: 'nothing-like-this' })).items).toEqual([]);
  });

  it('combines search with type and date filters', async () => {
    expect((await list({ q: 'reliance', transactionType: 'SELL' })).pagination.total).toBe(1);
    expect((await list({ q: 'reliance', from: '2026-02-01', to: '2026-02-28' })).pagination.total).toBe(1);
  });

  it('sorts the whole result before paging, so page 1 holds the true top rows', async () => {
    const res = await list({ sort: 'amount', dir: 'desc', pageSize: 2 });
    expect(res.pagination.total).toBe(4);
    expect(res.items.map((r) => r.netAmount)).toEqual(['6000', '1000']);
    expect((await list({ sort: 'date', dir: 'asc' })).items[0]!.tradeDate).toBe('2026-01-10');
  });

  it('exports every matching row regardless of paging, in the chosen order', async () => {
    const rows = await scope.runAs(() =>
      listTransactionsForExport(scope.userId, { q: 'reliance', sort: 'date', dir: 'asc' }),
    );
    expect(rows.map((r) => r.tradeDate)).toEqual(['2026-01-10', '2026-02-10', '2026-03-10']);
  });
});
