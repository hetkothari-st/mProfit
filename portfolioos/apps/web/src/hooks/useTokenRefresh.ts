import { useEffect } from 'react';
import { useAuthStore } from '@/stores/auth.store';
import { doRefresh } from '@/api/client';

const REFRESH_BEFORE_MS = 2 * 60 * 1000; // refresh 2 min before expiry

/**
 * Schedules a proactive JWT refresh 2 minutes before the access token expires.
 * Re-schedules automatically whenever a new token is issued. This prevents the
 * reactive 401→refresh cycle that otherwise appears in the browser console on
 * every authenticated poll (budget, positions, etc.) after the 15-min TTL.
 */
export function useTokenRefresh() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const accessTokenExpiresAt = useAuthStore((s) => s.accessTokenExpiresAt);

  useEffect(() => {
    if (!accessToken || !accessTokenExpiresAt) return;

    const expiresAt = new Date(accessTokenExpiresAt).getTime();
    const refreshAt = expiresAt - REFRESH_BEFORE_MS;
    const delay = Math.max(0, refreshAt - Date.now());

    const timer = setTimeout(async () => {
      try {
        await doRefresh();
      } catch {
        useAuthStore.getState().clearSession();
      }
    }, delay);

    return () => clearTimeout(timer);
  }, [accessToken, accessTokenExpiresAt]);
}
