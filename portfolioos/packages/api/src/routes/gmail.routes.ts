import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { asyncHandler } from '../middleware/validate.js';
import {
  getGmailConfig,
  getGmailAuthUrl,
  postGmailCallback,
  postGmailSync,
  getGmailDiscover,
  deleteGmailAccount,
} from '../controllers/gmail.controller.js';

export const gmailRouter = Router();

gmailRouter.use(authenticate);
gmailRouter.get('/config', asyncHandler(getGmailConfig));
gmailRouter.get('/auth-url', asyncHandler(getGmailAuthUrl));
gmailRouter.post('/callback', asyncHandler(postGmailCallback));
gmailRouter.post('/:id/sync', asyncHandler(postGmailSync));
gmailRouter.get('/:id/discover', asyncHandler(getGmailDiscover));
gmailRouter.delete('/:id', asyncHandler(deleteGmailAccount));
