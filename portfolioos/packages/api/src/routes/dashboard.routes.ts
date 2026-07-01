import { Router } from 'express';
import type { Request, Response } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { asyncHandler } from '../middleware/validate.js';
import { ok } from '../lib/response.js';
import { UnauthorizedError } from '../lib/errors.js';
import { getDashboardNetWorthForScope } from '../services/dashboard.service.js';
import { parseFamilyId } from '../lib/familyHeader.js';

export const dashboardRouter = Router();
dashboardRouter.use(authenticate);

dashboardRouter.get(
  '/net-worth',
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) throw new UnauthorizedError();
    const portfolioId = req.query.portfolioId as string | undefined;
    ok(
      res,
      await getDashboardNetWorthForScope(req.user.id, {
        familyId: parseFamilyId(req),
        portfolioId,
      }),
    );
  }),
);
