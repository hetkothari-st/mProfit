import path from 'path';
import fs from 'fs/promises';
import type { Request, Response } from 'express';
import multer from 'multer';
import { prisma } from '../lib/prisma.js';
import { env } from '../config/env.js';
import { ok, noContent } from '../lib/response.js';
import { BadRequestError, ForbiddenError, NotFoundError, UnauthorizedError } from '../lib/errors.js';
import { sniffImage } from '../services/propertyPhotos.service.js';
import { persistLocalFile } from '../lib/fileStore.js';
import { deleteFile, readBuffer } from '../lib/documentStorage.js';

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']);
const MAX_BYTES = (env.MAX_UPLOAD_SIZE_MB ?? 20) * 1024 * 1024;

/**
 * The image type the bytes actually are. The upload filter only sees the
 * browser's declared type, which a client sets freely; this file is later
 * served back with the stored type, so the stored type must be the real one.
 */
export function sniffPhoto(buf: Buffer): string | null {
  const basic = sniffImage(buf);
  if (basic) return basic;
  // HEIC/HEIF: ISO-BMFF `ftyp` box with an image brand.
  if (buf.length >= 12 && buf.subarray(4, 8).toString('ascii') === 'ftyp') {
    const brand = buf.subarray(8, 12).toString('ascii');
    if (['heic', 'heix', 'hevc', 'heim', 'heis'].includes(brand)) return 'image/heic';
    if (['mif1', 'msf1'].includes(brand)) return 'image/heif';
  }
  return null;
}

async function userOwnsTransaction(userId: string, txnId: string): Promise<boolean> {
  const txn = await prisma.transaction.findUnique({
    where: { id: txnId },
    select: { portfolio: { select: { userId: true } } },
  });
  return txn?.portfolio.userId === userId;
}

export const upload = multer({
  storage: multer.diskStorage({
    destination: async (_req, _file, cb) => {
      const dir = path.join(env.UPLOAD_DIR, 'transaction_photos');
      await fs.mkdir(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
      cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
    },
  }),
  fileFilter: (_req, file, cb) => {
    cb(null, ALLOWED_MIME.has(file.mimetype));
  },
  limits: { fileSize: MAX_BYTES, files: 5 },
});

export async function uploadPhoto(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  const txnId = req.params.id!;
  if (!(await userOwnsTransaction(req.user.id, txnId))) throw new ForbiddenError();

  const file = req.file;
  if (!file) throw new BadRequestError('No file uploaded');

  const head = Buffer.alloc(16);
  const fh = await fs.open(file.path, 'r');
  try {
    await fh.read(head, 0, 16, 0);
  } finally {
    await fh.close();
  }
  const mimeType = sniffPhoto(head);
  if (!mimeType) {
    await fs.unlink(file.path).catch(() => undefined);
    throw new BadRequestError('That file is not a JPEG, PNG, WebP or HEIC image.');
  }

  // Keep it encrypted in the database; the disk copy would not survive a
  // deploy and would sit there in plain text.
  const blobKey = await persistLocalFile(req.user.id, file.path, 'txnphoto');
  await fs.unlink(file.path).catch(() => undefined);

  const photo = await prisma.transactionPhoto.create({
    data: {
      transactionId: txnId,
      fileName: file.originalname,
      filePath: file.path,
      blobKey,
      mimeType,
      sizeBytes: file.size,
    },
  });

  ok(res, {
    id: photo.id,
    fileName: photo.fileName,
    mimeType: photo.mimeType,
    sizeBytes: photo.sizeBytes,
    createdAt: photo.createdAt.toISOString(),
  });
}

export async function servePhoto(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  const { id: txnId, photoId } = req.params as { id: string; photoId: string };
  if (!(await userOwnsTransaction(req.user.id, txnId))) throw new ForbiddenError();

  const photo = await prisma.transactionPhoto.findUnique({ where: { id: photoId } });
  if (!photo || photo.transactionId !== txnId) throw new NotFoundError('Photo not found');

  res.setHeader('Content-Type', photo.mimeType);
  res.setHeader('Cache-Control', 'private, max-age=3600');
  if (photo.blobKey) {
    res.send(await readBuffer(req.user.id, photo.blobKey));
    return;
  }
  res.sendFile(path.resolve(photo.filePath));
}

export async function deletePhoto(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  const { id: txnId, photoId } = req.params as { id: string; photoId: string };
  if (!(await userOwnsTransaction(req.user.id, txnId))) throw new ForbiddenError();

  const photo = await prisma.transactionPhoto.findUnique({ where: { id: photoId } });
  if (!photo || photo.transactionId !== txnId) throw new NotFoundError('Photo not found');

  await fs.unlink(photo.filePath).catch(() => {});
  if (photo.blobKey) await deleteFile(req.user.id, photo.blobKey);
  await prisma.transactionPhoto.delete({ where: { id: photoId } });
  noContent(res);
}
