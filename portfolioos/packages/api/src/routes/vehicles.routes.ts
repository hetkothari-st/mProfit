import { Router } from 'express';
import {
  list,
  get,
  create,
  update,
  remove,
  refresh,
  smsPaste,
  scanChallans,
} from '../controllers/vehicles.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { asyncHandler } from '../middleware/validate.js';

export const vehiclesRouter = Router();

vehiclesRouter.use(authenticate);

vehiclesRouter.get('/', asyncHandler(list));
vehiclesRouter.post('/', asyncHandler(create));
vehiclesRouter.post('/sms-paste', asyncHandler(smsPaste));
vehiclesRouter.get('/:id', asyncHandler(get));
vehiclesRouter.patch('/:id', asyncHandler(update));
vehiclesRouter.delete('/:id', asyncHandler(remove));
vehiclesRouter.post('/:id/refresh', asyncHandler(refresh));
vehiclesRouter.post('/:id/challans/scan', asyncHandler(scanChallans));
