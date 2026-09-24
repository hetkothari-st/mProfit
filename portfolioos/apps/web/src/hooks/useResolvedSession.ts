import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { AuthUser } from '@everypaisa/shared';
import { useAuthStore } from '@/stores/auth.store';
import { authApi } from '@/api/auth.api';
import { isAuthRejection, refreshSession } from '@/api/client';

export type SessionState =
  | { status: 'loading'; user: null }
  | { status: 'signed-in'; user: AuthUser }
  | { status: 'signed-out'; user: null };

/**
 * Who is signed in, resuming the session from its token when needed.
 *
 * The profile is not persisted — it carried PII beside the tokens, see the
 * store's `partialize` — so a new tab or a reload holds a token but no user.
 * That is a resuming session, not a signed-out one. `ProtectedRoute` always
 * knew this; the public invitation pages did not, and told a professional
 * who was signed in, in the very next tab, to sign in or create an account.
 * Any page that must tell "signed in" from "signed out" outside the
 * protected tree reads it from here rather than from `user` alone.
 */
export function useResolvedSession(): SessionState {
  const { user, accessToken, setUser, clearSession } = useAuthStore();

  const meQuery = useQuery({
    // Keyed by the token: the answer is about *this* session. Without it, a
    // 401 cached for an expired token outlived a later sign-in in the same
    // page and wiped the new session the moment it reached a guarded route.
    queryKey: ['auth-me', accessToken],
    queryFn: resumeSession,
    enabled: Boolean(accessToken) && !user,
    // Only the server rejecting the session ends it. A rate limit, a 5xx or a
    // phone that has lost signal is retried — with backoff, indefinitely —
    // instead of signing the user out.
    retry: (_count, err) => !isAuthRejection(err),
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 30_000),
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (meQuery.data) setUser(meQuery.data);
  }, [meQuery.data, setUser]);

  useEffect(() => {
    // A token /me rejects is not a token worth keeping — but only while that
    // token is still being resolved. A session that already has its profile
    // (a fresh sign-in sets both) is never discarded on a /me error.
    if (meQuery.isError && isAuthRejection(meQuery.error) && !user) clearSession();
  }, [meQuery.isError, meQuery.error, user, clearSession]);

  if (!accessToken) return { status: 'signed-out', user: null };
  if (user) return { status: 'signed-in', user };
  if (meQuery.isError && isAuthRejection(meQuery.error)) return { status: 'signed-out', user: null };
  // Holding a token whose profile is on its way, or already fetched and about
  // to be stored by the effect above.
  if (meQuery.data) return { status: 'signed-in', user: meQuery.data };
  return { status: 'loading', user: null };
}

/**
 * /me for a stored token. An access token that expired while the tab was
 * closed is renewed with the refresh token rather than treated as signed out
 * (the axios interceptor never retries /api/auth/* calls itself).
 */
async function resumeSession(): Promise<AuthUser> {
  try {
    return await authApi.me();
  } catch (err) {
    if (!isAuthRejection(err)) throw err;
    await refreshSession(); // throws an auth rejection if the refresh token is dead too
    return useAuthStore.getState().user ?? authApi.me();
  }
}
