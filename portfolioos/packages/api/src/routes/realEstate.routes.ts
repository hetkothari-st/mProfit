import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { asyncHandler } from '../middleware/validate.js';
import {
  createPropertyHandler,
  deletePropertyHandler,
  getCapitalGainHandler,
  getPropertyHandler,
  getSummaryHandler,
  listPropertiesHandler,
  markSoldHandler,
  refreshValueHandler,
  updatePropertyHandler,
} from '../controllers/realEstate.controller.js';

export const realEstateRouter = Router();
realEstateRouter.use(authenticate);

// Aggregate summary
realEstateRouter.get('/summary', asyncHandler(getSummaryHandler));

// Properties
realEstateRouter.get('/properties', asyncHandler(listPropertiesHandler));
realEstateRouter.post('/properties', asyncHandler(createPropertyHandler));
realEstateRouter.get('/properties/:id', asyncHandler(getPropertyHandler));
realEstateRouter.patch('/properties/:id', asyncHandler(updatePropertyHandler));
realEstateRouter.delete('/properties/:id', asyncHandler(deletePropertyHandler));

// Lifecycle / read-side
realEstateRouter.post('/properties/:id/mark-sold', asyncHandler(markSoldHandler));
realEstateRouter.post('/properties/:id/refresh-value', asyncHandler(refreshValueHandler));
realEstateRouter.get('/properties/:id/capital-gain', asyncHandler(getCapitalGainHandler));
