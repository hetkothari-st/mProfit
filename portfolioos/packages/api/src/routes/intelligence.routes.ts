import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { asyncHandler } from '../middleware/validate.js';
import { getHealthScore } from '../controllers/intelligence.controller.js';

export const intelligenceRouter = Router();
intelligenceRouter.use(authenticate);

intelligenceRouter.get('/health-score', asyncHandler(getHealthScore));
