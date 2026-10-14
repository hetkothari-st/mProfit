import multer from 'multer';
import { extname } from 'node:path';
import { env } from '../config/env.js';

const ALLOWED = new Set([
  '.pdf',
  '.doc',
  '.docx',
  '.odt',
  '.txt',
  '.rtf',
  '.xls',
  '.xlsx',
  '.ods',
  '.csv',
  '.ppt',
  '.pptx',
  '.odp',
  '.png',
  '.jpg',
  '.jpeg',
  '.heic',
  '.webp',
  '.gif',
  '.bmp',
  '.tiff',
]);

const memoryStorage = multer.memoryStorage();

export const uploadDocumentFile = multer({
  storage: memoryStorage,
  limits: { fileSize: env.MAX_UPLOAD_SIZE_MB * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = extname(file.originalname).toLowerCase();
    if (!ALLOWED.has(ext)) {
      cb(new Error(`Unsupported file type: ${ext}`));
      return;
    }
    cb(null, true);
  },
}).single('file');

/**
 * Documents sorter: many files in one drop, same allowlist as the vault. Files are buffered in
 * memory, so one request is bounded to SORTER_MAX_FILES × SORTER_MAX_FILE_MB (250 MB at most).
 */
export const SORTER_MAX_FILES = 10;
export const SORTER_MAX_FILE_MB = Math.min(env.MAX_UPLOAD_SIZE_MB, 25);
export const uploadSorterFiles = multer({
  storage: memoryStorage,
  limits: { fileSize: SORTER_MAX_FILE_MB * 1024 * 1024, files: SORTER_MAX_FILES },
  fileFilter: (_req, file, cb) => {
    const ext = extname(file.originalname).toLowerCase();
    if (!ALLOWED.has(ext)) {
      cb(new Error(`Unsupported file type: ${ext}`));
      return;
    }
    cb(null, true);
  },
}).array('files', SORTER_MAX_FILES);
