import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { asyncHandler } from '../middleware/validate.js';
import {
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
} from '../controllers/insurance.controller.js';

export const insuranceRouter = Router();
insuranceRouter.use(authenticate);

// Policies
insuranceRouter.get('/policies', asyncHandler(listPoliciesHandler));
insuranceRouter.post('/policies', asyncHandler(createPolicyHandler));
insuranceRouter.get('/policies/:id', asyncHandler(getPolicyHandler));
insuranceRouter.patch('/policies/:id', asyncHandler(updatePolicyHandler));
insuranceRouter.delete('/policies/:id', asyncHandler(deletePolicyHandler));

// Premium payments (scoped under policy)
insuranceRouter.post('/policies/:id/premiums', asyncHandler(addPremiumHandler));
insuranceRouter.delete('/premiums/:paymentId', asyncHandler(removePremiumHandler));

// Claims (scoped under policy)
insuranceRouter.post('/policies/:id/claims', asyncHandler(addClaimHandler));
insuranceRouter.patch('/claims/:claimId', asyncHandler(updateClaimHandler));
insuranceRouter.delete('/claims/:claimId', asyncHandler(removeClaimHandler));

// Manual trigger for renewal alerts (useful for testing §9.4)
insuranceRouter.post('/alerts/trigger', asyncHandler(triggerRenewalAlertsHandler));
