import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { asyncHandler } from '../middleware/validate.js';
import { list, read, create, update, remove } from '../controllers/goals.controller.js';

export const goalsRouter = Router();
goalsRouter.use(authenticate);

goalsRouter.get('/', asyncHandler(list));
goalsRouter.post('/', asyncHandler(create));
goalsRouter.get('/:id', asyncHandler(read));
goalsRouter.patch('/:id', asyncHandler(update));
goalsRouter.delete('/:id', asyncHandler(remove));
