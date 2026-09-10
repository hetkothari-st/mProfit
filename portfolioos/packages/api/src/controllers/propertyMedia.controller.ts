/**
 * HTTP layer for property photos and map pins. Validation here; ownership,
 * image checks and caps live in the services.
 */
import type { Request, Response } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { ok, noContent } from '../lib/response.js';
import { BadRequestError, UnauthorizedError } from '../lib/errors.js';
import {
  addPhoto,
  deletePhoto,
  listCovers,
  listPhotos,
  makeCover,
  readPhoto,
  type PropertyRef,
} from '../services/propertyPhotos.service.js';
import {
  listLocations,
  locateProperty,
  resetLocation,
  setManualLocation,
} from '../services/propertyLocation.service.js';

const ownerType = z.enum(['OWNED_PROPERTY', 'RENTAL_PROPERTY']);
const ownerQuery = z.object({ ownerType, ownerId: z.string().min(1).max(64) });

/** Multipart upload: `full` and `thumb` images, both kept in memory (they go to the DB). */
export const photoUpload = multer({
  storage: multer.memoryStorage(),
  // A little above the service's own caps so it, not multer, explains a refusal.
  limits: { fileSize: 5 * 1024 * 1024, files: 2, fields: 8 },
}).fields([
  { name: 'full', maxCount: 1 },
  { name: 'thumb', maxCount: 1 },
]);

function userId(req: Request): string {
  if (!req.user) throw new UnauthorizedError();
  return req.user.id;
}

function toPhotoDto(p: {
  id: string;
  ownedPropertyId: string | null;
  rentalPropertyId: string | null;
  width: number;
  height: number;
  sizeBytes: number;
  caption: string | null;
  sortOrder: number;
  createdAt: Date;
}) {
  return {
    id: p.id,
    ownerType: p.ownedPropertyId ? 'OWNED_PROPERTY' : 'RENTAL_PROPERTY',
    ownerId: p.ownedPropertyId ?? p.rentalPropertyId,
    width: p.width,
    height: p.height,
    sizeBytes: p.sizeBytes,
    caption: p.caption,
    sortOrder: p.sortOrder,
    createdAt: p.createdAt.toISOString(),
  };
}

// ── Photos ───────────────────────────────────────────────────────────────────

export async function listPhotosHandler(req: Request, res: Response) {
  const q = ownerQuery.parse(req.query);
  const photos = await listPhotos(userId(req), { type: q.ownerType, id: q.ownerId });
  ok(res, photos.map(toPhotoDto));
}

export async function listCoversHandler(req: Request, res: Response) {
  const { ownerType: type } = z.object({ ownerType }).parse(req.query);
  ok(res, await listCovers(userId(req), type));
}

export async function uploadPhotoHandler(req: Request, res: Response) {
  const uid = userId(req);
  const body = z
    .object({
      ownerType,
      ownerId: z.string().min(1).max(64),
      width: z.coerce.number().int(),
      height: z.coerce.number().int(),
      caption: z.string().max(200).optional(),
    })
    .parse(req.body);
  const files = req.files as Record<string, Express.Multer.File[] | undefined> | undefined;
  const full = files?.['full']?.[0];
  const thumb = files?.['thumb']?.[0];
  if (!full || !thumb) throw new BadRequestError('Send the photo and its thumbnail');

  const ref: PropertyRef = { type: body.ownerType, id: body.ownerId };
  const photo = await addPhoto(uid, ref, {
    full: full.buffer,
    thumb: thumb.buffer,
    width: body.width,
    height: body.height,
    caption: body.caption ?? null,
  });
  res.status(201);
  ok(res, toPhotoDto(photo));
}

export async function servePhotoHandler(req: Request, res: Response) {
  const size = req.params['size'] === 'thumb' ? 'thumb' : 'full';
  const { bytes, mimeType } = await readPhoto(userId(req), req.params['id']!, size);
  res.setHeader('Content-Type', mimeType);
  // A photo's bytes never change for its id, but it's private to its owner.
  res.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
  res.send(Buffer.from(bytes));
}

export async function makeCoverHandler(req: Request, res: Response) {
  ok(res, toPhotoDto(await makeCover(userId(req), req.params['id']!)));
}

export async function deletePhotoHandler(req: Request, res: Response) {
  await deletePhoto(userId(req), req.params['id']!);
  noContent(res);
}

// ── Map pins ─────────────────────────────────────────────────────────────────

function refFromParams(req: Request): PropertyRef {
  const p = z
    .object({ ownerType, id: z.string().min(1).max(64) })
    .parse({ ownerType: req.params['ownerType'], id: req.params['id'] });
  return { type: p.ownerType, id: p.id };
}

export async function listLocationsHandler(req: Request, res: Response) {
  const { ownerType: type } = z.object({ ownerType }).parse(req.query);
  ok(res, await listLocations(userId(req), type));
}

export async function getLocationHandler(req: Request, res: Response) {
  ok(res, await locateProperty(userId(req), refFromParams(req)));
}

export async function setLocationHandler(req: Request, res: Response) {
  const body = z.object({ latitude: z.number(), longitude: z.number() }).parse(req.body);
  ok(res, await setManualLocation(userId(req), refFromParams(req), body.latitude, body.longitude));
}

export async function resetLocationHandler(req: Request, res: Response) {
  const uid = userId(req);
  const ref = refFromParams(req);
  await resetLocation(uid, ref);
  // Look the address up again straight away so the map has a pin to show.
  ok(res, await locateProperty(uid, ref));
}
