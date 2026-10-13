import multer from 'multer';
import { extname } from 'node:path';
import type { NextFunction, Request, Response } from 'express';
import { WILL_SIGNED_COPY_MAX_MB } from '@everypaisa/shared';
import { AppError, BadRequestError } from '../lib/errors.js';

/**
 * The signed copy of a will: one file, PDF or photo, at most 20 MB, kept in
 * memory (the service stores it sealed in the vault). The extension list is
 * only a first filter; the service decides the type from the bytes.
 */
const ALLOWED_EXT = new Set(['.pdf', '.jpg', '.jpeg', '.png', '.webp']);

const single = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: WILL_SIGNED_COPY_MAX_MB * 1024 * 1024, files: 1, fields: 10, fieldSize: 2048 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_EXT.has(extname(file.originalname).toLowerCase())) {
      cb(new BadRequestError('Upload the signed will as a PDF or a photo (JPEG, PNG or WebP).', {
        field: 'file', reason: 'WILL_UPLOAD_TYPE',
      }));
      return;
    }
    cb(null, true);
  },
}).single('file');

/** multer's own errors would surface as 500s; map them to what the user did wrong. */
export function uploadWillSignedCopy(req: Request, res: Response, next: NextFunction): void {
  single(req, res, (err: unknown) => {
    if (!err) {
      next();
      return;
    }
    if (err instanceof multer.MulterError) {
      next(
        err.code === 'LIMIT_FILE_SIZE'
          ? new AppError(`The file is larger than ${WILL_SIGNED_COPY_MAX_MB} MB`, 413, 'WILL_UPLOAD_TOO_LARGE')
          : new BadRequestError('The upload could not be read', { field: err.field ?? 'file', reason: err.code }),
      );
      return;
    }
    next(err);
  });
}
