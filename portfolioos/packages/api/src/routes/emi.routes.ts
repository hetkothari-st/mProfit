import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { asyncHandler } from '../middleware/validate.js';
import { emiExportLimiter } from '../middleware/rateLimit.js';
import { exportHandler } from '../controllers/emi.controller.js';

export const emiRouter = Router();
emiRouter.use(authenticate);
emiRouter.post('/export', emiExportLimiter, asyncHandler(exportHandler));
