import { logger } from '../lib/logger.js';
import type { Request, Response } from 'express';
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
  generateVouchersFromActivity,
} from '../services/accounting.service.js';
import { ok } from '../lib/response.js';
import { NotFoundError, UnauthorizedError } from '../lib/errors.js';
import { buildReceipt } from '../services/receipts/receiptData.js';
import { renderReceiptPdf, receiptFileName } from '../services/receipts/receiptPdf.js';
import {
  selectReceipts,
  zipReceipts,
  receiptsWorkbook,
  type ReceiptQuery,
} from '../services/receipts/receiptBundle.js';
import type { AccountType, VoucherType } from '@prisma/client';
import {
  createAccountSchema,
  createVoucherSchema,
  updateVoucherSchema,
} from '../schemas/accounting.schema.js';

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

/**
 * Bring the books up to date before a statement is read, as the downloads do,
 * so the screen and the file never disagree. A failed projection is logged and
 * the statement is served from the vouchers already booked.
 */
async function projectBeforeRead(userId: string): Promise<void> {
  try {
    await generateVouchersFromActivity(userId);
  } catch (err) {
    logger.error({ err, userId }, 'accounting.project_before_read_failed');
  }
}

export async function getLedgerHandler(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  await projectBeforeRead(req.user.id);
  const { from, to } = req.query as Record<string, string>;
  const ledger = await getAccountLedger(req.user.id, req.params['accountId']!, { from, to });
  ok(res, ledger);
}

// ─── Reports ──────────────────────────────────────────────────────────────────

export async function getTrialBalanceHandler(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  await projectBeforeRead(req.user.id);
  const { asOf } = req.query as Record<string, string>;
  const tb = await getTrialBalance(req.user.id, asOf);
  ok(res, tb);
}

export async function getPnLHandler(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  await projectBeforeRead(req.user.id);
  const { from, to } = req.query as Record<string, string>;
  const pnl = await getPnL(req.user.id, from, to);
  ok(res, pnl);
}

export async function getBalanceSheetHandler(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  await projectBeforeRead(req.user.id);
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

// ─── Bulk auto-generation ─────────────────────────────────────────────────────

export async function generateFromActivityHandler(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  const result = await generateVouchersFromActivity(req.user.id);
  ok(res, result);
}

// ─── Receipts ─────────────────────────────────────────────────────────────────
//
// A voucher is the double-entry record; a receipt is the document somebody
// actually wants — to hand a tenant, to attach to a return, to keep. These
// three endpoints are the same selection in three shapes: one PDF, a ZIP of
// PDFs, and a spreadsheet of the same rows.
//
// All of them read under the caller's own identity, so a CA reaching the same
// handlers through `caAccounting.controller` gets exactly what their grant
// permits and nothing more.

function receiptQueryFrom(req: Request): ReceiptQuery {
  const { from, to, type } = req.query as Record<string, string | undefined>;
  return {
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
    ...(type ? { type: type as VoucherType } : {}),
    ...(req.query.all === 'true' ? { paymentsOnly: false } : {}),
  };
}

/** Content-Disposition, with the filename quoted and stripped of quotes. */
function attach(res: Response, filename: string, contentType: string): void {
  res.setHeader('Content-Type', contentType);
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${filename.replace(/"/g, '')}"`,
  );
}

export async function getReceiptPdf(userId: string, voucherId: string, res: Response) {
  const receipt = await buildReceipt(userId, voucherId);
  const pdf = await renderReceiptPdf(receipt);
  attach(res, receiptFileName(receipt), 'application/pdf');
  res.end(pdf);
}

/**
 * `?inline=true` renders in the browser instead of downloading — the "view"
 * half of view-or-download, which is one header apart from the same document
 * rather than a second rendering path that could drift from it.
 */
export async function viewReceiptPdf(userId: string, voucherId: string, res: Response) {
  const receipt = await buildReceipt(userId, voucherId);
  const pdf = await renderReceiptPdf(receipt);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${receiptFileName(receipt)}"`);
  res.end(pdf);
}

export async function getReceiptsZip(userId: string, req: Request, res: Response) {
  const { receipts, truncated } = await selectReceipts(userId, receiptQueryFrom(req));
  if (receipts.length === 0) {
    throw new NotFoundError('No receipts in that range.');
  }
  const zip = await zipReceipts(receipts);
  // Said in a header rather than swallowed: a caller who asked for a decade
  // and got five hundred should be able to tell.
  if (truncated) res.setHeader('X-Receipts-Truncated', 'true');
  attach(res, `receipts-${receipts.length}.zip`, 'application/zip');
  res.end(zip);
}

export async function getReceiptsWorkbook(userId: string, req: Request, res: Response) {
  const { receipts, truncated } = await selectReceipts(userId, receiptQueryFrom(req));
  if (receipts.length === 0) {
    throw new NotFoundError('No receipts in that range.');
  }
  const xlsx = await receiptsWorkbook(receipts);
  if (truncated) res.setHeader('X-Receipts-Truncated', 'true');
  attach(
    res,
    `receipts-${receipts.length}.xlsx`,
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  );
  res.end(xlsx);
}

// The client's own books.

export async function receiptPdfHandler(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  if (req.query.inline === 'true') {
    await viewReceiptPdf(req.user.id, req.params['id']!, res);
    return;
  }
  await getReceiptPdf(req.user.id, req.params['id']!, res);
}

export async function receiptsZipHandler(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  await getReceiptsZip(req.user.id, req, res);
}

export async function receiptsWorkbookHandler(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  await getReceiptsWorkbook(req.user.id, req, res);
}
