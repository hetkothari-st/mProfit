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
  revealPan,
  deletionCode,
  deletionStatus,
  requestDeletion,
  verifyTwoFactorHandler,
  twoFactorStatusHandler,
  twoFactorSetupHandler,
  twoFactorEnableHandler,
  twoFactorDisableHandler,
  twoFactorBackupCodesHandler,
} from '../controllers/auth.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { asyncHandler } from '../middleware/validate.js';
import { authLimiter, piiLimiter } from '../middleware/rateLimit.js';

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
// Second step of a two-factor sign-in (no session yet: the challenge token
// from /login or /google is the credential).
authRouter.post('/2fa/verify', authLimiter, asyncHandler(verifyTwoFactorHandler));
authRouter.get('/me/2fa', authenticate, asyncHandler(twoFactorStatusHandler));
authRouter.post('/me/2fa/setup', authenticate, authLimiter, asyncHandler(twoFactorSetupHandler));
authRouter.post('/me/2fa/enable', authenticate, authLimiter, asyncHandler(twoFactorEnableHandler));
authRouter.post('/me/2fa/disable', authenticate, authLimiter, asyncHandler(twoFactorDisableHandler));
authRouter.post('/me/2fa/backup-codes', authenticate, authLimiter, asyncHandler(twoFactorBackupCodesHandler));
// Authenticated + rate-limited + audited: this returns a government ID.
authRouter.post('/pan/reveal', authenticate, piiLimiter, asyncHandler(revealPan));
authRouter.get('/me', authenticate, asyncHandler(me));
authRouter.patch('/me', authenticate, asyncHandler(patchMe));
authRouter.get('/me/deletion', authenticate, asyncHandler(deletionStatus));
authRouter.post('/me/deletion/code', authenticate, authLimiter, asyncHandler(deletionCode));
authRouter.post('/me/deletion', authenticate, authLimiter, asyncHandler(requestDeletion));
