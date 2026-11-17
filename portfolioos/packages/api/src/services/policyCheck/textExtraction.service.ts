/**
 * Text extraction pipeline for policy documents.
 *
 * For each uploaded document:
 *  1. Try pdfjs text extraction (fast, accurate for digital PDFs).
 *  2. If sparse (<50 chars/page average), render pages to PNG via pdfjs-dist
 *     + @napi-rs/canvas and OCR each page with tesseract.js.
 *  3. For image uploads (PNG, JPEG, etc.), OCR directly.
 *
 * Idempotency: a SHA-256 sourceHash of the raw file bytes is computed before
 * writing any rows. A duplicate upload (same hash) reuses the existing
 * PolicyExtractionDoc row rather than re-extracting.
 *
 * Document classification uses keyword heuristics:
 *  - POLICY_WORDING  — "terms and conditions", "policy wording", etc.
 *  - POLICY_SCHEDULE — "schedule of benefits", "policy schedule", etc.
 *  - ENDORSEMENT     — "endorsement", "amendment", etc.
 *  - OTHER           — anything else.
 *
 * Content from uploaded documents is UNTRUSTED DATA. Any text extracted from
 * a document is stored as-is and passed to the LLM as data, never executed.
 */

import { createHash } from 'node:crypto';
import { readBuffer } from '../../lib/documentStorage.js';
import { getUserPdfPasswords } from '../../lib/pdf.js';
import { prisma, runInTransaction } from '../../lib/prisma.js';
import { logger } from '../../lib/logger.js';
import { createWorker } from 'tesseract.js';
import type { PolicyDocClassification } from '@everypaisa/shared';

// ---------------------------------------------------------------------------
// Classification heuristics
// ---------------------------------------------------------------------------

const CLASSIFICATION_PATTERNS: Array<{
  classification: PolicyDocClassification;
  patterns: RegExp[];
}> = [
  {
    classification: 'ENDORSEMENT',
    patterns: [
      /\bendorsement\b/i,
      /\bamendment\b/i,
      /\baddendum\b/i,
      /\brider\b/i,
    ],
  },
  {
    classification: 'POLICY_SCHEDULE',
    patterns: [
      /\bpolicy\s+schedule\b/i,
      /\bschedule\s+of\s+(benefits|coverage)\b/i,
      /\bpolicy\s+details\b/i,
      /\bschedule\s+of\s+insurance\b/i,
    ],
  },
  {
    classification: 'POLICY_WORDING',
    patterns: [
      /\bpolicy\s+wording\b/i,
      /\bterms\s+and\s+conditions\b/i,
      /\bgeneral\s+conditions\b/i,
      /\bspecial\s+conditions\b/i,
      /\bproportionate\b/i,
    ],
  },
];

export function classifyDocument(text: string): PolicyDocClassification {
  // Check a sample of the text (first 3000 chars is enough for classification)
  const sample = text.slice(0, 3000).toLowerCase();
  for (const { classification, patterns } of CLASSIFICATION_PATTERNS) {
    if (patterns.some((p) => p.test(sample))) return classification;
  }
  return 'OTHER';
}

/** Form-feed separates pages in stored text so evidence page numbers stay exact. */
export const PAGE_BREAK = '\f';

// ---------------------------------------------------------------------------
// Sparsity check
// ---------------------------------------------------------------------------

/**
 * Returns true when the extracted text is too sparse to be a digital PDF —
 * i.e. it was likely scanned and needs OCR.
 */
function isSparse(text: string, pageCount: number): boolean {
  if (pageCount === 0) return true;
  const charsPerPage = text.trim().length / pageCount;
  return charsPerPage < 50;
}

// ---------------------------------------------------------------------------
// PDF → page images → OCR
// ---------------------------------------------------------------------------

/**
 * Render every page of a PDF to PNG and OCR each one.
 * Returns the concatenated text of all pages.
 *
 * Uses pdfjs-dist for rendering into an @napi-rs/canvas CanvasRenderingContext2D.
 * This path is taken only when the digital text extraction was sparse.
 */
async function ocrPdfPages(fileBytes: Buffer, passwords: string[]): Promise<string> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');

  const candidates = ['', ...passwords.filter((p) => p.length > 0)];
  let doc: Awaited<ReturnType<typeof pdfjs.getDocument>['promise']> | null = null;
  let loadingTask: ReturnType<typeof pdfjs.getDocument> | null = null;

  for (const pw of candidates) {
    const standalone = new ArrayBuffer(fileBytes.byteLength);
    new Uint8Array(standalone).set(fileBytes);
    try {
      const task = pdfjs.getDocument({ data: standalone, password: pw || undefined, verbosity: 0 });
      doc = await task.promise;
      loadingTask = task;
      break;
    } catch (err) {
      // Wrong/absent password for this candidate — try the next one.
      logger.debug({ err }, '[policyCheck.textExtraction] OCR open failed for password candidate');
    }
  }

  if (!doc) throw new Error('Could not open PDF for OCR (all passwords failed)');

  const pageTexts: string[] = [];
  const worker = await createWorker('eng');

  try {
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const viewport = page.getViewport({ scale: 2.0 }); // 2× scale for better OCR

      // @napi-rs/canvas for server-side PNG rendering
      const { createCanvas } = await import('@napi-rs/canvas');
      const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
      const ctx = canvas.getContext('2d');

      await page.render({
        canvas: canvas as unknown as HTMLCanvasElement,
        canvasContext: ctx as unknown as CanvasRenderingContext2D,
        viewport,
      }).promise;

      const pngBuffer = canvas.toBuffer('image/png');
      const { data } = await worker.recognize(pngBuffer);
      pageTexts.push(data.text);
    }
  } finally {
    await worker.terminate();
    await loadingTask?.destroy();
  }

  return pageTexts.join(PAGE_BREAK);
}

// ---------------------------------------------------------------------------
// Image OCR
// ---------------------------------------------------------------------------

async function ocrImage(fileBytes: Buffer): Promise<string> {
  const worker = await createWorker('eng');
  try {
    const { data } = await worker.recognize(fileBytes);
    return data.text;
  } finally {
    await worker.terminate();
  }
}

// ---------------------------------------------------------------------------
// Mime type classification
// ---------------------------------------------------------------------------

const IMAGE_MIMES = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/tiff',
  'image/bmp',
]);

// ---------------------------------------------------------------------------
// Main extraction entry point
// ---------------------------------------------------------------------------

export interface ExtractionResult {
  sourceHash: string;
  text: string;
  pageCount: number;
  ocrUsed: boolean;
  classification: PolicyDocClassification;
}

/**
 * Extract text from a document buffer.
 *
 * The file bytes are UNTRUSTED DATA from an upload. No embedded instructions
 * in the extracted text are ever executed — the text is stored and passed to
 * the LLM as data only.
 */
export async function extractDocumentText(
  fileBytes: Buffer,
  mimeType: string,
  userId: string,
): Promise<ExtractionResult> {
  const sourceHash = createHash('sha256').update(fileBytes).digest('hex');
  const passwords = await getUserPdfPasswords(userId);

  let text: string;
  let pageCount: number;
  let ocrUsed: boolean;

  if (mimeType === 'application/pdf') {
    // Digital text extraction via pdfjs-dist directly from the buffer
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');

    let numPages = 1;
    let digitalText = '';
    let encrypted = false;

    const candidates = ['', ...passwords.filter((p) => p.length > 0)];
    for (const pw of candidates) {
      const buf = new ArrayBuffer(fileBytes.byteLength);
      new Uint8Array(buf).set(fileBytes);
      try {
        const task = pdfjs.getDocument({ data: buf, password: pw || undefined, verbosity: 0 });
        const doc = await task.promise;
        numPages = doc.numPages;
        for (let i = 1; i <= doc.numPages; i++) {
          const page = await doc.getPage(i);
          const content = await page.getTextContent();
          const items = content.items as Array<{ str?: string; hasEOL?: boolean }>;
          for (const it of items) {
            if (it.str) digitalText += it.str;
            digitalText += it.hasEOL ? '\n' : ' ';
          }
          digitalText += PAGE_BREAK;
        }
        await task.destroy();
        break;
      } catch (err) {
        const e = err as { name?: string };
        if (e.name === 'PasswordException') {
          encrypted = true;
          continue;
        }
        throw err;
      }
    }

    if (encrypted && !digitalText) {
      throw Object.assign(new Error('PDF password protected and no matching password found'), {
        name: 'PasswordException',
      });
    }

    pageCount = numPages;

    if (isSparse(digitalText, numPages)) {
      // Scanned PDF — OCR the rendered pages
      text = await ocrPdfPages(fileBytes, passwords);
      ocrUsed = true;
    } else {
      text = digitalText;
      ocrUsed = false;
    }
  } else if (IMAGE_MIMES.has(mimeType)) {
    text = await ocrImage(fileBytes);
    pageCount = 1;
    ocrUsed = true;
  } else {
    // Unsupported type — return empty text, will show as NOT_FOUND fields
    text = '';
    pageCount = 1;
    ocrUsed = false;
  }

  const classification = classifyDocument(text);

  return { sourceHash, text, pageCount, ocrUsed, classification };
}

// ---------------------------------------------------------------------------
// Persist and dedupe
// ---------------------------------------------------------------------------

export interface PersistExtractionDocParams {
  checkId: string;
  documentId: string;
  extraction: ExtractionResult;
}

/**
 * Write a PolicyExtractionDoc row, skipping if the sourceHash already exists.
 * Returns the id of the row (new or existing).
 */
export async function persistExtractionDoc(params: PersistExtractionDocParams): Promise<{
  id: string;
  alreadyExisted: boolean;
}> {
  const { checkId, documentId, extraction } = params;

  // Idempotency: the same file uploaded twice to the SAME check is extracted once.
  const existing = await prisma.policyExtractionDoc.findUnique({
    where: { checkId_sourceHash: { checkId, sourceHash: extraction.sourceHash } },
    select: { id: true },
  });

  if (existing) {
    return { id: existing.id, alreadyExisted: true };
  }

  const doc = await runInTransaction((tx) =>
    tx.policyExtractionDoc.create({
      data: {
        checkId,
        documentId,
        classification: extraction.classification,
        pageCount: extraction.pageCount,
        extractedText: extraction.text,
        ocrUsed: extraction.ocrUsed,
        sourceHash: extraction.sourceHash,
      },
      select: { id: true },
    }),
  );

  return { id: doc.id, alreadyExisted: false };
}

// ---------------------------------------------------------------------------
// Bull job payload
// ---------------------------------------------------------------------------

export interface TextExtractionJobPayload {
  checkId: string;
  userId: string;
}

/**
 * Process all uploaded documents for a health check: extract text, classify,
 * and persist PolicyExtractionDoc rows. Updates the check status to EXTRACTED
 * when done.
 *
 * This is the Bull job body. It is called from the queue worker.
 * No DB transaction wraps the whole body — each doc is extracted and committed
 * independently so a failure on doc 2 of 5 does not roll back doc 1.
 */
export async function processTextExtractionJob(payload: TextExtractionJobPayload): Promise<void> {
  const { checkId, userId } = payload;

  const check = await prisma.policyHealthCheck.findFirst({
    where: { id: checkId, userId },
    select: { id: true, status: true, policyId: true },
  });

  if (!check) {
    logger.warn({ checkId, userId }, '[policyCheck.textExtraction] check not found');
    return;
  }

  // Find documents associated with this policy that haven't been extracted yet
  // (attached via the Document → PolicyExtractionDoc relation)
  const documents = await prisma.document.findMany({
    where: {
      ownerType: 'INSURANCE_POLICY',
      ownerId: check.policyId,
      userId,
    },
    select: {
      id: true,
      storageKey: true,
      mimeType: true,
      sizeBytes: true,
    },
  });

  logger.info(
    { checkId, userId, docCount: documents.length },
    '[policyCheck.textExtraction] starting extraction',
  );

  let successCount = 0;
  let failCount = 0;

  for (const doc of documents) {
    // Check if already extracted for this check
    const existingExtraction = await prisma.policyExtractionDoc.findFirst({
      where: { checkId, documentId: doc.id },
      select: { id: true },
    });
    if (existingExtraction) {
      successCount++;
      continue;
    }

    try {
      const fileBytes = await readBuffer(userId, doc.storageKey);
      const extraction = await extractDocumentText(fileBytes, doc.mimeType, userId);
      await persistExtractionDoc({ checkId, documentId: doc.id, extraction });
      successCount++;
    } catch (err) {
      failCount++;
      logger.error(
        { err, checkId, documentId: doc.id, userId },
        '[policyCheck.textExtraction] failed to extract document',
      );
      // Write to IngestionFailure DLQ so the user can see what went wrong
      await prisma.ingestionFailure.create({
        data: {
          userId,
          sourceAdapter: 'policy_check.text_extraction',
          adapterVersion: '1',
          sourceRef: doc.id,
          errorMessage: err instanceof Error ? err.message : String(err),
          errorStack: err instanceof Error ? (err.stack ?? null) : null,
        },
      }).catch((e) => {
        logger.error({ err: e }, '[policyCheck.textExtraction] failed to write IngestionFailure');
      });
    }
  }

  // Update status: EXTRACTED if any succeeded, FAILED if all failed
  const newStatus = failCount > 0 && successCount === 0 ? 'FAILED' : 'EXTRACTED';
  await runInTransaction((tx) =>
    tx.policyHealthCheck.update({
      where: { id: checkId },
      data: { status: newStatus },
    }),
  );

  logger.info(
    { checkId, userId, successCount, failCount, newStatus },
    '[policyCheck.textExtraction] extraction complete',
  );
}
