import { Router } from 'express';
import {
  list,
  listFeedFailures,
  get,
  resolve,
  retry,
} from '../controllers/ingestionFailures.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { asyncHandler } from '../middleware/validate.js';

export const ingestionFailuresRouter = Router();

ingestionFailuresRouter.use(authenticate);

ingestionFailuresRouter.get('/', asyncHandler(list));
// Before '/:id', or "feeds" is read as a failure id.
ingestionFailuresRouter.get('/feeds', asyncHandler(listFeedFailures));
ingestionFailuresRouter.get('/:id', asyncHandler(get));
ingestionFailuresRouter.post('/:id/retry', asyncHandler(retry));
ingestionFailuresRouter.post('/:id/resolve', asyncHandler(resolve));
