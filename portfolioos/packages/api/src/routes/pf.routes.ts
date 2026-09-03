/**
 * Every handler here is wrapped in asyncHandler, and must stay wrapped.
 *
 * These routes were registered bare. Express 4 does not catch a rejected
 * promise from an async handler, so any rejection became an unhandled
 * rejection — which terminates the Node process on modern versions. In
 * production that showed up as a 502 from the Railway edge with no CORS
 * headers and a container restart, rather than as the 500 the error deserved,
 * so the actual failure was never reported anywhere.
 *
 * asyncHandler forwards the rejection to errorHandler, which turns it into a
 * proper response and logs it.
 */
import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { asyncHandler } from '../middleware/validate.js';
import {
  listAccountsHandler,
  createAccountHandler,
  forgetCredentialsHandler,
  snoozeNudgeHandler,
  startSessionHandler,
  startUanLookupHandler,
  startPasswordResetHandler,
  sseEventsHandler,
  captchaRespondHandler,
  otpRespondHandler,
  uploadManualPassbookHandler,
  upload,
  // Plan C — extension pairing
  extensionPairInitHandler,
  extensionPairCompleteHandler,
  extensionMeHandler,
  extensionListPairingsHandler,
  extensionRawPayloadHandler,
  extensionRevokeHandler,
  extensionRevokePairingHandler,
  authenticateExtensionMiddleware,
} from '../controllers/pf.controller.js';

export const pfRouter: Router = Router();

// ---------------------------------------------------------------------------
// Public routes (no auth) — must be registered BEFORE pfRouter.use(authenticate)
// ---------------------------------------------------------------------------

/**
 * POST /epfppf/extension/pair-complete
 * Extension exchanges its short-lived pairing code for a bearer token.
 * No JWT required — the pairing code itself is the auth credential.
 */
pfRouter.post('/extension/pair-complete', asyncHandler(extensionPairCompleteHandler));

// ---------------------------------------------------------------------------
// Extension bearer-authenticated routes — custom middleware, not JWT
// These are also registered before pfRouter.use(authenticate) to bypass it.
// ---------------------------------------------------------------------------

/** GET  /epfppf/extension/me           — extension verifies its pairing is alive */
pfRouter.get('/extension/me', authenticateExtensionMiddleware, asyncHandler(extensionMeHandler));

/** POST /epfppf/extension/raw-payload  — extension posts scraped data */
pfRouter.post('/extension/raw-payload', authenticateExtensionMiddleware, asyncHandler(extensionRawPayloadHandler));

/** POST /epfppf/extension/revoke       — extension revokes itself on uninstall */
pfRouter.post('/extension/revoke', authenticateExtensionMiddleware, asyncHandler(extensionRevokeHandler));

// ---------------------------------------------------------------------------
// JWT-authenticated routes (all routes below require a valid user JWT)
// ---------------------------------------------------------------------------

pfRouter.use(authenticate);

// Accounts
pfRouter.get('/accounts', asyncHandler(listAccountsHandler));
pfRouter.post('/accounts', asyncHandler(createAccountHandler));
pfRouter.delete('/accounts/:id/credentials', asyncHandler(forgetCredentialsHandler));
pfRouter.post('/accounts/:id/snooze-nudge', asyncHandler(snoozeNudgeHandler));
pfRouter.post('/accounts/:id/passbook', upload.single('file'), asyncHandler(uploadManualPassbookHandler));

// Sessions
// Finding a UAN precedes having an account, so this sits beside /sessions
// rather than under /accounts/:id. Everything after the first step — captcha,
// OTP, SSE — is the shared session machinery below.
pfRouter.post('/uan-lookup', asyncHandler(startUanLookupHandler));
// The way out when a member does not know their EPFO password. Same session
// machinery: captcha and OTP come back over /sessions/:id/events.
pfRouter.post('/password-reset', asyncHandler(startPasswordResetHandler));

pfRouter.post('/sessions', asyncHandler(startSessionHandler));
pfRouter.get('/sessions/:sessionId/events', asyncHandler(sseEventsHandler));
pfRouter.post('/sessions/:sessionId/captcha', asyncHandler(captchaRespondHandler));
pfRouter.post('/sessions/:sessionId/otp', asyncHandler(otpRespondHandler));

// Extension pairing — web-initiated (user manages their pairings from the web UI)
/** POST   /epfppf/extension/pair-init       — generate a new pairing code */
pfRouter.post('/extension/pair-init', asyncHandler(extensionPairInitHandler));
/** GET    /epfppf/extension/pairings        — list user's pairings */
pfRouter.get('/extension/pairings', asyncHandler(extensionListPairingsHandler));
/** DELETE /epfppf/extension/pairings/:id   — revoke pairing from web UI */
pfRouter.delete('/extension/pairings/:id', asyncHandler(extensionRevokePairingHandler));
