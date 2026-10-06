import type { FileKind } from './decryptIfNeeded.js';

/**
 * Canonical Content-Type for a document, derived from its VERIFIED bytes.
 *
 * The vault used to persist `req.file.mimetype` — a value the uploading
 * client chooses freely — and then echo it back as the Content-Type on
 * download. A magic-byte probe ran on upload but its result was discarded.
 *
 * That combination was enough for stored XSS with full session theft: upload
 * HTML bytes, name the file `statement.pdf`, declare `Content-Type:
 * text/html`. The extension allow-list passed on the name, the sniff
 * classified the bytes as textual (an accepted kind), and the spoofed type was
 * stored. On preview the SPA fetched the blob, the browser took `text/html`
 * from the response header, and an unsandboxed `<iframe src={blobURL}>`
 * executed it same-origin with the app — where the access and refresh tokens
 * live in localStorage.
 *
 * Mapping through the detected kind closes that at the source: an attacker
 * controls the bytes, but the bytes decide the type, and no input maps to a
 * scriptable type.
 */
const MIME_BY_KIND: Record<FileKind, string> = {
  pdf: 'application/pdf',
  xlsx_ooxml: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xlsx_encrypted: 'application/vnd.ms-office.encrypted',
  xls: 'application/vnd.ms-excel',
  csv: 'text/plain',
  image: 'image/png',
  office_doc: 'application/octet-stream',
  other: 'application/octet-stream',
  junk: 'application/octet-stream',
};

/**
 * Types the browser may render inline. Deliberately tiny: PDFs and raster
 * images only.
 *
 * SVG is absent on purpose — it is an XML document that can carry script, so
 * an inline SVG is an XSS vector wearing an image's clothes.
 */
const INLINE_SAFE = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
]);

/**
 * The Content-Type to persist for an uploaded document.
 *
 * `sniffedMime` (when the probe produced one) is preferred because it is more
 * specific than the per-kind default — e.g. image/jpeg rather than image/png —
 * but it is only trusted when it is itself a known-safe value, so a future
 * sniffer change cannot reintroduce a scriptable type.
 */
export function storedMimeFor(kind: FileKind, sniffedMime: string | null): string {
  if (sniffedMime && INLINE_SAFE.has(sniffedMime)) return sniffedMime;
  return MIME_BY_KIND[kind] ?? 'application/octet-stream';
}

export function isInlineSafeMime(mime: string): boolean {
  return INLINE_SAFE.has(mime);
}

/**
 * Headers for serving stored bytes.
 *
 * Anything outside the inline allow-list is forced to download rather than
 * render, and `nosniff` stops the browser second-guessing the declared type.
 */
export function downloadHeaders(mime: string, fileName: string): Record<string, string> {
  const disposition = isInlineSafeMime(mime) ? 'inline' : 'attachment';
  return {
    'Content-Type': mime,
    'X-Content-Type-Options': 'nosniff',
    'Content-Disposition': `${disposition}; filename*=UTF-8''${encodeURIComponent(fileName)}`,
  };
}
