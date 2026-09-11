import type { Request, Response } from 'express';
import { getCoverage } from '../services/insuranceCoverage.service.js';
import { ok } from '../lib/response.js';
import { UnauthorizedError } from '../lib/errors.js';

/** GET /api/insurance/coverage — figures, defaults and per-area facts for the coverage check. */
export async function getCoverageHandler(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  ok(res, await getCoverage(req.user.id));
}
