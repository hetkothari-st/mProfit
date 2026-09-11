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
import fs from 'node:fs';
import { ok, created, noContent } from '../lib/response.js';
import { BadRequestError, NotFoundError } from '../lib/errors.js';
import { runInTransaction } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';
import { getCaScope, type CaScope } from '../services/ca/caAccess.service.js';
import { recordCaAudit } from '../services/ca/caAudit.service.js';
import { projectBooks } from '../services/ca/caProjection.service.js';
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
  setFmvSchema,
} from '../schemas/accounting.schema.js';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { toDecimal, serializeMoney, type Decimal } from '@everypaisa/shared';
import { recomputeForAsset } from '../services/holdingsProjection.js';
import {
  listUserFmvOverrides,
  getFmvForIsin,
  upsertUserFmv,
  deleteUserFmv,
} from '../services/fmvOverride.service.js';
import { createTransaction } from '../services/transaction.service.js';
import { baseTransactionSchema } from './transaction.controller.js';
import { createImportJob, listImportJobs } from '../services/imports/import.service.js';
import {
  createSchema as importCreateBodySchema,
  isRegulatoryDoc,
  inferTypeFromFileName,
} from './imports.controller.js';
import { decryptIfNeeded } from '../lib/decryptIfNeeded.js';

/** Resolve the grant named in the URL, or refuse. */
async function scopeOf(req: Request): Promise<CaScope> {
  const clientId = (req.params.clientId ?? '').trim();
  if (!clientId) throw new BadRequestError('clientId required');
  return getCaScope(req.user!.id, clientId);
}

/**
 * Seed the client's chart if it is missing, and say so on the record.
 *
 * Opening a books tab is a read to the CA and a WRITE to the client: the
 * default chart is created on first view. Every other change a CA makes is
 * recorded, and this one was not — a consented client would have watched
 * twenty accounts appear with nothing in their activity feed to explain them.
 */
async function ensureChartAudited(scope: CaScope, req: Request): Promise<void> {
  const created = await ensureDefaultAccounts(scope.subjectUserId);
  if (created.length === 0) return;
  await runInTransaction((tx) =>
    recordCaAudit(tx, auditCtx(scope, req), {
      action: 'ACCOUNT_CREATED',
      resourceType: 'Account',
      summary: `Created the default chart of accounts (${created.length} accounts).`,
      after: { codes: created },
    }),
  );
}

/**
 * Give the client the one portfolio their books need, if they have none yet.
 *
 * A shadow client (`createManagedClient`) is a brand-new `User` row with no
 * portfolio at all, so the first manual transaction or the first import for
 * them would fail `assertPortfolio` before it got anywhere near the ledger.
 * This creates exactly that first container, using the same defaults the
 * onboarding wizard itself uses for a brand-new account
 * (`apps/web/src/pages/onboarding/OnboardingWizard.tsx`: name "My Portfolio",
 * type INVESTMENT; currency is left to the schema default of INR) rather than
 * inventing new ones.
 *
 * The INSERT is guarded by `portfolio_ca_bootstrap_insert` — a policy narrower than the
 * CA's ordinary grant shape: it admits an INSERT only when the client
 * currently has ZERO portfolios. A CA can bring a portfolio-less client up to
 * having one; they can never give an already-provisioned client a second.
 * That is the same "keeps the books, does not own the account" boundary
 * `cannot create a portfolio for the client` in ca-access.test.ts asserts —
 * this does not relax it for any client that boundary already protects.
 *
 * Idempotent: found-or-create, so opening the tab or importing again never
 * spawns a second portfolio (and the policy would refuse it even if this
 * check were skipped). The find-then-create window is a known, accepted race
 * — see the migration comment on `portfolio_ca_bootstrap_insert`.
 */
async function ensureDefaultPortfolio(scope: CaScope, req: Request) {
  const existing = await prisma.portfolio.findFirst({
    where: { userId: scope.subjectUserId },
    orderBy: { createdAt: 'asc' },
  });
  if (existing) return existing;

  return runInTransaction(async (tx) => {
    const portfolio = await tx.portfolio.create({
      data: {
        userId: scope.subjectUserId,
        name: 'My Portfolio',
        type: 'INVESTMENT',
        currency: 'INR',
      },
    });
    await recordCaAudit(tx, auditCtx(scope, req), {
      action: 'PORTFOLIO_CREATED',
      resourceType: 'Portfolio',
      resourceId: portfolio.id,
      summary: `Created the default portfolio "${portfolio.name}" — the first write to this client's books.`,
      after: { name: portfolio.name, type: portfolio.type, currency: portfolio.currency },
    });
    return portfolio;
  });
}

/**
 * Bring the client's books up to date before reading them.
 *
 * Vouchers are derived from the client's recorded activity, and nothing
 * derives them for a client who enters transactions by hand. The accounting
 * report downloads have always projected first; these tabs did not, so a CA
 * saw an empty Trial balance and a populated Trial Balance report for the same
 * client on the same date. Projecting here is what makes the screen and the
 * download agree.
 *
 * Defensive, so a projection failure degrades to stale-but-real numbers rather
 * than a broken tab — the same trade the download path makes. The explicit
 * "Generate from activity" action does not swallow errors, because a CA who
 * asked for it is owed the reason it did not work.
 */
async function ensureBooksProjected(scope: CaScope, req: Request): Promise<void> {
  await ensureChartAudited(scope, req);
  try {
    await projectBooks(scope.subjectUserId, auditCtx(scope, req));
  } catch (err) {
    logger.error(
      { err, clientId: scope.clientId, actorUserId: req.user!.id },
      'ca-accounting.auto_project_failed',
    );
  }
}

/**
 * Project on demand.
 *
 * The tabs already project on open, so this exists for the case the automatic
 * pass cannot cover: the client added transactions while the CA had the page
 * open, and the CA wants the books to catch up without hunting for a reload.
 */
export async function caGenerateFromActivity(req: Request, res: Response) {
  const scope = await scopeOf(req);
  await ensureChartAudited(scope, req);
  ok(res, await projectBooks(scope.subjectUserId, auditCtx(scope, req)));
}

// ─── Chart of accounts ───────────────────────────────────────────────

export async function caListAccountsTree(req: Request, res: Response) {
  const scope = await scopeOf(req);
  await ensureChartAudited(scope, req);
  ok(res, await listAccountsTree(scope.subjectUserId));
}

export async function caListAccountsFlat(req: Request, res: Response) {
  const scope = await scopeOf(req);
  await ensureChartAudited(scope, req);
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
  await ensureBooksProjected(scope, req);
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
  await ensureBooksProjected(scope, req);
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
  await ensureBooksProjected(scope, req);
  ok(res, await getTrialBalance(scope.subjectUserId, req.query.asOf as string | undefined));
}

export async function caGetPnL(req: Request, res: Response) {
  const scope = await scopeOf(req);
  await ensureBooksProjected(scope, req);
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
  await ensureBooksProjected(scope, req);
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

// ─── Transactions: create + correct ───────────────────────────────────
//
// A CA may now do both. `transaction_ca_insert` (see the migration comment
// for why) sits alongside the pre-existing `transaction_ca_correct` — there
// is still no DELETE policy for a CA on this table, and none is added here:
// a CA can add a trade and fix a trade, never erase one.

/**
 * Reuses the SAME schema (`baseTransactionSchema`) the client's own
 * `/transactions` route validates with, minus `portfolioId`. The CA
 * workspace bootstraps exactly one relevant portfolio per client
 * (`ensureDefaultPortfolio`), so there is nothing for the CA to pick from —
 * a second, divergent schema is how the two paths would drift apart.
 */
const caCreateTransactionSchema = baseTransactionSchema.omit({ portfolioId: true });

/**
 * Record a transaction directly in the client's books.
 *
 * `createTransaction` is the exact service a client's own manual entry
 * calls — no accounting or FIFO logic is duplicated here. It is not
 * transactional with the audit entry below (the service does not accept an
 * external `tx`, and it already performs its own commit plus a fire-and-
 * forget price refresh), so this follows the same durable-write-then-audit
 * shape `ensureChartAudited` uses above: the transaction is real and
 * committed before the audit row is attempted, never the reverse.
 */
export async function caCreateTransaction(req: Request, res: Response) {
  const scope = await scopeOf(req);
  const body = caCreateTransactionSchema.parse(req.body);
  const portfolio = await ensureDefaultPortfolio(scope, req);

  const row = await createTransaction(scope.subjectUserId, {
    ...body,
    portfolioId: portfolio.id,
  });

  await runInTransaction((tx) =>
    recordCaAudit(tx, auditCtx(scope, req), {
      action: 'TRANSACTION_CREATED',
      resourceType: 'Transaction',
      resourceId: row.id,
      summary:
        `Recorded a ${row.transactionType} of ${row.assetName ?? 'an asset'} ` +
        `— ${row.quantity} @ ₹${row.price}, net ₹${row.netAmount} — dated ${row.tradeDate}.`,
      after: {
        assetName: row.assetName,
        transactionType: row.transactionType,
        quantity: row.quantity,
        price: row.price,
        netAmount: row.netAmount,
        tradeDate: row.tradeDate,
      },
    }),
  );

  created(res, row);
}

/**
 * Correct one of the client's transactions.
 *
 * The RLS grant carries a correction policy (FOR UPDATE) as well as the
 * insert one above, so this endpoint cannot make a trade disappear however
 * it is called — that boundary is Postgres's, not this handler's.
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
  const charges = chargeParts.reduce((sum: Decimal, c) => sum.plus(toDecimal(c)), toDecimal('0'));

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

// ─── Section 55(2)(ac) FMV overrides ─────────────────────────────────
//
// The 31-Jan-2018 fair market value used to grandfather long-term equity
// gains. It is a judgement a CA makes from historical quotes, which is exactly
// why they can set it here — and why every change is recorded with its prior
// value: a different FMV produces a different taxable gain on a return.

export async function caListFmv(req: Request, res: Response) {
  const scope = await scopeOf(req);
  const rows = await listUserFmvOverrides(scope.subjectUserId);
  ok(
    res,
    rows.map((r) => ({
      isin: r.isin,
      scripName: r.scripName,
      fmvPerUnit: serializeMoney(r.fmvPerUnit),
      source: r.source,
    })),
  );
}

export async function caSetFmv(req: Request, res: Response) {
  const scope = await scopeOf(req);
  const isin = (req.params.isin ?? '').trim().toUpperCase();
  if (!isin) throw new BadRequestError('isin required');
  const body = setFmvSchema.parse(req.body);

  // The prior value is read first: "the FMV changed" is not a useful record on
  // a figure that decides someone's tax. What it changed FROM is.
  const existing = await getFmvForIsin(scope.subjectUserId, isin);

  const saved = await runInTransaction(async (tx) => {
    const row = await upsertUserFmv(scope.subjectUserId, isin, body.fmvPerUnit, body.scripName, tx);
    await recordCaAudit(tx, auditCtx(scope, req), {
      action: 'FMV_OVERRIDE_SET',
      resourceType: 'FmvOverride',
      resourceId: isin,
      summary: `Set the 31-Jan-2018 fair market value for ${body.scripName ?? isin}.`,
      before: existing ? { fmvPerUnit: serializeMoney(existing.fmvPerUnit) } : undefined,
      after: { fmvPerUnit: body.fmvPerUnit },
    });
    return row;
  });

  ok(res, {
    isin: saved.isin,
    scripName: saved.scripName,
    fmvPerUnit: serializeMoney(saved.fmvPerUnit),
    source: saved.source,
  });
}

export async function caDeleteFmv(req: Request, res: Response) {
  const scope = await scopeOf(req);
  const isin = (req.params.isin ?? '').trim().toUpperCase();
  if (!isin) throw new BadRequestError('isin required');

  const existing = await getFmvForIsin(scope.subjectUserId, isin);
  if (!existing) throw new NotFoundError('No override set for that ISIN');

  await runInTransaction(async (tx) => {
    await deleteUserFmv(scope.subjectUserId, isin, tx);
    await recordCaAudit(tx, auditCtx(scope, req), {
      action: 'FMV_OVERRIDE_DELETED',
      resourceType: 'FmvOverride',
      resourceId: isin,
      summary: `Removed the fair market value override for ${existing.scripName ?? isin}.`,
      before: { fmvPerUnit: serializeMoney(existing.fmvPerUnit) },
    });
  });

  noContent(res);
}

// ─── The client's transactions, for adding and correcting ────────────

export async function caListTransactions(req: Request, res: Response) {
  const scope = await scopeOf(req);
  const rows = await prisma.transaction.findMany({
    where: { portfolio: { userId: scope.subjectUserId } },
    orderBy: { tradeDate: 'desc' },
    take: 200,
    select: {
      id: true,
      tradeDate: true,
      assetClass: true,
      transactionType: true,
      assetName: true,
      isin: true,
      quantity: true,
      price: true,
      netAmount: true,
      narration: true,
    },
  });
  ok(
    res,
    rows.map((t) => ({
      ...t,
      tradeDate: t.tradeDate.toISOString().slice(0, 10),
      quantity: t.quantity.toString(),
      price: t.price.toString(),
      netAmount: t.netAmount.toString(),
    })),
  );
}

// ─── Imports: statement / contract-note / CAS uploads, per client ────
//
// Wholesale reuse: the same magic-byte probe, regulatory-document guard,
// request schema, `createImportJob` and parser pipeline the client's own
// `POST /api/imports` route uses (imports.controller.ts). No new file types
// and no new parsing live here — only the grant resolution and the audit
// entry are specific to the CA path.
//
// The async parser worker (`jobs/importWorker.ts`) runs the commit phase
// under `runAsUser(job.userId)` — the CLIENT's own identity, not the CA's —
// so every transaction the parser produces lands through the ordinary owner
// RLS policy. That identity switch is not something this handler introduces;
// it is `createImportJob`'s own pre-existing context bridge (see the
// migration comment on `importjob_ca_insert`), used unchanged.

export async function caCreateImport(req: Request, res: Response) {
  const scope = await scopeOf(req);
  if (!req.file) throw new BadRequestError('No file uploaded — field name must be "file"');

  const regulatoryReason = isRegulatoryDoc(req.file.originalname);
  if (regulatoryReason) {
    fs.unlink(req.file.path, () => {});
    throw new BadRequestError(regulatoryReason);
  }

  const probe = await decryptIfNeeded(req.file.path, {
    fileName: req.file.originalname,
    allowedKinds: ['pdf', 'xlsx_ooxml', 'xlsx_encrypted', 'xls', 'csv'],
  });
  if (!probe.ok && !probe.requiresPassword && probe.reason === 'junk_type') {
    fs.unlink(req.file.path, () => {});
    throw new BadRequestError(probe.detail);
  }

  const body = importCreateBodySchema.parse(req.body ?? {});
  const type = body.type ?? inferTypeFromFileName(req.file.originalname);
  const portfolio = await ensureDefaultPortfolio(scope, req);

  const job = await createImportJob({
    userId: scope.subjectUserId,
    portfolioId: portfolio.id,
    type,
    fileName: req.file.originalname,
    filePath: req.file.path,
    broker: body.broker ?? null,
    pdfPassword: body.password ?? null,
  });

  // Not transactional with the job insert for the same reason
  // caCreateTransaction's audit is not: createImportJob has already
  // committed (and may have enqueued the parse job) by the time this runs.
  await runInTransaction((tx) =>
    recordCaAudit(tx, auditCtx(scope, req), {
      action: 'IMPORT_JOB_CREATED',
      resourceType: 'ImportJob',
      resourceId: job.id,
      summary: `Uploaded "${job.fileName}" for parsing (${job.type.replace(/_/g, ' ').toLowerCase()}).`,
      after: { fileName: job.fileName, jobId: job.id, type: job.type, status: job.status },
    }),
  );

  created(res, {
    id: job.id,
    status: job.status,
    type: job.type,
    fileName: job.fileName,
    createdAt: job.createdAt,
  });
}

/**
 * Reads under the CA's OWN ambient identity (no `runAsUser` bridge here),
 * which is exactly why `importjob_ca_read` had to be added — `listImportJobs`
 * filters by `userId: scope.subjectUserId` but the RLS session variable is
 * still the CA's id, and `importjob_owner` alone would match nothing.
 */
export async function caListImports(req: Request, res: Response) {
  const scope = await scopeOf(req);
  ok(res, await listImportJobs(scope.subjectUserId));
}
