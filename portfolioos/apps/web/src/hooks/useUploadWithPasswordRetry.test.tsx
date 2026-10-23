// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { AxiosError, type AxiosResponse } from 'axios';
import { useUploadWithPasswordRetry } from './useUploadWithPasswordRetry';

// The /import "wrong password" path: reprocess answers 422 FILE_LOCKED when
// the job is still locked after running. The dialog must stay open with a
// "didn't unlock" message and the success callback must not fire.
function lockedError(): AxiosError {
  const response = {
    status: 422,
    data: { success: false, error: 'That password didn’t unlock the file. Try another.', code: 'FILE_LOCKED' },
  } as AxiosResponse;
  return new AxiosError('Request failed with status code 422', 'ERR_BAD_REQUEST', undefined, undefined, response);
}

describe('useUploadWithPasswordRetry — async (job) retry', () => {
  it('keeps the dialog open on a wrong password and does not report success', async () => {
    const onSuccess = vi.fn();
    const onError = vi.fn();
    const retryFn = vi.fn().mockRejectedValue(lockedError());
    const { result } = renderHook(() => useUploadWithPasswordRetry({ retryFn, onSuccess, onError }));

    act(() => result.current.openForJob('job-1', 'cas.pdf'));
    await act(() => result.current.dialogProps.onSubmit('wrong', true));

    expect(retryFn).toHaveBeenCalledWith('job-1', 'wrong', true);
    expect(onSuccess).not.toHaveBeenCalled();
    expect(result.current.dialogProps.open).toBe(true);
    expect(result.current.dialogProps.errorMessage).toMatch(/didn.t unlock/);
  });

  it('closes and reports success when the password works', async () => {
    const onSuccess = vi.fn();
    const retryFn = vi.fn().mockResolvedValue({ ok: true });
    const { result } = renderHook(() => useUploadWithPasswordRetry({ retryFn, onSuccess }));

    act(() => result.current.openForJob('job-1', 'cas.pdf'));
    await act(() => result.current.dialogProps.onSubmit('right', true));

    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(result.current.dialogProps.open).toBe(false);
  });
});
