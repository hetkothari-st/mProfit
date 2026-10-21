import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { asyncHandler } from '../middleware/validate.js';
import { piiLimiter } from '../middleware/rateLimit.js';
import {
  revealPolicyNumberHandler,
  listPoliciesHandler,
  getPolicyHandler,
  createPolicyHandler,
  updatePolicyHandler,
  deletePolicyHandler,
  addPremiumHandler,
  removePremiumHandler,
  addClaimHandler,
  updateClaimHandler,
  removeClaimHandler,
  triggerRenewalAlertsHandler,
  listImportSuggestionsHandler,
  linkImportedPremiumHandler,
  dismissImportSuggestionHandler,
  taxSummaryHandler,
  listInsuranceDocumentsHandler,
  approveInsuranceDocumentHandler,
  dismissInsuranceDocumentHandler,
  unlockInsuranceDocumentHandler,
  answerRenewalHandler,
} from '../controllers/insurance.controller.js';
import { getCoverageHandler } from '../controllers/insuranceCoverage.controller.js';
import {
  getInsuranceFetchHandler,
  scanInsuranceNowHandler,
  setInsuranceFetchHandler,
} from '../controllers/insuranceGmailFetch.controller.js';

export const insuranceRouter = Router();
insuranceRouter.use(authenticate);

// Policies
insuranceRouter.get('/policies', asyncHandler(listPoliciesHandler));
insuranceRouter.post('/policies', asyncHandler(createPolicyHandler));
insuranceRouter.get('/policies/:id', asyncHandler(getPolicyHandler));
insuranceRouter.patch('/policies/:id', asyncHandler(updatePolicyHandler));
insuranceRouter.delete('/policies/:id', asyncHandler(deletePolicyHandler));

// Full policy number — decrypted, audited, and rate-limited like other PII (§15.7).
insuranceRouter.post('/policies/:id/reveal', piiLimiter, asyncHandler(revealPolicyNumberHandler));

// Premium payments (scoped under policy)
insuranceRouter.post('/policies/:id/premiums', asyncHandler(addPremiumHandler));
insuranceRouter.delete('/premiums/:paymentId', asyncHandler(removePremiumHandler));

// Claims (scoped under policy)
insuranceRouter.post('/policies/:id/claims', asyncHandler(addClaimHandler));
insuranceRouter.patch('/claims/:claimId', asyncHandler(updateClaimHandler));
insuranceRouter.delete('/claims/:claimId', asyncHandler(removeClaimHandler));

// Coverage check (hub phase 3): figures + defaults; verdicts are computed in shared.
insuranceRouter.get('/coverage', asyncHandler(getCoverageHandler));

// Premiums imported from insurance statements: suggested per policy, linked or dismissed.
insuranceRouter.get('/policies/:id/import-suggestions', asyncHandler(listImportSuggestionsHandler));
insuranceRouter.post('/policies/:id/import-suggestions/link', asyncHandler(linkImportedPremiumHandler));
insuranceRouter.post('/policies/:id/import-suggestions/dismiss', asyncHandler(dismissImportSuggestionHandler));

// What the year's recorded premiums are worth at tax time (?fy=2026-27).
insuranceRouter.get('/tax-summary', asyncHandler(taxSummaryHandler));

// Insurance documents from Gmail, with the user's permission per account.
insuranceRouter.get('/gmail-fetch', asyncHandler(getInsuranceFetchHandler));
insuranceRouter.put('/gmail-fetch/:mailboxId', asyncHandler(setInsuranceFetchHandler));
insuranceRouter.post('/gmail-fetch/:mailboxId/scan', asyncHandler(scanInsuranceNowHandler));

// What was found: linked to policies, suggested as new policies, or waiting.
insuranceRouter.get('/documents', asyncHandler(listInsuranceDocumentsHandler));
insuranceRouter.post('/documents/:docId/approve', asyncHandler(approveInsuranceDocumentHandler));
insuranceRouter.post('/documents/:docId/dismiss', asyncHandler(dismissInsuranceDocumentHandler));
// Rate-limited like PII endpoints: a password box is a guessing surface.
insuranceRouter.post('/documents/:docId/password', piiLimiter, asyncHandler(unlockInsuranceDocumentHandler));
insuranceRouter.post('/documents/:docId/renewal', asyncHandler(answerRenewalHandler));

// Manual trigger for renewal alerts (useful for testing §9.4)
insuranceRouter.post('/alerts/trigger', asyncHandler(triggerRenewalAlertsHandler));
