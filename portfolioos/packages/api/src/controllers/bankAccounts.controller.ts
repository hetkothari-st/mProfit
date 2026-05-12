import type { Request, Response } from 'express';
import { z } from 'zod';
import {
  BANK_ACCOUNT_TYPES,
  BANK_ACCOUNT_STATUSES,
  BANK_BALANCE_SOURCES,
  listAccounts,
  getAccount,
  createAccount,
  updateAccount,
  deleteAccount,
  addSnapshot,
  deleteSnapshot,
  listAccountCashFlows,
} from '../services/bankAccounts.service.js';
import { ok } from '../lib/response.js';
import { UnauthorizedError } from '../lib/errors.js';
import { isoDate, signedMoneyString, last4Digits, mmYY } from '../lib/zodMoney.js';

// ── Zod schemas ──────────────────────────────────────────────────────────────

const createSchema = z.object({
  bankName: z.string().min(1).max(200),
  accountType: z.enum(BANK_ACCOUNT_TYPES),
  accountHolder: z.string().min(1).max(200),
  last4: last4Digits,
  portfolioId: z.string().nullable().optional(),
  ifsc: z.string().max(20).nullable().optional(),
  branch: z.string().max(200).nullable().optional(),
  nickname: z.string().max(120).nullable().optional(),
  jointHolders: z.array(z.string().max(200)).optional(),
  nomineeName: z.string().max(200).nullable().optional(),
  nomineeRelation: z.string().max(60).nullable().optional(),
  debitCardLast4: last4Digits.nullable().optional(),
  debitCardExpiry: mmYY.nullable().optional(),
  currentBalance: signedMoneyString.nullable().optional(),
  balanceAsOf: isoDate.nullable().optional(),
  status: z.enum(BANK_ACCOUNT_STATUSES).optional(),
  openedOn: isoDate.nullable().optional(),
  closedOn: isoDate.nullable().optional(),
});

const updateSchema = createSchema.partial();

const snapshotSchema = z.object({
  asOfDate: isoDate,
  balance: signedMoneyString,
  source: z.enum(BANK_BALANCE_SOURCES).optional().default('manual'),
  note: z.string().max(500).nullable().optional(),
});

// ── Handlers ─────────────────────────────────────────────────────────────────

export async function listAccountsHandler(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  const rows = await listAccounts(req.user.id);
  ok(res, rows);
}

export async function getAccountHandler(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  const row = await getAccount(req.user.id, req.params['id']!);
  ok(res, row);
}

export async function createAccountHandler(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  const body = createSchema.parse(req.body);
  const row = await createAccount(req.user.id, body);
  res.status(201);
  ok(res, row);
}

export async function updateAccountHandler(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  const body = updateSchema.parse(req.body);
  const row = await updateAccount(req.user.id, req.params['id']!, body);
  ok(res, row);
}

export async function deleteAccountHandler(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  await deleteAccount(req.user.id, req.params['id']!);
  res.status(204).end();
}

export async function addSnapshotHandler(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  const body = snapshotSchema.parse(req.body);
  const row = await addSnapshot(req.user.id, req.params['id']!, body);
  res.status(201);
  ok(res, row);
}

export async function deleteSnapshotHandler(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  await deleteSnapshot(req.user.id, req.params['snapshotId']!);
  res.status(204).end();
}

export async function listAccountCashFlowsHandler(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  const limit = Number(req.query['limit'] ?? 100);
  const rows = await listAccountCashFlows(req.user.id, req.params['id']!, {
    limit: Number.isFinite(limit) ? limit : 100,
  });
  ok(res, rows);
}
