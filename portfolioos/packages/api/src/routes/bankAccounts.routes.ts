import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { asyncHandler } from '../middleware/validate.js';
import {
  listAccountsHandler,
  getAccountHandler,
  createAccountHandler,
  updateAccountHandler,
  deleteAccountHandler,
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

// Account CRUD
bankAccountsRouter.get('/', asyncHandler(listAccountsHandler));
bankAccountsRouter.post('/', asyncHandler(createAccountHandler));
bankAccountsRouter.get('/:id', asyncHandler(getAccountHandler));
bankAccountsRouter.patch('/:id', asyncHandler(updateAccountHandler));
bankAccountsRouter.delete('/:id', asyncHandler(deleteAccountHandler));

// Snapshot create + per-account cash flows
bankAccountsRouter.post('/:id/snapshots', asyncHandler(addSnapshotHandler));
bankAccountsRouter.get('/:id/cashflows', asyncHandler(listAccountCashFlowsHandler));
