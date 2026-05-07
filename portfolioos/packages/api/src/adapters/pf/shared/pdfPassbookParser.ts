/**
 * Shared PDF passbook tokenizer for PF adapters (EPFO, NPS, etc.).
 *
 * Uses pdfjs-dist (already a project dependency) rather than pdf-parse, because
 * pdf-parse ships a bundled pdf.js v1.10.100 that cannot parse XRef streams
 * produced by modern PDF writers (including pdfkit ≥ 0.13).
 */

export interface PassbookTokens {
  pageCount: number;
  rawText: string;
  lines: string[];
}

/**
 * Build PassbookTokens from already-extracted text. Used when the caller
 * has already run the bytes through `decryptIfNeeded` (e.g. to handle a
 * password-protected EPFO passbook) and has the rawText in hand.
 */
export function tokenizePassbookText(rawText: string, pageCount = 1): PassbookTokens {
  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter((l) => l.length > 0);
  return { pageCount, rawText, lines };
}

export async function tokenizePassbookPdf(buf: Buffer): Promise<PassbookTokens> {
  if (buf.length === 0) {
    throw new Error('Empty PDF buffer');
  }

  // pdfjs-dist internally calls structuredClone with buffer transfer, so we
  // must pass a standalone ArrayBuffer — not the shared pool-backed one that
  // Node's Buffer uses. (Same pattern as src/lib/pdf.ts.)
  const standalone = new ArrayBuffer(buf.byteLength);
  new Uint8Array(standalone).set(buf);

  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const loadingTask = pdfjs.getDocument({ data: standalone, verbosity: 0 });
  const doc = await loadingTask.promise;

  let rawText = '';
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const items = content.items as Array<{ str?: string; hasEOL?: boolean }>;
    for (const it of items) {
      if (it.str) rawText += it.str;
      rawText += it.hasEOL ? '\n' : ' ';
    }
    rawText += '\n';
  }

  await doc.cleanup();
  await doc.destroy();

  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter((l) => l.length > 0);

  return {
    pageCount: doc.numPages,
    rawText,
    lines,
  };
}
