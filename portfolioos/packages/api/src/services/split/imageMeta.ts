// packages/api/src/services/split/imageMeta.ts
/**
 * Receipt type detection and metadata stripping without native image
 * libraries. We only remove whole metadata segments/chunks; pixel data is
 * never re-encoded, so a malformed file stays exactly as malformed as it was.
 */
export type ReceiptKind = 'image/jpeg' | 'image/png' | 'image/webp' | 'application/pdf';

export function detectReceiptKind(buf: Buffer): ReceiptKind | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  if (buf.length >= 5 && buf.toString('ascii', 0, 5) === '%PDF-') return 'application/pdf';
  return null;
}

function stripJpeg(buf: Buffer): Buffer {
  const out: Buffer[] = [buf.subarray(0, 2)];
  let i = 2;
  while (i + 4 <= buf.length) {
    if (buf[i] !== 0xff) return buf; // not a marker where one is expected: leave file untouched
    const marker = buf[i + 1]!;
    if (marker === 0xda) { out.push(buf.subarray(i)); return Buffer.concat(out); } // SOS: rest is image data
    const len = buf.readUInt16BE(i + 2);
    const end = i + 2 + len;
    if (end > buf.length) return buf;
    const drop = (marker >= 0xe1 && marker <= 0xef) || marker === 0xfe; // APP1..APP15, COM
    if (!drop) out.push(buf.subarray(i, end));
    i = end;
  }
  return buf;
}

const PNG_DROP = new Set(['tEXt', 'iTXt', 'zTXt', 'eXIf', 'tIME']);
function stripPng(buf: Buffer): Buffer {
  const out: Buffer[] = [buf.subarray(0, 8)];
  let i = 8;
  while (i + 12 <= buf.length) {
    const len = buf.readUInt32BE(i);
    const type = buf.toString('ascii', i + 4, i + 8);
    const end = i + 12 + len;
    if (end > buf.length) return buf;
    if (!PNG_DROP.has(type)) out.push(buf.subarray(i, end));
    i = end;
    if (type === 'IEND') break;
  }
  return Buffer.concat(out);
}

// Note: the VP8X EXIF/XMP flag bits are not cleared; decoders ignore a set
// flag when the chunk is absent.
function stripWebp(buf: Buffer): Buffer {
  const chunks: Buffer[] = [];
  let i = 12;
  while (i + 8 <= buf.length) {
    const type = buf.toString('ascii', i, i + 4);
    const len = buf.readUInt32LE(i + 4);
    const end = i + 8 + len + (len % 2);
    if (end > buf.length) return buf;
    if (type !== 'EXIF' && type !== 'XMP ') chunks.push(buf.subarray(i, end));
    i = end;
  }
  const body = Buffer.concat(chunks);
  const header = Buffer.from(buf.subarray(0, 12));
  header.writeUInt32LE(body.length + 4, 4);
  return Buffer.concat([header, body]);
}

export function stripImageMetadata(buf: Buffer, kind: ReceiptKind): Buffer {
  switch (kind) {
    case 'image/jpeg': return stripJpeg(buf);
    case 'image/png': return stripPng(buf);
    case 'image/webp': return stripWebp(buf);
    case 'application/pdf': return buf;
  }
}
