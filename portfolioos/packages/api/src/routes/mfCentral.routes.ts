import { Router } from 'express';
import {
  requestOtp,
  submitOtp,
  getJob,
  listJobs,
} from '../controllers/mfCentral.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { asyncHandler } from '../middleware/validate.js';

export const mfCentralRouter = Router();

mfCentralRouter.use(authenticate);
mfCentralRouter.post('/request-otp', asyncHandler(requestOtp));
mfCentralRouter.post('/submit-otp', asyncHandler(submitOtp));
mfCentralRouter.get('/jobs', asyncHandler(listJobs));
mfCentralRouter.get('/jobs/:id', asyncHandler(getJob));
