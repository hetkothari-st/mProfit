import { describe, it, expect, afterEach } from 'vitest';
import type { AssetClass } from '@prisma/client';
import { createTestScope, prisma, type TestScope } from '../helpers/db.js';
import { runAsSystem } from '../../src/lib/requestContext.js';
import {
  ensureDefaultAccounts,
  generateVouchersFromActivity,
  getAccountLedger,
  getBalanceSheet,
  getPnL,
  getTrialBalance,
} from '../../src/services/accounting.service.js';
import { Decimal } from 'decimal.js';
import { computeOpenLots, computePortfolioCapitalGains } from '../../src/services/capitalGains.service.js';
import { replayTransactions } from '../../src/services/holdingsProjection.js';

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()!();
});

type TxInput = {
  type: string;
  date: string;
  name: string;
  qty: string;
  net: string;
  stt?: string;
  brokerage?: string;
  assetClass?: AssetClass;
};

async function newScope(label: string): Promise<TestScope> {
  const scope = await createTestScope(label);
  cleanups.push(async () => {
    await runAsSystem(async () => {
      await prisma.loanPayment.deleteMany({ where: { loan: { userId: scope.userId } } });
      await prisma.loan.deleteMany({ where: { userId: scope.userId } });
    });
    await scope.cleanup();
  });
  await runAsSystem(() => ensureDefaultAccounts(scope.userId));
  return scope;
}

async function addTxs(scope: TestScope, txs: TxInput[]) {
  const ids: string[] = [];
  await runAsSystem(async () => {
    for (const t of txs) {
      const row = await prisma.transaction.create({
        data: {
          portfolioId: scope.portfolioId,
          assetClass: t.assetClass ?? 'EQUITY',
          transactionType: t.type as never,
          assetName: t.name,
          assetKey: `name:${t.name}`,
          tradeDate: new Date(t.date),
          quantity: t.qty,
          price: '1',
          grossAmount: t.net,
          netAmount: t.net,
          ...(t.stt ? { stt: t.stt } : {}),
          ...(t.brokerage ? { brokerage: t.brokerage } : {}),
        },
      });
      ids.push(row.id);
    }
  });
  return ids;
}

const balanceOf = async (userId: string, code: string, asOf?: string) => {
  const tb = await runAsSystem(() => getTrialBalance(userId, asOf));
  return tb.find((r) => r.code === code)!.closingBalance;
};

describe('capital gains cost', () => {
  it('leaves STT out of cost and proceeds (sec 48)', async () => {
    const scope = await newScope('cg-stt');
    await addTxs(scope, [
      { type: 'BUY', date: '2024-01-10', name: 'X', qty: '100', net: '1010', stt: '10' },
      { type: 'SELL', date: '2024-03-10', name: 'X', qty: '100', net: '1188', stt: '12' },
    ]);
    const { rows } = await runAsSystem(() => computePortfolioCapitalGains(scope.portfolioId));
    expect(rows[0]!.buyAmount.toString()).toBe('1000');
    expect(rows[0]!.sellAmount.toString()).toBe('1200');
    expect(rows[0]!.gainLoss.toString()).toBe('200');
  });
});

describe('one cost basis', () => {
  it('holdings, lots and the books agree, and only tax cost drops STT', async () => {
    const scope = await newScope('cost-basis');
    // Two lots, then a partial exit: weighted average and FIFO disagree here,
    // and STT makes the tax cost differ from what was paid.
    await addTxs(scope, [
      { type: 'BUY', date: '2023-05-10', name: 'C', qty: '100', net: '140160', stt: '140', brokerage: '20' },
      { type: 'BUY', date: '2024-06-10', name: 'C', qty: '50', net: '80095', stt: '80', brokerage: '15' },
      { type: 'SELL', date: '2025-01-15', name: 'C', qty: '60', net: '113861', stt: '114' },
    ]);
    const txs = await runAsSystem(() =>
      prisma.transaction.findMany({ where: { portfolioId: scope.portfolioId }, orderBy: { tradeDate: 'asc' } }),
    );

    // What the holding is carried at: the 40 units left of the first lot plus
    // the whole second lot, each at the price paid for them.
    const held = replayTransactions(txs);
    expect(held.quantity.toString()).toBe('90');
    expect(held.totalCost.toFixed(2)).toBe('136159.00');

    // The lot engine's open lots carry the same figure.
    const lots = computeOpenLots(txs).flatMap((p) => p.lots);
    const lotBook = lots.reduce((s, l) => s.plus(l.quantity.times(l.bookCostPerUnit)), new Decimal(0));
    expect(lotBook.toFixed(2)).toBe(held.totalCost.toFixed(2));

    // Tax cost is lower by exactly the STT inside those lots (sec 48).
    const lotTax = lots.reduce((s, l) => s.plus(l.quantity.times(l.costPerUnit)), new Decimal(0));
    expect(lotBook.minus(lotTax).toFixed(2)).toBe('136.00');

    // And the books carry the holding at the paid-in figure too.
    await runAsSystem(() => generateVouchersFromActivity(scope.userId));
    expect(await balanceOf(scope.userId, '1101')).toBe(held.totalCost.toFixed(4));
  });
});

describe('chart of accounts', () => {
  it('seeds once when two requests race, instead of failing one of them', async () => {
    const scope = await createTestScope('coa-race');
    cleanups.push(scope.cleanup);
    // Two page loads at the same moment: the accounts tree and a statement
    // that projects the books first. Both seed the default chart.
    const [a, b] = await runAsSystem(() =>
      Promise.all([ensureDefaultAccounts(scope.userId), ensureDefaultAccounts(scope.userId)]),
    );
    expect(a.length + b.length).toBeGreaterThan(0);
    const codes = await runAsSystem(() =>
      prisma.account.groupBy({ by: ['code'], where: { userId: scope.userId }, _count: { code: true } }),
    );
    expect(codes.filter((c) => c._count.code > 1)).toEqual([]);
  });
});

describe('auto vouchers', () => {
  it('closes a position to zero after a sale at a loss, with charges counted once', async () => {
    const scope = await newScope('acct-loss');
    await addTxs(scope, [
      { type: 'BUY', date: '2024-05-01', name: 'L', qty: '10', net: '1020', brokerage: '15', stt: '5' },
      { type: 'SELL', date: '2024-06-01', name: 'L', qty: '10', net: '896', stt: '4' },
    ]);
    await runAsSystem(() => generateVouchersFromActivity(scope.userId));
    // The holding is carried at what was paid (1,020, STT included) and leaves
    // at that cost; the bank is out the 124 the round trip actually cost.
    expect(await balanceOf(scope.userId, '1101')).toBe('0.0000'); // Equity Holdings
    expect(await balanceOf(scope.userId, '1001')).toBe('-124.0000'); // −1020 + 896
    expect(await balanceOf(scope.userId, '5006')).toBe('124.0000'); // book loss: 896 − 1020
    expect(await balanceOf(scope.userId, '5002')).toBe('0.0000'); // STT sits in cost, not expensed
    const pnl = await runAsSystem(() => getPnL(scope.userId, '2024-04-01', '2025-03-31'));
    expect(pnl.netProfit).toBe('-124.0000');
  });

  it('books SIPs and a redemption, and intraday as speculative income', async () => {
    const scope = await newScope('acct-sip');
    await addTxs(scope, [
      { type: 'SIP', date: '2024-05-01', name: 'Fund', qty: '10', net: '5000', assetClass: 'MUTUAL_FUND' },
      { type: 'SIP', date: '2024-06-01', name: 'Fund', qty: '10', net: '5000', assetClass: 'MUTUAL_FUND' },
      { type: 'REDEMPTION', date: '2024-08-01', name: 'Fund', qty: '20', net: '11000', assetClass: 'MUTUAL_FUND' },
      { type: 'BUY', date: '2024-09-02', name: 'Day', qty: '10', net: '1000' },
      { type: 'SELL', date: '2024-09-02', name: 'Day', qty: '10', net: '1100' },
    ]);
    await runAsSystem(() => generateVouchersFromActivity(scope.userId));
    expect(await balanceOf(scope.userId, '1102')).toBe('0.0000');
    expect(await balanceOf(scope.userId, '4007')).toBe('100.0000');
    expect(await balanceOf(scope.userId, '4003')).toBe('1000.0000');
  });

  it('removes a voucher whose transaction was deleted and leaves unchanged ones alone', async () => {
    const scope = await newScope('acct-reconcile');
    const [buyId] = await addTxs(scope, [
      { type: 'BUY', date: '2024-05-01', name: 'R', qty: '10', net: '1000' },
      { type: 'DIVIDEND_PAYOUT', date: '2024-06-01', name: 'R', qty: '0', net: '50' },
    ]);
    const first = await runAsSystem(() => generateVouchersFromActivity(scope.userId));
    expect(first.created).toBe(2);
    await runAsSystem(async () => {
      await prisma.voucherEntry.updateMany({ where: { transactionId: buyId }, data: { transactionId: null } });
      await prisma.transaction.delete({ where: { id: buyId } });
    });
    const second = await runAsSystem(() => generateVouchersFromActivity(scope.userId));
    expect(second).toMatchObject({ created: 0, updated: 0, removed: 1, skipped: 1 });
    expect(await balanceOf(scope.userId, '1101')).toBe('0.0000');
  });

  it('books a loan disbursement and derives the principal from a partial split', async () => {
    const scope = await newScope('acct-loan');
    await runAsSystem(async () => {
      const loan = await prisma.loan.create({
        data: {
          userId: scope.userId, lenderName: 'Bank', loanType: 'HOME', borrowerName: 'Self',
          principalAmount: '500000', interestRate: '9', tenureMonths: 120, emiAmount: '10000',
          disbursementDate: new Date('2024-04-10'), firstEmiDate: new Date('2024-05-10'),
        },
      });
      await prisma.loanPayment.create({ data: { loanId: loan.id, paymentType: 'EMI', paidOn: new Date('2024-05-10'), amount: '10000', interestPart: '4000' } });
      await prisma.loanPayment.create({ data: { loanId: loan.id, paymentType: 'PROCESSING_FEE', paidOn: new Date('2024-04-10'), amount: '5000' } });
    });
    await runAsSystem(() => generateVouchersFromActivity(scope.userId));
    expect(await balanceOf(scope.userId, '2001')).toBe('494000.0000');
    expect(await balanceOf(scope.userId, '5008')).toBe('4000.0000');
    expect(await balanceOf(scope.userId, '5010')).toBe('5000.0000');
  });
});

describe('statements', () => {
  it('P&L for a period includes vouchers dated on its first day', async () => {
    const scope = await newScope('acct-pnl-from');
    await addTxs(scope, [{ type: 'DIVIDEND_PAYOUT', date: '2024-04-01', name: 'D', qty: '0', net: '5000' }]);
    await runAsSystem(() => generateVouchersFromActivity(scope.userId));
    const fy = await runAsSystem(() => getPnL(scope.userId, '2024-04-01', '2025-03-31'));
    const prior = await runAsSystem(() => getPnL(scope.userId, '2023-04-01', '2024-03-31'));
    expect(fy.totalIncome).toBe('5000.0000');
    expect(prior.totalIncome).toBe('0.0000');
  });

  it('ledger from a date opens with everything booked before it', async () => {
    const scope = await newScope('acct-ledger-open');
    await addTxs(scope, [
      { type: 'BUY', date: '2023-06-01', name: 'B', qty: '10', net: '100000' },
      { type: 'DIVIDEND_PAYOUT', date: '2024-05-01', name: 'B', qty: '0', net: '2000' },
    ]);
    await runAsSystem(() => generateVouchersFromActivity(scope.userId));
    const bank = await runAsSystem(() => prisma.account.findFirstOrThrow({ where: { userId: scope.userId, code: '1001' } }));
    const led = await runAsSystem(() => getAccountLedger(scope.userId, bank.id, { from: '2024-04-01', to: '2025-03-31' }));
    expect(led.openingBalance).toBe('-100000.0000');
    expect(led.closingBalance).toBe('-98000.0000');
  });

  it('balance sheet reports opening balances that do not net to zero', async () => {
    const scope = await newScope('acct-bs-diff');
    await runAsSystem(() =>
      prisma.account.updateMany({ where: { userId: scope.userId, code: '1001' }, data: { openingBalance: '50000' } }),
    );
    const bs = await runAsSystem(() => getBalanceSheet(scope.userId));
    expect(bs.openingDifference).toBe('50000.0000');
    expect(bs.totalAssets).toBe('50000.0000');
  });
});
