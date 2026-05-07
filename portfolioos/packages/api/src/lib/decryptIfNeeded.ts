import { readFile } from 'node:fs/promises';
import { logger } from './logger.js';
import { readPdfText, isPdfPasswordError, getUserPdfPasswords } from './pdf.js';
import { getSavedDocPasswords } from './userDocPasswords.js';

/**
 * Single entry point every doc-ingestion controller calls before parsing.
 *
 * Responsibilities:
 *   1. Magic-byte sniff (independent of file extension) → reject obvious
 *      junk (.exe disguised as .pdf, archives, video).
 *   2. PDF unlock — delegates to readPdfText with a merged candidate list
 *      (caller-supplied → user's saved passwords → auto-derived PAN/DOB).
 *   3. XLSX unlock — encrypted Office docs use the CFB compound format
 *      (D0 CF 11 E0 magic bytes). Detected here; decryption uses
 *      `office-crypto`. We don't fall through silently — encrypted XLSX
 *      that we can't open returns requiresPassword.
 *
 * Never throws on expected failures. All outcomes are encoded in the
 * discriminated union.
 */

export type FileKind = 'pdf' | 'xlsx_ooxml' | 'xlsx_encrypted' | 'xls' | 'csv' | 'image' | 'office_doc' | 'other' | 'junk';

export type DecryptResult =
  | {
      ok: true;
      kind: FileKind;
      mime: string | null;
      buffer: Buffer;
      /** Extracted text — populated for PDFs and decrypted XLSX (as CSV-like text). */
      text?: string;
      /** Which password unlocked the file. null = file was not encrypted. */
      usedPassword: string | null;
    }
  | {
      ok: false;
      kind: FileKind;
      mime: string | null;
      requiresPassword: true;
      passwordsTried: number;
    }
  | {
      ok: false;
      kind: FileKind;
      mime: string | null;
      requiresPassword: false;
      reason: 'junk_type' | 'scanned_pdf' | 'unreadable';
      detail: string;
    };

export interface DecryptOptions {
  /**
   * Caller-supplied passwords tried first (e.g. password the user typed
   * in the prompt for this specific file). Optional.
   */
  extraPasswords?: string[];
  /**
   * If supplied, the user's auto-derived passwords (PAN/DOB) and saved
   * passwords are merged in too. Skip for surfaces that don't have a
   * known user (rare).
   */
  userId?: string | null;
  /**
   * Allowed top-level kinds for this surface. If supplied and the
   * detected kind is not in the list, returns junk_type.
   * Example: doc-ingestion surfaces use ['pdf', 'xlsx_ooxml',
   * 'xlsx_encrypted', 'xls', 'csv'].
   * Vault accepts a wider set, so it can pass the broader allowlist.
   */
  allowedKinds?: FileKind[];
  /** Original file name — used as fallback for kind detection when magic bytes are inconclusive (e.g. CSV/TSV). */
  fileName?: string;
}

const PDF_MAGIC = Buffer.from('%PDF');
const ZIP_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04]); // OOXML xlsx/docx/pptx
const ZIP_EMPTY = Buffer.from([0x50, 0x4b, 0x05, 0x06]);
const CFB_MAGIC = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]); // legacy .xls + encrypted OOXML
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
const JPEG_MAGIC = Buffer.from([0xff, 0xd8, 0xff]);
const GIF_MAGIC = Buffer.from('GIF8');
const WEBP_RIFF = Buffer.from('RIFF');
const EXE_PE = Buffer.from('MZ');
const ELF_MAGIC = Buffer.from([0x7f, 0x45, 0x4c, 0x46]);
const RAR_MAGIC = Buffer.from('Rar!');
const SEVENZ_MAGIC = Buffer.from([0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c]);
const MP4_FTYP = Buffer.from('ftyp');

interface SniffedKind {
  kind: FileKind;
  mime: string | null;
  /** True when the magic identifies an encrypted Office file. */
  encryptedOffice?: boolean;
}

function startsWith(buf: Buffer, magic: Buffer, offset = 0): boolean {
  if (buf.length < offset + magic.length) return false;
  return buf.compare(magic, 0, magic.length, offset, offset + magic.length) === 0;
}

function isLikelyTextual(buf: Buffer): boolean {
  // Heuristic: <2% non-printable bytes in first 4KB.
  const sample = buf.subarray(0, Math.min(4096, buf.length));
  let bad = 0;
  for (const b of sample) {
    if (b === 0) return false;
    if (b < 7 || (b > 13 && b < 32 && b !== 27)) bad++;
  }
  return bad / Math.max(1, sample.length) < 0.02;
}

function sniff(buf: Buffer, fileName?: string): SniffedKind {
  if (startsWith(buf, PDF_MAGIC)) return { kind: 'pdf', mime: 'application/pdf' };
  if (startsWith(buf, CFB_MAGIC)) {
    // CFB: legacy .xls OR encrypted OOXML. Differentiate by extension hint.
    const lower = (fileName ?? '').toLowerCase();
    if (lower.endsWith('.xlsx') || lower.endsWith('.xlsm')) {
      return {
        kind: 'xlsx_encrypted',
        mime: 'application/vnd.ms-office.encrypted',
        encryptedOffice: true,
      };
    }
    if (lower.endsWith('.docx') || lower.endsWith('.pptx')) {
      return {
        kind: 'office_doc',
        mime: 'application/vnd.ms-office.encrypted',
        encryptedOffice: true,
      };
    }
    return { kind: 'xls', mime: 'application/vnd.ms-excel' };
  }
  if (startsWith(buf, ZIP_MAGIC) || startsWith(buf, ZIP_EMPTY)) {
    const lower = (fileName ?? '').toLowerCase();
    if (lower.endsWith('.xlsx') || lower.endsWith('.xlsm')) {
      return {
        kind: 'xlsx_ooxml',
        mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      };
    }
    if (lower.endsWith('.docx') || lower.endsWith('.pptx') || lower.endsWith('.odt') || lower.endsWith('.ods')) {
      return {
        kind: 'office_doc',
        mime: 'application/vnd.openxmlformats-officedocument',
      };
    }
    // Plain zip (likely junk for ingestion surfaces).
    return { kind: 'junk', mime: 'application/zip' };
  }
  if (startsWith(buf, PNG_MAGIC)) return { kind: 'image', mime: 'image/png' };
  if (startsWith(buf, JPEG_MAGIC)) return { kind: 'image', mime: 'image/jpeg' };
  if (startsWith(buf, GIF_MAGIC)) return { kind: 'image', mime: 'image/gif' };
  if (startsWith(buf, WEBP_RIFF) && buf.length > 12 && buf.subarray(8, 12).toString() === 'WEBP') {
    return { kind: 'image', mime: 'image/webp' };
  }
  if (buf.length > 8 && buf.subarray(4, 8).compare(MP4_FTYP) === 0) {
    return { kind: 'junk', mime: 'video/mp4' };
  }
  if (startsWith(buf, EXE_PE) || startsWith(buf, ELF_MAGIC)) {
    return { kind: 'junk', mime: 'application/octet-stream' };
  }
  if (startsWith(buf, RAR_MAGIC) || startsWith(buf, SEVENZ_MAGIC)) {
    return { kind: 'junk', mime: 'application/x-rar' };
  }
  if (isLikelyTextual(buf)) {
    return { kind: 'csv', mime: 'text/plain' };
  }
  return { kind: 'other', mime: null };
}

async function buildPasswordList(opts: DecryptOptions): Promise<string[]> {
  const seen = new Set<string>();
  const out: string[] = [];
  const push = (p: string | undefined | null) => {
    if (!p) return;
    const t = p.trim();
    if (!t || seen.has(t)) return;
    seen.add(t);
    out.push(t);
  };
  for (const p of opts.extraPasswords ?? []) push(p);
  if (opts.userId) {
    for (const p of await getSavedDocPasswords(opts.userId)) push(p);
    for (const p of await getUserPdfPasswords(opts.userId)) push(p);
  }
  return out;
}

export async function decryptIfNeeded(
  filePathOrBuffer: string | Buffer,
  opts: DecryptOptions = {},
): Promise<DecryptResult> {
  const buffer = Buffer.isBuffer(filePathOrBuffer)
    ? filePathOrBuffer
    : await readFile(filePathOrBuffer);

  const sniffed = sniff(buffer, opts.fileName);
  const allowed = opts.allowedKinds;

  if (sniffed.kind === 'junk') {
    return {
      ok: false,
      kind: 'junk',
      mime: sniffed.mime,
      requiresPassword: false,
      reason: 'junk_type',
      detail: `File type ${sniffed.mime ?? 'unknown'} is not allowed for upload.`,
    };
  }

  if (allowed && !allowed.includes(sniffed.kind)) {
    return {
      ok: false,
      kind: sniffed.kind,
      mime: sniffed.mime,
      requiresPassword: false,
      reason: 'junk_type',
      detail: `Detected file type (${sniffed.mime ?? sniffed.kind}) does not match what this upload accepts.`,
    };
  }

  if (sniffed.kind === 'pdf') {
    const passwords = await buildPasswordList(opts);
    let tempPath: string | null = null;
    try {
      const path = Buffer.isBuffer(filePathOrBuffer)
        ? (tempPath = await writeTempBuffer(buffer))
        : filePathOrBuffer;
      const result = await readPdfText(path, passwords);
      const stripped = result.text.replace(/\s+/g, '');
      if (stripped.length < 50) {
        return {
          ok: false,
          kind: 'pdf',
          mime: sniffed.mime,
          requiresPassword: false,
          reason: 'scanned_pdf',
          detail:
            'This PDF appears to be a scanned image. OCR is not supported yet — please request a text-based PDF or upload a CSV/Excel.',
        };
      }
      return {
        ok: true,
        kind: 'pdf',
        mime: sniffed.mime,
        buffer,
        text: result.text,
        usedPassword: result.usedPassword,
      };
    } catch (err) {
      if (isPdfPasswordError(err)) {
        return {
          ok: false,
          kind: 'pdf',
          mime: sniffed.mime,
          requiresPassword: true,
          passwordsTried: passwords.length,
        };
      }
      logger.warn({ err }, '[decryptIfNeeded] PDF read failed (non-password)');
      return {
        ok: false,
        kind: 'pdf',
        mime: sniffed.mime,
        requiresPassword: false,
        reason: 'unreadable',
        detail: (err as Error).message ?? 'Failed to read PDF',
      };
    } finally {
      if (tempPath) {
        const { unlink } = await import('node:fs/promises');
        // eslint-disable-next-line portfolioos/no-silent-catch -- best-effort cleanup
        try { await unlink(tempPath); } catch { /* ignore */ }
      }
    }
  }

  if (sniffed.kind === 'xlsx_encrypted') {
    // We detect encrypted OOXML files (CFB-wrapped) but can't unlock them
    // server-side — there's no maintained pure-JS library for OOXML
    // decryption. Surface a clear instruction rather than a generic error.
    return {
      ok: false,
      kind: 'xlsx_encrypted',
      mime: sniffed.mime,
      requiresPassword: false,
      reason: 'unreadable',
      detail:
        'This Excel file is password-protected. We can only auto-unlock PDFs. Please open it in Excel/LibreOffice, save a copy without a password (File → Info → Protect → remove password), and upload that copy.',
    };
  }

  return {
    ok: true,
    kind: sniffed.kind,
    mime: sniffed.mime,
    buffer,
    usedPassword: null,
  };
}

// readPdfText takes a path; when callers hand us a buffer we materialise
// it to a temp file so the existing pdfjs path stays unchanged.
async function writeTempBuffer(buf: Buffer): Promise<string> {
  const { writeFile } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const path = join(tmpdir(), `decrypt-${Date.now()}-${Math.random().toString(36).slice(2)}.pdf`);
  await writeFile(path, buf);
  return path;
}
