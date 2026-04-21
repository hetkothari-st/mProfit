import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { asyncHandler } from '../middleware/validate.js';
import {
  listBrokerAccounts,
  kiteLoginUrl,
  kiteCallback,
  syncBrokerAccount,
  deleteBrokerAccount,
} from '../controllers/connectors.controller.js';

export const connectorsRouter = Router();

connectorsRouter.use(authenticate);
connectorsRouter.get('/', asyncHandler(listBrokerAccounts));
connectorsRouter.get('/kite/login-url', asyncHandler(kiteLoginUrl));
connectorsRouter.post('/kite/callback', asyncHandler(kiteCallback));
connectorsRouter.post('/:id/sync', asyncHandler(syncBrokerAccount));
connectorsRouter.delete('/:id', asyncHandler(deleteBrokerAccount));
