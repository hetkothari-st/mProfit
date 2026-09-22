import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { ShieldCheck, Loader2, ArrowRight, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { professionalInviteApi } from '@/api/ca.api';
import { apiErrorMessage } from '@/api/client';
import { useAuthStore } from '@/stores/auth.store';
import { authApi } from '@/api/auth.api';
import { useResolvedSession } from '@/hooks/useResolvedSession';

/**
 * A professional accepting a client's invitation.
 *
 * The opposite direction from `AcceptCaInvitationPage`, and it has a different
 * problem to solve: the person opening this link may never have heard of the
 * product. So the page answers "who is asking, and for what" BEFORE asking
 * them to sign in — the preview endpoint is deliberately unauthenticated for
 * exactly this moment. Being told to create an account before being told why
 * is how a legitimate invitation gets mistaken for spam.
 *
 * Accepting is free. What it gives is this client's books and nothing else:
 * no portfolios of their own, no clients of their own. That boundary is the
 * honest version of the upsell shown afterwards.
 */
export function AcceptProfessionalInvitePage() {
  const { token = '' } = useParams();
  const navigate = useNavigate();
  // Resolved, not read raw: a professional opening a second client's link in
  // a new tab holds a token but no loaded profile yet, and reading `user`
  // alone told them to sign in to an account they were already signed in to.
  const session = useResolvedSession();
  const clearSession = useAuthStore((st) => st.clearSession);
  const refreshToken = useAuthStore((st) => st.refreshToken);
  const [error, setError] = useState<string | null>(null);
  const [accepted, setAccepted] = useState(false);

  const preview = useQuery({
    queryKey: ['professional-invite', token],
    queryFn: () => professionalInviteApi.peek(token),
    retry: false,
  });

  const accept = useMutation({
    mutationFn: () => professionalInviteApi.accept(token),
    onSuccess: () => setAccepted(true),
    onError: (e) => setError(apiErrorMessage(e, 'Could not accept this invitation')),
  });

  if (preview.isLoading) {
    return (
      <div className="mx-auto max-w-lg py-10">
        <Card>
          <CardContent className="flex items-center gap-2 p-6 text-[13px] text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Opening the invitation…
          </CardContent>
        </Card>
      </div>
    );
  }

  if (preview.isError) {
    return (
      <div className="mx-auto max-w-lg py-10">
        <Card>
          <CardContent className="space-y-3 p-6">
            <h1 className="font-display text-[22px] text-foreground">This invitation isn’t open</h1>
            <p className="text-[13.5px] leading-relaxed text-muted-foreground">
              {apiErrorMessage(preview.error, 'The link may have expired or already been used.')}{' '}
              Ask the person who sent it to invite you again.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const invite = preview.data!;
  const inviteNext = `/professional-invitations/${token}`;
  const signedInAs = session.status === 'signed-in' ? session.user.email : null;
  // No recorded address means the server alone decides who may accept.
  const emailMatches =
    signedInAs !== null &&
    (!invite.invitedEmail || signedInAs.toLowerCase() === invite.invitedEmail.toLowerCase());

  /** Leave this session and come back here signed in as the invited account. */
  async function switchAccount() {
    // eslint-disable-next-line everypaisa/no-silent-catch -- best-effort revoke, as in Header: the local session is cleared either way, and a failed revoke only leaves a refresh token to expire on its own
    try { await authApi.logout(refreshToken); } catch { /* ignore */ }
    clearSession();
    navigate(`/login?next=${encodeURIComponent(inviteNext)}`);
  }

  if (accepted) {
    return (
      <div className="mx-auto max-w-lg space-y-4 py-10">
        <Card>
          <CardContent className="space-y-4 p-6">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-accent-ink" strokeWidth={1.7} />
              <h1 className="font-display text-[24px] leading-tight text-foreground">
                You can now see {invite.invitedBy}’s books
              </h1>
            </div>
            <p className="text-[13.5px] leading-relaxed text-muted-foreground">
              Open them from Client books. They decide what you can see and can change or withdraw
              it at any time, and everything you do is on a trail they can read.
            </p>
            <Button onClick={() => navigate('/ca')} className="w-full">
              Open their books <ArrowRight className="h-4 w-4" />
            </Button>
          </CardContent>
        </Card>

        {/* The honest upsell: this account is free and covers exactly one
            thing. Anything more is a plan, and saying so here is better than
            letting them discover it at the moment they try. */}
        <Card>
          <CardContent className="space-y-3 p-6">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-accent-ink" strokeWidth={1.7} />
              <h2 className="text-[15px] font-medium text-foreground">Your own account</h2>
            </div>
            <p className="text-[13px] leading-relaxed text-muted-foreground">
              This is free and covers the clients who invite you. Track your own portfolios, or
              bring your own clients onto EveryPaisa and keep their books here, on an advisor plan.
            </p>
            <div className="flex gap-2">
              <Button asChild size="sm" variant="outline">
                <Link to="/dashboard">Set up my portfolio</Link>
              </Button>
              <Button asChild size="sm">
                <Link to="/settings/billing">See advisor plans</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg py-10">
      <Card>
        <CardContent className="space-y-4 p-6">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-accent-ink" strokeWidth={1.7} />
            <h1 className="font-display text-[26px] leading-tight tracking-tight text-foreground">
              {invite.invitedBy} would like you to see their books
            </h1>
          </div>

          <p className="text-[13.5px] leading-relaxed text-muted-foreground">
            Accepting lets you open their holdings, transactions, statements and reports, and keep
            their books. They choose how much of that you get, they can see everything you do, and
            they can withdraw it at any time.
          </p>

          <p className="text-[12.5px] leading-relaxed text-muted-foreground">
            The invitation was sent to <span className="font-medium">{invite.invitedEmail}</span>,
            and only that account can accept it. It expires on{' '}
            {new Date(invite.expiresAt).toLocaleDateString('en-IN', {
              day: '2-digit',
              month: 'long',
              year: 'numeric',
            })}
            .
          </p>

          {error && <p className="text-[12.5px] text-negative">{error}</p>}

          {session.status === 'loading' ? (
            <div className="flex items-center gap-2 text-[12.5px] text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Checking your sign-in…
            </div>
          ) : session.status === 'signed-in' ? (
            <div className="space-y-3">
              {emailMatches ? (
                <p className="text-[12.5px] text-muted-foreground">
                  Signed in as <span className="font-medium text-foreground">{signedInAs}</span>.
                </p>
              ) : (
                <p className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2.5 text-[12.5px] leading-relaxed text-foreground">
                  You are signed in as <span className="font-medium">{signedInAs}</span>, but this
                  invitation is for <span className="font-medium">{invite.invitedEmail}</span>. Sign
                  in with that account to accept it.
                </p>
              )}
              {emailMatches ? (
                <Button
                  onClick={() => accept.mutate()}
                  disabled={accept.isPending}
                  className="w-full"
                >
                  {accept.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                  Accept and open their books
                </Button>
              ) : (
                <Button onClick={switchAccount} variant="outline" className="w-full">
                  Sign in as {invite.invitedEmail}
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-[12.5px] leading-relaxed text-muted-foreground">
                Sign in with {invite.invitedEmail} to accept — or create an account with that
                address first. It is free.
              </p>
              <div className="flex gap-2">
                <Button asChild className="flex-1">
                  <Link to={`/login?next=${encodeURIComponent(inviteNext)}`}>
                    Sign in
                  </Link>
                </Button>
                <Button asChild variant="outline" className="flex-1">
                  <Link to={`/register?next=${encodeURIComponent(inviteNext)}`}>
                    Create account
                  </Link>
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
