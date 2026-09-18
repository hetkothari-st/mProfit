import { Decimal } from 'decimal.js';
import { prisma, runInTransaction } from '../lib/prisma.js';
import { NotFoundError, BadRequestError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import type { AccountType, VoucherType, Prisma, TransactionType } from '@prisma/client';
import { computeUserCapitalGains } from './capitalGains.service.js';
import { replayForFoPnl } from './foPnl.service.js';
import { transactionInrNet } from './investmentIncome.service.js';

/**
 * Optional transaction client for the mutating helpers below.
 *
 * The CA workspace writes an audit entry for every change it makes to somebody
 * else's books, and that entry must share the change's fate: a rolled-back
 * correction cannot leave a record claiming it happened, and a committed one
 * cannot go unrecorded. Both writes therefore have to land on ONE transaction,
 * so these functions accept the caller's client.
 *
 * Defaults to the global client, leaving the user's own accounting path
 * untouched — each call still gets its own short transaction from the
 * $allOperations hook, exactly as before.
 */
type Db = Prisma.TransactionClient;

/**
 * The global client stands in for a transaction client when no caller supplies
 * one. The two are structurally identical for the plain delegate calls below;
 * they differ only in the `$extends` machinery TypeScript cannot reconcile
 * into a callable union. `canonicalEvents.service.ts` documents the same
 * equivalence for the same reason.
 */
const defaultDb = prisma as unknown as Db;

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
  { code: '1106', name: 'Other Investments', type: 'ASSET', parentCode: '1100' },
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
  // Intraday equity is speculative business income (sec 43(5)), not a capital gain.
  { code: '4007', name: 'Speculative Income', type: 'INCOME', parentCode: '4000' },
  { code: '4008', name: 'F&O Income', type: 'INCOME', parentCode: '4000' },
  { code: '5000', name: 'Expenses', type: 'EXPENSE' },
  { code: '5001', name: 'Brokerage & Charges', type: 'EXPENSE', parentCode: '5000' },
  { code: '5002', name: 'STT & Transaction Tax', type: 'EXPENSE', parentCode: '5000' },
  { code: '5003', name: 'Fund Management Charges', type: 'EXPENSE', parentCode: '5000' },
  { code: '5004', name: 'Insurance Premiums', type: 'EXPENSE', parentCode: '5000' },
  { code: '5005', name: 'Property Expenses', type: 'EXPENSE', parentCode: '5000' },
  { code: '5006', name: 'Capital Losses', type: 'EXPENSE', parentCode: '5000' },
  { code: '5007', name: 'Other Expenses', type: 'EXPENSE', parentCode: '5000' },
  { code: '5008', name: 'Loan Interest', type: 'EXPENSE', parentCode: '5000' },
  { code: '5009', name: 'Speculative Loss', type: 'EXPENSE', parentCode: '5000' },
  { code: '5010', name: 'Loan Charges', type: 'EXPENSE', parentCode: '5000' },
  { code: '5011', name: 'F&O Loss', type: 'EXPENSE', parentCode: '5000' },
];

// Additively ensure every default code exists for this user. Existing rows
// are left untouched; only missing codes are created. This way new defaults
// (e.g. "5008 Loan Interest") roll out to users created before the addition.
/**
 * Seed the default chart if it is missing. Idempotent — existing codes are
 * skipped.
 *
 * Returns the codes it actually created, which matters on the CA path: this
 * runs when a books tab is merely OPENED, so a professional looking at a
 * client's chart for the first time writes twenty-odd rows into that client's
 * books as a side effect. Silent creation is fine for your own account and
 * wrong for somebody else's, so the caller needs to know whether anything
 * happened in order to record it.
 */
/** Prisma's "unique constraint failed" — the row is already there. */
function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2002';
}

export async function ensureDefaultAccounts(
  userId: string,
  db: Db = defaultDb,
): Promise<string[]> {
  const existing = await db.account.findMany({
    where: { userId },
    select: { id: true, code: true },
  });
  const codeToId = new Map(existing.map((a) => [a.code, a.id]));
  const createdCodes: string[] = [];
  for (const acct of DEFAULT_COA) {
    if (codeToId.has(acct.code)) continue;
    const parentId = acct.parentCode ? codeToId.get(acct.parentCode) : undefined;
    try {
      const created = await db.account.create({
        data: { userId, code: acct.code, name: acct.name, type: acct.type, parentId },
      });
      codeToId.set(acct.code, created.id);
      createdCodes.push(acct.code);
    } catch (err) {
      // Another request seeded this code between the read above and this
      // write — two page loads, or a read that projects the books while the
      // chart is being fetched. The row exists, which is all the caller
      // needs; failing here turned an ordinary page load into a 409.
      if (!isUniqueViolation(err)) throw err;
      const raced = await db.account.findFirst({ where: { userId, code: acct.code }, select: { id: true } });
      if (!raced) throw err;
      codeToId.set(acct.code, raced.id);
    }
  }
  return createdCodes;
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
  db: Db = defaultDb,
) {
  const existing = await db.account.findFirst({ where: { userId, code: data.code } });
  if (existing) throw new BadRequestError(`Account code ${data.code} already exists`);

  if (data.parentId) {
    const parent = await db.account.findFirst({ where: { id: data.parentId, userId } });
    if (!parent) throw new NotFoundError(`Parent account ${data.parentId} not found`);
  }

  const account = await db.account.create({
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
  db: Db = defaultDb,
) {
  const account = await db.account.findFirst({ where: { id, userId } });
  if (!account) throw new NotFoundError(`Account ${id} not found`);

  if (data.code && data.code !== account.code) {
    const conflict = await db.account.findFirst({ where: { userId, code: data.code } });
    if (conflict) throw new BadRequestError(`Account code ${data.code} already exists`);
  }

  const updated = await db.account.update({
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

export async function deleteAccount(userId: string, id: string, db: Db = defaultDb) {
  const account = await db.account.findFirst({ where: { id, userId } });
  if (!account) throw new NotFoundError(`Account ${id} not found`);

  const entryCount = await db.voucherEntry.count({
    where: { OR: [{ debitAccountId: id }, { creditAccountId: id }] },
  });
  if (entryCount > 0) {
    throw new BadRequestError('Cannot delete account with existing voucher entries');
  }
  const childCount = await db.account.count({ where: { parentId: id } });
  if (childCount > 0) {
    throw new BadRequestError('Cannot delete account with sub-accounts');
  }
  await db.account.delete({ where: { id } });
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

async function assertAccountsOwnedByUser(userId: string, ids: string[], db: Db = defaultDb) {
  const unique = [...new Set(ids)];
  const found = await db.account.findMany({ where: { id: { in: unique }, userId } });
  if (found.length !== unique.length) {
    throw new BadRequestError('One or more account IDs not found');
  }
}

function formatVoucher(v: {
  id: string; type: VoucherType; voucherNo: string; date: Date; narration: string | null;
  isAutoGenerated: boolean; createdAt: Date;
  entries: Array<{
    id: string; debitAccountId: string; creditAccountId: string; amount: { toString(): string };
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

export async function createVoucher(userId: string, data: VoucherInput, db: Db = defaultDb) {
  if (data.entries.length === 0) throw new BadRequestError('Voucher must have at least one entry');
  const accountIds = data.entries.flatMap((e) => [e.debitAccountId, e.creditAccountId]);
  await assertAccountsOwnedByUser(userId, accountIds, db);

  const existing = await db.voucher.findFirst({ where: { userId, type: data.type, voucherNo: data.voucherNo } });
  if (existing) throw new BadRequestError(`Voucher number ${data.voucherNo} already exists for type ${data.type}`);

  const voucher = await db.voucher.create({
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

export async function updateVoucher(userId: string, id: string, data: Partial<VoucherInput>, db: Db = defaultDb) {
  const existing = await db.voucher.findFirst({ where: { id, userId } });
  if (!existing) throw new NotFoundError(`Voucher ${id} not found`);

  if (data.entries) {
    const accountIds = data.entries.flatMap((e) => [e.debitAccountId, e.creditAccountId]);
    await assertAccountsOwnedByUser(userId, accountIds, db);
  }

  const voucher = await db.voucher.update({
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

export async function deleteVoucher(userId: string, id: string, db: Db = defaultDb) {
  const existing = await db.voucher.findFirst({ where: { id, userId } });
  if (!existing) throw new NotFoundError(`Voucher ${id} not found`);
  await db.voucher.delete({ where: { id } });
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

const ZERO = new Decimal(0);
const dec = (v: { toString(): string } | null | undefined): Decimal => (v == null ? ZERO : new Decimal(v.toString()));
const isDebitNature = (type: AccountType) => type === 'ASSET' || type === 'EXPENSE';
/** Movement on an account's own side: debits raise asset/expense balances, credits the rest. */
const signedMovement = (type: AccountType, debit: Decimal, credit: Decimal) =>
  isDebitNature(type) ? debit.minus(credit) : credit.minus(debit);

/** Voucher date filter: on or before `to`, and strictly before `before` when given. */
function voucherDateFilter(range: { from?: string; to?: string; before?: string }) {
  const date: Record<string, Date> = {};
  if (range.from) date.gte = new Date(range.from);
  if (range.to) date.lte = new Date(range.to);
  if (range.before) date.lt = new Date(range.before);
  return Object.keys(date).length ? { date } : {};
}

export async function getAccountLedger(
  userId: string,
  accountId: string,
  params?: { from?: string; to?: string },
): Promise<{ account: { id: string; code: string; name: string; type: AccountType }; openingBalance: string; entries: LedgerEntry[]; closingBalance: string }> {
  const account = await prisma.account.findFirst({ where: { id: accountId, userId } });
  if (!account) throw new NotFoundError(`Account ${accountId} not found`);

  // Opening = the account's opening balance plus every voucher before the period.
  let opening = dec(account.openingBalance);
  if (params?.from) {
    const prior = await prisma.voucherEntry.findMany({
      where: {
        OR: [{ debitAccountId: accountId }, { creditAccountId: accountId }],
        voucher: { userId, ...voucherDateFilter({ before: params.from }) },
      },
      select: { debitAccountId: true, amount: true },
    });
    for (const e of prior) {
      const amount = dec(e.amount);
      const isDebit = e.debitAccountId === accountId;
      opening = opening.plus(signedMovement(account.type, isDebit ? amount : ZERO, isDebit ? ZERO : amount));
    }
  }

  const entries = await prisma.voucherEntry.findMany({
    where: {
      OR: [{ debitAccountId: accountId }, { creditAccountId: accountId }],
      voucher: { userId, ...voucherDateFilter({ from: params?.from, to: params?.to }) },
    },
    include: { voucher: { select: { type: true, voucherNo: true, date: true, id: true, narration: true } } },
    orderBy: { voucher: { date: 'asc' } },
  });

  let balance = opening;
  const ledgerEntries: LedgerEntry[] = entries.map((e) => {
    const amount = dec(e.amount);
    const isDebit = e.debitAccountId === accountId;
    balance = balance.plus(signedMovement(account.type, isDebit ? amount : ZERO, isDebit ? ZERO : amount));
    return {
      date: e.voucher.date.toISOString().slice(0, 10),
      voucherId: e.voucher.id,
      voucherNo: e.voucher.voucherNo,
      voucherType: e.voucher.type,
      narration: e.narration ?? e.voucher.narration,
      debit: isDebit ? amount.toFixed(4) : null,
      credit: isDebit ? null : amount.toFixed(4),
      balance: balance.toFixed(4),
    };
  });

  return {
    account: { id: account.id, code: account.code, name: account.name, type: account.type },
    openingBalance: opening.toFixed(4),
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
  /** The account's own opening balance, on its normal side. */
  openingBalance: string;
  totalDebit: string;
  totalCredit: string;
  /** Opening + movements, on the account's normal side (negative = opposite side). */
  closingBalance: string;
}

/**
 * Balances from the account openings and vouchers on or before `asOfDate`
 * (inclusive). `options.before` instead takes vouchers strictly before a date —
 * the balance brought forward into a period starting on that date.
 */
export async function getTrialBalance(
  userId: string,
  asOfDate?: string,
  options: { before?: string } = {},
): Promise<TrialBalanceRow[]> {
  const accounts = await prisma.account.findMany({ where: { userId }, orderBy: { code: 'asc' } });
  const range = options.before ? { before: options.before } : { to: asOfDate };
  const entries = await prisma.voucherEntry.findMany({
    where: {
      OR: [{ debitAccount: { userId } }, { creditAccount: { userId } }],
      voucher: { userId, ...voucherDateFilter(range) },
    },
    select: { debitAccountId: true, creditAccountId: true, amount: true },
  });

  const debitMap = new Map<string, Decimal>();
  const creditMap = new Map<string, Decimal>();
  for (const e of entries) {
    const amt = dec(e.amount);
    debitMap.set(e.debitAccountId, (debitMap.get(e.debitAccountId) ?? ZERO).plus(amt));
    creditMap.set(e.creditAccountId, (creditMap.get(e.creditAccountId) ?? ZERO).plus(amt));
  }

  return accounts.map((a) => {
    const ob = dec(a.openingBalance);
    const totalDebit = debitMap.get(a.id) ?? ZERO;
    const totalCredit = creditMap.get(a.id) ?? ZERO;
    return {
      accountId: a.id,
      code: a.code,
      name: a.name,
      type: a.type,
      openingBalance: ob.toFixed(4),
      totalDebit: totalDebit.toFixed(4),
      totalCredit: totalCredit.toFixed(4),
      closingBalance: ob.plus(signedMovement(a.type, totalDebit, totalCredit)).toFixed(4),
    };
  });
}

export async function getPnL(userId: string, from?: string, to?: string) {
  const tb = await getTrialBalance(userId, to);
  // Brought forward = everything strictly before the first day of the period,
  // so a voucher dated on `from` belongs to this period and no other.
  const tbBefore = from ? await getTrialBalance(userId, undefined, { before: from }) : null;
  const baseMap = new Map(tbBefore?.map((r) => [r.accountId, dec(r.closingBalance)]) ?? []);

  const income: TrialBalanceRow[] = [];
  const expense: TrialBalanceRow[] = [];
  for (const row of tb) {
    const periodBalance = dec(row.closingBalance).minus(baseMap.get(row.accountId) ?? ZERO);
    if (row.type === 'INCOME') income.push({ ...row, closingBalance: periodBalance.toFixed(4) });
    if (row.type === 'EXPENSE') expense.push({ ...row, closingBalance: periodBalance.toFixed(4) });
  }

  const totalIncome = income.reduce((s, r) => s.plus(r.closingBalance), ZERO);
  const totalExpense = expense.reduce((s, r) => s.plus(r.closingBalance), ZERO);
  return {
    income,
    expense,
    totalIncome: totalIncome.toFixed(4),
    totalExpense: totalExpense.toFixed(4),
    netProfit: totalIncome.minus(totalExpense).toFixed(4),
  };
}

export async function getBalanceSheet(userId: string, asOfDate?: string) {
  const tb = await getTrialBalance(userId, asOfDate);
  const sum = (rows: TrialBalanceRow[], pick: (r: TrialBalanceRow) => string) =>
    rows.reduce((s, r) => s.plus(pick(r)), ZERO);

  const assets = tb.filter((r) => r.type === 'ASSET');
  const liabilities = tb.filter((r) => r.type === 'LIABILITY');
  const equity = tb.filter((r) => r.type === 'EQUITY');
  const income = tb.filter((r) => r.type === 'INCOME');
  const expense = tb.filter((r) => r.type === 'EXPENSE');

  // Retained earnings = net income from inception to asOfDate.
  const retainedEarnings = sum(income, (r) => r.closingBalance).minus(sum(expense, (r) => r.closingBalance));

  // Vouchers always balance, so any gap between the two sides comes from
  // opening balances that don't net to zero. Shown as its own line (as Tally
  // does) instead of leaving the totals silently unequal.
  const debitOpenings = sum(tb.filter((r) => isDebitNature(r.type)), (r) => r.openingBalance);
  const creditOpenings = sum(tb.filter((r) => !isDebitNature(r.type)), (r) => r.openingBalance);
  const openingDifference = debitOpenings.minus(creditOpenings);

  const totalAssets = sum(assets, (r) => r.closingBalance);
  const totalLiabilities = sum(liabilities, (r) => r.closingBalance);
  const totalEquity = sum(equity, (r) => r.closingBalance).plus(retainedEarnings);

  return {
    assets,
    liabilities,
    equity,
    retainedEarnings: retainedEarnings.toFixed(4),
    /** Positive: the liabilities side is short by this much; negative: the assets side is. */
    openingDifference: openingDifference.toFixed(4),
    totalAssets: totalAssets.toFixed(4),
    totalLiabilities: totalLiabilities.toFixed(4),
    totalEquity: totalEquity.toFixed(4),
  };
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
  const stcgAcct = byCode.get('4003');
  const ltcgAcct = byCode.get('4004');

  const investmentAcct = (() => {
    const ac = txn.assetClass;
    if (ac === 'EQUITY' || ac === 'ETF') return equityAcct;
    if (ac === 'MUTUAL_FUND') return mfAcct;
    if (ac === 'FIXED_DEPOSIT' || ac === 'RECURRING_DEPOSIT') return fdAcct;
    if (ac === 'BOND' || ac === 'GOVT_BOND' || ac === 'CORPORATE_BOND') return bondsAcct;
    if (ac === 'PHYSICAL_GOLD' || ac === 'GOLD_BOND' || ac === 'GOLD_ETF') return goldAcct;
    return null;
  })();

  // Net amount in INR: charges are part of cost, as in the generated vouchers.
  const amount = transactionInrNet(txn).toFixed(4);

  const entries: VoucherEntryInput[] = [];

  if (txn.transactionType === 'BUY') {
    if (investmentAcct && bankAcct) {
      entries.push({ debitAccountId: investmentAcct.id, creditAccountId: bankAcct.id, amount, narration: `Buy ${txn.assetName ?? ''}` });
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

// ─── Bulk auto-generation from existing activity ─────────────────────────────
//
// Turns the user's transactional records into vouchers so the ledger / trial
// balance / P&L / balance sheet reflect reality. Postings:
//
//   Purchase (BUY, SIP, SWITCH_IN, RIGHTS_ISSUE, DEPOSIT)
//       → Investment Dr / Bank Cr at the net amount: charges are part of cost,
//         the same cost the capital-gains engine uses, so nothing counts twice.
//   Dividend reinvested → Investment Dr / Dividend Income Cr
//   Opening balance     → Investment Dr / Capital Account Cr
//   Sale (SELL, SWITCH_OUT, REDEMPTION, MATURITY, WITHDRAWAL)
//       → Bank Dr proceeds; Investment Cr cost of the lots sold (plus the sale
//         value of any units with no purchase on file); gain Cr to STCG, LTCG or
//         Speculative Income; loss Dr to Capital Losses or Speculative Loss.
//         Assets outside the gains engine (deposits, PF) are credited up to
//         their book value, the excess being interest / other income.
//   Dividend / interest received → Bank Dr / Income Cr
//   F&O closed trade    → realised profit Cr F&O Income / loss Dr F&O Loss
//   Loan disbursed      → Bank Dr / Loans Cr; EMI → Loans Dr principal +
//                         Loan Interest Dr / Bank Cr; processing fee → Loan Charges
//   Rent received       → Bank Dr / Rental Income Cr
//   Premium paid        → Insurance Premiums Dr / Bank Cr
//
// Bonus, split and mergers move units, not money, and post nothing.
//
// Vouchers are keyed by a deterministic voucherNo per source row
// ("AUTO-BUY-<txnId>" etc) and RECONCILED on every run: a source that changed
// replaces its voucher, a source that no longer exists removes it. Manual
// vouchers are never touched.

type AccountingRole = 'PURCHASE' | 'SALE' | 'DIVIDEND' | 'INTEREST' | 'REINVEST' | 'OPENING' | 'NONE';

// Typed over every transaction type so a new type has to be placed here.
const ACCOUNTING_ROLE: Record<TransactionType, AccountingRole> = {
  BUY: 'PURCHASE',
  SIP: 'PURCHASE',
  SWITCH_IN: 'PURCHASE',
  RIGHTS_ISSUE: 'PURCHASE',
  DEPOSIT: 'PURCHASE',
  SELL: 'SALE',
  SWITCH_OUT: 'SALE',
  REDEMPTION: 'SALE',
  MATURITY: 'SALE',
  WITHDRAWAL: 'SALE',
  DIVIDEND_PAYOUT: 'DIVIDEND',
  INTEREST_RECEIVED: 'INTEREST',
  DIVIDEND_REINVEST: 'REINVEST',
  OPENING_BALANCE: 'OPENING',
  BONUS: 'NONE',
  SPLIT: 'NONE',
  MERGER_IN: 'NONE',
  MERGER_OUT: 'NONE',
  DEMERGER_IN: 'NONE',
  DEMERGER_OUT: 'NONE',
};

/** Classes whose sale proceeds above book value are interest, not a capital gain. */
const DEPOSIT_LIKE = new Set<string>([
  'FIXED_DEPOSIT', 'RECURRING_DEPOSIT', 'PPF', 'EPF', 'NPS', 'NSC', 'KVP', 'SCSS', 'SSY',
  'POST_OFFICE_MIS', 'POST_OFFICE_RD', 'POST_OFFICE_TD', 'POST_OFFICE_SAVINGS',
]);

function investmentAccountCode(assetClass: string): string | null {
  switch (assetClass) {
    case 'EQUITY':
    case 'ETF':
      return '1101';
    case 'MUTUAL_FUND':
      return '1102';
    case 'FIXED_DEPOSIT':
    case 'RECURRING_DEPOSIT':
      return '1103';
    case 'BOND':
    case 'GOVT_BOND':
    case 'CORPORATE_BOND':
      return '1104';
    case 'PHYSICAL_GOLD':
    case 'GOLD_BOND':
    case 'GOLD_ETF':
      return '1105';
    // F&O books its P&L, not contracts; insurance through premium payments;
    // cash is the bank itself.
    case 'FUTURES':
    case 'OPTIONS':
    case 'INSURANCE':
    case 'ULIP':
    case 'CASH':
      return null;
    default:
      return '1106';
  }
}

export interface GenerateFromActivityResult {
  /** Vouchers written for sources not booked before. */
  created: number;
  /** Vouchers rewritten because their source changed. */
  updated: number;
  /** Vouchers removed because their source is gone. */
  removed: number;
  /** Sources already booked exactly as they are. */
  skipped: number;
  errors: number;
  total: number;
}

type VEntry = {
  debitAccountId: string;
  creditAccountId: string;
  amount: Decimal;
  narration?: string;
  transactionId?: string;
};
type V = {
  type: VoucherType;
  voucherNo: string;
  date: Date;
  narration: string;
  entries: VEntry[];
};

function voucherSignature(v: {
  type: VoucherType;
  date: Date;
  narration: string | null;
  entries: Array<{ debitAccountId: string; creditAccountId: string; amount: { toString(): string }; narration?: string | null; transactionId?: string | null }>;
}): string {
  return JSON.stringify([
    v.type,
    v.date.toISOString().slice(0, 10),
    v.narration ?? '',
    v.entries
      .map((e) => [e.debitAccountId, e.creditAccountId, dec(e.amount).toFixed(4), e.narration ?? '', e.transactionId ?? ''])
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
  ]);
}

export async function generateVouchersFromActivity(
  userId: string,
): Promise<GenerateFromActivityResult> {
  await ensureDefaultAccounts(userId);

  const accounts = await prisma.account.findMany({ where: { userId } });
  const byCode = new Map(accounts.map((a) => [a.code, a]));
  const acctId = (code: string): string | undefined => byCode.get(code)?.id;

  const bankId = acctId('1001');
  if (!bankId) {
    // Defaults should always include 1001 — bail loudly if not.
    return { created: 0, updated: 0, removed: 0, skipped: 0, errors: 0, total: 0 };
  }

  const queue: V[] = [];
  const push = (v: V) => {
    const entries = v.entries.filter((e) => e.amount.greaterThan(0));
    if (entries.length > 0) queue.push({ ...v, entries });
  };

  // ── Transactions ─────────────────────────────────────────────────────────
  const txns = await prisma.transaction.findMany({
    where: { portfolio: { userId } },
    orderBy: [{ tradeDate: 'asc' }, { createdAt: 'asc' }],
  });
  // Gains computed live from the transactions, so a sale booked before its
  // purchases were imported is re-posted once they are.
  const { rows: gainRows } = await computeUserCapitalGains(userId);
  const gainsBySale = new Map<string, typeof gainRows>();
  for (const g of gainRows) {
    const list = gainsBySale.get(g.sellTransactionId);
    if (list) list.push(g);
    else gainsBySale.set(g.sellTransactionId, [g]);
  }
  // Book value per holding for assets the gains engine doesn't track.
  const bookValue = new Map<string, Decimal>();
  const holdingKey = (t: (typeof txns)[number]) => `${t.portfolioId}|${t.assetKey ?? t.assetName ?? ''}`;

  for (const t of txns) {
    const role = ACCOUNTING_ROLE[t.transactionType];
    const invCode = investmentAccountCode(t.assetClass);
    const investmentAcctId = invCode ? acctId(invCode) : undefined;
    const amount = transactionInrNet(t);
    // STT is not part of cost or proceeds for capital gains (sec 48): it is
    // booked as its own expense, keeping investments at the engine's cost.
    const stt = dec(t.stt);
    const sttId = acctId('5002');
    const sttEntry = (): VEntry[] =>
      stt.greaterThan(0) && sttId
        ? [{ debitAccountId: sttId, creditAccountId: bankId, amount: stt, narration: 'Securities transaction tax', transactionId: t.id }]
        : [];
    const name = (t.assetName ?? '').trim();
    const key = holdingKey(t);

    if (role === 'PURCHASE' || role === 'REINVEST' || role === 'OPENING') {
      if (!investmentAcctId) continue;
      const creditId = role === 'PURCHASE' ? bankId : role === 'REINVEST' ? acctId('4001') : acctId('3001');
      if (!creditId) continue;
      const cost = role === 'PURCHASE' && sttId ? amount.minus(stt) : amount;
      bookValue.set(key, (bookValue.get(key) ?? ZERO).plus(cost));
      const label = role === 'PURCHASE' ? 'Buy' : role === 'REINVEST' ? 'Dividend reinvested' : 'Opening balance';
      push({
        type: role === 'PURCHASE' ? 'PURCHASE' : 'JOURNAL',
        voucherNo: `AUTO-${role === 'PURCHASE' ? 'BUY' : role === 'REINVEST' ? 'REINV' : 'OPEN'}-${t.id}`,
        date: t.tradeDate,
        narration: `${label} ${name}`.trim(),
        entries: [
          { debitAccountId: investmentAcctId, creditAccountId: creditId, amount: cost, narration: `${label} ${name}`.trim(), transactionId: t.id },
          ...(role === 'PURCHASE' ? sttEntry() : []),
        ],
      });
    } else if (role === 'SALE') {
      if (!investmentAcctId) continue;
      const entries: VEntry[] = [];
      const rows = gainsBySale.get(t.id) ?? [];
      if (rows.length > 0) {
        // The engine's proceeds are before STT; the bank pays the STT back out below.
        const proceeds = sttId ? amount.plus(stt) : amount;
        entries.push(...sttEntry());
        // Units with no purchase on file come back from the engine at nil cost;
        // they are credited to the investment at sale value, not booked as gain.
        const matched = rows.filter((g) => g.buyTransactionId !== g.sellTransactionId);
        const bucket = (type: string) =>
          matched.filter((g) => g.capitalGainType === type).reduce((s, g) => s.plus(g.gainLoss), ZERO);
        const legs: Array<[Decimal, string, string, string]> = [
          [bucket('SHORT_TERM'), '4003', '5006', 'Short-term'],
          [bucket('LONG_TERM'), '4004', '5006', 'Long-term'],
          [bucket('INTRADAY'), '4007', '5009', 'Speculative'],
        ];
        let bookedGains = ZERO;
        for (const [g, gainCode, lossCode, label] of legs) {
          if (g.greaterThan(0) && acctId(gainCode)) {
            entries.push({ debitAccountId: bankId, creditAccountId: acctId(gainCode)!, amount: g, narration: `${label} gain`, transactionId: t.id });
            bookedGains = bookedGains.plus(g);
          } else if (g.lessThan(0) && acctId(lossCode)) {
            // Loss Dr / Investment Cr: the investment leaves at cost, the bank receives less.
            entries.push({ debitAccountId: acctId(lossCode)!, creditAccountId: investmentAcctId, amount: g.abs(), narration: `${label} loss`, transactionId: t.id });
          }
        }
        // Bank Dr / Investment Cr for the rest: Bank receives exactly the
        // proceeds (gains + this), and the investment is relieved of the cost
        // of the lots sold plus the sale value of any unmatched units.
        entries.push({
          debitAccountId: bankId,
          creditAccountId: investmentAcctId,
          amount: proceeds.minus(bookedGains),
          narration: `Sell ${name}`.trim(),
          transactionId: t.id,
        });
      } else {
        // Outside the gains engine: return of book value, the excess is income.
        const book = bookValue.get(key) ?? ZERO;
        const principal = Decimal.min(amount, book);
        bookValue.set(key, book.minus(principal));
        const excess = amount.minus(principal);
        entries.push({ debitAccountId: bankId, creditAccountId: investmentAcctId, amount: principal, narration: `${t.transactionType === 'SELL' ? 'Sell' : 'Proceeds'} ${name}`.trim(), transactionId: t.id });
        const incomeId = acctId(DEPOSIT_LIKE.has(t.assetClass) ? '4002' : '4006');
        if (excess.greaterThan(0) && incomeId) {
          entries.push({ debitAccountId: bankId, creditAccountId: incomeId, amount: excess, narration: DEPOSIT_LIKE.has(t.assetClass) ? 'Interest' : 'Gain', transactionId: t.id });
        }
      }
      push({ type: 'SALES', voucherNo: `AUTO-SELL-${t.id}`, date: t.tradeDate, narration: `${t.transactionType} ${name}`.trim(), entries });
    } else if (role === 'DIVIDEND' || role === 'INTEREST') {
      const incomeId = acctId(role === 'DIVIDEND' ? '4001' : '4002');
      if (!incomeId) continue;
      const label = role === 'DIVIDEND' ? 'Dividend' : 'Interest';
      push({
        type: 'RECEIPT',
        voucherNo: `AUTO-${role === 'DIVIDEND' ? 'DIV' : 'INT'}-${t.id}`,
        date: t.tradeDate,
        narration: `${label} ${name}`.trim(),
        entries: [{ debitAccountId: bankId, creditAccountId: incomeId, amount, narration: `${label} ${name}`.trim(), transactionId: t.id }],
      });
    }
  }

  // ── F&O: realised P&L per closed trade ───────────────────────────────────
  const foBooks = new Map<string, typeof txns>();
  for (const t of txns) {
    if ((t.assetClass !== 'FUTURES' && t.assetClass !== 'OPTIONS') || !t.assetKey) continue;
    const k = `${t.portfolioId}|${t.assetKey}`;
    const list = foBooks.get(k);
    if (list) list.push(t);
    else foBooks.set(k, [t]);
  }
  const foIncomeId = acctId('4008');
  const foLossId = acctId('5011');
  for (const [k, list] of foBooks) {
    replayForFoPnl(list).forEach((e, i) => {
      const pnl = new Decimal(e.realizedPnl);
      const voucherNo = `AUTO-FNO-${k}-${i}`;
      const narration = `F&O ${e.underlying} ${e.instrumentType} ${e.expiryDate}`;
      if (pnl.greaterThan(0) && foIncomeId) {
        push({ type: 'RECEIPT', voucherNo, date: new Date(e.exitDate), narration, entries: [{ debitAccountId: bankId, creditAccountId: foIncomeId, amount: pnl, narration: 'F&O profit' }] });
      } else if (pnl.lessThan(0) && foLossId) {
        push({ type: 'PAYMENT', voucherNo, date: new Date(e.exitDate), narration, entries: [{ debitAccountId: foLossId, creditAccountId: bankId, amount: pnl.abs(), narration: 'F&O loss' }] });
      }
    });
  }

  // ── Loans ────────────────────────────────────────────────────────────────
  const loansLiabId = acctId('2001');
  const loanIntId = acctId('5008');
  const loanChargesId = acctId('5010');
  const loans = await prisma.loan.findMany({ where: { userId } });
  for (const l of loans) {
    if (!loansLiabId) break;
    push({
      type: 'RECEIPT',
      voucherNo: `AUTO-LOANDISB-${l.id}`,
      date: l.disbursementDate,
      narration: `Loan disbursed ${l.lenderName}`,
      entries: [{ debitAccountId: bankId, creditAccountId: loansLiabId, amount: dec(l.principalAmount), narration: 'Loan disbursed' }],
    });
  }
  // By loan id, not through the relation: a child table with no policy of its
  // own cannot be filtered through its parent's policy.
  const loanPayments = loans.length
    ? await prisma.loanPayment.findMany({ where: { loanId: { in: loans.map((l) => l.id) } } })
    : [];
  for (const p of loanPayments) {
    const amount = dec(p.amount);
    const entries: VEntry[] = [];
    if (p.paymentType === 'PROCESSING_FEE') {
      if (loanChargesId) entries.push({ debitAccountId: loanChargesId, creditAccountId: bankId, amount, narration: 'Loan processing fee' });
    } else {
      // No split on file: all principal. One part on file: the other is the remainder.
      const principal = p.principalPart != null ? dec(p.principalPart) : p.interestPart != null ? amount.minus(dec(p.interestPart)) : amount;
      const interest = p.interestPart != null ? dec(p.interestPart) : amount.minus(principal);
      if (loansLiabId) entries.push({ debitAccountId: loansLiabId, creditAccountId: bankId, amount: principal, narration: 'Loan principal' });
      if (loanIntId) entries.push({ debitAccountId: loanIntId, creditAccountId: bankId, amount: interest, narration: 'Loan interest' });
    }
    push({ type: 'PAYMENT', voucherNo: `AUTO-LOAN-${p.id}`, date: p.paidOn, narration: `Loan ${p.paymentType}`, entries });
  }

  // ── Rent receipts (only RECEIVED) ────────────────────────────────────────
  const rentReceipts = await prisma.rentReceipt.findMany({
    where: { status: 'RECEIVED', tenancy: { property: { userId } } },
  });
  const rentalIncId = acctId('4005');
  for (const r of rentReceipts) {
    if (!rentalIncId || !r.receivedAmount || !r.receivedOn) continue;
    push({
      type: 'RECEIPT',
      voucherNo: `AUTO-RENT-${r.id}`,
      date: r.receivedOn,
      narration: `Rent ${r.forMonth}`,
      entries: [{ debitAccountId: bankId, creditAccountId: rentalIncId, amount: dec(r.receivedAmount), narration: `Rent ${r.forMonth}` }],
    });
  }

  // ── Premium payments ─────────────────────────────────────────────────────
  const premiums = await prisma.premiumPayment.findMany({ where: { policy: { userId } } });
  const insExpId = acctId('5004');
  for (const p of premiums) {
    if (!insExpId) continue;
    push({
      type: 'PAYMENT',
      voucherNo: `AUTO-PREM-${p.id}`,
      date: p.paidOn,
      narration: 'Insurance premium',
      entries: [{ debitAccountId: insExpId, creditAccountId: bankId, amount: dec(p.amount), narration: 'Premium' }],
    });
  }

  // ── Reconcile with the auto vouchers already booked ──────────────────────
  const existing = await prisma.voucher.findMany({
    where: { userId, isAutoGenerated: true },
    include: { entries: true },
  });
  const existingByNo = new Map(existing.map((v) => [v.voucherNo, v]));
  const wanted = new Set(queue.map((v) => v.voucherNo));

  let created = 0;
  let updated = 0;
  let removed = 0;
  let skipped = 0;
  let errors = 0;
  for (const v of existing) {
    if (wanted.has(v.voucherNo)) continue;
    await prisma.voucher.delete({ where: { id: v.id } });
    removed += 1;
  }
  for (const v of queue) {
    const prior = existingByNo.get(v.voucherNo);
    if (prior && voucherSignature(prior) === voucherSignature(v)) {
      skipped += 1;
      continue;
    }
    // Per-voucher failure is counted and the rest still post.
    try {
      await runInTransaction(async (tx) => {
        if (prior) await tx.voucher.delete({ where: { id: prior.id } });
        await tx.voucher.create({
          data: {
            userId,
            type: v.type,
            voucherNo: v.voucherNo,
            date: v.date,
            narration: v.narration,
            isAutoGenerated: true,
            entries: {
              create: v.entries.map((e) => ({
                debitAccountId: e.debitAccountId,
                creditAccountId: e.creditAccountId,
                amount: e.amount.toFixed(4),
                narration: e.narration ?? null,
                transactionId: e.transactionId ?? null,
              })),
            },
          },
        });
      });
      if (prior) updated += 1;
      else created += 1;
    } catch (err) {
      logger.warn({ err, userId, voucherNo: v.voucherNo }, 'accounting.auto_voucher_failed');
      errors += 1;
    }
  }

  return { created, updated, removed, skipped, errors, total: queue.length };
}
