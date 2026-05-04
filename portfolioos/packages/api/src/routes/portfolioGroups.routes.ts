import { Router } from 'express';
import {
  allocation,
  cashFlows,
  create,
  detail,
  historicalValuation,
  holdings,
  list,
  remove,
  setMembers,
  summary,
  update,
} from '../controllers/portfolioGroup.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { asyncHandler } from '../middleware/validate.js';

export const portfolioGroupsRouter = Router();

portfolioGroupsRouter.use(authenticate);

portfolioGroupsRouter.get('/', asyncHandler(list));
portfolioGroupsRouter.post('/', asyncHandler(create));
portfolioGroupsRouter.get('/:id', asyncHandler(detail));
portfolioGroupsRouter.patch('/:id', asyncHandler(update));
portfolioGroupsRouter.delete('/:id', asyncHandler(remove));
portfolioGroupsRouter.put('/:id/members', asyncHandler(setMembers));

portfolioGroupsRouter.get('/:id/summary', asyncHandler(summary));
portfolioGroupsRouter.get('/:id/holdings', asyncHandler(holdings));
portfolioGroupsRouter.get('/:id/asset-allocation', asyncHandler(allocation));
portfolioGroupsRouter.get('/:id/historical-valuation', asyncHandler(historicalValuation));
portfolioGroupsRouter.get('/:id/cash-flows', asyncHandler(cashFlows));
