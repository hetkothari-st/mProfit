import type { Request, Response } from 'express';
import { z } from 'zod';
import { ok, created, noContent } from '../lib/response.js';
import { UnauthorizedError } from '../lib/errors.js';
import {
  LOAN_GIVEN_ENTRY_KINDS,
  LOAN_GIVEN_MODES,
  RELATIONSHIPS,
  addLoanGivenEntry,
  createLoanGiven,
  deleteLoanGiven,
  deleteLoanGivenEntry,
  getLoanGiven,
  listLoansGiven,
  reopenLoanGiven,
  settleLoanGiven,
  setLoanGivenInstallment,
  INSTALLMENT_ACTIONS,
  updateLoanGiven,
  writeOffLoanGiven,
} from '../services/loansGiven.service.js';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD');
const moneyString = z.string().regex(/^\d+(\.\d+)?$/, 'Expected positive decimal string');

const loanSchema = z.object({
  borrowerName: z.string().trim().min(1).max(200),
  borrowerContact: z.string().trim().max(200).nullable().optional(),
  relationship: z.enum(RELATIONSHIPS).nullable().optional(),
  principalAmount: moneyString,
  lentOn: isoDate,
  interestRate: moneyString.optional(),
  dueDate: isoDate.nullable().optional(),
  repaymentMode: z.enum(LOAN_GIVEN_MODES).optional(),
  emiAmount: moneyString.nullable().optional(),
  tenureMonths: z.number().int().min(1).max(600).nullable().optional(),
  firstEmiDate: isoDate.nullable().optional(),
  notes: z.string().max(5000).nullable().optional(),
});

const entrySchema = z.object({
  kind: z.enum(LOAN_GIVEN_ENTRY_KINDS),
  amount: moneyString,
  date: isoDate,
  notes: z.string().max(1000).nullable().optional(),
});

const installmentSchema = z.object({
  action: z.enum(INSTALLMENT_ACTIONS),
  amount: moneyString.optional(),
  date: isoDate.optional(),
  notes: z.string().max(1000).nullable().optional(),
});

const closeSchema = z.object({
  date: isoDate,
  notes: z.string().max(1000).nullable().optional(),
});

function userId(req: Request): string {
  if (!req.user) throw new UnauthorizedError();
  return req.user.id;
}

export async function listHandler(req: Request, res: Response) {
  ok(res, await listLoansGiven(userId(req)));
}

export async function getHandler(req: Request, res: Response) {
  ok(res, await getLoanGiven(userId(req), req.params['id']!));
}

export async function createHandler(req: Request, res: Response) {
  created(res, await createLoanGiven(userId(req), loanSchema.parse(req.body)));
}

export async function updateHandler(req: Request, res: Response) {
  ok(res, await updateLoanGiven(userId(req), req.params['id']!, loanSchema.partial().parse(req.body)));
}

export async function deleteHandler(req: Request, res: Response) {
  await deleteLoanGiven(userId(req), req.params['id']!);
  noContent(res);
}

export async function addEntryHandler(req: Request, res: Response) {
  created(res, await addLoanGivenEntry(userId(req), req.params['id']!, entrySchema.parse(req.body)));
}

export async function deleteEntryHandler(req: Request, res: Response) {
  ok(res, await deleteLoanGivenEntry(userId(req), req.params['entryId']!));
}

export async function installmentHandler(req: Request, res: Response) {
  const no = z.coerce.number().int().min(1).max(600).parse(req.params['no']);
  ok(res, await setLoanGivenInstallment(userId(req), req.params['id']!, no, installmentSchema.parse(req.body)));
}

export async function settleHandler(req: Request, res: Response) {
  const { date } = closeSchema.parse(req.body);
  ok(res, await settleLoanGiven(userId(req), req.params['id']!, date));
}

export async function writeOffHandler(req: Request, res: Response) {
  const { date, notes } = closeSchema.parse(req.body);
  ok(res, await writeOffLoanGiven(userId(req), req.params['id']!, date, notes));
}

export async function reopenHandler(req: Request, res: Response) {
  ok(res, await reopenLoanGiven(userId(req), req.params['id']!));
}
