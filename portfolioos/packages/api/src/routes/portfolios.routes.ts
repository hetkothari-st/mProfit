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
  summary,
  update,
} from '../controllers/portfolio.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { asyncHandler } from '../middleware/validate.js';

export const portfoliosRouter = Router();

portfoliosRouter.use(authenticate);

portfoliosRouter.get('/', asyncHandler(list));
portfoliosRouter.post('/', asyncHandler(create));
portfoliosRouter.get('/:id', asyncHandler(detail));
portfoliosRouter.patch('/:id', asyncHandler(update));
portfoliosRouter.delete('/:id', asyncHandler(remove));

portfoliosRouter.get('/:id/summary', asyncHandler(summary));
portfoliosRouter.get('/:id/holdings', asyncHandler(holdings));
portfoliosRouter.get('/:id/asset-allocation', asyncHandler(allocation));
portfoliosRouter.get('/:id/historical-valuation', asyncHandler(historicalValuation));
portfoliosRouter.get('/:id/cash-flows', asyncHandler(cashFlows));
