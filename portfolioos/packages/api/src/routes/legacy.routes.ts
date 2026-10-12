import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { requireFeature } from '../middleware/requirePlan.js';
import { asyncHandler, validate } from '../middleware/validate.js';
import { legacyPublicLimiter, legacyTokenLimiter, piiLimiter } from '../middleware/rateLimit.js';
import { legacySession } from '../middleware/legacySession.js';
import {
  legacyNomineeSchema, legacyOtpVerifySchema, legacyPauseSchema, legacyRevokeSchema, legacySettingsSchema,
  legacyStepUpVerifySchema, legacyVerifyAnswerSchema,
} from '../schemas/legacy.schemas.js';
import * as c from '../controllers/legacy.controller.js';

/**
 * Owner routes. Configuring (settings, adding/editing nominees, turning on)
 * needs LEGACY_TRANSFER; pausing, revoking, removing and turning off do not,
 * so a lapsed owner keeps control of a plan that still runs. The grant check
 * comes before body validation so a caller without one learns nothing.
 */
export const legacyRouter = Router();
legacyRouter.use(authenticate);
const gated = requireFeature('LEGACY_TRANSFER');
const grant = c.requireLegacyGrant;
legacyRouter.get('/', asyncHandler(c.overviewHandler));
legacyRouter.post('/step-up', piiLimiter, asyncHandler(c.stepUpHandler));
legacyRouter.post('/step-up/verify', piiLimiter, validate(legacyStepUpVerifySchema), asyncHandler(c.stepUpVerifyHandler));
legacyRouter.put('/settings', gated, grant, validate(legacySettingsSchema), asyncHandler(c.saveSettingsHandler));
legacyRouter.post('/nominees', gated, grant, validate(legacyNomineeSchema), asyncHandler(c.addNomineeHandler));
legacyRouter.put('/nominees/:id', gated, grant, validate(legacyNomineeSchema), asyncHandler(c.updateNomineeHandler));
legacyRouter.delete('/nominees/:id', grant, asyncHandler(c.removeNomineeHandler));
legacyRouter.post('/activate', gated, grant, asyncHandler(c.activateHandler));
legacyRouter.post('/pause', grant, validate(legacyPauseSchema), asyncHandler(c.pauseHandler));
legacyRouter.post('/resume', grant, asyncHandler(c.resumeHandler));
legacyRouter.post('/deactivate', grant, asyncHandler(c.deactivateHandler));
legacyRouter.post('/revoke', grant, validate(legacyRevokeSchema), asyncHandler(c.revokeHandler));

/** Emailed-link actions, no login. POST-only for anything that changes state. */
export const legacyPublicRouter = Router();
legacyPublicRouter.use(legacyPublicLimiter);
legacyPublicRouter.post('/ok/:token', asyncHandler(c.imOkHandler));
legacyPublicRouter.post('/ack/:token', asyncHandler(c.ackHandler));
legacyPublicRouter.get('/verify/:token', asyncHandler(c.peekVerifyHandler));
legacyPublicRouter.post('/verify/:token', validate(legacyVerifyAnswerSchema), asyncHandler(c.answerVerifyHandler));
legacyPublicRouter.post('/access/:token/otp', legacyTokenLimiter, asyncHandler(c.accessOtpHandler));
legacyPublicRouter.post('/access/:token/session', legacyTokenLimiter, validate(legacyOtpVerifySchema), asyncHandler(c.accessSessionHandler));
legacyPublicRouter.post('/access/:token/reissue', legacyTokenLimiter, asyncHandler(c.reissueHandler));

/** Nominee read-only view, behind X-Legacy-Session only. */
export const legacyViewRouter = Router();
legacyViewRouter.use(legacySession);
legacyViewRouter.get('/', asyncHandler(c.viewHandler));
legacyViewRouter.get('/pdf', asyncHandler(c.viewPdfHandler));
legacyViewRouter.get('/documents/:id', asyncHandler(c.viewDocumentHandler));
