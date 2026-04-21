import type { Request, Response } from 'express';
import { z } from 'zod';
import {
  listMonitoredSenders,
  getMonitoredSender,
  createMonitoredSender,
  updateMonitoredSender,
  deleteMonitoredSender,
} from '../services/monitoredSenders.service.js';
import { ok } from '../lib/response.js';
import { UnauthorizedError } from '../lib/errors.js';

const createBodySchema = z.object({
  address: z.string().min(1),
  displayLabel: z.string().max(120).nullable().optional(),
  autoCommitAfter: z.number().int().min(1).max(100).optional(),
});

const updateBodySchema = z.object({
  displayLabel: z.string().max(120).nullable().optional(),
  autoCommitAfter: z.number().int().min(1).max(100).optional(),
  isActive: z.boolean().optional(),
  autoCommitEnabled: z.boolean().optional(),
});

export async function list(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  const rows = await listMonitoredSenders(req.user.id);
  ok(res, rows);
}

export async function get(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  const row = await getMonitoredSender(req.user.id, req.params.id!);
  ok(res, row);
}

export async function create(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  const body = createBodySchema.parse(req.body ?? {});
  const row = await createMonitoredSender(req.user.id, body);
  ok(res, row);
}

export async function update(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  const body = updateBodySchema.parse(req.body ?? {});
  const row = await updateMonitoredSender(req.user.id, req.params.id!, body);
  ok(res, row);
}

export async function remove(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  await deleteMonitoredSender(req.user.id, req.params.id!);
  ok(res, { deleted: true });
}
