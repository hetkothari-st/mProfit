import { useCallback, useState } from 'react';
import axios from 'axios';
import { apiErrorMessage } from '@/api/client';

/**
 * State machine for upload surfaces that need to handle
 * password-protected files inline.
 *
 * Two surface flavours:
 *   - Sync (passbook, vault): the upload endpoint returns 422 with
 *     `code:'FILE_LOCKED'` when the file is locked. Caller's `uploadFn`
 *     re-throws the axios error (or returns it) — the hook detects the
 *     code and opens the dialog. On retry it calls `uploadFn` again with
 *     the password baked into the FormData.
 *   - Async (`/import`): the upload endpoint returns 201 immediately.
 *     The job lifecycle later transitions to NEEDS_PASSWORD; polling
 *     code calls `openForJob(jobId, fileName)` and submit hits a
 *     separate `retryFn` (e.g. `importsApi.reprocess`).
 */

export interface UseUploadWithPasswordRetryOptions<TResponse> {
  /** Initial upload. Receives optional password. Throws on failure.
   *  Optional: surfaces that don't drive uploads through this hook (e.g.
   *  /import which uses its own mutation and only opens the dialog
   *  reactively from job-status polling) can omit it. */
  uploadFn?: (file: File, password?: string, save?: boolean) => Promise<TResponse>;
  /**
   * Async-surface retry — submitted password targets an existing job
   * by id (not a new file upload). When omitted, the dialog only
   * supports the sync flow.
   */
  retryFn?: (jobId: string, password: string, save: boolean) => Promise<TResponse>;
  onSuccess?: (response: TResponse) => void;
  onError?: (err: unknown) => void;
}

interface DialogState {
  open: boolean;
  fileName: string;
  /** Sync flow: a File pending password. Async flow: a job id. */
  pendingFile: File | null;
  pendingJobId: string | null;
  errorMessage: string | null;
  isPending: boolean;
}

export function isLockedError(err: unknown): boolean {
  if (!axios.isAxiosError(err)) return false;
  const data = err.response?.data as { code?: string; requiresPassword?: boolean } | undefined;
  return data?.code === 'FILE_LOCKED' || data?.requiresPassword === true;
}

export function useUploadWithPasswordRetry<TResponse>(
  opts: UseUploadWithPasswordRetryOptions<TResponse>,
) {
  const [uploading, setUploading] = useState(false);
  const [dialog, setDialog] = useState<DialogState>({
    open: false,
    fileName: '',
    pendingFile: null,
    pendingJobId: null,
    errorMessage: null,
    isPending: false,
  });

  const handleUpload = useCallback(
    async (file: File) => {
      if (!opts.uploadFn) return;
      setUploading(true);
      try {
        const result = await opts.uploadFn(file);
        opts.onSuccess?.(result);
      } catch (err) {
        if (isLockedError(err)) {
          setDialog({
            open: true,
            fileName: file.name,
            pendingFile: file,
            pendingJobId: null,
            errorMessage: null,
            isPending: false,
          });
        } else {
          opts.onError?.(err);
        }
      } finally {
        setUploading(false);
      }
    },
    [opts],
  );

  const openForJob = useCallback((jobId: string, fileName: string) => {
    setDialog({
      open: true,
      fileName,
      pendingFile: null,
      pendingJobId: jobId,
      errorMessage: null,
      isPending: false,
    });
  }, []);

  const submitPassword = useCallback(
    async (password: string, save: boolean) => {
      setDialog((prev) => ({ ...prev, isPending: true, errorMessage: null }));
      try {
        let result: TResponse;
        if (dialog.pendingFile && opts.uploadFn) {
          result = await opts.uploadFn(dialog.pendingFile, password, save);
        } else if (dialog.pendingJobId && opts.retryFn) {
          result = await opts.retryFn(dialog.pendingJobId, password, save);
        } else {
          throw new Error('No pending file or job to retry');
        }
        setDialog({
          open: false,
          fileName: '',
          pendingFile: null,
          pendingJobId: null,
          errorMessage: null,
          isPending: false,
        });
        opts.onSuccess?.(result);
      } catch (err) {
        if (isLockedError(err)) {
          setDialog((prev) => ({
            ...prev,
            isPending: false,
            errorMessage: 'That password didn’t unlock the file. Try another.',
          }));
          return;
        }
        setDialog((prev) => ({
          ...prev,
          isPending: false,
          errorMessage: apiErrorMessage(err, 'Failed'),
        }));
        opts.onError?.(err);
      }
    },
    [dialog.pendingFile, dialog.pendingJobId, opts],
  );

  const cancelPassword = useCallback(() => {
    setDialog({
      open: false,
      fileName: '',
      pendingFile: null,
      pendingJobId: null,
      errorMessage: null,
      isPending: false,
    });
  }, []);

  return {
    upload: handleUpload,
    openForJob,
    uploading,
    dialogProps: {
      open: dialog.open,
      fileName: dialog.fileName,
      isPending: dialog.isPending,
      errorMessage: dialog.errorMessage,
      onSubmit: submitPassword,
      onCancel: cancelPassword,
    },
  };
}
