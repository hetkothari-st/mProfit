import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { asyncHandler } from '../middleware/validate.js';
import {
  creditsHandler,
  decisionHandler,
  monthHandler,
  planHandler,
  saveHandler,
  summaryHandler,
} from '../controllers/safeToInvest.controller.js';

/** /api/safe-to-invest — open to every plan; every write answers with the fresh summary. */
export const safeToInvestRouter = Router();
safeToInvestRouter.use(authenticate);

safeToInvestRouter.get('/', asyncHandler(summaryHandler));
safeToInvestRouter.put('/plan', asyncHandler(planHandler));
safeToInvestRouter.post('/plan/save', asyncHandler(saveHandler));
safeToInvestRouter.put('/months/:month', asyncHandler(monthHandler));
safeToInvestRouter.get('/months/:month/credits', asyncHandler(creditsHandler));
safeToInvestRouter.put('/credits/:id', asyncHandler(decisionHandler));
