import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { AuthUser } from '@everypaisa/shared';
import { useAuthStore } from '@/stores/auth.store';
import { authApi } from '@/api/auth.api';

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
    queryFn: () => authApi.me(),
    enabled: Boolean(accessToken) && !user,
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (meQuery.data) setUser(meQuery.data);
  }, [meQuery.data, setUser]);

  useEffect(() => {
    // A token /me rejects is not a token worth keeping — but only while that
    // token is still being resolved. A session that already has its profile
    // (a fresh sign-in sets both) is never discarded on a /me error.
    if (meQuery.isError && !user) clearSession();
  }, [meQuery.isError, user, clearSession]);

  if (!accessToken) return { status: 'signed-out', user: null };
  if (user) return { status: 'signed-in', user };
  if (meQuery.isError) return { status: 'signed-out', user: null };
  // Holding a token whose profile is on its way, or already fetched and about
  // to be stored by the effect above.
  if (meQuery.data) return { status: 'signed-in', user: meQuery.data };
  return { status: 'loading', user: null };
}
