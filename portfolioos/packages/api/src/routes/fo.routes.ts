import { Router } from 'express';
import {
  listPositions,
  listTrades,
  pnl,
  summary,
  optionChain,
  recompute,
  refreshLive,
  syncBroker,
  listMargin,
  listExpiryJobs,
  approveExpiryJob,
  rejectExpiryJob,
  updateSetting,
  schedule43,
} from '../controllers/fo.controller.js';
import {
  setup as brokerSetup,
  start as brokerStart,
  callback as brokerCallback,
  status as brokerStatus,
  refresh as brokerRefresh,
  disconnect as brokerDisconnect,
  redirectInfo as brokerRedirectInfo,
} from '../controllers/brokerOauth.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { asyncHandler } from '../middleware/validate.js';

export const foRouter = Router();

// Broker OAuth callback is unauthenticated — the broker redirects the
// user-agent here without our session cookie. We authenticate the request
// purely via the random `state` token bound to the credential.
foRouter.get('/brokers/:brokerId/callback', asyncHandler(brokerCallback));

// Everything below requires auth.
foRouter.use(authenticate);

foRouter.get('/positions', asyncHandler(listPositions));
foRouter.get('/trades', asyncHandler(listTrades));
foRouter.get('/pnl', asyncHandler(pnl));
foRouter.get('/summary', asyncHandler(summary));
foRouter.get('/option-chain', asyncHandler(optionChain));
foRouter.get('/schedule-43', asyncHandler(schedule43));
foRouter.get('/margin', asyncHandler(listMargin));
foRouter.get('/expiry-jobs', asyncHandler(listExpiryJobs));
foRouter.post('/expiry-jobs/:id/approve', asyncHandler(approveExpiryJob));
foRouter.post('/expiry-jobs/:id/reject', asyncHandler(rejectExpiryJob));
foRouter.post('/recompute', asyncHandler(recompute));
foRouter.post('/refresh-live', asyncHandler(refreshLive));
foRouter.post('/sync-broker', asyncHandler(syncBroker));
foRouter.patch('/settings/:portfolioId', asyncHandler(updateSetting));

// Broker OAuth: setup (one-time keys), start (returns login URL), refresh,
// disconnect, status, and a tiny helper that returns the redirect URI the
// user must register on the broker's developer console.
foRouter.get('/brokers/status', asyncHandler(brokerStatus));
foRouter.get('/brokers/:brokerId/status', asyncHandler(brokerStatus));
foRouter.get('/brokers/:brokerId/redirect-info', asyncHandler(brokerRedirectInfo));
foRouter.post('/brokers/setup', asyncHandler(brokerSetup));
foRouter.post('/brokers/:brokerId/oauth/start', asyncHandler(brokerStart));
foRouter.post('/brokers/:brokerId/refresh', asyncHandler(brokerRefresh));
foRouter.delete('/brokers/:brokerId', asyncHandler(brokerDisconnect));
