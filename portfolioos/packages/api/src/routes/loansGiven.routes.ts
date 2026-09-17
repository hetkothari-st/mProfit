import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { asyncHandler } from '../middleware/validate.js';
import {
  addEntryHandler,
  createHandler,
  deleteEntryHandler,
  deleteHandler,
  getHandler,
  installmentHandler,
  listHandler,
  reopenHandler,
  settleHandler,
  updateHandler,
  writeOffHandler,
} from '../controllers/loansGiven.controller.js';

export const loansGivenRouter = Router();
loansGivenRouter.use(authenticate);

loansGivenRouter.get('/', asyncHandler(listHandler));
loansGivenRouter.post('/', asyncHandler(createHandler));
// Before /:id so "entries" is never read as a loan id.
loansGivenRouter.delete('/entries/:entryId', asyncHandler(deleteEntryHandler));
loansGivenRouter.get('/:id', asyncHandler(getHandler));
loansGivenRouter.patch('/:id', asyncHandler(updateHandler));
loansGivenRouter.delete('/:id', asyncHandler(deleteHandler));
loansGivenRouter.post('/:id/entries', asyncHandler(addEntryHandler));
loansGivenRouter.put('/:id/installments/:no', asyncHandler(installmentHandler));
loansGivenRouter.post('/:id/settle', asyncHandler(settleHandler));
loansGivenRouter.post('/:id/write-off', asyncHandler(writeOffHandler));
loansGivenRouter.post('/:id/reopen', asyncHandler(reopenHandler));
