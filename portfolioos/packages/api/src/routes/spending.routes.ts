import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { asyncHandler } from '../middleware/validate.js';
import { tagPayeeHandler, uncategorisedHandler } from '../controllers/spending.controller.js';

/** /api/spending: the spending store's payee categories (Personal Inflation pipeline). */
export const spendingRouter = Router();
spendingRouter.use(authenticate);

spendingRouter.get('/payees/uncategorised', asyncHandler(uncategorisedHandler));
spendingRouter.put('/payees/category', asyncHandler(tagPayeeHandler));
