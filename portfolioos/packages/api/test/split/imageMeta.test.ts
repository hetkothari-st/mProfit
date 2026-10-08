import { describe, it, expect } from 'vitest';
import { detectReceiptKind, stripImageMetadata } from '../../src/services/split/imageMeta.js';

// Minimal JPEG: SOI, APP0 JFIF, APP1 Exif (with GPS marker text), SOS stub, EOI
function jpegWithExif(): Buffer {
  const app0 = Buffer.from([0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00]);
  const exifPayload = Buffer.concat([Buffer.from('Exif\0\0'), Buffer.from('GPSLatitude=19.07')]);
  const app1 = Buffer.concat([Buffer.from([0xff, 0xe1]), Buffer.from([0x00, exifPayload.length + 2]), exifPayload]);
  const sos = Buffer.from([0xff, 0xda, 0x00, 0x02, 0x11, 0x22, 0x33]);
  return Buffer.concat([Buffer.from([0xff, 0xd8]), app0, app1, sos, Buffer.from([0xff, 0xd9])]);
}

function pngWithText(): Buffer {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    return Buffer.concat([len, Buffer.from(type, 'ascii'), data, Buffer.alloc(4)]); // CRC unchecked by stripper
  };
  return Buffer.concat([sig, chunk('IHDR', Buffer.alloc(13)), chunk('tEXt', Buffer.from('Author\0Secret')), chunk('IDAT', Buffer.from([1, 2, 3])), chunk('IEND', Buffer.alloc(0))]);
}

describe('imageMeta', () => {
  it('detects kinds by magic bytes', () => {
    expect(detectReceiptKind(jpegWithExif())).toBe('image/jpeg');
    expect(detectReceiptKind(pngWithText())).toBe('image/png');
    expect(detectReceiptKind(Buffer.from('%PDF-1.7\n'))).toBe('application/pdf');
    expect(detectReceiptKind(Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBPVP8 ')]))).toBe('image/webp');
    expect(detectReceiptKind(Buffer.from('MZ\x90\x00'))).toBeNull();
  });

  it('strips JPEG EXIF but keeps JFIF and image data', () => {
    const out = stripImageMetadata(jpegWithExif(), 'image/jpeg');
    expect(out.includes(Buffer.from('GPSLatitude'))).toBe(false);
    expect(out.includes(Buffer.from('JFIF'))).toBe(true);
    expect(out.subarray(-2)).toEqual(Buffer.from([0xff, 0xd9]));
  });

  it('strips PNG text chunks', () => {
    const out = stripImageMetadata(pngWithText(), 'image/png');
    expect(out.includes(Buffer.from('Secret'))).toBe(false);
    expect(out.includes(Buffer.from('IDAT'))).toBe(true);
  });

  it('leaves PDFs alone', () => {
    const pdf = Buffer.from('%PDF-1.7\nhello');
    expect(stripImageMetadata(pdf, 'application/pdf')).toEqual(pdf);
  });
});
