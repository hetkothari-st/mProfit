import type { ImportJobDTO } from '@everypaisa/shared';

/**
 * What the Import list's issues button should say for a job, or null when
 * there is nothing to show.
 *
 * A job can fail without any per-row errors: the worker crashed or timed
 * out (`errorLog.workerError`), the orphan sweep tombstoned it after a
 * restart, or the service rejected it up front (`errorLog.general`). Those
 * used to leave a bare "Failed" badge with no way to see why.
 */
export function importIssueLabel(job: ImportJobDTO): 'Errors' | 'Warnings' | null {
  const log = job.errorLog;
  const hasErrors =
    (job.failedRows ?? 0) > 0 ||
    (log?.rowErrors?.length ?? 0) > 0 ||
    Boolean(log?.workerError) ||
    Boolean(log?.general);
  if (hasErrors) return 'Errors';
  if ((log?.parserWarnings?.length ?? 0) > 0) return 'Warnings';
  return null;
}
