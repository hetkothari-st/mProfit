import { readFile } from 'node:fs/promises';
import { logger } from '../../../lib/logger.js';
import { getUserPdfPasswords, readPdfText, isPdfPasswordError } from '../../../lib/pdf.js';
import type { Parser, ParserContext, ParserResult } from './types.js';
import { genericCsvParser } from './genericCsv.parser.js';
import { genericExcelParser } from './genericExcel.parser.js';
import { zerodhaContractNoteParser } from './zerodhaContractNote.parser.js';
import { mfCasParser } from './mfCas.parser.js';
import { nsdlCdslCasParser } from './nsdlCdslCas.parser.js';

const REGISTRY: Parser[] = [
  zerodhaContractNoteParser,
  nsdlCdslCasParser,
  mfCasParser,
  genericExcelParser,
  genericCsvParser,
];

async function buildSample(ctx: ParserContext): Promise<
  | { kind: 'ok'; sample: string | Buffer; isPdf: boolean; pdfTextLen?: number }
  | { kind: 'pdf-locked'; passwordsTried: number }
  | { kind: 'pdf-scanned' }
> {
  const isPdf = ctx.fileName.toLowerCase().endsWith('.pdf');
  if (!isPdf) {
    try {
      const buf = await readFile(ctx.filePath);
      return { kind: 'ok', sample: buf.subarray(0, 4096).toString('utf8'), isPdf: false };
    } catch (err) {
      logger.warn({ err, fileName: ctx.fileName }, '[parserRegistry] sample read failed');
      return { kind: 'ok', sample: '', isPdf: false };
    }
  }

  // For PDFs, try to decrypt once upfront so parsers see real text and we can
  // short-circuit with a clear message (password, scanned image, etc).
  const passwords = await getUserPdfPasswords(ctx.userId);
  try {
    const { text } = await readPdfText(ctx.filePath, passwords);
    const stripped = text.replace(/\s+/g, '');
    logger.info(
      { fileName: ctx.fileName, textLen: text.length, nonWsLen: stripped.length },
      '[parserRegistry] pdf decrypted',
    );
    if (stripped.length < 50) {
      // Decrypted but effectively no text — almost certainly a scanned image PDF.
      return { kind: 'pdf-scanned' };
    }
    return { kind: 'ok', sample: text, isPdf: true, pdfTextLen: text.length };
  } catch (err) {
    if (isPdfPasswordError(err)) {
      return { kind: 'pdf-locked', passwordsTried: passwords.length };
    }
    logger.warn({ err, fileName: ctx.fileName }, '[parserRegistry] pdf read failed');
    return { kind: 'ok', sample: '', isPdf: true };
  }
}

export async function selectParser(
  ctx: ParserContext,
  sample: string | Buffer,
): Promise<Parser | null> {
  for (const parser of REGISTRY) {
    try {
      const ok = await parser.canHandle(ctx, sample);
      if (ok) return parser;
    } catch (err) {
      logger.warn({ err, parser: parser.name }, '[parserRegistry] canHandle failed');
    }
  }
  return null;
}

export async function runParser(ctx: ParserContext): Promise<{ parser: string; result: ParserResult }> {
  const sampleResult = await buildSample(ctx);

  if (sampleResult.kind === 'pdf-locked') {
    const msg =
      sampleResult.passwordsTried === 0
        ? 'PDF is password-protected. Set your PAN (and date of birth if your statement uses PAN+DOB) in Settings, then re-upload.'
        : 'PDF is password-protected and your saved PAN/DOB did not unlock it. Some statements use non-standard passwords — decrypt the PDF manually and re-upload, or double-check PAN/DOB in Settings.';
    return {
      parser: 'none',
      result: { transactions: [], warnings: [msg] },
    };
  }

  if (sampleResult.kind === 'pdf-scanned') {
    return {
      parser: 'none',
      result: {
        transactions: [],
        warnings: [
          'This PDF contains no extractable text — it looks like a scanned image. OCR for scanned broker/depository statements is not supported yet. Please request a text-based PDF from your broker/DP, or export CSV/Excel if available.',
        ],
      },
    };
  }

  const parser = await selectParser(ctx, sampleResult.sample);
  if (!parser) {
    logger.warn(
      {
        fileName: ctx.fileName,
        isPdf: sampleResult.isPdf,
        sampleLen: typeof sampleResult.sample === 'string' ? sampleResult.sample.length : 0,
        samplePreview:
          typeof sampleResult.sample === 'string' ? sampleResult.sample.slice(0, 400) : '<binary>',
      },
      '[parserRegistry] no parser matched',
    );
    return {
      parser: 'none',
      result: {
        transactions: [],
        warnings: ['No parser accepted this file. Supported: CSV, Excel, Zerodha PDF, CAMS/KFintech CAS PDF, NSDL/CDSL depository CAS PDF.'],
      },
    };
  }
  logger.info({ parser: parser.name, fileName: ctx.fileName }, '[parserRegistry] running');
  const result = await parser.parse(ctx);
  return { parser: parser.name, result };
}

export { REGISTRY };
export type { Parser, ParserContext, ParserResult } from './types.js';
