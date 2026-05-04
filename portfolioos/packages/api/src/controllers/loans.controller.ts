import type { Request, Response } from 'express';
import { z } from 'zod';
import {
  LOAN_TYPES,
  PAYMENT_TYPES,
  PREPAYMENT_OPTIONS,
  LOAN_STATUSES,
  listLoans,
  getLoan,
  createLoan,
  updateLoan,
  deleteLoan,
  addPayment,
  deletePayment,
  getLoanSummary,
  getAmortization,
  computeEmi,
} from '../services/loans.service.js';
import { ok } from '../lib/response.js';
import { UnauthorizedError } from '../lib/errors.js';
import { Decimal } from 'decimal.js';
import { serializeMoney } from '@portfolioos/shared';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD');
const moneyString = z.string().regex(/^\d+(\.\d+)?$/, 'Expected positive decimal string');

// ── Zod schemas ──────────────────────────────────────────────────────────────

const createLoanSchema = z.object({
  lenderName: z.string().min(1).max(200),
  accountNumber: z.string().max(100).nullable().optional(),
  loanType: z.enum(LOAN_TYPES),
  borrowerName: z.string().min(1).max(200),
  principalAmount: moneyString,
  interestRate: moneyString,
  tenureMonths: z.number().int().min(1).max(600),
  emiAmount: moneyString,
  emiDueDay: z.number().int().min(1).max(31).optional(),
  disbursementDate: isoDate,
  firstEmiDate: isoDate,
  prepaymentOption: z.enum(PREPAYMENT_OPTIONS).optional(),
  vehicleId: z.string().nullable().optional(),
  rentalPropertyId: z.string().nullable().optional(),
  portfolioId: z.string().nullable().optional(),
  taxBenefitSection: z.string().nullable().optional(),
  status: z.enum(LOAN_STATUSES).optional(),
  closedDate: isoDate.nullable().optional(),
  lenderMatchKey: z.string().nullable().optional(),
});

const updateLoanSchema = createLoanSchema.partial();

const addPaymentSchema = z.object({
  paymentType: z.enum(PAYMENT_TYPES),
  paidOn: isoDate,
  amount: moneyString,
  principalPart: moneyString.nullable().optional(),
  interestPart: moneyString.nullable().optional(),
  forMonth: z.string().regex(/^\d{4}-\d{2}$/, 'Expected YYYY-MM').nullable().optional(),
  canonicalEventId: z.string().nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
});

const computeEmiQuerySchema = z.object({
  principal: z.string().regex(/^\d+(\.\d+)?$/, 'Expected positive decimal'),
  rate: z.string().regex(/^\d+(\.\d+)?$/, 'Expected positive decimal'),
  months: z.string().regex(/^\d+$/, 'Expected integer'),
});

// ── Handlers ─────────────────────────────────────────────────────────────────

export async function listLoansHandler(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  const loans = await listLoans(req.user.id);
  ok(res, loans);
}

export async function getLoanHandler(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  const loan = await getLoan(req.user.id, req.params['id']!);
  ok(res, loan);
}

export async function createLoanHandler(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  const body = createLoanSchema.parse(req.body);
  const loan = await createLoan(req.user.id, body);
  res.status(201);
  ok(res, loan);
}

export async function updateLoanHandler(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  const body = updateLoanSchema.parse(req.body);
  const loan = await updateLoan(req.user.id, req.params['id']!, body);
  ok(res, loan);
}

export async function deleteLoanHandler(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  await deleteLoan(req.user.id, req.params['id']!);
  ok(res, null);
}

export async function getLoanSummaryHandler(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  const summary = await getLoanSummary(req.user.id, req.params['id']!);
  ok(res, summary);
}

export async function getAmortizationHandler(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  const rows = await getAmortization(req.user.id, req.params['id']!);
  // Cap at 600 rows (enforced in service already, but be explicit)
  ok(res, rows.slice(0, 600));
}

export async function addPaymentHandler(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  const body = addPaymentSchema.parse(req.body);
  const payment = await addPayment(req.user.id, req.params['id']!, body);
  res.status(201);
  ok(res, payment);
}

export async function deletePaymentHandler(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  await deletePayment(req.user.id, req.params['paymentId']!);
  ok(res, null);
}

/**
 * Utility endpoint: compute EMI given principal, rate, tenure.
 * GET /api/loans/compute-emi?principal=1000000&rate=8.5&months=240
 */
export async function computeEmiHandler(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  const q = computeEmiQuerySchema.parse(req.query);
  const emi = computeEmi(
    new Decimal(q.principal),
    new Decimal(q.rate),
    parseInt(q.months, 10),
  );
  ok(res, { emi: serializeMoney(emi) });
}
