import type { Request, Response } from 'express';
import { z } from 'zod';
import {
  GOAL_CATEGORIES,
  GOAL_PRIORITIES,
  GOAL_STATUSES,
  listGoals,
  getGoal,
  createGoal,
  updateGoal,
  deleteGoal,
} from '../services/goals.service.js';
import { ok } from '../lib/response.js';
import { UnauthorizedError } from '../lib/errors.js';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD');
const moneyString = z.union([
  z.string().regex(/^\d+(\.\d+)?$/, 'Expected positive decimal string'),
  z.number().nonnegative(),
]);

const baseSchema = z.object({
  name: z.string().min(1).max(200),
  category: z.enum(GOAL_CATEGORIES).optional(),
  priority: z.enum(GOAL_PRIORITIES).optional(),
  status: z.enum(GOAL_STATUSES).optional(),
  targetAmount: moneyString,
  initialAmount: moneyString.optional(),
  inflationRate: z.union([z.string(), z.number()]).nullable().optional(),
  expectedReturn: z.union([z.string(), z.number()]).nullable().optional(),
  targetDate: isoDate,
  startDate: isoDate.optional(),
  portfolioIds: z.array(z.string()).optional(),
  notes: z.string().max(4000).nullable().optional(),
});

const updateSchema = baseSchema.partial();

export async function list(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  const data = await listGoals(req.user.id);
  return ok(res, data);
}

export async function read(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  const data = await getGoal(req.user.id, req.params['id']!);
  return ok(res, data);
}

export async function create(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  const body = baseSchema.parse(req.body);
  const data = await createGoal(req.user.id, body);
  return ok(res, data);
}

export async function update(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  const body = updateSchema.parse(req.body);
  const data = await updateGoal(req.user.id, req.params['id']!, body);
  return ok(res, data);
}

export async function remove(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  await deleteGoal(req.user.id, req.params['id']!);
  return ok(res, { success: true });
}
