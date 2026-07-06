import { readFile } from 'node:fs/promises';
import { sniff, type FileKind } from './decryptIfNeeded.js';

/**
 * A claimed extension can lie about what's actually on disk. This maps each
 * extension this app accepts to the FileKind(s) that decryptIfNeeded's
 * sniff() is allowed to report for it. Plain-text formats (csv/tsv/html)
 * share the 'csv' sniff kind — there's no reliable magic signature to tell
 * them apart from raw text, so the check for those falls back to the
 * textual/non-binary heuristic already inside sniff().
 */
const EXT_TO_ALLOWED_KINDS: Record<string, FileKind[]> = {
  '.pdf': ['pdf'],
  '.xlsx': ['xlsx_ooxml', 'xlsx_encrypted'],
  '.xls': ['xls'],
  '.csv': ['csv'],
  '.tsv': ['csv'],
  '.html': ['csv'],
  '.htm': ['csv'],
};

export interface UploadVerificationResult {
  ok: boolean;
  detectedKind: FileKind;
  detectedMime: string | null;
  detail?: string;
}

/**
 * Verifies a just-written upload's actual bytes match its claimed extension.
 * Rejects e.g. a plain-text file renamed to `.pdf`, or a real `.xlsx`
 * renamed to `.csv` — cases a plain extension allowlist never catches.
 */
export async function verifyUploadedFile(
  filePath: string,
  claimedExt: string,
): Promise<UploadVerificationResult> {
  const ext = claimedExt.toLowerCase();
  const expectedKinds = EXT_TO_ALLOWED_KINDS[ext];
  const buffer = await readFile(filePath);
  // Pass a synthetic filename carrying just the claimed extension — sniff()
  // only uses it to disambiguate zip/CFB containers (xlsx vs docx vs xls),
  // and we don't want it influenced by multer's on-disk naming scheme.
  const sniffed = sniff(buffer, `probe${ext}`);

  if (!expectedKinds || !expectedKinds.includes(sniffed.kind)) {
    return {
      ok: false,
      detectedKind: sniffed.kind,
      detectedMime: sniffed.mime,
      detail: `Uploaded file content does not match its "${ext}" extension (detected: ${sniffed.mime ?? sniffed.kind}).`,
    };
  }
  return { ok: true, detectedKind: sniffed.kind, detectedMime: sniffed.mime };
}
