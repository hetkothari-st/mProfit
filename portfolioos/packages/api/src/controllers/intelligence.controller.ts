import type { Request, Response } from 'express';
import { computeHealthScore } from '../services/healthScore.service.js';
import { ok } from '../lib/response.js';
import { UnauthorizedError } from '../lib/errors.js';

export async function getHealthScore(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  const force = req.query['force'] === 'true';
  const data = await computeHealthScore(req.user.id, { force });
  return ok(res, data);
}
