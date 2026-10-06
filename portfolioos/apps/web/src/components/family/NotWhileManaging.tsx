import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useActingAsStore } from '@/stores/actingAs.store';

/**
 * Keep a screen out of reach while managing a family member's account.
 *
 * For screens outside the app shell (so without the "You are managing" strip)
 * that mix data with account steps. Onboarding is the case: its profile and
 * Gmail steps are account routes, which always run as the signed-in person,
 * so walking it "as Dadaji" would quietly edit your own profile instead.
 */
export function NotWhileManaging({ to, children }: { to: string; children: ReactNode }) {
  const acting = useActingAsStore((s) => s.profile);
  if (acting) return <Navigate to={to} replace />;
  return <>{children}</>;
}
