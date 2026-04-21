import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { asyncHandler } from '../middleware/validate.js';
import { getBudget } from '../controllers/ingestion.controller.js';

export const ingestionRouter = Router();

ingestionRouter.use(authenticate);

/**
 * §6.11 budget gauge feed. The review UI reads this for the
 * sidebar spend bar; it is also the signal that tells the user
 * why new events are suddenly landing in ARCHIVED.
 */
ingestionRouter.get('/budget', asyncHandler(getBudget));
