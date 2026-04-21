import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { asyncHandler } from '../middleware/validate.js';
import {
  listMailboxes,
  createMailbox,
  updateMailbox,
  deleteMailbox,
  testMailbox,
  pollMailbox,
} from '../controllers/mailboxes.controller.js';

export const mailboxesRouter = Router();

mailboxesRouter.use(authenticate);
mailboxesRouter.get('/', asyncHandler(listMailboxes));
mailboxesRouter.post('/', asyncHandler(createMailbox));
mailboxesRouter.post('/test', asyncHandler(testMailbox));
mailboxesRouter.patch('/:id', asyncHandler(updateMailbox));
mailboxesRouter.delete('/:id', asyncHandler(deleteMailbox));
mailboxesRouter.post('/:id/poll', asyncHandler(pollMailbox));
