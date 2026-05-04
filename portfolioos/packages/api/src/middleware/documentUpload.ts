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
