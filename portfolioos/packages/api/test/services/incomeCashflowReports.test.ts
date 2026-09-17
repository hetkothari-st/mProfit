import { describe, it, expect, afterEach } from 'vitest';
import { Decimal } from 'decimal.js';
import type { AssetClass } from '@prisma/client';
import { createTestScope, prisma } from '../helpers/db.js';
import { runAsSystem } from '../../src/lib/requestContext.js';
import { userIncomeReport } from '../../src/services/reports.service.js';
import { buildLedgerStatement } from '../../src/services/reportBuilder/statement/ledger.js';
import {
  buildCashFlowStatementLayout,
  buildClosingBalanceLayout,
  buildDailyTransactionsLayout,
  buildFinancialLedgerLayout,
} from '../../src/services/reportBuilder/special/index.js';

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()!();
});

type TxInput = {
  type: string;
  date: string;
  name: string;
  qty?: string;
  price?: string;
  net: string;
  assetClass?: AssetClass;
  broker?: string;
  currency?: string;
  inrEquivalent?: string;
};

async function scopeWith(label: string, txs: TxInput[]) {
  const scope = await createTestScope(label);
  cleanups.push(scope.cleanup);
  await runAsSystem(async () => {
    for (const t of txs) {
      await prisma.transaction.create({
        data: {
          portfolioId: scope.portfolioId,
          assetClass: t.assetClass ?? 'EQUITY',
          transactionType: t.type as never,
          assetName: t.name,
          assetKey: `name:${t.name}`,
          tradeDate: new Date(t.date),
          quantity: t.qty ?? '1',
          price: t.price ?? t.net,
          grossAmount: t.net,
          netAmount: t.net,
          ...(t.broker ? { broker: t.broker } : {}),
          ...(t.currency ? { currency: t.currency } : {}),
          ...(t.inrEquivalent ? { inrEquivalent: t.inrEquivalent } : {}),
        },
      });
    }
  });
  return scope;
}

const dec = (v: unknown) => new Decimal(String(v || '0'));
const allRows = (layout: { sections: Array<{ groups: Array<{ rows: Array<{ cells: Record<string, unknown> }> }> }> }) =>
  layout.sections.flatMap((s) => s.groups.flatMap((g) => g.rows));

describe('income report', () => {
  it('keeps maturity principal out of income, converts to INR and includes bank-email dividends', async () => {
    const scope = await scopeWith('income', [
      { type: 'MATURITY', date: '2024-08-01', name: 'Bond', qty: '10', price: '100000', net: '1000000', assetClass: 'BOND' },
      { type: 'INTEREST_RECEIVED', date: '2024-09-01', name: 'Bond', net: '20000', assetClass: 'BOND' },
      { type: 'DIVIDEND_PAYOUT', date: '2024-10-01', name: 'INFY', net: '5000' },
      { type: 'DIVIDEND_PAYOUT', date: '2024-10-02', name: 'AAPL', net: '100', assetClass: 'FOREIGN_EQUITY', currency: 'USD', inrEquivalent: '8300' },
    ]);
    await runAsSystem(async () => {
      const cf = await prisma.cashFlow.create({
        data: { portfolioId: scope.portfolioId, date: new Date('2024-11-05'), type: 'INFLOW', amount: '2400', description: 'Dividend credit' },
      });
      await prisma.canonicalEvent.create({
        data: {
          userId: scope.userId, sourceAdapter: 'test', sourceAdapterVer: '1', sourceRef: 'r', sourceHash: `h-${cf.id}`,
          eventType: 'DIVIDEND', eventDate: new Date('2024-11-05'), amount: '2400', status: 'PROJECTED',
          projectedCashFlowId: cf.id,
        },
      });
    });
    const r = await runAsSystem(() => userIncomeReport(scope.userId, '2024-25'));
    expect(r.dividend).toBe('15700');
    expect(r.interest).toBe('20000');
    expect(r.maturity).toBe('1000000');
    expect(r.total).toBe('35700');
  });
});

describe('transaction ledger', () => {
  it('debits money invested (FD deposit) and credits withdrawals', async () => {
    const scope = await scopeWith('ledger-signs', [
      { type: 'DEPOSIT', date: '2025-01-01', name: 'FD', net: '100000', assetClass: 'FIXED_DEPOSIT' },
      { type: 'BUY', date: '2025-01-01', name: 'INFY', net: '50000' },
      { type: 'WITHDRAWAL', date: '2025-02-01', name: 'FD', net: '30000', assetClass: 'FIXED_DEPOSIT' },
      { type: 'BONUS', date: '2025-02-02', name: 'INFY', net: '0' },
    ]);
    const payload = await runAsSystem(() => buildLedgerStatement({ userId: scope.userId, portfolioIds: [] }));
    expect(payload.footer!['Total Debits']).toBe('₹1,50,000.00');
    expect(payload.footer!['Total Credits']).toBe('₹30,000.00');
  });
});

describe('financial ledger', () => {
  it('starts from the account opening balance and keeps accounts with no vouchers in the period', async () => {
    const scope = await createTestScope('fin-ledger');
    cleanups.push(scope.cleanup);
    await runAsSystem(async () => {
      const bank = await prisma.account.create({ data: { userId: scope.userId, code: 'B1', name: 'Bank', type: 'ASSET', openingBalance: '50000' } });
      const exp = await prisma.account.create({ data: { userId: scope.userId, code: 'E1', name: 'Charges', type: 'EXPENSE' } });
      await prisma.account.create({ data: { userId: scope.userId, code: 'B2', name: 'Idle Bank', type: 'ASSET', openingBalance: '7000' } });
      const v = await prisma.voucher.create({ data: { userId: scope.userId, type: 'PAYMENT', voucherNo: 'P1', date: new Date('2024-05-01') } });
      await prisma.voucherEntry.create({ data: { voucherId: v.id, debitAccountId: exp.id, creditAccountId: bank.id, amount: '10000' } });
    });
    const layout = await runAsSystem(() => buildFinancialLedgerLayout(scope.userId, { from: '2024-04-01', to: '2024-05-31' }));
    const bank = layout.sections.find((s) => s.banner === 'Bank')!;
    const bankRows = bank.groups[0]!.rows;
    expect(bankRows[0]!.cells['debit']).toBe('50000');
    expect(bankRows.at(-1)!.cells['balance']).toBe('40000');
    expect(bankRows.at(-1)!.cells['drCr']).toBe('Dr.');
    expect(layout.sections.some((s) => s.banner === 'Idle Bank')).toBe(true);
  });
});

describe('broker bill register', () => {
  it('nets a broker total as sale receivable minus purchase payable', async () => {
    const scope = await scopeWith('bill-register', [
      { type: 'BUY', date: '2025-01-10', name: 'X', qty: '100', price: '1000', net: '100020', broker: 'Zerodha' },
      { type: 'SELL', date: '2025-01-20', name: 'X', qty: '100', price: '1200', net: '119976', broker: 'Zerodha' },
    ]);
    const layout = await runAsSystem(() => buildDailyTransactionsLayout(scope.userId, {}));
    expect(layout.grandTotal!.values['net']).toBe('19956');
  });
});

describe('cash flow statement', () => {
  it('includes trades and income from transactions and files rent by its source', async () => {
    const scope = await scopeWith('cashflow', [
      { type: 'DIVIDEND_PAYOUT', date: '2025-01-05', name: 'INFY', net: '5000' },
      { type: 'SELL', date: '2025-01-06', name: 'INFY', net: '120000' },
      { type: 'BUY', date: '2025-01-07', name: 'TCS', net: '80000' },
      { type: 'BONUS', date: '2025-01-08', name: 'TCS', net: '0' },
    ]);
    await runAsSystem(() =>
      prisma.cashFlow.create({
        data: { portfolioId: scope.portfolioId, date: new Date('2025-01-09'), type: 'OUTFLOW', amount: '1500', description: 'UPI to Torrent Power' },
      }),
    );
    const layout = await runAsSystem(() => buildCashFlowStatementLayout(scope.userId, { from: '2025-01-01', to: '2025-01-31' }));
    const rows = allRows(layout);
    const inflow = (name: string) => rows.find((r) => r.cells['inParticulars'] === name)?.cells['inAmount'];
    const outflow = (name: string) => rows.find((r) => r.cells['outParticulars'] === name)?.cells['outAmount'];
    expect(inflow('BY DIVIDEND RECEIVED')).toBe('5000');
    expect(inflow('BY SALE PROCEEDS')).toBe('120000');
    expect(outflow('TO INVESTMENT PURCHASES')).toBe('80000');
    expect(outflow('TO OTHER PAYMENTS')).toBe('1500');
    expect(outflow('TO RENT PAID')).toBeUndefined();
    expect(outflow('TO NET CASH SURPLUS C/F')).toBe('43500');
  });
});

describe('closing balance', () => {
  it('dates a re-bought position from the re-purchase and values unpriced rows at cost', async () => {
    const scope = await scopeWith('closing', [
      { type: 'BUY', date: '2015-06-01', name: 'HDFCBANK', qty: '100', price: '100', net: '10000' },
      { type: 'SELL', date: '2019-01-10', name: 'HDFCBANK', qty: '100', price: '200', net: '20000' },
      { type: 'BUY', date: '2023-08-01', name: 'HDFCBANK', qty: '40', price: '1500', net: '60000' },
    ]);
    const layout = await runAsSystem(() => buildClosingBalanceLayout(scope.userId, new Date('2024-03-31')));
    const row = allRows(layout).find((r) => r.cells['assetName'] === 'HDFCBANK')!;
    expect(row.cells['acqDate']).toBe('2023-08-01');
    expect(dec(row.cells['currValue']).toString()).toBe('60000');
    expect(layout.grandTotal!.values['qty']).toBeUndefined();
  });
});
