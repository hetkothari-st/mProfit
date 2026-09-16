import { Router } from 'express';
import {
  forgotPassword,
  google,
  login,
  logout,
  me,
  patchMe,
  refresh,
  register,
  resendRegistrationHandler,
  resetPasswordHandler,
  verifyRegistrationHandler,
} from '../controllers/auth.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { asyncHandler } from '../middleware/validate.js';
import { authLimiter } from '../middleware/rateLimit.js';

export const authRouter = Router();

authRouter.post('/register', authLimiter, asyncHandler(register));
authRouter.post('/register/verify', authLimiter, asyncHandler(verifyRegistrationHandler));
authRouter.post('/register/resend', authLimiter, asyncHandler(resendRegistrationHandler));
authRouter.post('/login', authLimiter, asyncHandler(login));
authRouter.post('/google', authLimiter, asyncHandler(google));
authRouter.post('/refresh', authLimiter, asyncHandler(refresh));
authRouter.post('/logout', asyncHandler(logout));
authRouter.post('/forgot-password', authLimiter, asyncHandler(forgotPassword));
authRouter.post('/reset-password', authLimiter, asyncHandler(resetPasswordHandler));
authRouter.get('/me', authenticate, asyncHandler(me));
authRouter.patch('/me', authenticate, asyncHandler(patchMe));
