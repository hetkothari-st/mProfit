import { describe, it, expect, beforeEach, vi } from 'vitest';

// Property photos live in the database. These tests pin the contract:
// owner-scoped reads and writes, bytes verified as real images, a per-property
// cap, list queries that never load image bytes, and one gallery shared by an
// owned property and the rental record linked to it.

const db = vi.hoisted(() => ({
  ownedProperty: { findFirst: vi.fn(), findMany: vi.fn() },
  rentalProperty: { findFirst: vi.fn(), findMany: vi.fn() },
  propertyPhoto: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    count: vi.fn(),
    aggregate: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));
vi.mock('../../src/lib/prisma.js', () => ({ prisma: db }));

import {
  addPhoto,
  listPhotos,
  readPhoto,
  deletePhoto,
  makeCover,
  listCovers,
  MAX_PHOTOS_PER_PROPERTY,
} from '../../src/services/propertyPhotos.service.js';
import { BadRequestError, NotFoundError } from '../../src/lib/errors.js';

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.from([0, 0, 0, 0]), Buffer.from('WEBPVP8 ')]);
const PDF = Buffer.from('%PDF-1.7 not an image');

const OWNED = { type: 'OWNED_PROPERTY' as const, id: 'op1' };
const RENTAL = { type: 'RENTAL_PROPERTY' as const, id: 'rp1' };
const upload = { full: JPEG, thumb: WEBP, width: 1600, height: 1067, caption: 'Living room' };

beforeEach(() => {
  vi.clearAllMocks();
  db.ownedProperty.findFirst.mockResolvedValue({ id: 'op1', rentalPropertyId: null });
  db.rentalProperty.findFirst.mockResolvedValue({ id: 'rp1' });
  db.ownedProperty.findMany.mockResolvedValue([]);
  db.propertyPhoto.count.mockResolvedValue(0);
  db.propertyPhoto.aggregate.mockResolvedValue({ _max: { sortOrder: 2 }, _min: { sortOrder: 0 } });
  db.propertyPhoto.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    id: 'ph1',
    ...data,
  }));
});

describe('addPhoto', () => {
  it("rejects a property that isn't the user's, without storing anything", async () => {
    db.ownedProperty.findFirst.mockResolvedValue(null);
    await expect(addPhoto('u2', OWNED, upload)).rejects.toBeInstanceOf(NotFoundError);
    expect(db.ownedProperty.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'op1', userId: 'u2' } }),
    );
    expect(db.propertyPhoto.create).not.toHaveBeenCalled();
  });

  it('rejects bytes that are not a JPEG, PNG or WebP image', async () => {
    await expect(addPhoto('u1', OWNED, { ...upload, full: PDF })).rejects.toBeInstanceOf(BadRequestError);
    await expect(addPhoto('u1', OWNED, { ...upload, thumb: PDF })).rejects.toBeInstanceOf(BadRequestError);
    expect(db.propertyPhoto.create).not.toHaveBeenCalled();
  });

  it('stores the photo after the last one, with types read from the bytes', async () => {
    await addPhoto('u1', OWNED, { ...upload, full: PNG });
    const data = db.propertyPhoto.create.mock.calls[0]![0].data;
    expect(data).toMatchObject({
      userId: 'u1',
      ownedPropertyId: 'op1',
      mimeType: 'image/png',
      thumbMimeType: 'image/webp',
      width: 1600,
      height: 1067,
      caption: 'Living room',
      sortOrder: 3,
      sizeBytes: PNG.length,
    });
    expect(data).not.toHaveProperty('rentalPropertyId');
  });

  it(`refuses more than ${MAX_PHOTOS_PER_PROPERTY} photos on a property`, async () => {
    db.propertyPhoto.count.mockResolvedValue(MAX_PHOTOS_PER_PROPERTY);
    await expect(addPhoto('u1', OWNED, upload)).rejects.toBeInstanceOf(BadRequestError);
    expect(db.propertyPhoto.create).not.toHaveBeenCalled();
  });

  it('rejects an oversized photo', async () => {
    const huge = Buffer.concat([JPEG, Buffer.alloc(6 * 1024 * 1024)]);
    await expect(addPhoto('u1', OWNED, { ...upload, full: huge })).rejects.toBeInstanceOf(BadRequestError);
  });
});

describe('listPhotos', () => {
  it('never loads image bytes', async () => {
    db.propertyPhoto.findMany.mockResolvedValue([]);
    await listPhotos('u1', OWNED);
    const select = db.propertyPhoto.findMany.mock.calls[0]![0].select;
    expect(select).toBeDefined();
    expect(select).not.toHaveProperty('data');
    expect(select).not.toHaveProperty('thumb');
  });

  it('shows one gallery for a rental and the owned property linked to it', async () => {
    db.ownedProperty.findMany.mockResolvedValue([{ id: 'op9' }]);
    db.propertyPhoto.findMany.mockResolvedValue([]);
    await listPhotos('u1', RENTAL);
    const where = db.propertyPhoto.findMany.mock.calls[0]![0].where;
    expect(where.userId).toBe('u1');
    expect(where.OR).toEqual([{ rentalPropertyId: 'rp1' }, { ownedPropertyId: 'op9' }]);
  });

  it('includes the linked rental record when listing an owned property', async () => {
    db.ownedProperty.findFirst.mockResolvedValue({ id: 'op1', rentalPropertyId: 'rp7' });
    db.propertyPhoto.findMany.mockResolvedValue([]);
    await listPhotos('u1', OWNED);
    expect(db.propertyPhoto.findMany.mock.calls[0]![0].where.OR).toEqual([
      { ownedPropertyId: 'op1' },
      { rentalPropertyId: 'rp7' },
    ]);
  });
});

describe('readPhoto / deletePhoto / makeCover', () => {
  it("reads only the user's own photo, full or thumbnail", async () => {
    db.propertyPhoto.findFirst.mockResolvedValue({ thumb: WEBP, thumbMimeType: 'image/webp' });
    const got = await readPhoto('u1', 'ph1', 'thumb');
    expect(db.propertyPhoto.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'ph1', userId: 'u1' } }),
    );
    expect(got).toEqual({ bytes: WEBP, mimeType: 'image/webp' });

    db.propertyPhoto.findFirst.mockResolvedValue(null);
    await expect(readPhoto('u2', 'ph1', 'full')).rejects.toBeInstanceOf(NotFoundError);
  });

  it("doesn't delete another user's photo", async () => {
    db.propertyPhoto.findFirst.mockResolvedValue(null);
    await expect(deletePhoto('u2', 'ph1')).rejects.toBeInstanceOf(NotFoundError);
    expect(db.propertyPhoto.delete).not.toHaveBeenCalled();
  });

  it('makes a photo the cover by ordering it before the rest', async () => {
    db.propertyPhoto.findFirst.mockResolvedValue({ id: 'ph3', ownedPropertyId: 'op1', rentalPropertyId: null });
    db.propertyPhoto.aggregate.mockResolvedValue({ _min: { sortOrder: 0 }, _max: { sortOrder: 4 } });
    db.propertyPhoto.update.mockResolvedValue({ id: 'ph3' });
    await makeCover('u1', 'ph3');
    expect(db.propertyPhoto.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'ph3' }, data: { sortOrder: -1 } }),
    );
  });
});

describe('listCovers', () => {
  it("gives each property its first photo and count, and a linked rental the owned property's", async () => {
    db.rentalProperty.findMany.mockResolvedValue([{ id: 'rp1' }, { id: 'rp2' }]);
    db.ownedProperty.findMany.mockResolvedValue([{ id: 'op9', rentalPropertyId: 'rp2' }]);
    db.propertyPhoto.findMany.mockResolvedValue([
      { id: 'a', rentalPropertyId: 'rp1', ownedPropertyId: null },
      { id: 'b', rentalPropertyId: 'rp1', ownedPropertyId: null },
      { id: 'c', rentalPropertyId: null, ownedPropertyId: 'op9' },
    ]);
    const covers = await listCovers('u1', 'RENTAL_PROPERTY');
    expect(covers).toEqual({
      rp1: { coverPhotoId: 'a', count: 2 },
      rp2: { coverPhotoId: 'c', count: 1 },
    });
    const q = db.propertyPhoto.findMany.mock.calls[0]![0];
    expect(q.where).toEqual({ userId: 'u1' });
    expect(q.select).not.toHaveProperty('data');
  });
});
