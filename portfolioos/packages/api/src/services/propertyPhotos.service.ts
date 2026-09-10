/**
 * Property photos — for Real Estate (OwnedProperty) and Rentals
 * (RentalProperty), stored in the database.
 *
 * - Every read and write is scoped to the owner (userId + the property's
 *   userId), on top of the RLS policy from the migration (§3.6).
 * - Bytes are sniffed: only real JPEG / PNG / WebP are kept, whatever the
 *   client claims (BUG-015: type by magic bytes, not name).
 * - List queries never select the image columns.
 * - An owned property and the rental record linked to it (promote to rental)
 *   are the same building, so they share one gallery.
 */

import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { BadRequestError, NotFoundError } from '../lib/errors.js';

export const MAX_PHOTOS_PER_PROPERTY = 20;
const MAX_FULL_BYTES = 4 * 1024 * 1024;
const MAX_THUMB_BYTES = 512 * 1024;

export type PropertyOwnerType = 'OWNED_PROPERTY' | 'RENTAL_PROPERTY';
export interface PropertyRef {
  type: PropertyOwnerType;
  id: string;
}

export interface PhotoUpload {
  full: Buffer;
  thumb: Buffer;
  width: number;
  height: number;
  caption?: string | null;
}

const META_SELECT = {
  id: true,
  ownedPropertyId: true,
  rentalPropertyId: true,
  width: true,
  height: true,
  sizeBytes: true,
  caption: true,
  sortOrder: true,
  createdAt: true,
} satisfies Prisma.PropertyPhotoSelect;

type PhotoMeta = Prisma.PropertyPhotoGetPayload<{ select: typeof META_SELECT }>;

const ORDER: Prisma.PropertyPhotoOrderByWithRelationInput[] = [
  { sortOrder: 'asc' },
  { createdAt: 'asc' },
];

/** The image type the bytes actually are, or null. */
export function sniffImage(buf: Buffer): 'image/jpeg' | 'image/png' | 'image/webp' | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (
    buf.length >= 8 &&
    buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return 'image/png';
  }
  if (
    buf.length >= 12 &&
    buf.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buf.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'image/webp';
  }
  return null;
}

/**
 * The photo owners making up `ref`'s gallery, after checking the property is
 * the user's (404 otherwise).
 */
async function galleryOwners(
  userId: string,
  ref: PropertyRef,
): Promise<Prisma.PropertyPhotoWhereInput[]> {
  if (ref.type === 'OWNED_PROPERTY') {
    const row = await prisma.ownedProperty.findFirst({
      where: { id: ref.id, userId },
      select: { id: true, rentalPropertyId: true },
    });
    if (!row) throw new NotFoundError('Property not found');
    return row.rentalPropertyId
      ? [{ ownedPropertyId: row.id }, { rentalPropertyId: row.rentalPropertyId }]
      : [{ ownedPropertyId: row.id }];
  }
  const row = await prisma.rentalProperty.findFirst({
    where: { id: ref.id, userId },
    select: { id: true },
  });
  if (!row) throw new NotFoundError('Property not found');
  const linked = await prisma.ownedProperty.findMany({
    where: { userId, rentalPropertyId: row.id },
    select: { id: true },
  });
  return [{ rentalPropertyId: row.id }, ...linked.map((l) => ({ ownedPropertyId: l.id }))];
}

export async function listPhotos(userId: string, ref: PropertyRef): Promise<PhotoMeta[]> {
  const owners = await galleryOwners(userId, ref);
  return prisma.propertyPhoto.findMany({
    where: { userId, OR: owners },
    select: META_SELECT,
    orderBy: ORDER,
  });
}

function checkDimension(n: number, what: string): number {
  if (!Number.isInteger(n) || n < 1 || n > 10_000) {
    throw new BadRequestError(`Photo ${what} must be a whole number of pixels`);
  }
  return n;
}

export async function addPhoto(userId: string, ref: PropertyRef, input: PhotoUpload): Promise<PhotoMeta> {
  const mimeType = sniffImage(input.full);
  const thumbMimeType = sniffImage(input.thumb);
  if (!mimeType || !thumbMimeType) {
    throw new BadRequestError('Photos must be JPEG, PNG or WebP images');
  }
  if (input.full.length > MAX_FULL_BYTES || input.thumb.length > MAX_THUMB_BYTES) {
    throw new BadRequestError('That photo is too large — try a smaller one');
  }
  const width = checkDimension(input.width, 'width');
  const height = checkDimension(input.height, 'height');
  const caption = input.caption?.trim().slice(0, 200) || null;

  const owners = await galleryOwners(userId, ref);
  const count = await prisma.propertyPhoto.count({ where: { userId, OR: owners } });
  if (count >= MAX_PHOTOS_PER_PROPERTY) {
    throw new BadRequestError(`A property can have up to ${MAX_PHOTOS_PER_PROPERTY} photos`);
  }
  const agg = await prisma.propertyPhoto.aggregate({
    where: { userId, OR: owners },
    _max: { sortOrder: true },
  });

  return prisma.propertyPhoto.create({
    data: {
      userId,
      ...(ref.type === 'OWNED_PROPERTY' ? { ownedPropertyId: ref.id } : { rentalPropertyId: ref.id }),
      mimeType,
      data: input.full,
      thumbMimeType,
      thumb: input.thumb,
      width,
      height,
      sizeBytes: input.full.length,
      caption,
      sortOrder: (agg._max.sortOrder ?? -1) + 1,
    },
    select: META_SELECT,
  });
}

export async function readPhoto(
  userId: string,
  photoId: string,
  size: 'full' | 'thumb',
): Promise<{ bytes: Uint8Array; mimeType: string }> {
  if (size === 'thumb') {
    const row = await prisma.propertyPhoto.findFirst({
      where: { id: photoId, userId },
      select: { thumb: true, thumbMimeType: true },
    });
    if (!row) throw new NotFoundError('Photo not found');
    return { bytes: row.thumb, mimeType: row.thumbMimeType };
  }
  const row = await prisma.propertyPhoto.findFirst({
    where: { id: photoId, userId },
    select: { data: true, mimeType: true },
  });
  if (!row) throw new NotFoundError('Photo not found');
  return { bytes: row.data, mimeType: row.mimeType };
}

export async function deletePhoto(userId: string, photoId: string): Promise<void> {
  const row = await prisma.propertyPhoto.findFirst({
    where: { id: photoId, userId },
    select: { id: true },
  });
  if (!row) throw new NotFoundError('Photo not found');
  await prisma.propertyPhoto.delete({ where: { id: row.id } });
}

/** Put a photo first in its gallery — the cover shown on cards. */
export async function makeCover(userId: string, photoId: string): Promise<PhotoMeta> {
  const photo = await prisma.propertyPhoto.findFirst({
    where: { id: photoId, userId },
    select: { id: true, ownedPropertyId: true, rentalPropertyId: true },
  });
  if (!photo) throw new NotFoundError('Photo not found');
  const ref: PropertyRef = photo.ownedPropertyId
    ? { type: 'OWNED_PROPERTY', id: photo.ownedPropertyId }
    : { type: 'RENTAL_PROPERTY', id: photo.rentalPropertyId! };
  const owners = await galleryOwners(userId, ref);
  const agg = await prisma.propertyPhoto.aggregate({
    where: { userId, OR: owners },
    _min: { sortOrder: true },
  });
  return prisma.propertyPhoto.update({
    where: { id: photo.id },
    data: { sortOrder: (agg._min.sortOrder ?? 0) - 1 },
    select: META_SELECT,
  });
}

const ownerKey = (p: { ownedPropertyId: string | null; rentalPropertyId: string | null }) =>
  p.ownedPropertyId ? `O:${p.ownedPropertyId}` : `R:${p.rentalPropertyId}`;

/** Each property's cover photo and photo count, for the list pages. */
export async function listCovers(
  userId: string,
  type: PropertyOwnerType,
): Promise<Record<string, { coverPhotoId: string; count: number }>> {
  // Which photo owners feed each property's gallery.
  const keysByProperty = new Map<string, string[]>();
  if (type === 'RENTAL_PROPERTY') {
    const [rentals, links] = await Promise.all([
      prisma.rentalProperty.findMany({ where: { userId }, select: { id: true } }),
      prisma.ownedProperty.findMany({
        where: { userId, rentalPropertyId: { not: null } },
        select: { id: true, rentalPropertyId: true },
      }),
    ]);
    for (const r of rentals) keysByProperty.set(r.id, [`R:${r.id}`]);
    for (const l of links) keysByProperty.get(l.rentalPropertyId!)?.push(`O:${l.id}`);
  } else {
    const owned = await prisma.ownedProperty.findMany({
      where: { userId },
      select: { id: true, rentalPropertyId: true },
    });
    for (const o of owned) {
      keysByProperty.set(o.id, o.rentalPropertyId ? [`O:${o.id}`, `R:${o.rentalPropertyId}`] : [`O:${o.id}`]);
    }
  }
  const propertiesByKey = new Map<string, string[]>();
  for (const [propertyId, keys] of keysByProperty) {
    for (const k of keys) propertiesByKey.set(k, [...(propertiesByKey.get(k) ?? []), propertyId]);
  }

  const photos = await prisma.propertyPhoto.findMany({
    where: { userId },
    select: { id: true, ownedPropertyId: true, rentalPropertyId: true },
    orderBy: ORDER,
  });
  const covers: Record<string, { coverPhotoId: string; count: number }> = {};
  for (const p of photos) {
    for (const propertyId of propertiesByKey.get(ownerKey(p)) ?? []) {
      const c = (covers[propertyId] ??= { coverPhotoId: p.id, count: 0 });
      c.count += 1;
    }
  }
  return covers;
}
