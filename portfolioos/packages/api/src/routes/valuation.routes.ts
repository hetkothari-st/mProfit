import { Router } from 'express';
import {
  listCategories,
  listMakes,
  listModels,
  listYears,
  listTrims,
  quote,
  autoValuate,
  save,
} from '../controllers/valuation.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { asyncHandler } from '../middleware/validate.js';

export const catalogRouter = Router();
catalogRouter.use(authenticate);
catalogRouter.get('/categories', asyncHandler(listCategories));
catalogRouter.get('/makes', asyncHandler(listMakes));
catalogRouter.get('/models', asyncHandler(listModels));
catalogRouter.get('/years', asyncHandler(listYears));
catalogRouter.get('/trims', asyncHandler(listTrims));

export const valuationRouter = Router();
valuationRouter.use(authenticate);
valuationRouter.post('/quote', asyncHandler(quote));
valuationRouter.get('/vehicles/:vehicleId/auto', asyncHandler(autoValuate));
valuationRouter.post('/vehicles/:vehicleId/save', asyncHandler(save));
