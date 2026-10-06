import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useResolvedSession } from '@/hooks/useResolvedSession';

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const location = useLocation();
  // Resumes a session that holds a token but no profile (a reload or a new
  // tab) instead of treating it as signed out. See useResolvedSession.
  const session = useResolvedSession();

  if (session.status === 'signed-out') {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (session.status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return <>{children}</>;
}
