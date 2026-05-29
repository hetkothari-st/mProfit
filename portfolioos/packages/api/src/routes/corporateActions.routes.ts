import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { asyncHandler } from '../middleware/validate.js';
import {
  listCorporateActions,
  syncCorporateActions,
  applyCorporateActions,
} from '../controllers/corporateActions.controller.js';

export const corporateActionsRouter = Router();

corporateActionsRouter.use(authenticate);

// Enriched corporate-actions report for the user's holdings.
corporateActionsRouter.get('/', asyncHandler(listCorporateActions));
// Fetch latest NSE corporate actions into the catalog.
corporateActionsRouter.post('/sync', asyncHandler(syncCorporateActions));
// Fold appliable actions (split/bonus/dividend) into the user's holdings.
corporateActionsRouter.post('/apply', asyncHandler(applyCorporateActions));
