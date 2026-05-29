import { Router } from 'express';
import { listCashFlows, getForecast } from '../controllers/cashflows.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { asyncHandler } from '../middleware/validate.js';

export const cashFlowsRouter = Router();
cashFlowsRouter.use(authenticate);
cashFlowsRouter.get('/forecast', asyncHandler(getForecast));
cashFlowsRouter.get('/', asyncHandler(listCashFlows));
