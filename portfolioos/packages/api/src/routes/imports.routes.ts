import { Router } from 'express';
import {
  upload,
  list,
  get,
  remove,
  reprocess,
} from '../controllers/imports.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { asyncHandler } from '../middleware/validate.js';
import { uploadImportFile } from '../middleware/upload.js';

export const importsRouter = Router();

importsRouter.use(authenticate);

importsRouter.post('/', uploadImportFile, asyncHandler(upload));
importsRouter.get('/', asyncHandler(list));
importsRouter.get('/:id', asyncHandler(get));
importsRouter.delete('/:id', asyncHandler(remove));
importsRouter.post('/:id/reprocess', asyncHandler(reprocess));
