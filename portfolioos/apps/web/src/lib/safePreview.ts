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
 *   - anything else is download-only.
 */
export type PreviewMode = 'pdf' | 'sandboxed' | 'none';

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
  if (isTextLike(declaredMime, fileName)) {
    // Shown as HTML only inside the sandbox; the type is fixed here so a
    // declared `image/svg+xml` or `application/xhtml+xml` cannot slip through.
    const html = /html?$/i.test(fileName) || /html/i.test(declaredMime);
    return { mode: 'sandboxed', blob: new Blob([data], { type: html ? 'text/html' : 'text/plain' }) };
  }
  return { mode: 'none', blob: null };
}
