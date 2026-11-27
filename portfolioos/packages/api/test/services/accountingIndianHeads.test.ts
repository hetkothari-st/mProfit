import { describe, it, expect, afterEach } from 'vitest';
import type { AssetClass } from '@prisma/client';
import { createTestScope, prisma, type TestScope } from '../helpers/db.js';
import { runAsSystem } from '../../src/lib/requestContext.js';
import {
  ensureDefaultAccounts,
  generateVouchersFromActivity,
  getTrialBalance,
} from '../../src/services/accounting/accounting.service.js';
import { resolveTallyParentGroup } from '../../src/services/reportBuilder/tally/accountGroupMapping.js';

/**
 * CA workspace review: the default chart lacked the heads a CA keeps for an
 * Indian individual — tax paid and deducted, salary and business income,
 * crypto (sec 115BBH: flat rate, losses neither set off nor carried
 * forward), loans given, card dues, retirement savings and property — and put
 * every capital loss in one expense head, where set-off needs short and long
 * term apart.
 */

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()!();
});

async function newScope(label: string): Promise<TestScope> {
  const scope = await createTestScope(label);
  cleanups.push(scope.cleanup);
  await runAsSystem(() => ensureDefaultAccounts(scope.userId));
  return scope;
}

async function addTxs(
  scope: TestScope,
  txs: Array<{ type: string; date: string; name: string; qty: string; net: string; assetClass?: AssetClass }>,
) {
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
          quantity: t.qty,
          price: '1',
          grossAmount: t.net,
          netAmount: t.net,
        },
      });
    }
  });
}

const balanceOf = async (userId: string, code: string) => {
  const tb = await runAsSystem(() => getTrialBalance(userId));
  const row = tb.find((r) => r.code === code);
  if (!row) throw new Error(`no account ${code}`);
  return row.closingBalance;
};

const NEW_HEADS: Array<[string, string]> = [
  ['1003', 'ASSET'], // Loans Given
  ['1107', 'ASSET'], // PPF / EPF / NPS
  ['1108', 'ASSET'], // Crypto (VDA)
  ['1109', 'ASSET'], // Real Estate
  ['1200', 'ASSET'], // Tax paid & deducted
  ['1201', 'ASSET'], // TDS Receivable
  ['1202', 'ASSET'], // TCS Receivable
  ['1203', 'ASSET'], // Advance Tax Paid
  ['1204', 'ASSET'], // Self-assessment Tax Paid
  ['2002', 'LIABILITY'], // Credit Card Payable
  ['4009', 'INCOME'], // Salary
  ['4010', 'INCOME'], // Business / Professional
  ['4011', 'INCOME'], // VDA gains
  ['5012', 'EXPENSE'], // Short-term capital loss
  ['5013', 'EXPENSE'], // Long-term capital loss
  ['5014', 'EXPENSE'], // VDA loss
];

describe('Indian individual chart of accounts', () => {
  it('seeds the tax, income, asset and loss heads a CA expects', async () => {
    const scope = await newScope('coa-heads');
    const accounts = await runAsSystem(() =>
      prisma.account.findMany({ where: { userId: scope.userId }, select: { code: true, type: true } }),
    );
    const byCode = new Map(accounts.map((a) => [a.code, a.type]));
    for (const [code, type] of NEW_HEADS) expect([code, byCode.get(code)]).toEqual([code, type]);
  });

  it('books short-term and long-term capital losses to separate heads', async () => {
    const scope = await newScope('coa-st-lt');
    await addTxs(scope, [
      { type: 'BUY', date: '2022-05-02', name: 'Long', qty: '10', net: '1000' },
      { type: 'SELL', date: '2024-06-03', name: 'Long', qty: '10', net: '700' },
      { type: 'BUY', date: '2024-05-02', name: 'Short', qty: '10', net: '1000' },
      { type: 'SELL', date: '2024-06-03', name: 'Short', qty: '10', net: '900' },
    ]);
    await runAsSystem(() => generateVouchersFromActivity(scope.userId));
    expect(await balanceOf(scope.userId, '5013')).toBe('300.0000');
    expect(await balanceOf(scope.userId, '5012')).toBe('100.0000');
    expect(await balanceOf(scope.userId, '5006')).toBe('0.0000');
  });

  it('keeps crypto in its own investment, gain and loss heads', async () => {
    const scope = await newScope('coa-vda');
    await addTxs(scope, [
      { type: 'BUY', date: '2024-05-02', name: 'Coin A', qty: '1', net: '1000', assetClass: 'CRYPTOCURRENCY' },
      { type: 'SELL', date: '2024-07-01', name: 'Coin A', qty: '1', net: '1500', assetClass: 'CRYPTOCURRENCY' },
      { type: 'BUY', date: '2024-05-02', name: 'Coin B', qty: '1', net: '1000', assetClass: 'CRYPTOCURRENCY' },
      { type: 'SELL', date: '2024-07-01', name: 'Coin B', qty: '1', net: '800', assetClass: 'CRYPTOCURRENCY' },
      { type: 'BUY', date: '2024-05-02', name: 'Coin C', qty: '1', net: '400', assetClass: 'CRYPTOCURRENCY' },
    ]);
    await runAsSystem(() => generateVouchersFromActivity(scope.userId));
    expect(await balanceOf(scope.userId, '1108')).toBe('400.0000'); // Coin C still held
    expect(await balanceOf(scope.userId, '4011')).toBe('500.0000');
    expect(await balanceOf(scope.userId, '5014')).toBe('200.0000');
    expect(await balanceOf(scope.userId, '4003')).toBe('0.0000');
    expect(await balanceOf(scope.userId, '5012')).toBe('0.0000');
  });

  it('carries PPF/EPF/NPS and property in their own asset heads', async () => {
    const scope = await newScope('coa-ppf-property');
    await addTxs(scope, [
      { type: 'DEPOSIT', date: '2024-05-02', name: 'PPF', qty: '1', net: '150000', assetClass: 'PPF' },
      { type: 'DEPOSIT', date: '2024-05-02', name: 'NPS Tier I', qty: '1', net: '50000', assetClass: 'NPS' },
      { type: 'BUY', date: '2024-05-02', name: 'Flat', qty: '1', net: '5000000', assetClass: 'REAL_ESTATE' },
    ]);
    await runAsSystem(() => generateVouchersFromActivity(scope.userId));
    expect(await balanceOf(scope.userId, '1107')).toBe('200000.0000');
    expect(await balanceOf(scope.userId, '1109')).toBe('5000000.0000');
    expect(await balanceOf(scope.userId, '1106')).toBe('0.0000');
  });

  it('exports the new heads to sensible Tally groups', () => {
    expect(resolveTallyParentGroup({ code: '1201', name: 'TDS Receivable', type: 'ASSET' })).toBe('Loans & Advances (Asset)');
    expect(resolveTallyParentGroup({ code: '1203', name: 'Advance Tax Paid', type: 'ASSET' })).toBe('Loans & Advances (Asset)');
    expect(resolveTallyParentGroup({ code: '1003', name: 'Loans Given', type: 'ASSET' })).toBe('Loans & Advances (Asset)');
    expect(resolveTallyParentGroup({ code: '1107', name: 'PPF, EPF & NPS', type: 'ASSET' })).toBe('Investments');
    expect(resolveTallyParentGroup({ code: '1108', name: 'Crypto (VDA) Holdings', type: 'ASSET' })).toBe('Investments');
    expect(resolveTallyParentGroup({ code: '1109', name: 'Real Estate', type: 'ASSET' })).toBe('Investments');
    expect(resolveTallyParentGroup({ code: '2002', name: 'Credit Card Payable', type: 'LIABILITY' })).toBe('Current Liabilities');
  });
});
