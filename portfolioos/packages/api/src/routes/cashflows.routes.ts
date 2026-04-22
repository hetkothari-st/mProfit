import { Router } from 'express';
import { listCashFlows } from '../controllers/cashflows.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { asyncHandler } from '../middleware/validate.js';

export const cashFlowsRouter = Router();
cashFlowsRouter.use(authenticate);
cashFlowsRouter.get('/', asyncHandler(listCashFlows));
