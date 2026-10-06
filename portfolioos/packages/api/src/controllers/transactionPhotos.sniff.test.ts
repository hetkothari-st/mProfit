import { describe, it, expect, vi } from 'vitest';

vi.mock('../lib/prisma.js', () => ({ prisma: {} }));
const { sniffPhoto } = await import('./transactionPhotos.controller.js');

const ftyp = (brand: string) => Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from(`ftyp${brand}`, 'ascii')]);

describe('sniffPhoto', () => {
  it('recognises real image formats by their bytes', () => {
    expect(sniffPhoto(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg');
    expect(sniffPhoto(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe('image/png');
    expect(sniffPhoto(ftyp('heic'))).toBe('image/heic');
    expect(sniffPhoto(ftyp('mif1'))).toBe('image/heif');
  });

  it('refuses HTML or SVG sent with an image content type', () => {
    expect(sniffPhoto(Buffer.from('<svg onload="x()">'))).toBeNull();
    expect(sniffPhoto(Buffer.from('<html><script>'))).toBeNull();
    expect(sniffPhoto(ftyp('isom'))).toBeNull(); // an MP4, not an image
  });
});
