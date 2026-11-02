/**
 * How to show a file the user did not necessarily create (an email
 * attachment, a document shared by family or a CA) inside the app.
 *
 * A `blob:` URL inherits this page's origin. Rendering one typed `text/html`
 * or `image/svg+xml` in an ordinary iframe runs its scripts as the app, with
 * the session token in reach — so anyone who could get an HTML "contract note"
 * into a user's inbox could take over the account the moment it was previewed.
 *
 * The type is decided from the bytes, never from what the sender declared:
 *   - a real PDF renders in a plain iframe (browsers refuse to draw PDFs in a
 *     sandboxed one, and the PDF viewer does not run page script as the app);
 *   - HTML and plain text render in an iframe with `sandbox=""` — no scripts,
 *     an opaque origin, no navigation of the app;
 *   - a real JPEG, PNG, GIF, WEBP or BMP renders in an <img>, which never runs
 *     script. SVG is not among them: it is markup, not an image format;
 *   - anything else is download-only.
 */
export type PreviewMode = 'pdf' | 'image' | 'sandboxed' | 'none';

export interface SafePreview {
  mode: PreviewMode;
  /** The blob to point the iframe at, retyped to match `mode`. */
  blob: Blob | null;
}

const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46]; // %PDF

export function isPdfBytes(bytes: Uint8Array): boolean {
  // The PDF spec allows junk before the header; readers accept it within 1 KB.
  const limit = Math.min(bytes.length - PDF_MAGIC.length, 1024);
  for (let i = 0; i <= limit; i++) {
    if (PDF_MAGIC.every((b, j) => bytes[i + j] === b)) return true;
  }
  return false;
}

const startsWith = (bytes: Uint8Array, sig: number[], at = 0) =>
  bytes.length >= at + sig.length && sig.every((b, i) => bytes[at + i] === b);
const ascii = (s: string) => Array.from(s, (c) => c.charCodeAt(0));

/** The image type the bytes really are, or null. Signatures, not names. */
export function imageTypeOf(bytes: Uint8Array): string | null {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (startsWith(bytes, ascii('GIF87a')) || startsWith(bytes, ascii('GIF89a'))) return 'image/gif';
  if (startsWith(bytes, ascii('RIFF')) && startsWith(bytes, ascii('WEBP'), 8)) return 'image/webp';
  // "BM" alone is weak; a real file header is 14 bytes plus a >= 12-byte
  // info header, with four reserved zero bytes at offset 6.
  if (startsWith(bytes, ascii('BM')) && bytes.length >= 26 && startsWith(bytes, [0, 0, 0, 0], 6)) return 'image/bmp';
  return null;
}

function isTextLike(declaredMime: string, fileName: string): boolean {
  return (
    /^text\/(html|plain|csv|tab-separated-values)\b/i.test(declaredMime) ||
    /\.(html?|txt|csv|tsv)$/i.test(fileName)
  );
}

export function classifyPreview(data: ArrayBuffer, declaredMime: string, fileName: string): SafePreview {
  const bytes = new Uint8Array(data);
  if (isPdfBytes(bytes)) {
    return { mode: 'pdf', blob: new Blob([data], { type: 'application/pdf' }) };
  }
  const image = imageTypeOf(bytes);
  if (image) {
    return { mode: 'image', blob: new Blob([data], { type: image }) };
  }
  if (isTextLike(declaredMime, fileName)) {
    // Shown as HTML only inside the sandbox; the type is fixed here so a
    // declared `image/svg+xml` or `application/xhtml+xml` cannot slip through.
    const html = /html?$/i.test(fileName) || /html/i.test(declaredMime);
    return { mode: 'sandboxed', blob: new Blob([data], { type: html ? 'text/html' : 'text/plain' }) };
  }
  return { mode: 'none', blob: null };
}
