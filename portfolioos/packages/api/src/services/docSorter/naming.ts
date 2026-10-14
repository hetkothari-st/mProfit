import { DOC_TYPE_LABEL, type SortDocType } from '@everypaisa/shared';

/** Pure file-naming for the Documents sorter: "<Type label>_<date>.<ext>". */

const SAFE_EXT = new Set([
  '.pdf', '.png', '.jpg', '.jpeg', '.heic', '.webp', '.tiff', '.bmp', '.gif',
  '.docx', '.doc', '.xlsx', '.xls', '.csv', '.txt',
]);

/** Extension from an untrusted file name; anything off the allowlist becomes "". */
export function safeExt(originalName: string): string {
  const base = originalName.split(/[\\/]/).pop() ?? '';
  const dot = base.lastIndexOf('.');
  const ext = dot >= 0 ? base.slice(dot).toLowerCase() : '';
  return SAFE_EXT.has(ext) ? ext : '';
}

export function buildSortedName(docType: SortDocType, docDate: string | null, uploadDate: Date, ext: string): string {
  const date = docDate ?? uploadDate.toISOString().slice(0, 10);
  return `${DOC_TYPE_LABEL[docType]}_${date}${ext}`;
}

/** `base`, or `base-2`, `base-3`… until it is not in `taken` (case-insensitive). */
export function uniqueName(base: string, taken: ReadonlySet<string>): string {
  const lower = new Set([...taken].map((t) => t.toLowerCase()));
  if (!lower.has(base.toLowerCase())) return base;
  const dot = base.lastIndexOf('.');
  const stem = dot >= 0 ? base.slice(0, dot) : base;
  const ext = dot >= 0 ? base.slice(dot) : '';
  for (let n = 2; ; n++) {
    const candidate = `${stem}-${n}${ext}`;
    if (!lower.has(candidate.toLowerCase())) return candidate;
  }
}

/** True only for a YYYY-MM-DD that is a real calendar day (no 31 Feb, no month 13). */
export function isRealIsoDate(s: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const [y, mo, d] = [Number.parseInt(m[1]!, 10), Number.parseInt(m[2]!, 10), Number.parseInt(m[3]!, 10)];
  const t = new Date(Date.UTC(y, mo - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === d;
}
