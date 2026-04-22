import { Decimal as PrismaDecimal } from '@prisma/client/runtime/library';
import { prisma } from '../lib/prisma.js';
import { NotFoundError, BadRequestError } from '../lib/errors.js';
import type { AccountType, VoucherType } from '@prisma/client';

// ─── Default Chart of Accounts ───────────────────────────────────────────────

const DEFAULT_COA: Array<{
  code: string;
  name: string;
  type: AccountType;
  parentCode?: string;
}> = [
  { code: '1000', name: 'Assets', type: 'ASSET' },
  { code: '1001', name: 'Bank Accounts', type: 'ASSET', parentCode: '1000' },
  { code: '1002', name: 'Cash in Hand', type: 'ASSET', parentCode: '1000' },
  { code: '1100', name: 'Investments', type: 'ASSET', parentCode: '1000' },
  { code: '1101', name: 'Equity Holdings', type: 'ASSET', parentCode: '1100' },
  { code: '1102', name: 'Mutual Fund Holdings', type: 'ASSET', parentCode: '1100' },
  { code: '1103', name: 'Fixed Deposits', type: 'ASSET', parentCode: '1100' },
  { code: '1104', name: 'Bonds & Debentures', type: 'ASSET', parentCode: '1100' },
  { code: '1105', name: 'Gold Holdings', type: 'ASSET', parentCode: '1100' },
  { code: '2000', name: 'Liabilities', type: 'LIABILITY' },
  { code: '2001', name: 'Loans & Borrowings', type: 'LIABILITY', parentCode: '2000' },
  { code: '3000', name: 'Equity & Capital', type: 'EQUITY' },
  { code: '3001', name: 'Capital Account', type: 'EQUITY', parentCode: '3000' },
  { code: '3002', name: 'Retained Earnings', type: 'EQUITY', parentCode: '3000' },
  { code: '4000', name: 'Income', type: 'INCOME' },
  { code: '4001', name: 'Dividend Income', type: 'INCOME', parentCode: '4000' },
  { code: '4002', name: 'Interest Income', type: 'INCOME', parentCode: '4000' },
  { code: '4003', name: 'Short-term Capital Gains', type: 'INCOME', parentCode: '4000' },
  { code: '4004', name: 'Long-term Capital Gains', type: 'INCOME', parentCode: '4000' },
  { code: '4005', name: 'Rental Income', type: 'INCOME', parentCode: '4000' },
  { code: '4006', name: 'Other Income', type: 'INCOME', parentCode: '4000' },
  { code: '5000', name: 'Expenses', type: 'EXPENSE' },
  { code: '5001', name: 'Brokerage & Charges', type: 'EXPENSE', parentCode: '5000' },
  { code: '5002', name: 'STT & Transaction Tax', type: 'EXPENSE', parentCode: '5000' },
  { code: '5003', name: 'Fund Management Charges', type: 'EXPENSE', parentCode: '5000' },
  { code: '5004', name: 'Insurance Premiums', type: 'EXPENSE', parentCode: '5000' },
  { code: '5005', name: 'Property Expenses', type: 'EXPENSE', parentCode: '5000' },
  { code: '5006', name: 'Capital Losses', type: 'EXPENSE', parentCode: '5000' },
  { code: '5007', name: 'Other Expenses', type: 'EXPENSE', parentCode: '5000' },
];

export async function ensureDefaultAccounts(userId: string): Promise<void> {
  const existing = await prisma.account.count({ where: { userId } });
  if (existing > 0) return;

  // Build ordered list respecting parent references
  const codeToId = new Map<string, string>();
  for (const acct of DEFAULT_COA) {
    const parentId = acct.parentCode ? codeToId.get(acct.parentCode) : undefined;
    const created = await prisma.account.create({
      data: { userId, code: acct.code, name: acct.name, type: acct.type, parentId },
    });
    codeToId.set(acct.code, created.id);
  }
}

// ─── Chart of Accounts ───────────────────────────────────────────────────────

export interface AccountNode {
  id: string;
  code: string;
  name: string;
  type: AccountType;
  parentId: string | null;
  openingBalance: string;
  children: AccountNode[];
}

export async function listAccountsTree(userId: string): Promise<AccountNode[]> {
  await ensureDefaultAccounts(userId);
  const flat = await prisma.account.findMany({
    where: { userId },
    orderBy: [{ code: 'asc' }],
  });

  const map = new Map<string, AccountNode>();
  flat.forEach((a) =>
    map.set(a.id, {
      id: a.id,
      code: a.code,
      name: a.name,
      type: a.type,
      parentId: a.parentId,
      openingBalance: a.openingBalance.toString(),
      children: [],
    }),
  );

  const roots: AccountNode[] = [];
  flat.forEach((a) => {
    const node = map.get(a.id)!;
    if (a.parentId && map.has(a.parentId)) {
      map.get(a.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  });
  return roots;
}

export async function listAccountsFlat(userId: string) {
  await ensureDefaultAccounts(userId);
  const accounts = await prisma.account.findMany({
    where: { userId },
    orderBy: { code: 'asc' },
  });
  return accounts.map((a) => ({
    id: a.id,
    code: a.code,
    name: a.name,
    type: a.type,
    parentId: a.parentId,
    openingBalance: a.openingBalance.toString(),
  }));
}

export async function createAccount(
  userId: string,
  data: { code: string; name: string; type: AccountType; parentId?: string | null; openingBalance?: string },
) {
  const existing = await prisma.account.findFirst({ where: { userId, code: data.code } });
  if (existing) throw new BadRequestError(`Account code ${data.code} already exists`);

  if (data.parentId) {
    const parent = await prisma.account.findFirst({ where: { id: data.parentId, userId } });
    if (!parent) throw new NotFoundError(`Parent account ${data.parentId} not found`);
  }

  const account = await prisma.account.create({
    data: {
      userId,
      code: data.code,
      name: data.name,
      type: data.type,
      parentId: data.parentId ?? null,
      openingBalance: data.openingBalance ?? '0',
    },
  });
  return { ...account, openingBalance: account.openingBalance.toString() };
}

export async function updateAccount(
  userId: string,
  id: string,
  data: Partial<{ code: string; name: string; type: AccountType; parentId: string | null; openingBalance: string }>,
) {
  const account = await prisma.account.findFirst({ where: { id, userId } });
  if (!account) throw new NotFoundError(`Account ${id} not found`);

  if (data.code && data.code !== account.code) {
    const conflict = await prisma.account.findFirst({ where: { userId, code: data.code } });
    if (conflict) throw new BadRequestError(`Account code ${data.code} already exists`);
  }

  const updated = await prisma.account.update({
    where: { id },
    data: {
      ...(data.code && { code: data.code }),
      ...(data.name && { name: data.name }),
      ...(data.type && { type: data.type }),
      ...(data.openingBalance !== undefined && { openingBalance: data.openingBalance }),
      ...(data.parentId !== undefined && { parentId: data.parentId }),
    },
  });
  return { ...updated, openingBalance: updated.openingBalance.toString() };
}

export async function deleteAccount(userId: string, id: string) {
  const account = await prisma.account.findFirst({ where: { id, userId } });
  if (!account) throw new NotFoundError(`Account ${id} not found`);

  const entryCount = await prisma.voucherEntry.count({
    where: { OR: [{ debitAccountId: id }, { creditAccountId: id }] },
  });
  if (entryCount > 0) {
    throw new BadRequestError('Cannot delete account with existing voucher entries');
  }
  const childCount = await prisma.account.count({ where: { parentId: id } });
  if (childCount > 0) {
    throw new BadRequestError('Cannot delete account with sub-accounts');
  }
  await prisma.account.delete({ where: { id } });
}

// ─── Vouchers ────────────────────────────────────────────────────────────────

export interface VoucherEntryInput {
  debitAccountId: string;
  creditAccountId: string;
  amount: string;
  narration?: string;
}

export interface VoucherInput {
  type: VoucherType;
  voucherNo: string;
  date: string;
  narration?: string;
  entries: VoucherEntryInput[];
}

async function assertAccountsOwnedByUser(userId: string, ids: string[]) {
  const unique = [...new Set(ids)];
  const found = await prisma.account.findMany({ where: { id: { in: unique }, userId } });
  if (found.length !== unique.length) {
    throw new BadRequestError('One or more account IDs not found');
  }
}

function formatVoucher(v: {
  id: string; type: VoucherType; voucherNo: string; date: Date; narration: string | null;
  isAutoGenerated: boolean; createdAt: Date;
  entries: Array<{
    id: string; debitAccountId: string; creditAccountId: string; amount: PrismaDecimal;
    narration: string | null; transactionId: string | null;
    debitAccount: { code: string; name: string };
    creditAccount: { code: string; name: string };
  }>;
}) {
  return {
    id: v.id,
    type: v.type,
    voucherNo: v.voucherNo,
    date: v.date.toISOString().slice(0, 10),
    narration: v.narration,
    isAutoGenerated: v.isAutoGenerated,
    createdAt: v.createdAt,
    entries: v.entries.map((e) => ({
      id: e.id,
      debitAccountId: e.debitAccountId,
      debitAccountCode: e.debitAccount.code,
      debitAccountName: e.debitAccount.name,
      creditAccountId: e.creditAccountId,
      creditAccountCode: e.creditAccount.code,
      creditAccountName: e.creditAccount.name,
      amount: e.amount.toString(),
      narration: e.narration,
      transactionId: e.transactionId,
    })),
  };
}

const voucherInclude = {
  entries: {
    include: {
      debitAccount: { select: { code: true, name: true } },
      creditAccount: { select: { code: true, name: true } },
    },
  },
};

export async function listVouchers(
  userId: string,
  params?: { from?: string; to?: string; type?: VoucherType; page?: number; limit?: number },
) {
  const page = params?.page ?? 1;
  const limit = Math.min(params?.limit ?? 50, 200);
  const skip = (page - 1) * limit;

  const where = {
    userId,
    ...(params?.type && { type: params.type }),
    ...(params?.from || params?.to
      ? {
          date: {
            ...(params.from && { gte: new Date(params.from) }),
            ...(params.to && { lte: new Date(params.to) }),
          },
        }
      : {}),
  };

  const [vouchers, total] = await Promise.all([
    prisma.voucher.findMany({ where, include: voucherInclude, orderBy: { date: 'desc' }, skip, take: limit }),
    prisma.voucher.count({ where }),
  ]);
  return { vouchers: vouchers.map(formatVoucher), total, page, limit };
}

export async function getVoucher(userId: string, id: string) {
  const v = await prisma.voucher.findFirst({ where: { id, userId }, include: voucherInclude });
  if (!v) throw new NotFoundError(`Voucher ${id} not found`);
  return formatVoucher(v);
}

export async function createVoucher(userId: string, data: VoucherInput) {
  if (data.entries.length === 0) throw new BadRequestError('Voucher must have at least one entry');
  const accountIds = data.entries.flatMap((e) => [e.debitAccountId, e.creditAccountId]);
  await assertAccountsOwnedByUser(userId, accountIds);

  const existing = await prisma.voucher.findFirst({ where: { userId, type: data.type, voucherNo: data.voucherNo } });
  if (existing) throw new BadRequestError(`Voucher number ${data.voucherNo} already exists for type ${data.type}`);

  const voucher = await prisma.voucher.create({
    data: {
      userId,
      type: data.type,
      voucherNo: data.voucherNo,
      date: new Date(data.date),
      narration: data.narration ?? null,
      entries: {
        create: data.entries.map((e) => ({
          debitAccountId: e.debitAccountId,
          creditAccountId: e.creditAccountId,
          amount: e.amount,
          narration: e.narration ?? null,
        })),
      },
    },
    include: voucherInclude,
  });
  return formatVoucher(voucher);
}

export async function updateVoucher(userId: string, id: string, data: Partial<VoucherInput>) {
  const existing = await prisma.voucher.findFirst({ where: { id, userId } });
  if (!existing) throw new NotFoundError(`Voucher ${id} not found`);

  if (data.entries) {
    const accountIds = data.entries.flatMap((e) => [e.debitAccountId, e.creditAccountId]);
    await assertAccountsOwnedByUser(userId, accountIds);
  }

  const voucher = await prisma.voucher.update({
    where: { id },
    data: {
      ...(data.type && { type: data.type }),
      ...(data.voucherNo && { voucherNo: data.voucherNo }),
      ...(data.date && { date: new Date(data.date) }),
      ...(data.narration !== undefined && { narration: data.narration }),
      ...(data.entries && {
        entries: {
          deleteMany: {},
          create: data.entries.map((e) => ({
            debitAccountId: e.debitAccountId,
            creditAccountId: e.creditAccountId,
            amount: e.amount,
            narration: e.narration ?? null,
          })),
        },
      }),
    },
    include: voucherInclude,
  });
  return formatVoucher(voucher);
}

export async function deleteVoucher(userId: string, id: string) {
  const existing = await prisma.voucher.findFirst({ where: { id, userId } });
  if (!existing) throw new NotFoundError(`Voucher ${id} not found`);
  await prisma.voucher.delete({ where: { id } });
}

// ─── Next voucher number ──────────────────────────────────────────────────────

export async function nextVoucherNo(userId: string, type: VoucherType): Promise<string> {
  const last = await prisma.voucher.findFirst({
    where: { userId, type },
    orderBy: { voucherNo: 'desc' },
  });
  const prefix = type.slice(0, 2).toUpperCase();
  if (!last) return `${prefix}0001`;
  const num = parseInt(last.voucherNo.replace(/\D/g, ''), 10) || 0;
  return `${prefix}${String(num + 1).padStart(4, '0')}`;
}

// ─── Ledger ───────────────────────────────────────────────────────────────────

export interface LedgerEntry {
  date: string;
  voucherId: string;
  voucherNo: string;
  voucherType: VoucherType;
  narration: string | null;
  debit: string | null;
  credit: string | null;
  balance: string;
}

export async function getAccountLedger(
  userId: string,
  accountId: string,
  params?: { from?: string; to?: string },
): Promise<{ account: { id: string; code: string; name: string; type: AccountType }; openingBalance: string; entries: LedgerEntry[]; closingBalance: string }> {
  const account = await prisma.account.findFirst({ where: { id: accountId, userId } });
  if (!account) throw new NotFoundError(`Account ${accountId} not found`);

  const entries = await prisma.voucherEntry.findMany({
    where: {
      OR: [{ debitAccountId: accountId }, { creditAccountId: accountId }],
      voucher: {
        userId,
        ...(params?.from || params?.to
          ? {
              date: {
                ...(params.from && { gte: new Date(params.from) }),
                ...(params.to && { lte: new Date(params.to) }),
              },
            }
          : {}),
      },
    },
    include: { voucher: { select: { type: true, voucherNo: true, date: true, id: true, narration: true } } },
    orderBy: { voucher: { date: 'asc' } },
  });

  let balance = parseFloat(account.openingBalance.toString());
  const isDebitNormal = account.type === 'ASSET' || account.type === 'EXPENSE';

  const ledgerEntries: LedgerEntry[] = entries.map((e) => {
    const amount = parseFloat(e.amount.toString());
    const isDebit = e.debitAccountId === accountId;
    const debit = isDebit ? amount : null;
    const credit = isDebit ? null : amount;

    if (isDebitNormal) {
      balance += isDebit ? amount : -amount;
    } else {
      balance += isDebit ? -amount : amount;
    }

    return {
      date: e.voucher.date.toISOString().slice(0, 10),
      voucherId: e.voucher.id,
      voucherNo: e.voucher.voucherNo,
      voucherType: e.voucher.type,
      narration: e.narration ?? e.voucher.narration,
      debit: debit !== null ? debit.toFixed(4) : null,
      credit: credit !== null ? credit.toFixed(4) : null,
      balance: balance.toFixed(4),
    };
  });

  return {
    account: { id: account.id, code: account.code, name: account.name, type: account.type },
    openingBalance: account.openingBalance.toString(),
    entries: ledgerEntries,
    closingBalance: balance.toFixed(4),
  };
}

// ─── Financial Statements ─────────────────────────────────────────────────────

export interface TrialBalanceRow {
  accountId: string;
  code: string;
  name: string;
  type: AccountType;
  openingBalance: string;
  totalDebit: string;
  totalCredit: string;
  closingBalance: string;
}

export async function getTrialBalance(userId: string, asOfDate?: string): Promise<TrialBalanceRow[]> {
  const accounts = await prisma.account.findMany({ where: { userId }, orderBy: { code: 'asc' } });

  const dateFilter = asOfDate ? { lte: new Date(asOfDate) } : undefined;

  const entries = await prisma.voucherEntry.findMany({
    where: {
      OR: [
        { debitAccount: { userId } },
        { creditAccount: { userId } },
      ],
      voucher: { userId, ...(dateFilter ? { date: dateFilter } : {}) },
    },
    select: { debitAccountId: true, creditAccountId: true, amount: true },
  });

  const debitMap = new Map<string, number>();
  const creditMap = new Map<string, number>();
  entries.forEach((e) => {
    const amt = parseFloat(e.amount.toString());
    debitMap.set(e.debitAccountId, (debitMap.get(e.debitAccountId) ?? 0) + amt);
    creditMap.set(e.creditAccountId, (creditMap.get(e.creditAccountId) ?? 0) + amt);
  });

  return accounts.map((a) => {
    const ob = parseFloat(a.openingBalance.toString());
    const totalDebit = debitMap.get(a.id) ?? 0;
    const totalCredit = creditMap.get(a.id) ?? 0;
    const isDebitNormal = a.type === 'ASSET' || a.type === 'EXPENSE';
    const closingBalance = isDebitNormal
      ? ob + totalDebit - totalCredit
      : ob + totalCredit - totalDebit;
    return {
      accountId: a.id,
      code: a.code,
      name: a.name,
      type: a.type,
      openingBalance: ob.toFixed(4),
      totalDebit: totalDebit.toFixed(4),
      totalCredit: totalCredit.toFixed(4),
      closingBalance: closingBalance.toFixed(4),
    };
  });
}

export async function getPnL(userId: string, from?: string, to?: string) {
  const tb = await getTrialBalance(userId, to);
  const tbFrom = from ? await getTrialBalance(userId, from) : null;

  const fromMap = new Map(tbFrom?.map((r) => [r.accountId, parseFloat(r.closingBalance)]) ?? []);

  const income: TrialBalanceRow[] = [];
  const expense: TrialBalanceRow[] = [];

  for (const row of tb) {
    const base = fromMap.get(row.accountId) ?? 0;
    const periodBalance = parseFloat(row.closingBalance) - base;
    if (row.type === 'INCOME') income.push({ ...row, closingBalance: periodBalance.toFixed(4) });
    if (row.type === 'EXPENSE') expense.push({ ...row, closingBalance: periodBalance.toFixed(4) });
  }

  const totalIncome = income.reduce((s, r) => s + parseFloat(r.closingBalance), 0);
  const totalExpense = expense.reduce((s, r) => s + parseFloat(r.closingBalance), 0);
  const netProfit = totalIncome - totalExpense;

  return { income, expense, totalIncome: totalIncome.toFixed(4), totalExpense: totalExpense.toFixed(4), netProfit: netProfit.toFixed(4) };
}

export async function getBalanceSheet(userId: string, asOfDate?: string) {
  const tb = await getTrialBalance(userId, asOfDate);

  const assets = tb.filter((r) => r.type === 'ASSET');
  const liabilities = tb.filter((r) => r.type === 'LIABILITY');
  const equity = tb.filter((r) => r.type === 'EQUITY');

  // Retained earnings = net income from inception to asOfDate
  const income = tb.filter((r) => r.type === 'INCOME');
  const expense = tb.filter((r) => r.type === 'EXPENSE');
  const retainedEarnings = (
    income.reduce((s, r) => s + parseFloat(r.closingBalance), 0) -
    expense.reduce((s, r) => s + parseFloat(r.closingBalance), 0)
  ).toFixed(4);

  const totalAssets = assets.reduce((s, r) => s + parseFloat(r.closingBalance), 0).toFixed(4);
  const totalLiabilities = liabilities.reduce((s, r) => s + parseFloat(r.closingBalance), 0).toFixed(4);
  const totalEquity = (
    equity.reduce((s, r) => s + parseFloat(r.closingBalance), 0) +
    parseFloat(retainedEarnings)
  ).toFixed(4);

  return { assets, liabilities, equity, retainedEarnings, totalAssets, totalLiabilities, totalEquity };
}

// ─── Auto-generate from transaction ──────────────────────────────────────────

export async function suggestVoucherForTransaction(userId: string, transactionId: string) {
  const txn = await prisma.transaction.findFirst({
    where: { id: transactionId, portfolio: { userId } },
    include: { portfolio: true },
  });
  if (!txn) throw new NotFoundError(`Transaction ${transactionId} not found`);

  await ensureDefaultAccounts(userId);
  const accounts = await prisma.account.findMany({ where: { userId } });
  const byCode = new Map(accounts.map((a) => [a.code, a]));

  const bankAcct = byCode.get('1001');
  const equityAcct = byCode.get('1101');
  const mfAcct = byCode.get('1102');
  const fdAcct = byCode.get('1103');
  const bondsAcct = byCode.get('1104');
  const goldAcct = byCode.get('1105');
  const brokerageAcct = byCode.get('5001');
  const stcgAcct = byCode.get('4003');
  const ltcgAcct = byCode.get('4004');

  const investmentAcct = (() => {
    const ac = txn.assetClass;
    if (ac === 'EQUITY' || ac === 'ETF') return equityAcct;
    if (ac === 'MUTUAL_FUND') return mfAcct;
    if (ac === 'FIXED_DEPOSIT') return fdAcct;
    if (ac === 'BOND' || ac === 'GOVT_BOND' || ac === 'CORPORATE_BOND') return bondsAcct;
    if (ac === 'PHYSICAL_GOLD' || ac === 'GOLD_BOND' || ac === 'GOLD_ETF') return goldAcct;
    return null;
  })();

  const amount = txn.price && txn.quantity
    ? (parseFloat(txn.price.toString()) * parseFloat(txn.quantity.toString())).toFixed(4)
    : txn.netAmount?.toString() ?? '0';

  const entries: VoucherEntryInput[] = [];

  if (txn.transactionType === 'BUY') {
    if (investmentAcct && bankAcct) {
      entries.push({ debitAccountId: investmentAcct.id, creditAccountId: bankAcct.id, amount, narration: `Buy ${txn.assetName ?? ''}` });
    }
    if (txn.brokerage && parseFloat(txn.brokerage.toString()) > 0 && brokerageAcct && bankAcct) {
      entries.push({ debitAccountId: brokerageAcct.id, creditAccountId: bankAcct.id, amount: txn.brokerage.toString(), narration: 'Brokerage' });
    }
  } else if (txn.transactionType === 'SELL') {
    if (investmentAcct && bankAcct) {
      entries.push({ debitAccountId: bankAcct.id, creditAccountId: investmentAcct.id, amount, narration: `Sell ${txn.assetName ?? ''}` });
    }
    // Gain/loss placeholder — zero until FIFO result is looked up
    if (stcgAcct && bankAcct) {
      entries.push({ debitAccountId: bankAcct.id, creditAccountId: stcgAcct.id, amount: '0', narration: 'Capital gain (update manually)' });
    }
  }

  return {
    suggestedType: (txn.transactionType === 'SELL' ? 'RECEIPT' : 'PAYMENT') as VoucherType,
    suggestedDate: txn.tradeDate.toISOString().slice(0, 10),
    narration: `${txn.transactionType} ${txn.assetName ?? ''} on ${txn.tradeDate.toISOString().slice(0, 10)}`,
    entries,
    transactionId,
  };
}
