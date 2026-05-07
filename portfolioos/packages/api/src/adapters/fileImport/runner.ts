import { writeFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { logger } from '../../lib/logger.js';
import { decryptIfNeeded, type FileKind } from '../../lib/decryptIfNeeded.js';
import type { Parser, ParserContext } from '../../services/imports/parsers/types.js';
import { FILE_IMPORT_ADAPTERS, PARSER_OF } from './adapters.js';
import type { FileImportAdapter, FileImportInput, FileImportParseResult } from './types.js';

/**
 * Entry point for the file-import pipeline. Delegates magic-byte sniffing,
 * PDF unlock, and encrypted-XLSX unlock to `decryptIfNeeded`. Returns a
 * typed `ParseResult`:
 *   - locked PDF / XLSX → `{ ok: false, locked: true, ... }` so the import
 *     service can flip the job to NEEDS_PASSWORD instead of FAILED.
 *   - junk file type → `{ ok: false, locked: false, error: ... }` → DLQ.
 *   - scanned PDF / unreadable → ok:true with warning, parser pipeline
 *     short-circuits with empty events (matches prior behaviour).
 */

const DOC_INGESTION_KINDS: FileKind[] = [
  'pdf',
  'xlsx_ooxml',
  'xlsx_encrypted',
  'xls',
  'csv',
];

interface SampleOk {
  kind: 'ok';
  /** Path the parser should read from. May differ from the original file
   *  when an encrypted XLSX was decrypted into a temp file. */
  filePath: string;
  fileName: string;
  /** Cleanup callback for any temp file we materialised. */
  cleanup: (() => Promise<void>) | null;
  sample: string | Buffer;
}

interface SampleLocked {
  kind: 'locked';
  format: 'pdf' | 'xlsx';
  passwordsTried: number;
}

interface SampleScanned {
  kind: 'scanned';
}

interface SampleJunk {
  kind: 'junk';
  detail: string;
}

interface SampleUnreadable {
  kind: 'unreadable';
  detail: string;
}

type SampleResult = SampleOk | SampleLocked | SampleScanned | SampleJunk | SampleUnreadable;

async function buildSample(ctx: ParserContext): Promise<SampleResult> {
  const decrypted = await decryptIfNeeded(ctx.filePath, {
    extraPasswords: ctx.extraPasswords,
    userId: ctx.userId,
    allowedKinds: DOC_INGESTION_KINDS,
    fileName: ctx.fileName,
  });

  if (!decrypted.ok) {
    if (decrypted.requiresPassword) {
      return {
        kind: 'locked',
        format: decrypted.kind === 'xlsx_encrypted' ? 'xlsx' : 'pdf',
        passwordsTried: decrypted.passwordsTried,
      };
    }
    if (decrypted.reason === 'scanned_pdf') return { kind: 'scanned' };
    if (decrypted.reason === 'junk_type') return { kind: 'junk', detail: decrypted.detail };
    return { kind: 'unreadable', detail: decrypted.detail };
  }

  // PDF — text was extracted; pass file path through unchanged.
  if (decrypted.kind === 'pdf' && decrypted.text !== undefined) {
    return {
      kind: 'ok',
      filePath: ctx.filePath,
      fileName: ctx.fileName,
      cleanup: null,
      sample: decrypted.text,
    };
  }

  // XLSX OOXML — pass file path through unchanged. The Excel parser reads
  // the file by path and the buffer is unaltered for non-encrypted .xlsx.
  if (decrypted.kind === 'xlsx_ooxml' || decrypted.kind === 'xls') {
    // If we decrypted an encrypted .xlsx, write the plaintext to a temp
    // file so genericExcel.parser (which reads by path) sees the
    // unencrypted bytes.
    const wasDecrypted = decrypted.usedPassword !== null;
    if (wasDecrypted) {
      const tmpPath = join(
        tmpdir(),
        `unlocked-${Date.now()}-${Math.random().toString(36).slice(2)}.xlsx`,
      );
      await writeFile(tmpPath, decrypted.buffer);
      return {
        kind: 'ok',
        filePath: tmpPath,
        fileName: ctx.fileName,
        // eslint-disable-next-line portfolioos/no-silent-catch -- best-effort cleanup
        cleanup: async () => { try { await unlink(tmpPath); } catch { /* ignore */ } },
        sample: decrypted.buffer.subarray(0, 4096).toString('utf8'),
      };
    }
    return {
      kind: 'ok',
      filePath: ctx.filePath,
      fileName: ctx.fileName,
      cleanup: null,
      sample: decrypted.buffer.subarray(0, 4096).toString('utf8'),
    };
  }

  // CSV / other textual.
  return {
    kind: 'ok',
    filePath: ctx.filePath,
    fileName: ctx.fileName,
    cleanup: null,
    sample: decrypted.buffer.subarray(0, 4096).toString('utf8'),
  };
}

async function selectAdapter(
  ctx: ParserContext,
  sample: string | Buffer,
): Promise<FileImportAdapter | null> {
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
    extraPasswords: input.extraPasswords,
  };

  const sample = await buildSample(ctx);

  if (sample.kind === 'locked') {
    const isXlsx = sample.format === 'xlsx';
    const tried = sample.passwordsTried;
    const msg = isXlsx
      ? tried === 0
        ? 'Excel file is password-protected. Enter the password to unlock and import.'
        : 'Excel file is password-protected and saved passwords did not unlock it. Enter the correct password to retry.'
      : tried === 0
        ? 'PDF is password-protected. Set your PAN (and date of birth if your statement uses PAN+DOB) in Settings, or enter the password directly.'
        : 'PDF is password-protected and saved passwords did not unlock it. Enter the correct password to retry.';
    return {
      adapter: null,
      result: { ok: false, error: msg, locked: true, passwordsTried: tried },
    };
  }

  if (sample.kind === 'scanned') {
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

  if (sample.kind === 'junk') {
    return {
      adapter: null,
      result: { ok: false, error: sample.detail },
    };
  }

  if (sample.kind === 'unreadable') {
    return {
      adapter: null,
      result: { ok: false, error: sample.detail },
    };
  }

  // sample.kind === 'ok' — dispatch to adapter.
  const adapter = await selectAdapter(
    { ...ctx, filePath: sample.filePath, fileName: sample.fileName },
    sample.sample,
  );
  if (!adapter) {
    if (sample.cleanup) await sample.cleanup();
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
  try {
    const result = await adapter.parse({
      ...input,
      filePath: sample.filePath,
      fileName: sample.fileName,
    });
    return { adapter, result };
  } finally {
    if (sample.cleanup) await sample.cleanup();
  }
}

export { FILE_IMPORT_ADAPTERS } from './adapters.js';
export type { FileImportAdapter, FileImportInput, FileImportParseResult, TransactionEvent } from './types.js';
