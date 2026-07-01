import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams, Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Loader2, Users, CheckCircle2, AlertOctagon } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { familiesApi } from '@/api/families.api';
import { useAuthStore } from '@/stores/auth.store';
import { useFamilyScopeStore } from '@/stores/familyScope.store';
import { apiErrorMessage } from '@/api/client';

/**
 * Public accept-invite landing. If the user isn't signed in, the peek
 * runs unauthenticated (backend allows it) but Accept requires auth.
 * Redirects to login with a `?next=...` param when unauthenticated so
 * we return to this page after sign-in.
 */
export function AcceptInvitationPage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, accessToken } = useAuthStore();
  const setFamily = useFamilyScopeStore((s) => s.setFamily);
  const isAuthed = Boolean(user && accessToken);

  const peekQuery = useQuery({
    queryKey: ['family-invitation', token],
    queryFn: () => familiesApi.peek(token!),
    enabled: !!token,
    retry: false,
  });

  const acceptMutation = useMutation({
    mutationFn: () => familiesApi.accept(token!),
    onSuccess: () => {
      toast.success('Invitation accepted');
      if (peekQuery.data) {
        // Refetch families list so the switcher picks up the new
        // membership immediately.
        queryClient.invalidateQueries({ queryKey: ['families', 'mine'] });
      }
      navigate('/settings', { replace: true });
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Accept failed')),
  });

  useEffect(() => {
    if (!isAuthed && peekQuery.isSuccess) {
      // Take them to login, return here after.
      navigate(`/login?next=${encodeURIComponent(window.location.pathname)}`, {
        replace: false,
      });
    }
  }, [isAuthed, peekQuery.isSuccess, navigate]);

  if (peekQuery.isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (peekQuery.isError) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <Card className="max-w-md w-full">
          <CardHeader className="flex-row items-center gap-2">
            <AlertOctagon className="h-5 w-5 text-negative" />
            <CardTitle>Invitation invalid</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {apiErrorMessage(peekQuery.error, 'This invitation link is not valid.')}
            </p>
            <Button asChild variant="outline">
              <Link to="/dashboard">Back to dashboard</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const peek = peekQuery.data;
  if (!peek || !isAuthed) {
    // Redirect handled in useEffect; render nothing meaningful here.
    return null;
  }

  const emailMatches =
    user?.email.toLowerCase() === peek.invitedEmail.toLowerCase();

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <Card className="max-w-md w-full">
        <CardHeader className="flex-row items-center gap-2">
          <Users className="h-5 w-5 text-accent" strokeWidth={1.9} />
          <CardTitle>Family invitation</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <p className="text-sm">
              <span className="text-muted-foreground">{peek.invitedByName}</span>{' '}
              invited you to{' '}
              <span className="font-medium">{peek.familyName}</span>.
            </p>
            <p className="text-[11px] uppercase tracking-kerned text-muted-foreground">
              Role: {peek.role.toLowerCase()} · Sent to {peek.invitedEmail}
            </p>
          </div>

          {!emailMatches && (
            <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 dark:border-amber-900/60 dark:bg-amber-950/30 px-3 py-2">
              <AlertOctagon className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5" />
              <p className="text-xs text-amber-800 dark:text-amber-300">
                This invitation was sent to{' '}
                <span className="font-mono">{peek.invitedEmail}</span> but you
                are signed in as{' '}
                <span className="font-mono">{user!.email}</span>. Accepting will
                fail. Sign in with the invited account first.
              </p>
            </div>
          )}

          <div className="flex gap-2">
            <Button
              className="flex-1"
              onClick={() => {
                acceptMutation.mutate(undefined, {
                  onSuccess: () => setFamily(null, null),
                });
              }}
              disabled={!emailMatches || acceptMutation.isPending}
            >
              {acceptMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
              ) : (
                <CheckCircle2 className="h-4 w-4 mr-1.5" strokeWidth={1.9} />
              )}
              Accept
            </Button>
            <Button variant="outline" asChild>
              <Link to="/dashboard">Decline</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
