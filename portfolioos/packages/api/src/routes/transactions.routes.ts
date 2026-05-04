import { Router } from 'express';
import {
  create,
  detail,
  list,
  remove,
  update,
} from '../controllers/transaction.controller.js';
import {
  upload,
  uploadPhoto,
  servePhoto,
  deletePhoto,
} from '../controllers/transactionPhotos.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { asyncHandler } from '../middleware/validate.js';

export const transactionsRouter = Router();

transactionsRouter.use(authenticate);

transactionsRouter.get('/', asyncHandler(list));
transactionsRouter.post('/', asyncHandler(create));
transactionsRouter.get('/:id', asyncHandler(detail));
transactionsRouter.patch('/:id', asyncHandler(update));
transactionsRouter.delete('/:id', asyncHandler(remove));

// Photo attachments
transactionsRouter.post('/:id/photos', upload.single('photo'), asyncHandler(uploadPhoto));
transactionsRouter.get('/:id/photos/:photoId', asyncHandler(servePhoto));
transactionsRouter.delete('/:id/photos/:photoId', asyncHandler(deletePhoto));
