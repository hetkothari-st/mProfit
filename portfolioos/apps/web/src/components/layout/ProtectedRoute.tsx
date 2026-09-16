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
    queryKey: ['auth-me'],
    queryFn: () => authApi.me(),
    enabled: Boolean(accessToken) && !user,
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (meQuery.data) setUser(meQuery.data);
  }, [meQuery.data, setUser]);

  useEffect(() => {
    // A token /me rejects is not a token worth keeping.
    if (meQuery.isError) clearSession();
  }, [meQuery.isError, clearSession]);

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
