import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { KeyRound, Loader2, ShieldCheck } from 'lucide-react';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { familyClaimApi } from '@/api/families.api';
import { apiErrorMessage } from '@/api/client';
import { useAuthStore } from '@/stores/auth.store';

/**
 * Taking over the account a family member kept for you.
 *
 * The person opening this has no login — that is the whole reason someone
 * else was keeping their books — so the page is public and asks for one
 * thing: a password. It is not a sign-up: the account already exists, with
 * their holdings in it, and this hands it over rather than creating another.
 *
 * The address is fixed to the one the link was sent to and shown read-only;
 * changing it here would just fail at the server, which checks the two match.
 */
export function ClaimProfilePage() {
  const { token = '' } = useParams();
  const navigate = useNavigate();
  const setSession = useAuthStore((s) => s.setSession);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');

  const preview = useQuery({
    queryKey: ['family-claim', token],
    queryFn: () => familyClaimApi.peek(token),
    retry: false,
  });

  const claim = useMutation({
    mutationFn: () =>
      familyClaimApi.claim(token, { email: preview.data!.invitedEmail, password }),
    onSuccess: (session) => {
      setSession(session.user, session.tokens, { remember: true });
      toast.success('This account is yours now');
      navigate('/dashboard', { replace: true });
    },
    onError: (e) => toast.error(apiErrorMessage(e, 'Could not take over the account')),
  });

  if (preview.isLoading) {
    return (
      <Shell>
        <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Opening the link…
        </div>
      </Shell>
    );
  }

  if (preview.isError || !preview.data) {
    return (
      <Shell>
        <h1 className="font-display text-[22px] text-foreground">This link isn’t open</h1>
        <p className="mt-2 text-[13.5px] leading-relaxed text-muted-foreground">
          {apiErrorMessage(preview.error, 'It may have expired or already been used.')} Ask the
          person keeping your books to send it again.
        </p>
      </Shell>
    );
  }

  const p = preview.data;
  const tooShort = password.length > 0 && password.length < 8;
  const mismatch = confirm.length > 0 && confirm !== password;
  const ready = password.length >= 8 && confirm === password && !claim.isPending;

  return (
    <Shell>
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-5 w-5 text-accent-ink" strokeWidth={1.7} />
        <h1 className="font-display text-[24px] leading-tight text-foreground">
          Take over your account
        </h1>
      </div>

      <p className="mt-3 text-[13.5px] leading-relaxed text-muted-foreground">
        <span className="font-medium text-foreground">{p.invitedBy}</span> has been keeping{' '}
        <span className="font-medium text-foreground">{p.profileName}</span>’s finances on
        EveryPaisa, in {p.familyName}. Set a password and the account becomes yours — everything
        recorded so far stays exactly as it is, and only you can open it afterwards.
      </p>

      <div className="mt-5 space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="claim-email">Your email</Label>
          <Input id="claim-email" readOnly value={p.invitedEmail} className="text-[13px]" />
          <p className="text-[11.5px] text-muted-foreground">
            The address this link was sent to. It becomes your sign-in.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="claim-password">Choose a password</Label>
          <Input
            id="claim-password"
            type="password"
            autoFocus
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {tooShort && (
            <p className="text-[11.5px] text-negative">Use at least 8 characters.</p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="claim-confirm">Type it again</Label>
          <Input
            id="claim-confirm"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
          {mismatch && <p className="text-[11.5px] text-negative">These do not match.</p>}
        </div>
      </div>

      <Button className="mt-5 w-full" disabled={!ready} onClick={() => claim.mutate()}>
        {claim.isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <KeyRound className="h-4 w-4" />
        )}
        Take over my account
      </Button>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-lg px-4 py-10">
      <Card>
        <CardContent className="p-6">{children}</CardContent>
      </Card>
    </div>
  );
}
