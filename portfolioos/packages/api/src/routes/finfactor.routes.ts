import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { requireFeature } from '../middleware/requirePlan.js';
import { asyncHandler } from '../middleware/validate.js';
import {
  getConsents,
  getFinfactorStatus,
  postBenchmarkPointToPoint,
  postBenchmarkTrailing,
  postCohortWebhook,
  postConsentApproveDemo,
  postConsentInitiate,
  postConsentRevoke,
  postConsentWebhook,
  postDataWebhook,
  postDecryptEcres,
  postHistoricalWebhook,
  postMfAnalysis,
  postMfHoldingByIsin,
  postMfInsights,
  postMfInsightsNoPii,
  postMfLinkedAccounts,
  postMfLinkedAccountsHoldingFolio,
  postMfStatement,
  postSubscriptionWebhook,
  postSyncMutualFunds,
  postLifeInsuranceLinkedAccounts,
  postLifeInsuranceStatement,
  postGeneralInsuranceLinkedAccounts,
  postGeneralInsuranceStatement,
} from '../controllers/finfactor.controller.js';

export const finfactorRouter = Router();
finfactorRouter.use(authenticate);

// Connection status is harmless to read at any tier — it's what the
// upgrade prompt itself needs to render correctly.
finfactorRouter.get('/status', asyncHandler(getFinfactorStatus));

// Everything below actually drives AA/Finvu-sourced auto-import (consent,
// sync, statements, AA-derived insights) — Plus and above only.
finfactorRouter.use(requireFeature('AA_FINVU_AUTOIMPORT'));

// Mutual Fund insights group — mirrors /pfm/api/v2/mutual-fund/* upstream.
finfactorRouter.post('/mf/insights', asyncHandler(postMfInsights));
finfactorRouter.post('/mf/insights-no-pii', asyncHandler(postMfInsightsNoPii));
finfactorRouter.post('/mf/linked-accounts', asyncHandler(postMfLinkedAccounts));
finfactorRouter.post('/mf/linked-accounts/holding-folio', asyncHandler(postMfLinkedAccountsHoldingFolio));
finfactorRouter.post('/mf/statement', asyncHandler(postMfStatement));
finfactorRouter.post('/mf/analysis', asyncHandler(postMfAnalysis));
finfactorRouter.post('/mf/holdings/:isin', asyncHandler(postMfHoldingByIsin));
finfactorRouter.post('/mf/benchmark/trailing', asyncHandler(postBenchmarkTrailing));
finfactorRouter.post('/mf/benchmark/point-to-point', asyncHandler(postBenchmarkPointToPoint));

// Consent lifecycle.
finfactorRouter.post('/consent/initiate', asyncHandler(postConsentInitiate));
finfactorRouter.get('/consent', asyncHandler(getConsents));
finfactorRouter.post('/consent/:handle/revoke', asyncHandler(postConsentRevoke));
finfactorRouter.post('/consent/:handle/approve-demo', asyncHandler(postConsentApproveDemo));
finfactorRouter.post('/consent/decrypt-ecres', asyncHandler(postDecryptEcres));

// Sync — project Finvu MF data into PortfolioOS holdings.
finfactorRouter.post('/sync/mf', asyncHandler(postSyncMutualFunds));

// Insurance — life + general.
finfactorRouter.post('/life-insurance/linked-accounts', asyncHandler(postLifeInsuranceLinkedAccounts));
finfactorRouter.post('/life-insurance/statement', asyncHandler(postLifeInsuranceStatement));
finfactorRouter.post('/general-insurance/linked-accounts', asyncHandler(postGeneralInsuranceLinkedAccounts));
finfactorRouter.post('/general-insurance/statement', asyncHandler(postGeneralInsuranceStatement));

// Webhooks — unauthenticated, HMAC-verified inside the handler. Mounted
// on a separate router so the authenticate middleware above doesn't gate
// them.
export const finfactorWebhookRouter = Router();
finfactorWebhookRouter.post('/consent', asyncHandler(postConsentWebhook));
finfactorWebhookRouter.post('/data', asyncHandler(postDataWebhook));
finfactorWebhookRouter.post('/historical', asyncHandler(postHistoricalWebhook));
finfactorWebhookRouter.post('/cohort', asyncHandler(postCohortWebhook));
finfactorWebhookRouter.post('/subscription', asyncHandler(postSubscriptionWebhook));
