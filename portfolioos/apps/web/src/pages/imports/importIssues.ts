import { humanizeEnum, type ImportJobDTO } from '@everypaisa/shared';

/** Rows the import recognised as already imported and left alone. */
export function importSkippedCount(job: ImportJobDTO): number {
  return job.errorLog?.skippedAsDuplicates ?? 0;
}

/**
 * What the Import list's issues button should say for a job, or null when
 * there is nothing to show.
 *
 * A job can fail without any per-row errors: the worker crashed or timed
 * out (`errorLog.workerError`), the orphan sweep tombstoned it after a
 * restart, or the service rejected it up front (`errorLog.general`). Those
 * used to leave a bare "Failed" badge with no way to see why.
 *
 * "Details" is for a clean import where rows were skipped as duplicates: nothing is wrong, but without
 * it a re-uploaded file reads "5 rows, 0 imported" with no way to see why.
 */
export function importIssueLabel(job: ImportJobDTO): 'Errors' | 'Warnings' | 'Details' | null {
  const log = job.errorLog;
  const hasErrors =
    (job.failedRows ?? 0) > 0 ||
    (log?.rowErrors?.length ?? 0) > 0 ||
    Boolean(log?.workerError) ||
    Boolean(log?.general);
  if (hasErrors) return 'Errors';
  if ((log?.parserWarnings?.length ?? 0) > 0) return 'Warnings';
  if (importSkippedCount(job) > 0) return 'Details';
  return null;
}

const HEADLINE_MAX = 90;
const clip = (s: string) => (s.length <= HEADLINE_MAX ? s : `${s.slice(0, HEADLINE_MAX - 1).trimEnd()}…`);

/**
 * The one-line reason to show under the status badge, so a failed or empty import explains itself on the
 * row. Null when the status already says everything (a clean import that added rows).
 */
export function importHeadline(job: ImportJobDTO): string | null {
  const log = job.errorLog;
  if (!log) return null;
  if (log.workerError) return clip(log.timedOut ? 'Took too long and was stopped' : log.workerError);
  if (log.general) return clip(log.general);
  const rowError = log.rowErrors?.[0]?.reason;
  if (rowError) return clip(rowError);
  const warning = log.parserWarnings?.[0];
  if (warning && (job.status === 'FAILED' || (job.totalRows ?? 0) === 0)) return clip(warning);

  const skipped = importSkippedCount(job);
  if (skipped > 0 && (job.successRows ?? 0) === 0 && (job.failedRows ?? 0) === 0) {
    return skipped === 1 ? 'Already imported' : `All ${skipped} rows were already imported`;
  }
  return null;
}

/**
 * The Type column. Depository (NSDL/CDSL/Zerodha holding) statements share the MF_CAS_* import type because
 * the same parser reads them, which made an NSDL statement show as "MF CAS PDF". The stored type stays (it
 * routes the parser); only the label looks at the file name, using the same hints the Gmail fetch uses.
 */
export function importTypeLabel(type: string, fileName: string | null | undefined): string {
  const kind = type === 'MF_CAS_PDF' ? 'PDF' : type === 'MF_CAS_EXCEL' ? 'Excel' : null;
  if (!kind) return humanizeEnum(type);
  const name = (fileName ?? '').toLowerCase();
  const depository =
    /\b(nsdl|cdsl)\b|nsdl|cdsl|depository|transaction[-_\s]?(with|cum)[-_\s]?holding|_txn\./.test(name);
  return depository ? `Depository statement (${kind})` : `Mutual fund CAS (${kind})`;
}

/**
 * One line naming where to get the file this importer reads, for a failed or
 * empty import (launch review B5). Picked from the import type, the parser
 * that ran and the file name; null when we cannot tell the source.
 */
export function importSourceHelp(type: string, fileName: string | null | undefined, parser?: string | null): string | null {
  const name = `${(fileName ?? '').toLowerCase()} ${(parser ?? '').toLowerCase()}`;
  if (/zerodha|kite|console/.test(name)) return 'Zerodha: Console → Reports → Contract notes, one file per day.';
  if (/\b(nsdl|cdsl)\b|nsdl|cdsl|depository|transaction[-_\s]?(with|cum)[-_\s]?holding/.test(name)) {
    return 'NSDL/CDSL: download the CAS from NSDL or CDSL.';
  }
  if (/cams|kfin|karvy/.test(name) || type === 'MF_CAS_PDF' || type === 'MF_CAS_EXCEL') {
    return 'CAMS/KFin: download the Detailed CAS from camsonline.com, as a PDF, with a password.';
  }
  if (/kotak|hdfc\s?sec|hdfcsec|icici|groww|upstox|angel|dhan|5paisa|motilal|sharekhan/.test(name) || type.startsWith('CONTRACT_NOTE')) {
    return "Broker: download the contract note from your broker's back office, one file per trading day.";
  }
  return null;
}

/** The source hint for a job that failed or imported nothing; null for a job that worked. */
export function importFixHint(job: ImportJobDTO): string | null {
  const failedOrEmpty = job.status === 'FAILED' || ((job.totalRows ?? 0) === 0 && (job.successRows ?? 0) === 0);
  if (!failedOrEmpty || job.status === 'PENDING' || job.status === 'PROCESSING' || job.status === 'NEEDS_PASSWORD') return null;
  if (importSkippedCount(job) > 0) return null; // nothing new because it was already imported
  return importSourceHelp(job.type, job.fileName, job.errorLog?.parser ?? null);
}
