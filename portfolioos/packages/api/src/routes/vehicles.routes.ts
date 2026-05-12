import { Router } from 'express';
import {
  list,
  get,
  create,
  update,
  remove,
  refresh,
  refreshPhoto,
  smsPaste,
  scanChallans,
  carInfoInit,
  carInfoVerify,
  fuelStates,
  fuelPrices,
} from '../controllers/vehicles.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { asyncHandler } from '../middleware/validate.js';

export const vehiclesRouter = Router();

vehiclesRouter.use(authenticate);

vehiclesRouter.get('/', asyncHandler(list));
vehiclesRouter.post('/', asyncHandler(create));
vehiclesRouter.post('/sms-paste', asyncHandler(smsPaste));
// Fuel/electricity routes must be declared before `/:id` so the literal
// segments win over the dynamic id matcher.
vehiclesRouter.get('/prices/states', asyncHandler(fuelStates));
vehiclesRouter.get('/prices', asyncHandler(fuelPrices));
vehiclesRouter.get('/:id', asyncHandler(get));
vehiclesRouter.patch('/:id', asyncHandler(update));
vehiclesRouter.delete('/:id', asyncHandler(remove));
vehiclesRouter.post('/:id/refresh', asyncHandler(refresh));
vehiclesRouter.post('/:id/refresh-photo', asyncHandler(refreshPhoto));
vehiclesRouter.post('/:id/challans/scan', asyncHandler(scanChallans));
vehiclesRouter.post('/carinfo/init', asyncHandler(carInfoInit));
vehiclesRouter.post('/carinfo/verify', asyncHandler(carInfoVerify));
