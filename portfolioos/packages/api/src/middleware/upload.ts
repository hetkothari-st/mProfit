import multer from 'multer';
import { mkdir } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { env } from '../config/env.js';

const UPLOAD_ROOT = env.UPLOAD_DIR;

async function ensureDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: async (_req, _file, cb) => {
    const year = new Date().getUTCFullYear();
    const month = String(new Date().getUTCMonth() + 1).padStart(2, '0');
    const target = join(UPLOAD_ROOT, 'imports', `${year}-${month}`);
    try {
      await ensureDir(target);
      cb(null, target);
    } catch (err) {
      cb(err as Error, target);
    }
  },
  filename: (_req, file, cb) => {
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80);
    const unique = `${Date.now()}-${randomUUID().slice(0, 8)}`;
    cb(null, `${unique}${extname(safeName) || ''}-${safeName}`);
  },
});

export const uploadImportFile = multer({
  storage,
  limits: {
    fileSize: env.MAX_UPLOAD_SIZE_MB * 1024 * 1024,
  },
  fileFilter: (_req, file, cb) => {
    const allowed = ['.pdf', '.csv', '.tsv', '.xlsx', '.xls', '.html', '.htm'];
    const ext = extname(file.originalname).toLowerCase();
    if (!allowed.includes(ext)) {
      cb(new Error(`Unsupported file type: ${ext}. Allowed: ${allowed.join(', ')}`));
      return;
    }
    cb(null, true);
  },
}).single('file');
