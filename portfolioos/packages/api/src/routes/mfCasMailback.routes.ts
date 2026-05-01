import { Router } from 'express';
import {
  initiate,
  submit,
  getJob,
  listJobs,
} from '../controllers/mfCasMailback.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { asyncHandler } from '../middleware/validate.js';

export const mfCasMailbackRouter = Router();

mfCasMailbackRouter.use(authenticate);
mfCasMailbackRouter.post('/initiate', asyncHandler(initiate));
mfCasMailbackRouter.post('/submit', asyncHandler(submit));
mfCasMailbackRouter.get('/jobs', asyncHandler(listJobs));
mfCasMailbackRouter.get('/jobs/:id', asyncHandler(getJob));
