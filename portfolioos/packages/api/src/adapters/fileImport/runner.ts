import { readFile } from 'node:fs/promises';
import { logger } from '../../lib/logger.js';
import { getUserPdfPasswords, readPdfText, isPdfPasswordError } from '../../lib/pdf.js';
import type { Parser, ParserContext } from '../../services/imports/parsers/types.js';
import { FILE_IMPORT_ADAPTERS, PARSER_OF } from './adapters.js';
import type { FileImportAdapter, FileImportInput, FileImportParseResult } from './types.js';

/**
 * Entry point for the file-import pipeline. Encapsulates the PDF password /
 * scanned-image / no-match user-facing warnings alongside adapter selection
 * and parsing. Returns a typed ParseResult so callers branch on ok/error
 * without string-sniffing — unlocks the DLQ path in Task 8.
 */

async function buildSample(
  ctx: ParserContext,
): Promise<
  | { kind: 'ok'; sample: string | Buffer }
  | { kind: 'pdf-locked'; passwordsTried: number }
  | { kind: 'pdf-scanned' }
> {
  const isPdf = ctx.fileName.toLowerCase().endsWith('.pdf');
  if (!isPdf) {
    try {
      const buf = await readFile(ctx.filePath);
      return { kind: 'ok', sample: buf.subarray(0, 4096).toString('utf8') };
    } catch (err) {
      logger.warn({ err, fileName: ctx.fileName }, '[fileImportRunner] sample read failed');
      return { kind: 'ok', sample: '' };
    }
  }

  const passwords = await getUserPdfPasswords(ctx.userId);
  try {
    const { text } = await readPdfText(ctx.filePath, passwords);
    const stripped = text.replace(/\s+/g, '');
    if (stripped.length < 50) return { kind: 'pdf-scanned' };
    return { kind: 'ok', sample: text };
  } catch (err) {
    if (isPdfPasswordError(err)) {
      return { kind: 'pdf-locked', passwordsTried: passwords.length };
    }
    logger.warn({ err, fileName: ctx.fileName }, '[fileImportRunner] pdf read failed');
    return { kind: 'ok', sample: '' };
  }
}

async function selectAdapter(ctx: ParserContext, sample: string | Buffer): Promise<FileImportAdapter | null> {
  for (const adapter of FILE_IMPORT_ADAPTERS) {
    const underlying: Parser | undefined = PARSER_OF.get(adapter);
    if (!underlying) continue;
    try {
      const ok = await underlying.canHandle(ctx, sample);
      if (ok) return adapter;
    } catch (err) {
      logger.warn({ err, adapter: adapter.id }, '[fileImportRunner] canHandle failed');
    }
  }
  return null;
}

export async function runFileImportAdapter(
  input: FileImportInput,
): Promise<{ adapter: FileImportAdapter | null; result: FileImportParseResult }> {
  const ctx: ParserContext = {
    filePath: input.filePath,
    fileName: input.fileName,
    portfolioId: input.portfolioId,
    userId: input.userId,
  };

  const sample = await buildSample(ctx);

  if (sample.kind === 'pdf-locked') {
    const msg =
      sample.passwordsTried === 0
        ? 'PDF is password-protected. Set your PAN (and date of birth if your statement uses PAN+DOB) in Settings, then re-upload.'
        : 'PDF is password-protected and your saved PAN/DOB did not unlock it. Some statements use non-standard passwords — decrypt the PDF manually and re-upload, or double-check PAN/DOB in Settings.';
    return { adapter: null, result: { ok: true, events: [], warnings: [msg] } };
  }

  if (sample.kind === 'pdf-scanned') {
    return {
      adapter: null,
      result: {
        ok: true,
        events: [],
        warnings: [
          'This PDF contains no extractable text — it looks like a scanned image. OCR for scanned broker/depository statements is not supported yet. Please request a text-based PDF from your broker/DP, or export CSV/Excel if available.',
        ],
      },
    };
  }

  const adapter = await selectAdapter(ctx, sample.sample);
  if (!adapter) {
    logger.warn({ fileName: ctx.fileName }, '[fileImportRunner] no adapter matched');
    return {
      adapter: null,
      result: {
        ok: true,
        events: [],
        warnings: [
          'No parser accepted this file. Supported: CSV, Excel, Zerodha PDF, CAMS/KFintech CAS PDF, NSDL/CDSL depository CAS PDF.',
        ],
      },
    };
  }

  logger.info({ adapter: adapter.id, fileName: ctx.fileName }, '[fileImportRunner] running');
  const result = await adapter.parse(input);
  return { adapter, result };
}

export { FILE_IMPORT_ADAPTERS } from './adapters.js';
export type { FileImportAdapter, FileImportInput, FileImportParseResult, TransactionEvent } from './types.js';
