import { Router } from 'express';
import {
  requestCdslOtp,
  submitCdslOtp,
  requestKfintechMailback,
  credits,
} from '../controllers/mfCasparser.controller.js';
import { authenticate, requireRole } from '../middleware/authenticate.js';
import { asyncHandler } from '../middleware/validate.js';
import { costlyOperationLimiter } from '../middleware/rateLimit.js';

export const mfCasparserRouter = Router();

mfCasparserRouter.use(authenticate);
mfCasparserRouter.post('/cdsl/request-otp', costlyOperationLimiter, asyncHandler(requestCdslOtp));
mfCasparserRouter.post('/cdsl/submit-otp', asyncHandler(submitCdslOtp));
mfCasparserRouter.post('/kfintech/mailback', costlyOperationLimiter, asyncHandler(requestKfintechMailback));
// The balance is the operator's casparser.in account, shared by every user —
// business information, not the user's. Admins only.
mfCasparserRouter.get('/credits', requireRole('ADMIN'), asyncHandler(credits));
