import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { asyncHandler } from '../middleware/validate.js';
import { listCasProviders, buildCasRequest } from '../controllers/cas.controller.js';

export const casRouter = Router();

casRouter.use(authenticate);
casRouter.get('/providers', asyncHandler(listCasProviders));
casRouter.post('/request', asyncHandler(buildCasRequest));
