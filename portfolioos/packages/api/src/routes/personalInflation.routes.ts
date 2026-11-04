import { Router } from 'express';
import { authenticate, requireRole } from '../middleware/authenticate.js';
import { asyncHandler } from '../middleware/validate.js';
import { requireSecondFactor } from '../lib/professionalMfa.js';
import { cpiRunLimiter } from '../middleware/rateLimit.js';
import {
  adminRefreshHandler,
  createItemHandler,
  deleteItemHandler,
  profileHandler,
  summaryHandler,
  updateItemHandler,
} from '../controllers/personalInflation.controller.js';

/** /api/personal-inflation — every write answers with the fresh summary. */
export const personalInflationRouter = Router();
personalInflationRouter.use(authenticate);

personalInflationRouter.get('/', asyncHandler(summaryHandler));
personalInflationRouter.put('/profile', asyncHandler(profileHandler));
personalInflationRouter.post('/items', asyncHandler(createItemHandler));
personalInflationRouter.patch('/items/:id', asyncHandler(updateItemHandler));
personalInflationRouter.delete('/items/:id', asyncHandler(deleteItemHandler));

/** /api/admin/cpi — ADMIN + second factor, same gate as admin loan rates. */
export const adminCpiRouter = Router();
adminCpiRouter.use(authenticate, requireRole('ADMIN'), requireSecondFactor('admin tools'));
adminCpiRouter.post('/refresh', cpiRunLimiter, asyncHandler(adminRefreshHandler));
