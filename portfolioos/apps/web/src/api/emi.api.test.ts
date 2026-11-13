// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { AxiosError, AxiosHeaders } from 'axios';

vi.mock('./client', async (orig) => {
  const actual = await orig<typeof import('./client')>();
  return { ...actual, api: { post: vi.fn() } };
});

describe('emiApi.export errors', () => {
  it('surfaces the server message from a Blob JSON error body', async () => {
    const { api, apiErrorMessage } = await import('./client');
    const { emiApi } = await import('./emi.api');
    const blob = new Blob([JSON.stringify({ success: false, error: 'Too many exports - please wait a minute', code: 'RATE_LIMITED' })], { type: 'application/json' });
    const err = new AxiosError('Request failed with status code 429', 'ERR_BAD_REQUEST', undefined, undefined, {
      status: 429, statusText: 'Too Many Requests', data: blob, headers: {}, config: { headers: new AxiosHeaders() },
    });
    vi.mocked(api.post).mockRejectedValueOnce(err);
    const thrown = await emiApi.export('pdf', { input: {} as never }).catch((e: unknown) => e);
    expect(apiErrorMessage(thrown)).toBe('Too many exports - please wait a minute');
  });
});
