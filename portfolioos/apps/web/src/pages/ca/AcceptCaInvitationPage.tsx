import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { ShieldCheck, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { professionalAccessApi } from '@/api/ca.api';
import { apiErrorMessage } from '@/api/client';

/**
 * Accepting a CA's invitation.
 *
 * The page states what is being granted before it is granted, in the plainest
 * words available: complete financial position, and the ability to edit the
 * books. Anything softer would understate it, and this is the only moment the
 * person gets to decide.
 *
 * There is no preview of who invited them beyond what the link carries — the
 * server refuses a token that wasn't issued to this account's email, so a
 * mis-sent link fails at accept rather than showing a stranger's details.
 */
export function AcceptCaInvitationPage() {
  const { token = '' } = useParams();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  const accept = useMutation({
    mutationFn: () => professionalAccessApi.acceptInvitation(token),
    onSuccess: () => navigate('/settings/professional-access'),
    onError: (e) => setError(apiErrorMessage(e, 'Could not accept this invitation')),
  });

  return (
    <div className="mx-auto max-w-lg py-10">
      <Card>
        <CardContent className="space-y-4 p-6">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-accent-ink" strokeWidth={1.7} />
            <h1 className="font-display text-[26px] leading-tight tracking-tight text-foreground">
              Give your accountant access
            </h1>
          </div>

          <p className="text-[13.5px] leading-relaxed text-muted-foreground">
            Accepting lets them see your complete financial position — holdings,
            transactions, capital gains — and keep your books: creating and editing
            vouchers, your chart of accounts, and corrections to your records.
          </p>

          <ul className="space-y-1.5 text-[12.5px] leading-relaxed text-muted-foreground">
            <li>· They cannot create or delete portfolios, or change your login.</li>
            <li>· They cannot see your saved credentials or connected mailboxes.</li>
            <li>· Every change they make is recorded, and you can read all of it.</li>
            <li>· You can withdraw access at any time, and it stops immediately.</li>
          </ul>

          {error && <p className="text-[12.5px] text-negative">{error}</p>}

          <div className="flex gap-2 pt-1">
            <Button onClick={() => accept.mutate()} disabled={accept.isPending} className="flex-1">
              {accept.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Accepting…
                </>
              ) : (
                'Accept'
              )}
            </Button>
            <Button variant="outline" onClick={() => navigate('/dashboard')} className="flex-1">
              Not now
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
