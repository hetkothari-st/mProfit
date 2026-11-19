import type { ImportJobDTO } from '@everypaisa/shared';

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
