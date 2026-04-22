import { Router } from 'express';
import type { Request, Response } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { asyncHandler } from '../middleware/validate.js';
import { ok } from '../lib/response.js';
import { UnauthorizedError } from '../lib/errors.js';
import { getDashboardNetWorth } from '../services/dashboard.service.js';

export const dashboardRouter = Router();
dashboardRouter.use(authenticate);

dashboardRouter.get(
  '/net-worth',
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) throw new UnauthorizedError();
    ok(res, await getDashboardNetWorth(req.user.id));
  }),
);
