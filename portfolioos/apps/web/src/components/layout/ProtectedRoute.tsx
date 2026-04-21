import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth.store';

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const location = useLocation();
  const { user, accessToken } = useAuthStore();
  const isAuthed = Boolean(accessToken && user);
  if (!isAuthed) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }
  return <>{children}</>;
}
