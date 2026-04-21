import axios, { AxiosError, type AxiosInstance, type InternalAxiosRequestConfig } from 'axios';
import { useAuthStore } from '@/stores/auth.store';

const baseURL =
  (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:3001';

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

async function doRefresh(): Promise<string> {
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

export function apiErrorMessage(err: unknown, fallback = 'Something went wrong'): string {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as { error?: string; message?: string } | undefined;
    return data?.error ?? data?.message ?? err.message ?? fallback;
  }
  if (err instanceof Error) return err.message;
  return fallback;
}
