import type { Request, Response } from 'express';
import { z } from 'zod';
import {
  listProperties,
  getProperty,
  createProperty,
  updateProperty,
  deleteProperty,
  createTenancy,
  updateTenancy,
  deleteTenancy,
  listReceipts,
  markReceiptReceived,
  skipReceipt,
  undoAutoMatch,
  listExpenses,
  addExpense,
  removeExpense,
  propertyPnL,
  markOverdueReceipts,
} from '../services/rental.service.js';
import { ok } from '../lib/response.js';
import { UnauthorizedError } from '../lib/errors.js';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD');
const moneyString = z.string().regex(/^-?\d+(\.\d+)?$/, 'Expected decimal string');

const propertyBody = {
  name: z.string().min(1).max(200),
  address: z.string().max(1000).nullable().optional(),
  propertyType: z.enum(['RESIDENTIAL', 'COMMERCIAL', 'LAND', 'PARKING']),
  portfolioId: z.string().nullable().optional(),
  purchaseDate: isoDate.nullable().optional(),
  purchasePrice: moneyString.nullable().optional(),
  currentValue: moneyString.nullable().optional(),
  isActive: z.boolean().optional(),
};

const createPropertySchema = z.object(propertyBody);
const updatePropertySchema = z.object({
  name: z.string().min(1).max(200).optional(),
  address: z.string().max(1000).nullable().optional(),
  propertyType: z.enum(['RESIDENTIAL', 'COMMERCIAL', 'LAND', 'PARKING']).optional(),
  portfolioId: z.string().nullable().optional(),
  purchaseDate: isoDate.nullable().optional(),
  purchasePrice: moneyString.nullable().optional(),
  currentValue: moneyString.nullable().optional(),
  isActive: z.boolean().optional(),
});

const createTenancySchema = z.object({
  tenantName: z.string().min(1).max(200),
  tenantContact: z.string().max(200).nullable().optional(),
  startDate: isoDate,
  endDate: isoDate.nullable().optional(),
  monthlyRent: moneyString,
  securityDeposit: moneyString.nullable().optional(),
  rentDueDay: z.number().int().min(1).max(31).optional(),
  notes: z.string().max(2000).nullable().optional(),
});

const updateTenancySchema = z.object({
  tenantName: z.string().min(1).max(200).optional(),
  tenantContact: z.string().max(200).nullable().optional(),
  endDate: isoDate.nullable().optional(),
  monthlyRent: moneyString.optional(),
  securityDeposit: moneyString.nullable().optional(),
  rentDueDay: z.number().int().min(1).max(31).optional(),
  notes: z.string().max(2000).nullable().optional(),
  isActive: z.boolean().optional(),
});

const markReceivedSchema = z.object({
  receivedAmount: moneyString,
  receivedOn: isoDate,
  notes: z.string().max(2000).nullable().optional(),
});

const skipReceiptSchema = z.object({
  reason: z.string().max(2000).nullable().optional(),
});

const addExpenseSchema = z.object({
  expenseType: z.enum([
    'PROPERTY_TAX',
    'MAINTENANCE',
    'REPAIRS',
    'UTILITIES',
    'AGENT_FEE',
    'LEGAL',
    'OTHER',
  ]),
  amount: moneyString,
  paidOn: isoDate,
  description: z.string().max(2000).nullable().optional(),
  receiptUrl: z.string().max(2000).nullable().optional(),
});

const listReceiptsSchema = z.object({
  tenancyId: z.string().optional(),
  propertyId: z.string().optional(),
  status: z.enum(['EXPECTED', 'RECEIVED', 'PARTIAL', 'OVERDUE', 'SKIPPED']).optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  limit: z.coerce.number().int().min(1).max(1000).optional(),
});

const pnlSchema = z.object({
  from: isoDate,
  to: isoDate,
});

// ── Property handlers ────────────────────────────────────────────────

export async function listPropertiesHandler(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  const rows = await listProperties(req.user.id);
  ok(res, rows);
}

export async function getPropertyHandler(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  const row = await getProperty(req.user.id, req.params.id!);
  ok(res, row);
}

export async function createPropertyHandler(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  const body = createPropertySchema.parse(req.body ?? {});
  const row = await createProperty(req.user.id, body);
  ok(res, row);
}

export async function updatePropertyHandler(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  const body = updatePropertySchema.parse(req.body ?? {});
  const row = await updateProperty(req.user.id, req.params.id!, body);
  ok(res, row);
}

export async function deletePropertyHandler(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  await deleteProperty(req.user.id, req.params.id!);
  ok(res, { deleted: true });
}

// ── Tenancy handlers ─────────────────────────────────────────────────

export async function createTenancyHandler(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  const body = createTenancySchema.parse(req.body ?? {});
  const row = await createTenancy(req.user.id, {
    propertyId: req.params.id!,
    ...body,
  });
  ok(res, row);
}

export async function updateTenancyHandler(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  const body = updateTenancySchema.parse(req.body ?? {});
  const row = await updateTenancy(req.user.id, req.params.tenancyId!, body);
  ok(res, row);
}

export async function deleteTenancyHandler(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  await deleteTenancy(req.user.id, req.params.tenancyId!);
  ok(res, { deleted: true });
}

// ── Receipt handlers ─────────────────────────────────────────────────

export async function listReceiptsHandler(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  const q = listReceiptsSchema.parse(req.query ?? {});
  const rows = await listReceipts(req.user.id, q);
  ok(res, rows);
}

export async function markReceiptReceivedHandler(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  const body = markReceivedSchema.parse(req.body ?? {});
  const row = await markReceiptReceived(req.user.id, req.params.receiptId!, body);
  ok(res, row);
}

export async function skipReceiptHandler(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  const body = skipReceiptSchema.parse(req.body ?? {});
  const row = await skipReceipt(req.user.id, req.params.receiptId!, body.reason ?? null);
  ok(res, row);
}

export async function undoAutoMatchHandler(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  const row = await undoAutoMatch(req.user.id, req.params.receiptId!);
  ok(res, row);
}

// ── Expense handlers ─────────────────────────────────────────────────

export async function listExpensesHandler(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  const propertyId =
    typeof req.query.propertyId === 'string' ? req.query.propertyId : undefined;
  const rows = await listExpenses(req.user.id, propertyId);
  ok(res, rows);
}

export async function addExpenseHandler(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  const body = addExpenseSchema.parse(req.body ?? {});
  const row = await addExpense(req.user.id, req.params.id!, body);
  ok(res, row);
}

export async function removeExpenseHandler(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  await removeExpense(req.user.id, req.params.expenseId!);
  ok(res, { deleted: true });
}

// ── Reporting / cron ─────────────────────────────────────────────────

export async function propertyPnLHandler(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  const q = pnlSchema.parse(req.query ?? {});
  const row = await propertyPnL(req.user.id, req.params.id!, q.from, q.to);
  ok(res, row);
}

export async function markOverdueHandler(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  const count = await markOverdueReceipts(req.user.id);
  ok(res, { flipped: count });
}
