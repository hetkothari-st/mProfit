import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { asyncHandler } from '../middleware/validate.js';
import { piiLimiter } from '../middleware/rateLimit.js';
import {
  listAccountsHandler,
  getAccountHandler,
  createAccountHandler,
  updateAccountHandler,
  deleteAccountHandler,
  revealAccountNumberHandler,
  shareAccountDetailsHandler,
  lookupIfscHandler,
  addSnapshotHandler,
  deleteSnapshotHandler,
  listAccountCashFlowsHandler,
} from '../controllers/bankAccounts.controller.js';

export const bankAccountsRouter = Router();
bankAccountsRouter.use(authenticate);

// More-specific routes MUST come before `/:id` — Express matches in
// declaration order, so `/snapshots/:snapshotId` would otherwise be
// shadowed by the generic `/:id` delete handler.
bankAccountsRouter.delete('/snapshots/:snapshotId', asyncHandler(deleteSnapshotHandler));
// IFSC → branch name/address, for the account form's auto-fill.
bankAccountsRouter.get('/ifsc/:code', asyncHandler(lookupIfscHandler));

// Account CRUD
bankAccountsRouter.get('/', asyncHandler(listAccountsHandler));
bankAccountsRouter.post('/', asyncHandler(createAccountHandler));
bankAccountsRouter.get('/:id', asyncHandler(getAccountHandler));
bankAccountsRouter.patch('/:id', asyncHandler(updateAccountHandler));
bankAccountsRouter.delete('/:id', asyncHandler(deleteAccountHandler));

// Full account number — audit-logged (pii_view / pii_share) and rate-limited
// per user; reveal and share share one bucket.
bankAccountsRouter.post('/:id/reveal', piiLimiter, asyncHandler(revealAccountNumberHandler));
bankAccountsRouter.post('/:id/share', piiLimiter, asyncHandler(shareAccountDetailsHandler));

// Snapshot create + per-account cash flows
bankAccountsRouter.post('/:id/snapshots', asyncHandler(addSnapshotHandler));
bankAccountsRouter.get('/:id/cashflows', asyncHandler(listAccountCashFlowsHandler));
