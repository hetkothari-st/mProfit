import type { Request, Response } from 'express';
import { z } from 'zod';
import {
  listIngestionFailures,
  getIngestionFailure,
  resolveIngestionFailure,
} from '../services/ingestionFailures.service.js';
import { ok } from '../lib/response.js';
import { UnauthorizedError } from '../lib/errors.js';

const listQuerySchema = z.object({
  resolved: z.enum(['true', 'false']).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});

const resolveBodySchema = z.object({
  action: z.enum(['manual_entry', 'retry_succeeded', 'ignored', 'data_corrected']),
});

export async function list(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  const q = listQuerySchema.parse(req.query);
  const rows = await listIngestionFailures(req.user.id, {
    resolved: q.resolved === undefined ? undefined : q.resolved === 'true',
    limit: q.limit,
  });
  ok(res, rows);
}

export async function get(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  const row = await getIngestionFailure(req.user.id, req.params.id!);
  ok(res, row);
}

export async function resolve(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  const body = resolveBodySchema.parse(req.body ?? {});
  const row = await resolveIngestionFailure(req.user.id, req.params.id!, body.action);
  ok(res, row);
}
