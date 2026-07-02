import type { Request, Response } from 'express';
import { z } from 'zod';
import {
  INCOME_TYPES, listIncomes, getIncome, createIncome, updateIncome, deleteIncome,
} from '../services/income.service.js';
import { ok } from '../lib/response.js';
import { UnauthorizedError } from '../lib/errors.js';

const moneyString = z.union([
  z.string().regex(/^\d+(\.\d+)?$/, 'Expected positive decimal string'),
  z.number().nonnegative(),
]);

const baseSchema = z.object({
  type: z.enum(INCOME_TYPES).optional(),
  sourceName: z.string().min(1).max(200),
  monthlyAmount: moneyString,
  payDay: z.number().int().min(1).max(31).optional(),
  isActive: z.boolean().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

const updateSchema = baseSchema.partial();

export async function list(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  const data = await listIncomes(req.user.id);
  return ok(res, data);
}

export async function read(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  const data = await getIncome(req.user.id, req.params['id']!);
  return ok(res, data);
}

export async function create(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  const body = baseSchema.parse(req.body);
  const data = await createIncome(req.user.id, body);
  return ok(res, data);
}

export async function update(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  const body = updateSchema.parse(req.body);
  const data = await updateIncome(req.user.id, req.params['id']!, body);
  return ok(res, data);
}

export async function remove(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  await deleteIncome(req.user.id, req.params['id']!);
  return ok(res, { success: true });
}
