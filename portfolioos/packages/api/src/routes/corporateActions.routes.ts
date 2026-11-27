import { Router } from 'express';
import { authenticate, requireRole } from '../middleware/authenticate.js';
import { requireSecondFactor } from '../lib/professionalMfa.js';
import { asyncHandler } from '../middleware/validate.js';
import {
  listCorporateActions,
  syncCorporateActions,
  applyCorporateActions,
  addManualCorporateActionHandler,
  listManualCorporateActionsHandler,
} from '../controllers/corporateActions.controller.js';

export const corporateActionsRouter = Router();

corporateActionsRouter.use(authenticate);

// Enriched corporate-actions report for the user's holdings.
corporateActionsRouter.get('/', asyncHandler(listCorporateActions));
// Fetch latest NSE corporate actions into the catalog.
corporateActionsRouter.post('/sync', asyncHandler(syncCorporateActions));
// Fold appliable actions (split/bonus/dividend) into the user's holdings.
corporateActionsRouter.post('/apply', asyncHandler(applyCorporateActions));

// Admin: enter a split or bonus by hand when the feeds miss it.
const adminOnly = [requireRole('ADMIN'), requireSecondFactor('admin tools')];
corporateActionsRouter.get('/manual', ...adminOnly, asyncHandler(listManualCorporateActionsHandler));
corporateActionsRouter.post('/manual', ...adminOnly, asyncHandler(addManualCorporateActionHandler));
