import axios, { AxiosError, type AxiosInstance, type InternalAxiosRequestConfig } from 'axios';
import type { ApiResponse } from '@portfolioos/shared';
import { useAuthStore } from '@/stores/auth.store';
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
  return config;
});

let refreshPromise: Promise<string> | null = null;

export async function doRefresh(): Promise<string> {
  const refreshToken = useAuthStore.getState().refreshToken;
  if (!refreshToken) throw new Error('No refresh token');
  const response = await axios.post(`${baseURL}/api/auth/refresh`, { refreshToken });
  const { user, tokens } = response.data.data;
  useAuthStore.getState().setSession(user, tokens);
  return tokens.accessToken as string;
}

api.interceptors.response.use(
  (res) => res,
  async (err: AxiosError) => {
    const original = err.config as InternalAxiosRequestConfig & { _retry?: boolean };
    const status = err.response?.status;
    if (status === 401 && !original._retry && !original.url?.includes('/api/auth/')) {
      original._retry = true;
      try {
        refreshPromise = refreshPromise ?? doRefresh();
        const newToken = await refreshPromise;
        refreshPromise = null;
        original.headers.set('Authorization', `Bearer ${newToken}`);
        return api.request(original);
      } catch (refreshError) {
        refreshPromise = null;
        useAuthStore.getState().clearSession();
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
