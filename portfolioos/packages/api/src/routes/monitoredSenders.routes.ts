import { Router } from 'express';
import {
  list,
  get,
  create,
  update,
  remove,
} from '../controllers/monitoredSenders.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { asyncHandler } from '../middleware/validate.js';

export const monitoredSendersRouter = Router();

monitoredSendersRouter.use(authenticate);

monitoredSendersRouter.get('/', asyncHandler(list));
monitoredSendersRouter.post('/', asyncHandler(create));
monitoredSendersRouter.get('/:id', asyncHandler(get));
monitoredSendersRouter.patch('/:id', asyncHandler(update));
monitoredSendersRouter.delete('/:id', asyncHandler(remove));
