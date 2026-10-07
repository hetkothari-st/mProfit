import type { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Loader2, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { authApi } from '@/api/auth.api';
import { useAuthStore } from '@/stores/auth.store';

/**
 * The professional (CA / adviser) workspace shows clients' financial data, so
 * the API requires two-factor sign-in, switched on and used for this session.
 * This explains what to do instead of letting every request fail with 403.
 */
export function ProfessionalTwoFactorGate({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const clearSession = useAuthStore((s) => s.clearSession);
  const status = useQuery({ queryKey: ['two-factor-status'], queryFn: authApi.twoFactorStatus });

  if (status.isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (status.data?.enabled && status.data.sessionVerified) return <>{children}</>;

  const notEnabled = !status.data?.enabled;
  return (
    <div className="mx-auto max-w-lg py-10">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-primary" /> Two-factor sign-in required
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-muted-foreground">
          <p>
            The professional workspace shows your clients&apos; financial data, so it needs two-factor sign-in: a code
            from an authenticator app each time you sign in.
          </p>
          {notEnabled ? (
            <Button asChild>
              <Link to="/settings">Turn on two-factor sign-in</Link>
            </Button>
          ) : (
            <>
              <p>Two-factor sign-in is on, but this session started without a code. Sign in again to continue.</p>
              <Button
                onClick={() => {
                  clearSession();
                  navigate('/login?next=/ca', { replace: true });
                }}
              >
                Sign out and sign in again
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
