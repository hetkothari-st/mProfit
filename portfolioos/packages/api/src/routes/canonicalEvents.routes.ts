import { Router } from 'express';
import {
  list,
  get,
  patch,
  approve,
  reject,
  bulkApprove,
} from '../controllers/canonicalEvents.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { asyncHandler } from '../middleware/validate.js';

export const canonicalEventsRouter = Router();

canonicalEventsRouter.use(authenticate);

canonicalEventsRouter.get('/', asyncHandler(list));
canonicalEventsRouter.post('/bulk-approve', asyncHandler(bulkApprove));
canonicalEventsRouter.get('/:id', asyncHandler(get));
canonicalEventsRouter.patch('/:id', asyncHandler(patch));
canonicalEventsRouter.post('/:id/approve', asyncHandler(approve));
canonicalEventsRouter.post('/:id/reject', asyncHandler(reject));
