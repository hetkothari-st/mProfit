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
 * Requests are validated with the SAME schemas the client's own accounting
 * controller uses. `accounting.service.ts` does no format checking of its
 * own, so those schemas are the only place a money string is proved to be
 * one — and this is the surface where the caller does not own the ledger.
 *
 * Reads are audited only where they are the point (the activity feed lives in
 * ca.controller). Every mutation writes an audit entry, and the two share one
 * transaction: the accounting services take an optional client, so the change
 * and its record commit together or not at all. A rolled-back correction
 * cannot leave an entry claiming it happened, and a committed one cannot go
 * unrecorded.
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
import type { AccountType, VoucherType } from '@prisma/client';
import {
  createAccountSchema,
  updateAccountSchema,
  createVoucherSchema,
  updateVoucherSchema,
  correctTransactionSchema,
} from '../schemas/accounting.schema.js';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { toDecimal, serializeMoney, type Decimal } from '@portfolioos/shared';
import { recomputeForAsset } from '../services/holdingsProjection.js';

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
  const body = createAccountSchema.parse(req.body);
  const account = await runInTransaction(async (tx) => {
    const created_ = await createAccount(
      scope.subjectUserId,
      { ...body, type: body.type as AccountType },
      tx,
    );
    await recordCaAudit(tx, auditCtx(scope, req), {
      action: 'ACCOUNT_CREATED',
      resourceType: 'Account',
      resourceId: created_.id,
      summary: `Created account ${created_.code} — ${created_.name}.`,
      after: { code: created_.code, name: created_.name, type: created_.type },
    });
    return created_;
  });
  created(res, account);
}

export async function caUpdateAccount(req: Request, res: Response) {
  const scope = await scopeOf(req);
  const id = req.params.id!;
  // Read the prior state first: an audit trail that records only the new value
  // cannot answer "what did this used to say", which is most of its purpose.
  const before = (await listAccountsFlat(scope.subjectUserId)).find((a) => a.id === id);
  if (!before) throw new NotFoundError('Account not found');

  const body = updateAccountSchema.parse(req.body);
  const account = await runInTransaction(async (tx) => {
    const updated = await updateAccount(
      scope.subjectUserId,
      id,
      { ...body, type: body.type as AccountType | undefined },
      tx,
    );
    await recordCaAudit(tx, auditCtx(scope, req), {
      action: 'ACCOUNT_UPDATED',
      resourceType: 'Account',
      resourceId: id,
      summary: `Updated account ${updated.code} — ${updated.name}.`,
      before: { code: before.code, name: before.name, type: before.type },
      after: { code: updated.code, name: updated.name, type: updated.type },
    });
    return updated;
  });
  ok(res, account);
}

export async function caDeleteAccount(req: Request, res: Response) {
  const scope = await scopeOf(req);
  const id = req.params.id!;
  const before = (await listAccountsFlat(scope.subjectUserId)).find((a) => a.id === id);
  if (!before) throw new NotFoundError('Account not found');

  await runInTransaction(async (tx) => {
    await deleteAccount(scope.subjectUserId, id, tx);
    await recordCaAudit(tx, auditCtx(scope, req), {
      action: 'ACCOUNT_DELETED',
      resourceType: 'Account',
      resourceId: id,
      summary: `Deleted account ${before.code} — ${before.name}.`,
      before: { code: before.code, name: before.name, type: before.type },
    });
  });
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
  const body = createVoucherSchema.parse(req.body);
  const voucher = await runInTransaction(async (tx) => {
    const posted = await createVoucher(
      scope.subjectUserId,
      { ...body, type: body.type as VoucherType },
      tx,
    );
    await recordCaAudit(tx, auditCtx(scope, req), {
      action: 'VOUCHER_CREATED',
      resourceType: 'Voucher',
      resourceId: posted.id,
      summary: `Posted ${posted.type} voucher ${posted.voucherNo}.`,
      after: { voucherNo: posted.voucherNo, type: posted.type, date: posted.date },
    });
    return posted;
  });
  created(res, voucher);
}

export async function caUpdateVoucher(req: Request, res: Response) {
  const scope = await scopeOf(req);
  const id = req.params.id!;
  const before = await getVoucher(scope.subjectUserId, id);
  const body = updateVoucherSchema.parse(req.body);
  const voucher = await runInTransaction(async (tx) => {
    const edited = await updateVoucher(
      scope.subjectUserId,
      id,
      { ...body, type: body.type as VoucherType | undefined },
      tx,
    );
    await recordCaAudit(tx, auditCtx(scope, req), {
      action: 'VOUCHER_UPDATED',
      resourceType: 'Voucher',
      resourceId: id,
      summary: `Edited ${edited.type} voucher ${edited.voucherNo}.`,
      before,
      after: edited,
    });
    return edited;
  });
  ok(res, voucher);
}

export async function caDeleteVoucher(req: Request, res: Response) {
  const scope = await scopeOf(req);
  const id = req.params.id!;
  const before = await getVoucher(scope.subjectUserId, id);
  await runInTransaction(async (tx) => {
    await deleteVoucher(scope.subjectUserId, id, tx);
    await recordCaAudit(tx, auditCtx(scope, req), {
      action: 'VOUCHER_DELETED',
      resourceType: 'Voucher',
      resourceId: id,
      summary: `Deleted voucher ${before?.voucherNo ?? id}.`,
      before,
    });
  });
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

// ─── Transaction corrections ─────────────────────────────────────────

/**
 * Correct one of the client's transactions.
 *
 * The RLS grant on `Transaction` is FOR UPDATE only, so this endpoint cannot
 * conjure a trade into existence or make one disappear however it is called —
 * that boundary is Postgres's, not this handler's.
 *
 * The write and its audit entry share one transaction. The FIFO recompute runs
 * AFTER that commits, which is the pattern `ingestion/projection.ts` already
 * follows: a recompute is a rebuild of derived rows, it is idempotent, and if
 * it throws the corrected ledger is still durable and the rebuild can be
 * retried. Holding the transaction open across it would buy nothing and risk
 * a long-running lock on someone else's books.
 */
export async function caCorrectTransaction(req: Request, res: Response) {
  const scope = await scopeOf(req);
  const id = req.params.id!;
  const body = correctTransactionSchema.parse(req.body);

  // Readable under portfolio_ca_read + transaction_ca_read; the ownership
  // check is the point, not the read — a transaction id from the URL must be
  // proved to belong to THIS client before anything is written.
  const before = await prisma.transaction.findUnique({
    where: { id },
    include: { portfolio: { select: { userId: true } } },
  });
  if (!before || before.portfolio.userId !== scope.subjectUserId) {
    throw new NotFoundError('Transaction not found for this client');
  }

  const patch: Prisma.TransactionUpdateInput = {
    ...(body.tradeDate !== undefined && { tradeDate: new Date(body.tradeDate) }),
    ...(body.quantity !== undefined && { quantity: body.quantity }),
    ...(body.price !== undefined && { price: body.price }),
    ...(body.brokerage !== undefined && { brokerage: body.brokerage }),
    ...(body.stt !== undefined && { stt: body.stt }),
    ...(body.stampDuty !== undefined && { stampDuty: body.stampDuty }),
    ...(body.exchangeCharges !== undefined && { exchangeCharges: body.exchangeCharges }),
    ...(body.gst !== undefined && { gst: body.gst }),
    ...(body.sebiCharges !== undefined && { sebiCharges: body.sebiCharges }),
    ...(body.otherCharges !== undefined && { otherCharges: body.otherCharges }),
    ...(body.assetName !== undefined && { assetName: body.assetName }),
    ...(body.isin !== undefined && { isin: body.isin }),
    ...(body.broker !== undefined && { broker: body.broker }),
    ...(body.orderNo !== undefined && { orderNo: body.orderNo }),
    ...(body.tradeNo !== undefined && { tradeNo: body.tradeNo }),
    ...(body.narration !== undefined && { narration: body.narration }),
  };

  // Money moved, so gross and net are re-derived rather than trusted from the
  // request — a caller must never be able to state a total that disagrees with
  // the quantity and price beside it.
  const qty = toDecimal(body.quantity ?? before.quantity);
  const price = toDecimal(body.price ?? before.price);
  const chargeParts: Array<string | { toString(): string }> = [
    body.brokerage ?? before.brokerage,
    body.stt ?? before.stt,
    body.stampDuty ?? before.stampDuty,
    body.exchangeCharges ?? before.exchangeCharges,
    body.gst ?? before.gst,
    body.sebiCharges ?? before.sebiCharges,
    body.otherCharges ?? before.otherCharges,
  ];
  const charges = chargeParts.reduce(
    (sum: Decimal, c) => sum.plus(toDecimal(c)),
    toDecimal('0'),
  );

  const gross = qty.times(price);
  patch.grossAmount = serializeMoney(gross);
  // A buy costs more than the trade; a sale nets less. Anything else is a
  // movement of units, where charges still reduce the value received.
  patch.netAmount = serializeMoney(
    before.transactionType === 'BUY' ? gross.plus(charges) : gross.minus(charges),
  );

  const updated = await runInTransaction(async (tx) => {
    const row = await tx.transaction.update({ where: { id }, data: patch });
    await recordCaAudit(tx, auditCtx(scope, req), {
      action: 'TRANSACTION_CORRECTED',
      resourceType: 'Transaction',
      resourceId: id,
      summary: `Corrected ${before.assetName ?? 'a transaction'} dated ${before.tradeDate
        .toISOString()
        .slice(0, 10)}.`,
      before: {
        tradeDate: before.tradeDate.toISOString().slice(0, 10),
        quantity: before.quantity.toString(),
        price: before.price.toString(),
        netAmount: before.netAmount.toString(),
        narration: before.narration,
      },
      after: {
        tradeDate: row.tradeDate.toISOString().slice(0, 10),
        quantity: row.quantity.toString(),
        price: row.price.toString(),
        netAmount: row.netAmount.toString(),
        narration: row.narration,
      },
    });
    return row;
  });

  // Derived rows, rebuilt under the CA's own identity — HoldingProjection and
  // CapitalGain carry a CA write policy precisely so this needs no
  // impersonation of the client.
  if (before.assetKey) {
    await recomputeForAsset(before.portfolioId, before.assetKey);
  }

  ok(res, updated);
}
