import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { asyncHandler } from '../middleware/validate.js';
import {
  getFinfactorStatus,
  postMfAnalysis,
  postMfHoldingByIsin,
  postMfInsights,
  postMfInsightsNoPii,
  postMfLinkedAccounts,
  postMfLinkedAccountsHoldingFolio,
  postMfStatement,
} from '../controllers/finfactor.controller.js';

export const finfactorRouter = Router();
finfactorRouter.use(authenticate);

finfactorRouter.get('/status', asyncHandler(getFinfactorStatus));

// Mutual Fund insights group — mirrors /pfm/api/v2/mutual-fund/* upstream.
finfactorRouter.post('/mf/insights', asyncHandler(postMfInsights));
finfactorRouter.post('/mf/insights-no-pii', asyncHandler(postMfInsightsNoPii));
finfactorRouter.post('/mf/linked-accounts', asyncHandler(postMfLinkedAccounts));
finfactorRouter.post('/mf/linked-accounts/holding-folio', asyncHandler(postMfLinkedAccountsHoldingFolio));
finfactorRouter.post('/mf/statement', asyncHandler(postMfStatement));
finfactorRouter.post('/mf/analysis', asyncHandler(postMfAnalysis));
finfactorRouter.post('/mf/holdings/:isin', asyncHandler(postMfHoldingByIsin));
