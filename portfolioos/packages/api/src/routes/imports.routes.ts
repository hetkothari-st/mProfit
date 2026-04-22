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
import { rebindUserContext } from '../middleware/rebindUserContext.js';

export const importsRouter = Router();

importsRouter.use(authenticate);

// `rebindUserContext` after multer: the multipart parser's internal async
// plumbing can drop the ALS store set by `authenticate`, which makes the
// Prisma RLS hook skip `set_config('app.current_user_id', ...)` and every
// user-scoped INSERT fails with Postgres code 42501.
importsRouter.post('/', uploadImportFile, rebindUserContext, asyncHandler(upload));
importsRouter.get('/', asyncHandler(list));
importsRouter.get('/:id', asyncHandler(get));
importsRouter.delete('/:id', asyncHandler(remove));
importsRouter.post('/:id/reprocess', asyncHandler(reprocess));
