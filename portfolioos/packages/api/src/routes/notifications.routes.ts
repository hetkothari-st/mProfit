import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { asyncHandler } from '../middleware/validate.js';
import {
  getConfigHandler,
  upsertConfigHandler,
  deleteConfigHandler,
  testConfigHandler,
  statusHandler,
} from '../controllers/notificationConfig.controller.js';

export const notificationsRouter = Router();
notificationsRouter.use(authenticate);

notificationsRouter.get('/status', asyncHandler(statusHandler));
notificationsRouter.get('/config', asyncHandler(getConfigHandler));
notificationsRouter.put('/config', asyncHandler(upsertConfigHandler));
notificationsRouter.delete('/config', asyncHandler(deleteConfigHandler));
notificationsRouter.post('/test', asyncHandler(testConfigHandler));
