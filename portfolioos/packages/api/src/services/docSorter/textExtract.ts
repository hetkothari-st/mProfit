import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readPdfText, isPdfPasswordError } from '../../lib/pdf.js';
import { sniff } from '../../lib/decryptIfNeeded.js';
import { logger } from '../../lib/logger.js';

/**
 * Local text extraction for the Documents sorter: pdfjs text layer first, OCR
 * (tesseract.js, on this server — nothing leaves it) for scans and photos.
 * Never throws for bad input: every failure is a typed result the caller turns
 * into a review state, so a file is never lost.
 */

/** OCR at most this many pages of a scanned PDF; the name/type/date are on the first pages. */
export const OCR_MAX_PAGES = 3;
/** A text layer shorter than this is treated as "no text": the PDF is a scan. */
export const MIN_TEXT_CHARS = 40;

export type ExtractResult =
  | { ok: true; text: string; method: 'pdf-text' | 'ocr' }
  | { ok: false; reason: 'password' | 'unreadable' | 'unsupported' };

async function ocrImage(buf: Buffer): Promise<string> {
  const { createWorker } = await import('tesseract.js');
  const worker = await createWorker('eng');
  try {
    const { data } = await worker.recognize(buf);
    return data.text;
  } finally {
    await worker.terminate();
  }
}

async function heicToJpeg(buf: Buffer): Promise<Buffer> {
  const convert = (await import('heic-convert')).default;
  return Buffer.from(await convert({ buffer: buf, format: 'JPEG', quality: 0.9 }));
}

async function ocrPdfPages(buf: Buffer): Promise<string> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const { createCanvas } = await import('@napi-rs/canvas');
  const task = pdfjs.getDocument({ data: new Uint8Array(buf), useSystemFonts: true });
  try {
    const doc = await task.promise;
    const pages = Math.min(doc.numPages, OCR_MAX_PAGES);
    let text = '';
    for (let n = 1; n <= pages; n++) {
      const page = await doc.getPage(n);
      const viewport = page.getViewport({ scale: 2 });
      const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
      // pdfjs types want a DOM canvas; @napi-rs/canvas is API-compatible.
      await page.render({ canvas: canvas as never, viewport }).promise;
      text += `\n${await ocrImage(canvas.toBuffer('image/png'))}`;
    }
    return text;
  } finally {
    await task.destroy();
  }
}

export async function extractText(input: {
  buffer: Buffer;
  fileName: string;
  passwords: string[];
}): Promise<ExtractResult> {
  const kind = sniff(input.buffer, input.fileName).kind;

  if (kind === 'image') {
    try {
      const isHeic = /\.hei[cf]$/i.test(input.fileName);
      const text = await ocrImage(isHeic ? await heicToJpeg(input.buffer) : input.buffer);
      return text.trim().length > 0 ? { ok: true, text, method: 'ocr' } : { ok: false, reason: 'unreadable' };
    } catch (err) {
      logger.warn({ err }, '[docSorter] image OCR failed');
      return { ok: false, reason: 'unreadable' };
    }
  }

  if (kind !== 'pdf') return { ok: false, reason: 'unsupported' };

  const dir = await mkdtemp(join(tmpdir(), 'docsort-'));
  const path = join(dir, 'in.pdf');
  try {
    await writeFile(path, input.buffer);
    const r = await readPdfText(path, input.passwords);
    if (r.text.trim().length >= MIN_TEXT_CHARS) return { ok: true, text: r.text, method: 'pdf-text' };
    const ocr = await ocrPdfPages(input.buffer);
    return ocr.trim().length > 0 ? { ok: true, text: ocr, method: 'ocr' } : { ok: false, reason: 'unreadable' };
  } catch (err) {
    if (isPdfPasswordError(err)) return { ok: false, reason: 'password' };
    logger.warn({ err }, '[docSorter] pdf extraction failed');
    return { ok: false, reason: 'unreadable' };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
