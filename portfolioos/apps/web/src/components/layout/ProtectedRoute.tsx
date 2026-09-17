import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { useAuthStore } from '@/stores/auth.store';
import { authApi } from '@/api/auth.api';

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const location = useLocation();
  const { user, accessToken, setUser, clearSession } = useAuthStore();

  // The profile is no longer persisted to localStorage — it carried PII next
  // to the tokens, see the store's `partialize`. So after a reload we hold a
  // token but no user. That is a resuming session, not a signed-out one:
  // fetch the profile rather than bouncing to /login.
  const meQuery = useQuery({
    // Keyed by the token: the answer is about *this* session. Without it, a
    // 401 cached for an expired token outlived a later sign-in in the same
    // page and wiped the new session the moment it reached this route.
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

  if (!accessToken) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (!user) {
    if (meQuery.isError) {
      return <Navigate to="/login" replace state={{ from: location }} />;
    }
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return <>{children}</>;
}
