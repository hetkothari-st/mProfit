// @vitest-environment jsdom
/**
 * Only the server saying "this session is no good" (401/403) may sign the
 * user out. A rate limit, a 5xx or a dropped mobile connection used to do it
 * too, and two refreshes racing on a one-time refresh token signed them out
 * with a token that was perfectly valid a moment earlier.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import axios, { AxiosError, AxiosHeaders } from 'axios';
import { useAuthStore } from '@/stores/auth.store';
import { isAuthRejection, refreshSession } from './client';

function httpError(status: number): AxiosError {
  const headers = new AxiosHeaders();
  return new AxiosError('fail', String(status), { headers }, null, {
    status,
    statusText: '',
    headers: {},
    config: { headers },
    data: {},
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  useAuthStore.setState({ user: null, accessToken: null, refreshToken: null, accessTokenExpiresAt: null });
});

describe('isAuthRejection', () => {
  it('is true only for 401 and 403', () => {
    expect(isAuthRejection(httpError(401))).toBe(true);
    expect(isAuthRejection(httpError(403))).toBe(true);
    expect(isAuthRejection(httpError(429))).toBe(false);
    expect(isAuthRejection(httpError(503))).toBe(false);
    expect(isAuthRejection(new AxiosError('Network Error', 'ERR_NETWORK'))).toBe(false);
    expect(isAuthRejection(new Error('boom'))).toBe(false);
  });
});

describe('refreshSession', () => {
  it('sends one refresh request however many callers ask at once', async () => {
    useAuthStore.setState({ accessToken: 'old', refreshToken: 'r1' });
    const post = vi.spyOn(axios, 'post').mockResolvedValue({
      data: {
        data: {
          user: { id: 'u1' },
          tokens: { accessToken: 'new', refreshToken: 'r2', accessTokenExpiresAt: new Date().toISOString() },
        },
      },
    });
    const [a, b] = await Promise.all([refreshSession(), refreshSession()]);
    expect(post).toHaveBeenCalledTimes(1);
    expect(a).toBe('new');
    expect(b).toBe('new');
  });

  it('treats a missing refresh token as an auth rejection', async () => {
    useAuthStore.setState({ accessToken: 'old', refreshToken: null });
    await expect(refreshSession()).rejects.toSatisfy(isAuthRejection);
  });
});
