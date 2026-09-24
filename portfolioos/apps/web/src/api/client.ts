import axios, { AxiosError, type AxiosInstance, type InternalAxiosRequestConfig } from 'axios';
import type { ApiResponse } from '@everypaisa/shared';
import { useAuthStore } from '@/stores/auth.store';
import { useFamilyScopeStore } from '@/stores/familyScope.store';
import { useActingAsStore, isAccountRoute } from '@/stores/actingAs.store';
import { getApiBaseUrl } from './baseUrl';

const baseURL = getApiBaseUrl();

export const api: AxiosInstance = axios.create({
  baseURL,
  withCredentials: false,
});

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = useAuthStore.getState().accessToken;
  if (token) {
    config.headers.set('Authorization', `Bearer ${token}`);
  }
  // Family / HOF scope selector — backend resolves an EffectiveScope
  // for this family when the header is present.
  const familyId = useFamilyScopeStore.getState().viewingAsFamilyId;
  if (familyId) {
    config.headers.set('X-Viewing-As-Family', familyId);
  }
  // Managing a family member's account: data requests run as them. The
  // server re-checks every one; account routes always run as you.
  const acting = useActingAsStore.getState().profile;
  if (acting && !isAccountRoute(config.url ?? '')) {
    config.headers.set('X-Act-As', acting.id);
  }
  return config;
});

class NoRefreshTokenError extends Error {
  constructor() {
    super('No refresh token');
  }
}

/**
 * True when the server rejected the session itself (401/403), or there is no
 * refresh token to try. Only this may sign the user out: a 429, a 5xx or a
 * dropped mobile connection says nothing about whether the session is valid.
 */
export function isAuthRejection(err: unknown): boolean {
  if (err instanceof NoRefreshTokenError) return true;
  const status = axios.isAxiosError(err) ? err.response?.status : undefined;
  return status === 401 || status === 403;
}

async function doRefresh(): Promise<string> {
  const refreshToken = useAuthStore.getState().refreshToken;
  if (!refreshToken) throw new NoRefreshTokenError();
  const response = await axios.post(`${baseURL}/api/auth/refresh`, { refreshToken });
  const { user, tokens } = response.data.data;
  useAuthStore.getState().setSession(user, tokens);
  return tokens.accessToken as string;
}

let refreshPromise: Promise<string> | null = null;

/**
 * Refresh the session, one request at a time. Refresh tokens are single-use,
 * so a second concurrent refresh (the proactive timer racing a 401 retry)
 * would present an already-rotated token and be rejected.
 */
export function refreshSession(): Promise<string> {
  refreshPromise ??= doRefresh().finally(() => {
    refreshPromise = null;
  });
  return refreshPromise;
}

api.interceptors.response.use(
  (res) => res,
  async (err: AxiosError) => {
    const original = err.config as InternalAxiosRequestConfig & { _retry?: boolean };
    const status = err.response?.status;
    if (status === 401 && !original._retry && !original.url?.includes('/api/auth/')) {
      original._retry = true;
      try {
        const newToken = await refreshSession();
        original.headers.set('Authorization', `Bearer ${newToken}`);
        return api.request(original);
      } catch (refreshError) {
        if (isAuthRejection(refreshError)) useAuthStore.getState().clearSession();
        return Promise.reject(refreshError);
      }
    }
    return Promise.reject(err);
  },
);

// Strips ANSI escape sequences ("[2m...") and condenses whitespace.
// Server-side Playwright stack traces leak these — they render as wall-of-text
// in the dialog without this filter.
function sanitizeMsg(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\[[0-9;]*m/g, '').replace(/\s+/g, ' ').trim();
}

/**
 * Strip the ApiResponse envelope. Throws on `{ success: false }` with the
 * server-supplied error message. Reuse this across all api/*.ts modules
 * instead of redeclaring a local `unwrap` per file.
 */
export function unwrap<T>(data: ApiResponse<T>): T {
  if (!data.success) throw new Error(data.error);
  return data.data;
}

/**
 * The server's own error code (`DUPLICATE_TRANSACTION`, `RATE_LIMIT`, …), for
 * the few places that need to react to one rather than just show the message.
 */
export function apiErrorCode(err: unknown): string | undefined {
  if (!axios.isAxiosError(err)) return undefined;
  const data = err.response?.data as { code?: string } | undefined;
  return data?.code;
}

export function apiErrorMessage(err: unknown, fallback = 'Something went wrong'): string {
  let raw: string | undefined;
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as { error?: string; message?: string } | undefined;
    raw = data?.error ?? data?.message ?? err.message;
  } else if (err instanceof Error) {
    raw = err.message;
  }
  const msg = raw ? sanitizeMsg(raw) : fallback;
  // Trim Playwright "Call log: ..." tail — it's noise for end users.
  const cut = msg.split(/\s*Call log:/i)[0]!;
  // Cap to a reasonable length so a stack trace doesn't blow up the dialog.
  return cut.length > 400 ? `${cut.slice(0, 400)}…` : cut;
}
