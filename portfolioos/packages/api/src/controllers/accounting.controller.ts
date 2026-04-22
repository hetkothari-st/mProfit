import type { Request, Response } from 'express';
import { z } from 'zod';
import {
  listAccountsTree,
  listAccountsFlat,
  createAccount,
  updateAccount,
  deleteAccount,
  listVouchers,
  getVoucher,
  createVoucher,
  updateVoucher,
  deleteVoucher,
  nextVoucherNo,
  getAccountLedger,
  getTrialBalance,
  getPnL,
  getBalanceSheet,
  suggestVoucherForTransaction,
} from '../services/accounting.service.js';
import { ok } from '../lib/response.js';
import { UnauthorizedError } from '../lib/errors.js';
import type { AccountType, VoucherType } from '@prisma/client';

const ACCOUNT_TYPES = ['ASSET', 'LIABILITY', 'INCOME', 'EXPENSE', 'EQUITY'] as const;
const VOUCHER_TYPES = ['JOURNAL', 'PAYMENT', 'RECEIPT', 'CONTRA', 'PURCHASE', 'SALES'] as const;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD');
const moneyString = z.string().regex(/^\d+(\.\d+)?$/, 'Expected positive decimal string');

const createAccountSchema = z.object({
  code: z.string().min(1).max(20),
  name: z.string().min(1).max(200),
  type: z.enum(ACCOUNT_TYPES),
  parentId: z.string().nullable().optional(),
  openingBalance: moneyString.optional(),
});

const voucherEntrySchema = z.object({
  debitAccountId: z.string().min(1),
  creditAccountId: z.string().min(1),
  amount: moneyString,
  narration: z.string().max(500).optional(),
});

const createVoucherSchema = z.object({
  type: z.enum(VOUCHER_TYPES),
  voucherNo: z.string().min(1).max(50),
  date: isoDate,
  narration: z.string().max(500).optional(),
  entries: z.array(voucherEntrySchema).min(1),
});

const updateVoucherSchema = createVoucherSchema.partial();

// ─── Accounts ────────────────────────────────────────────────────────────────

export async function listAccountsTreeHandler(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  const tree = await listAccountsTree(req.user.id);
  ok(res, tree);
}

export async function listAccountsFlatHandler(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  const accounts = await listAccountsFlat(req.user.id);
  ok(res, accounts);
}

export async function createAccountHandler(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  const body = createAccountSchema.parse(req.body);
  const account = await createAccount(req.user.id, {
    ...body,
    type: body.type as AccountType,
  });
  res.status(201);
  ok(res, account);
}

export async function updateAccountHandler(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  const body = createAccountSchema.partial().parse(req.body);
  const account = await updateAccount(req.user.id, req.params['id']!, {
    ...body,
    type: body.type as AccountType | undefined,
  });
  ok(res, account);
}

export async function deleteAccountHandler(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  await deleteAccount(req.user.id, req.params['id']!);
  ok(res, null);
}

// ─── Vouchers ─────────────────────────────────────────────────────────────────

export async function listVouchersHandler(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  const { from, to, type, page, limit } = req.query as Record<string, string>;
  const result = await listVouchers(req.user.id, {
    from,
    to,
    type: type as VoucherType | undefined,
    page: page ? parseInt(page, 10) : undefined,
    limit: limit ? parseInt(limit, 10) : undefined,
  });
  ok(res, result);
}

export async function getVoucherHandler(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  const voucher = await getVoucher(req.user.id, req.params['id']!);
  ok(res, voucher);
}

export async function createVoucherHandler(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  const body = createVoucherSchema.parse(req.body);
  const voucher = await createVoucher(req.user.id, {
    ...body,
    type: body.type as VoucherType,
  });
  res.status(201);
  ok(res, voucher);
}

export async function updateVoucherHandler(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  const body = updateVoucherSchema.parse(req.body);
  const voucher = await updateVoucher(req.user.id, req.params['id']!, {
    ...body,
    type: body.type as VoucherType | undefined,
  });
  ok(res, voucher);
}

export async function deleteVoucherHandler(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  await deleteVoucher(req.user.id, req.params['id']!);
  ok(res, null);
}

export async function nextVoucherNoHandler(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  const { type } = req.query as { type: string };
  const no = await nextVoucherNo(req.user.id, (type ?? 'JOURNAL') as VoucherType);
  ok(res, { voucherNo: no });
}

// ─── Ledger ────────────────────────────────────────────────────────────────────

export async function getLedgerHandler(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  const { from, to } = req.query as Record<string, string>;
  const ledger = await getAccountLedger(req.user.id, req.params['accountId']!, { from, to });
  ok(res, ledger);
}

// ─── Reports ──────────────────────────────────────────────────────────────────

export async function getTrialBalanceHandler(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  const { asOf } = req.query as Record<string, string>;
  const tb = await getTrialBalance(req.user.id, asOf);
  ok(res, tb);
}

export async function getPnLHandler(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  const { from, to } = req.query as Record<string, string>;
  const pnl = await getPnL(req.user.id, from, to);
  ok(res, pnl);
}

export async function getBalanceSheetHandler(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  const { asOf } = req.query as Record<string, string>;
  const bs = await getBalanceSheet(req.user.id, asOf);
  ok(res, bs);
}

// ─── Suggest from transaction ─────────────────────────────────────────────────

export async function suggestVoucherHandler(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  const suggestion = await suggestVoucherForTransaction(req.user.id, req.params['txnId']!);
  ok(res, suggestion);
}
