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
import { getAlertPrefsHandler, putAlertPrefsHandler } from '../controllers/alertPrefs.controller.js';

export const notificationsRouter = Router();
notificationsRouter.use(authenticate);

notificationsRouter.get('/status', asyncHandler(statusHandler));
notificationsRouter.get('/config', asyncHandler(getConfigHandler));
notificationsRouter.put('/config', asyncHandler(upsertConfigHandler));
notificationsRouter.delete('/config', asyncHandler(deleteConfigHandler));
notificationsRouter.post('/test', asyncHandler(testConfigHandler));
notificationsRouter.get('/preferences', asyncHandler(getAlertPrefsHandler));
notificationsRouter.put('/preferences', asyncHandler(putAlertPrefsHandler));
