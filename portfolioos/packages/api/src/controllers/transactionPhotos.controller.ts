import path from 'path';
import fs from 'fs/promises';
import type { Request, Response } from 'express';
import multer from 'multer';
import { prisma } from '../lib/prisma.js';
import { env } from '../config/env.js';
import { ok, noContent } from '../lib/response.js';
import { BadRequestError, ForbiddenError, NotFoundError, UnauthorizedError } from '../lib/errors.js';

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']);
const MAX_BYTES = (env.MAX_UPLOAD_SIZE_MB ?? 20) * 1024 * 1024;

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

  const photo = await prisma.transactionPhoto.create({
    data: {
      transactionId: txnId,
      fileName: file.originalname,
      filePath: file.path,
      mimeType: file.mimetype,
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
  res.sendFile(path.resolve(photo.filePath));
}

export async function deletePhoto(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  const { id: txnId, photoId } = req.params as { id: string; photoId: string };
  if (!(await userOwnsTransaction(req.user.id, txnId))) throw new ForbiddenError();

  const photo = await prisma.transactionPhoto.findUnique({ where: { id: photoId } });
  if (!photo || photo.transactionId !== txnId) throw new NotFoundError('Photo not found');

  await fs.unlink(photo.filePath).catch(() => {});
  await prisma.transactionPhoto.delete({ where: { id: photoId } });
  noContent(res);
}
