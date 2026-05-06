import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import {
  listAccountsHandler,
  createAccountHandler,
  forgetCredentialsHandler,
  snoozeNudgeHandler,
  startSessionHandler,
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
pfRouter.post('/extension/pair-complete', extensionPairCompleteHandler);

// ---------------------------------------------------------------------------
// Extension bearer-authenticated routes — custom middleware, not JWT
// These are also registered before pfRouter.use(authenticate) to bypass it.
// ---------------------------------------------------------------------------

/** GET  /epfppf/extension/me           — extension verifies its pairing is alive */
pfRouter.get('/extension/me', authenticateExtensionMiddleware, extensionMeHandler);

/** POST /epfppf/extension/raw-payload  — extension posts scraped data */
pfRouter.post('/extension/raw-payload', authenticateExtensionMiddleware, extensionRawPayloadHandler);

/** POST /epfppf/extension/revoke       — extension revokes itself on uninstall */
pfRouter.post('/extension/revoke', authenticateExtensionMiddleware, extensionRevokeHandler);

// ---------------------------------------------------------------------------
// JWT-authenticated routes (all routes below require a valid user JWT)
// ---------------------------------------------------------------------------

pfRouter.use(authenticate);

// Accounts
pfRouter.get('/accounts', listAccountsHandler);
pfRouter.post('/accounts', createAccountHandler);
pfRouter.delete('/accounts/:id/credentials', forgetCredentialsHandler);
pfRouter.post('/accounts/:id/snooze-nudge', snoozeNudgeHandler);
pfRouter.post('/accounts/:id/passbook', upload.single('file'), uploadManualPassbookHandler);

// Sessions
pfRouter.post('/sessions', startSessionHandler);
pfRouter.get('/sessions/:sessionId/events', sseEventsHandler);
pfRouter.post('/sessions/:sessionId/captcha', captchaRespondHandler);
pfRouter.post('/sessions/:sessionId/otp', otpRespondHandler);

// Extension pairing — web-initiated (user manages their pairings from the web UI)
/** POST   /epfppf/extension/pair-init       — generate a new pairing code */
pfRouter.post('/extension/pair-init', extensionPairInitHandler);
/** GET    /epfppf/extension/pairings        — list user's pairings */
pfRouter.get('/extension/pairings', extensionListPairingsHandler);
/** DELETE /epfppf/extension/pairings/:id   — revoke pairing from web UI */
pfRouter.delete('/extension/pairings/:id', extensionRevokePairingHandler);
