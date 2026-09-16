import multer from 'multer';
import { mkdir } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { env } from '../config/env.js';

const UPLOAD_ROOT = env.UPLOAD_DIR;

async function ensureDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true });
}

/**
 * Per-user import storage path — `${UPLOAD_ROOT}/imports/${userId}/${year}-${month}`.
 * userId comes from a Prisma cuid (alphanumeric) but validated defensively
 * anyway since it ends up in a filesystem path.
 */
export function buildImportUploadDir(userId: string): string {
  if (!/^[a-zA-Z0-9_-]+$/.test(userId)) {
    throw new Error('Invalid userId for upload path');
  }
  const year = new Date().getUTCFullYear();
  const month = String(new Date().getUTCMonth() + 1).padStart(2, '0');
  return join(UPLOAD_ROOT, 'imports', userId, `${year}-${month}`);
}

const storage = multer.diskStorage({
  destination: async (req, _file, cb) => {
    // authenticate runs before this middleware in imports.routes.ts, so
    // req.user is already set — but fail loudly rather than falling back
    // to a shared/unscoped path if it's ever missing.
    const userId = req.user?.id;
    if (!userId) {
      cb(new Error('Cannot store upload: authenticated user missing from request'), '');
      return;
    }
    const target = buildImportUploadDir(userId);
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
