import type { Request, Response } from 'express';
import { ok } from '../lib/response.js';
import { UnauthorizedError } from '../lib/errors.js';
import { getHiddenCosts } from '../services/hiddenCosts/hiddenCosts.service.js';

/** GET /api/hidden-costs — the yearly hidden costs by source and their 20-year cost. */
export async function hiddenCostsHandler(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  return ok(res, await getHiddenCosts(req.user.id));
}
