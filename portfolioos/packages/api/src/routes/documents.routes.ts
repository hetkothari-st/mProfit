import { Router, json } from 'express';
import {
  convertDocToPdf,
  detail,
  download,
  list,
  onlyofficeCallback,
  onlyofficeConfig,
  onlyofficeDownload,
  remove,
  update,
  upload,
} from '../controllers/document.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { asyncHandler } from '../middleware/validate.js';
import { uploadDocumentFile } from '../middleware/documentUpload.js';

export const documentsRouter = Router();

// OnlyOffice DocumentServer routes are NOT user-authenticated — they
// auth via short-lived JWT in the URL/body. They must be mounted before
// the global `authenticate` middleware.
documentsRouter.get('/:id/oo-download', asyncHandler(onlyofficeDownload));
documentsRouter.post(
  '/:id/oo-callback',
  json({ limit: '5mb' }),
  asyncHandler(onlyofficeCallback),
);

documentsRouter.use(authenticate);

documentsRouter.get('/', asyncHandler(list));
documentsRouter.post('/', uploadDocumentFile, asyncHandler(upload));
documentsRouter.get('/:id', asyncHandler(detail));
documentsRouter.patch('/:id', asyncHandler(update));
documentsRouter.delete('/:id', asyncHandler(remove));

documentsRouter.get('/:id/download', asyncHandler(download));
documentsRouter.get('/:id/onlyoffice-config', asyncHandler(onlyofficeConfig));
documentsRouter.post('/:id/convert-pdf', asyncHandler(convertDocToPdf));
