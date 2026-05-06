import type { Request, Response } from 'express';
import { z } from 'zod';
import {
  listIngestionFailures,
  getIngestionFailure,
  resolveIngestionFailure,
  retryIngestionFailure,
} from '../services/ingestionFailures.service.js';
import { ok } from '../lib/response.js';
import { UnauthorizedError, BadRequestError } from '../lib/errors.js';

const listQuerySchema = z.object({
  resolved: z.enum(['true', 'false']).optional(),
  adapter: z.string().optional(),
  since: z.string().optional(), // YYYY-MM-DD
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

const resolveBodySchema = z.object({
  action: z.enum(['manual_entry', 'retry_succeeded', 'ignored', 'fixed_externally', 'data_corrected']),
});

export async function list(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  const q = listQuerySchema.parse(req.query);
  const result = await listIngestionFailures(req.user.id, {
    resolved: q.resolved === undefined ? undefined : q.resolved === 'true',
    adapter: q.adapter,
    since: q.since ? new Date(q.since) : undefined,
    cursor: q.cursor,
    limit: q.limit,
  });
  ok(res, result);
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

export async function retry(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  try {
    const result = await retryIngestionFailure(req.user.id, req.params.id!);
    ok(res, result);
  } catch (err) {
    if (err instanceof BadRequestError) {
      ok(res, { eventsInserted: 0, error: err.message });
      return;
    }
    throw err;
  }
}
