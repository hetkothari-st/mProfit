import { Router } from 'express';
import { authenticate, requireRole } from '../middleware/authenticate.js';
import { asyncHandler } from '../middleware/validate.js';
import { requireSecondFactor } from '../lib/professionalMfa.js';
import {
  adminListHandler,
  adminPatchHandler,
  createTicketHandler,
  listMyTicketsHandler,
} from '../controllers/support.controller.js';

/** /api/support: any signed-in user sends a request and sees their own. */
export const supportRouter = Router();
supportRouter.use(authenticate);
supportRouter.post('/tickets', asyncHandler(createTicketHandler));
supportRouter.get('/tickets', asyncHandler(listMyTicketsHandler));

/**
 * /api/admin/support: the team's view across users. Gated structurally (router.use), like the other admin
 * tools: ADMIN role, then a session signed in with a second factor.
 */
export const adminSupportRouter = Router();
adminSupportRouter.use(authenticate, requireRole('ADMIN'), requireSecondFactor('admin tools'));
adminSupportRouter.get('/tickets', asyncHandler(adminListHandler));
adminSupportRouter.patch('/tickets/:id', asyncHandler(adminPatchHandler));
