import { Router } from 'express';
import { authenticate, requireRole } from '../middleware/authenticate.js';
import { asyncHandler } from '../middleware/validate.js';
import { requireSecondFactor } from '../lib/professionalMfa.js';
import { loanRatesRunLimiter } from '../middleware/rateLimit.js';
import {
  adminApproveHandler, adminClearManualHandler, adminListHandler, adminRejectHandler, adminRunHandler, adminSetManualHandler,
} from '../controllers/loanRates.controller.js';

/**
 * /api/admin/loan-rates (spec s5.5/s5.6). The gate is structural (router.use), so a route added below is
 * gated too: ADMIN role, then a session signed in with a second factor - the same pair billing's admin
 * escape hatch uses. The rate tables are shared reference data; the AuditLog row each write leaves is what
 * makes an unowned write attributable.
 */
export const adminLoanRatesRouter = Router();
adminLoanRatesRouter.use(authenticate, requireRole('ADMIN'), requireSecondFactor('admin tools'));

adminLoanRatesRouter.get('/', asyncHandler(adminListHandler));
adminLoanRatesRouter.post('/run', loanRatesRunLimiter, asyncHandler(adminRunHandler));
adminLoanRatesRouter.post('/readings/:id/approve', asyncHandler(adminApproveHandler));
adminLoanRatesRouter.post('/readings/:id/reject', asyncHandler(adminRejectHandler));
adminLoanRatesRouter.post('/:sourceId/manual', asyncHandler(adminSetManualHandler));
adminLoanRatesRouter.delete('/:sourceId/manual', asyncHandler(adminClearManualHandler));
