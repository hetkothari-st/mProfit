import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import {
  listAccountsHandler,
  createAccountHandler,
  forgetCredentialsHandler,
  startSessionHandler,
  sseEventsHandler,
  captchaRespondHandler,
  otpRespondHandler,
  uploadManualPassbookHandler,
  upload,
} from '../controllers/pf.controller.js';

export const pfRouter: Router = Router();

pfRouter.use(authenticate);

pfRouter.get('/accounts', listAccountsHandler);
pfRouter.post('/accounts', createAccountHandler);
pfRouter.delete('/accounts/:id/credentials', forgetCredentialsHandler);
pfRouter.post('/accounts/:id/passbook', upload.single('file'), uploadManualPassbookHandler);

pfRouter.post('/sessions', startSessionHandler);
pfRouter.get('/sessions/:sessionId/events', sseEventsHandler);
pfRouter.post('/sessions/:sessionId/captcha', captchaRespondHandler);
pfRouter.post('/sessions/:sessionId/otp', otpRespondHandler);
