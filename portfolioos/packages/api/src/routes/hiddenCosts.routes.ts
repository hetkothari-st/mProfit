import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { asyncHandler } from '../middleware/validate.js';
import { hiddenCostsHandler } from '../controllers/hiddenCosts.controller.js';

/** /api/hidden-costs — Hidden Cost X-ray. Open to every plan. */
export const hiddenCostsRouter = Router();
hiddenCostsRouter.use(authenticate);
hiddenCostsRouter.get('/', asyncHandler(hiddenCostsHandler));
