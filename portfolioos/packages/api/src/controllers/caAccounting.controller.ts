/**
 * A client's books, kept by their CA.
 *
 * Every handler is the same three steps: resolve the grant, call the EXISTING
 * accounting service with the client's userId, and record what was done. No
 * accounting logic is duplicated here — `accounting.service.ts` already takes
 * `userId` as a parameter throughout, which is what makes per-client books
 * cost nothing in schema terms.
 *
 * The CA's own session identity is never changed. The write reaches the
 * client's rows because `account_ca_access` / `voucher_ca_access` and their
 * siblings permit it, not because the caller has been disguised as the client.
 * That is what confines a CA to five tables no matter what this file does.
 *
 * Reads are audited only where they are the point (the activity feed lives in
 * ca.controller). Mutations are audited without exception, inside the same
 * transaction as the change.
 */

import type { Request, Response } from 'express';
import { ok, created, noContent } from '../lib/response.js';
import { BadRequestError, NotFoundError } from '../lib/errors.js';
import { runInTransaction } from '../lib/prisma.js';
import { getCaScope, type CaScope } from '../services/ca/caAccess.service.js';
import { recordCaAudit } from '../services/ca/caAudit.service.js';
import {
  ensureDefaultAccounts,
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
} from '../services/accounting.service.js';
import type { VoucherType } from '@prisma/client';

/** Resolve the grant named in the URL, or refuse. */
async function scopeOf(req: Request): Promise<CaScope> {
  const clientId = (req.params.clientId ?? '').trim();
  if (!clientId) throw new BadRequestError('clientId required');
  return getCaScope(req.user!.id, clientId);
}

// ─── Chart of accounts ───────────────────────────────────────────────

export async function caListAccountsTree(req: Request, res: Response) {
  const scope = await scopeOf(req);
  // A client who has never opened the accounting module has no chart yet;
  // seeding on first read is what the user's own path already does.
  await ensureDefaultAccounts(scope.subjectUserId);
  ok(res, await listAccountsTree(scope.subjectUserId));
}

export async function caListAccountsFlat(req: Request, res: Response) {
  const scope = await scopeOf(req);
  await ensureDefaultAccounts(scope.subjectUserId);
  ok(res, await listAccountsFlat(scope.subjectUserId));
}

export async function caCreateAccount(req: Request, res: Response) {
  const scope = await scopeOf(req);
  const account = await createAccount(scope.subjectUserId, req.body);
  await runInTransaction((tx) =>
    recordCaAudit(tx, auditCtx(scope, req), {
      action: 'ACCOUNT_CREATED',
      resourceType: 'Account',
      resourceId: account.id,
      summary: `Created account ${account.code} — ${account.name}.`,
      after: { code: account.code, name: account.name, type: account.type },
    }),
  );
  created(res, account);
}

export async function caUpdateAccount(req: Request, res: Response) {
  const scope = await scopeOf(req);
  const id = req.params.id!;
  // Read the prior state first: an audit trail that records only the new value
  // cannot answer "what did this used to say", which is most of its purpose.
  const before = (await listAccountsFlat(scope.subjectUserId)).find((a) => a.id === id);
  if (!before) throw new NotFoundError('Account not found');

  const account = await updateAccount(scope.subjectUserId, id, req.body);
  await runInTransaction((tx) =>
    recordCaAudit(tx, auditCtx(scope, req), {
      action: 'ACCOUNT_UPDATED',
      resourceType: 'Account',
      resourceId: id,
      summary: `Updated account ${account.code} — ${account.name}.`,
      before: { code: before.code, name: before.name, type: before.type },
      after: { code: account.code, name: account.name, type: account.type },
    }),
  );
  ok(res, account);
}

export async function caDeleteAccount(req: Request, res: Response) {
  const scope = await scopeOf(req);
  const id = req.params.id!;
  const before = (await listAccountsFlat(scope.subjectUserId)).find((a) => a.id === id);
  if (!before) throw new NotFoundError('Account not found');

  await deleteAccount(scope.subjectUserId, id);
  await runInTransaction((tx) =>
    recordCaAudit(tx, auditCtx(scope, req), {
      action: 'ACCOUNT_DELETED',
      resourceType: 'Account',
      resourceId: id,
      summary: `Deleted account ${before.code} — ${before.name}.`,
      before: { code: before.code, name: before.name, type: before.type },
    }),
  );
  noContent(res);
}

// ─── Vouchers ────────────────────────────────────────────────────────

export async function caListVouchers(req: Request, res: Response) {
  const scope = await scopeOf(req);
  const type = (req.query.type as VoucherType | undefined) ?? undefined;
  ok(
    res,
    await listVouchers(scope.subjectUserId, {
      type,
      from: req.query.from as string | undefined,
      to: req.query.to as string | undefined,
    }),
  );
}

export async function caGetVoucher(req: Request, res: Response) {
  const scope = await scopeOf(req);
  ok(res, await getVoucher(scope.subjectUserId, req.params.id!));
}

export async function caNextVoucherNo(req: Request, res: Response) {
  const scope = await scopeOf(req);
  const type = req.query.type as VoucherType | undefined;
  if (!type) throw new BadRequestError('type required');
  ok(res, { voucherNo: await nextVoucherNo(scope.subjectUserId, type) });
}

export async function caCreateVoucher(req: Request, res: Response) {
  const scope = await scopeOf(req);
  const voucher = await createVoucher(scope.subjectUserId, req.body);
  await runInTransaction((tx) =>
    recordCaAudit(tx, auditCtx(scope, req), {
      action: 'VOUCHER_CREATED',
      resourceType: 'Voucher',
      resourceId: voucher.id,
      summary: `Posted ${voucher.type} voucher ${voucher.voucherNo}.`,
      after: { voucherNo: voucher.voucherNo, type: voucher.type, date: voucher.date },
    }),
  );
  created(res, voucher);
}

export async function caUpdateVoucher(req: Request, res: Response) {
  const scope = await scopeOf(req);
  const id = req.params.id!;
  const before = await getVoucher(scope.subjectUserId, id);
  const voucher = await updateVoucher(scope.subjectUserId, id, req.body);
  await runInTransaction((tx) =>
    recordCaAudit(tx, auditCtx(scope, req), {
      action: 'VOUCHER_UPDATED',
      resourceType: 'Voucher',
      resourceId: id,
      summary: `Edited ${voucher.type} voucher ${voucher.voucherNo}.`,
      before,
      after: voucher,
    }),
  );
  ok(res, voucher);
}

export async function caDeleteVoucher(req: Request, res: Response) {
  const scope = await scopeOf(req);
  const id = req.params.id!;
  const before = await getVoucher(scope.subjectUserId, id);
  await deleteVoucher(scope.subjectUserId, id);
  await runInTransaction((tx) =>
    recordCaAudit(tx, auditCtx(scope, req), {
      action: 'VOUCHER_DELETED',
      resourceType: 'Voucher',
      resourceId: id,
      summary: `Deleted voucher ${before?.voucherNo ?? id}.`,
      before,
    }),
  );
  noContent(res);
}

// ─── Statements (read-only) ──────────────────────────────────────────

export async function caGetLedger(req: Request, res: Response) {
  const scope = await scopeOf(req);
  const accountId = (req.query.accountId as string | undefined)?.trim();
  if (!accountId) throw new BadRequestError('accountId required');
  ok(
    res,
    await getAccountLedger(scope.subjectUserId, accountId, {
      from: req.query.from as string | undefined,
      to: req.query.to as string | undefined,
    }),
  );
}

export async function caGetTrialBalance(req: Request, res: Response) {
  const scope = await scopeOf(req);
  ok(res, await getTrialBalance(scope.subjectUserId, req.query.asOf as string | undefined));
}

export async function caGetPnL(req: Request, res: Response) {
  const scope = await scopeOf(req);
  ok(
    res,
    await getPnL(
      scope.subjectUserId,
      req.query.from as string | undefined,
      req.query.to as string | undefined,
    ),
  );
}

export async function caGetBalanceSheet(req: Request, res: Response) {
  const scope = await scopeOf(req);
  ok(res, await getBalanceSheet(scope.subjectUserId, req.query.asOf as string | undefined));
}

function auditCtx(scope: CaScope, req: Request) {
  return {
    actorUserId: scope.callerId,
    subjectUserId: scope.subjectUserId,
    clientId: scope.clientId,
    req,
  };
}
