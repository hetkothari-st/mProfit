import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { asyncHandler } from '../middleware/validate.js';
import {
  listAlertsHandler,
  getUnreadCountHandler,
  markReadHandler,
  markAllReadHandler,
  deleteAlertHandler,
  createCustomAlertHandler,
  triggerScansHandler,
} from '../controllers/alerts.controller.js';

export const alertsRouter = Router();
alertsRouter.use(authenticate);

alertsRouter.get('/', asyncHandler(listAlertsHandler));
alertsRouter.get('/unread-count', asyncHandler(getUnreadCountHandler));
alertsRouter.post('/', asyncHandler(createCustomAlertHandler));
alertsRouter.patch('/mark-all-read', asyncHandler(markAllReadHandler));
alertsRouter.patch('/:id/read', asyncHandler(markReadHandler));
alertsRouter.delete('/:id', asyncHandler(deleteAlertHandler));
alertsRouter.post('/scan', asyncHandler(triggerScansHandler));
