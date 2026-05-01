import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Mail, X, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui/button';
import { authApi } from '@/api/auth.api';
import { mailboxesApi } from '@/api/mailboxes.api';
import { gmailApi } from '@/api/gmail.api';
import { apiErrorMessage } from '@/api/client';

const DISMISS_KEY = 'gmail-auto-connect-dismissed';

export function GmailAutoConnectBanner() {
  const [dismissed, setDismissed] = useState<boolean>(
    () => typeof window !== 'undefined' && localStorage.getItem(DISMISS_KEY) === '1',
  );

  const meQuery = useQuery({
    queryKey: ['auth-me'],
    queryFn: () => authApi.me(),
    staleTime: 60_000,
  });

  const mailboxesQuery = useQuery({
    queryKey: ['mailboxes'],
    queryFn: () => mailboxesApi.list(),
    staleTime: 60_000,
  });

  const gmailCfg = useQuery({
    queryKey: ['gmail', 'config'],
    queryFn: () => gmailApi.config(),
    staleTime: 60_000,
  });

  const connectMut = useMutation({
    mutationFn: () => gmailApi.authUrl(),
    onSuccess: (r) => {
      window.location.href = r.url;
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Failed to start Google sign-in')),
  });

  const userEmail = (meQuery.data?.email ?? '').toLowerCase();
  const isGmail = /@gmail\.com$/.test(userEmail) || /@googlemail\.com$/.test(userEmail);
  const alreadyConnected = (mailboxesQuery.data ?? []).some(
    (m) => m.provider === 'GMAIL_OAUTH' && m.isActive,
  );
  const oauthConfigured = gmailCfg.data?.configured ?? false;

  if (
    dismissed ||
    !isGmail ||
    alreadyConnected ||
    !oauthConfigured ||
    meQuery.isLoading ||
    mailboxesQuery.isLoading
  ) {
    return null;
  }

  function dismiss() {
    setDismissed(true);
    localStorage.setItem(DISMISS_KEY, '1');
  }

  return (
    <div className="border-b bg-blue-50/50 dark:bg-blue-950/20 px-6 py-2.5">
      <div className="flex items-center gap-3 text-sm">
        <Mail className="h-4 w-4 text-blue-600 shrink-0" />
        <div className="flex-1">
          <span className="font-medium">Auto-import statements from your inbox.</span>{' '}
          <span className="text-muted-foreground">
            Connect <span className="font-mono">{userEmail}</span> — we'll fetch contract notes,
            CAS PDFs, and trade confirmations automatically. You approve each new sender once.
          </span>
        </div>
        <Button
          size="sm"
          onClick={() => connectMut.mutate()}
          disabled={connectMut.isPending}
        >
          {connectMut.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Mail className="h-3.5 w-3.5" />
          )}
          Connect Gmail
        </Button>
        <Button variant="ghost" size="sm" onClick={dismiss} title="Dismiss">
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
