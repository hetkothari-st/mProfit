import { Router } from 'express';
import {
  requestCdslOtp,
  submitCdslOtp,
  requestKfintechMailback,
  credits,
} from '../controllers/mfCasparser.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { asyncHandler } from '../middleware/validate.js';

export const mfCasparserRouter = Router();

mfCasparserRouter.use(authenticate);
mfCasparserRouter.post('/cdsl/request-otp', asyncHandler(requestCdslOtp));
mfCasparserRouter.post('/cdsl/submit-otp', asyncHandler(submitCdslOtp));
mfCasparserRouter.post('/kfintech/mailback', asyncHandler(requestKfintechMailback));
mfCasparserRouter.get('/credits', asyncHandler(credits));
