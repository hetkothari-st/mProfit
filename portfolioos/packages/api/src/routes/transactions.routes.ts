import { Router } from 'express';
import {
  create,
  detail,
  list,
  remove,
  update,
} from '../controllers/transaction.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { asyncHandler } from '../middleware/validate.js';

export const transactionsRouter = Router();

transactionsRouter.use(authenticate);

transactionsRouter.get('/', asyncHandler(list));
transactionsRouter.post('/', asyncHandler(create));
transactionsRouter.get('/:id', asyncHandler(detail));
transactionsRouter.patch('/:id', asyncHandler(update));
transactionsRouter.delete('/:id', asyncHandler(remove));
