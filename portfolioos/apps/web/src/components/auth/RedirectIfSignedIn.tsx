import { useState, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth.store';
import { useNextPath } from '@/hooks/useNextPath';
import { postLoginPath } from '@/pages/auth/loginRedirect';

/**
 * For pages only a signed-out visitor needs (signup, password reset): a
 * signed-in user who lands there goes where /login would send them.
 *
 * Decided once, on arrival. These pages sign the user in themselves (signup's
 * verify step, Google) and then navigate on their own; re-checking on every
 * auth change would race that navigation and could override it.
 */
export function RedirectIfSignedIn({ children }: { children: ReactNode }) {
  const location = useLocation();
  const nextPath = useNextPath();
  const userId = useAuthStore((s) => s.user?.id);
  const [signedInOnArrival] = useState(() => {
    const st = useAuthStore.getState();
    return Boolean(st.accessToken && st.user);
  });
  if (signedInOnArrival) {
    return <Navigate to={postLoginPath({ nextPath, userId, state: location.state })} replace />;
  }
  return <>{children}</>;
}
