import { Router } from 'express';
import { list, get, resolve } from '../controllers/ingestionFailures.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { asyncHandler } from '../middleware/validate.js';

export const ingestionFailuresRouter = Router();

ingestionFailuresRouter.use(authenticate);

ingestionFailuresRouter.get('/', asyncHandler(list));
ingestionFailuresRouter.get('/:id', asyncHandler(get));
ingestionFailuresRouter.post('/:id/resolve', asyncHandler(resolve));
