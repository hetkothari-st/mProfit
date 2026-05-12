import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Loader2, Send, Trash2, Mail, Check } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { notificationsApi } from '@/api/notifications.api';
import { gmailApi } from '@/api/gmail.api';

/**
 * Zero-password email setup. The landlord clicks "Connect Gmail", grants
 * consent on Google, and the app sends rent reminders via the Gmail API
 * using their existing OAuth tokens — same connection that already
 * powers inbox ingestion. SMTP / app password flow stays available
 * server-side for non-Gmail users but isn't surfaced here.
 */
export function NotificationsSection() {
  const qc = useQueryClient();
  const [testEmail, setTestEmail] = useState<string>('');

  const statusQuery = useQuery({
    queryKey: ['notifications', 'status'],
    queryFn: () => notificationsApi.getStatus(),
  });

  const connectMut = useMutation({
    mutationFn: () => gmailApi.authUrl(),
    onSuccess: ({ url }) => {
      // Open Google consent in same tab — the existing /gmail/callback
      // route handles the redirect + token exchange and brings the user
      // back to the dashboard.
      window.location.href = url;
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : 'Could not start Google sign-in'),
  });

  const testMut = useMutation({
    mutationFn: () => notificationsApi.testEmail(testEmail),
    onSuccess: (r) => {
      if (r.ok) toast.success(`Test email sent to ${testEmail}`);
      else toast.error(`Test failed — ${r.reason ?? 'unknown'}`, { duration: 8000 });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Test failed'),
  });

  const status = statusQuery.data;
  const connected = !!status?.gmailConnected;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Mail className="h-4 w-4 text-accent-ink/70" />
          <CardTitle>Email notifications</CardTitle>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          Rent reminders are sent via your Gmail account. One-time sign-in,
          no passwords stored.
        </p>
      </CardHeader>
      <CardContent>
        {statusQuery.isLoading ? (
          <div className="py-3 flex items-center justify-center">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : connected ? (
          <div className="space-y-4">
            <div className="rounded-md border border-emerald-200 bg-emerald-50/60 px-3 py-2.5 flex flex-wrap items-center gap-3">
              <Check className="h-4 w-4 text-emerald-700" />
              <span className="text-sm font-medium">Gmail connected</span>
              <span className="text-sm font-mono text-muted-foreground">
                {status?.gmailEmail}
              </span>
              <Button
                size="sm"
                variant="ghost"
                className="ml-auto"
                onClick={() => connectMut.mutate()}
                disabled={connectMut.isPending}
              >
                Reconnect
              </Button>
            </div>

            <div className="pt-2">
              <Label>Send test email</Label>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <Input
                  type="email"
                  value={testEmail}
                  onChange={(e) => setTestEmail(e.target.value)}
                  placeholder="your-other-email@example.com"
                  className="max-w-sm"
                />
                <Button
                  variant="outline"
                  onClick={() => testMut.mutate()}
                  disabled={!testEmail || testMut.isPending}
                >
                  {testMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                  Send test
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground mt-1.5">
                Send yourself a test before approving real tenant reminders.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Sign in with your Google account to allow PortfolioOS to send rent
              reminders on your behalf. No password is ever stored — Google
              grants and revokes access via your account settings.
            </p>
            <Button
              onClick={() => connectMut.mutate()}
              disabled={connectMut.isPending}
            >
              {connectMut.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <GoogleGlyph />
              )}
              Connect Gmail
            </Button>
            <p className="text-[11px] text-muted-foreground">
              You'll be redirected to Google, then back here. We request only
              the Gmail send + read scopes — nothing else.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function GoogleGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
      <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.24 1.5-1.7 4.4-5.5 4.4-3.3 0-6-2.7-6-6.1s2.7-6.1 6-6.1c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.6 3.7 14.5 2.8 12 2.8 6.9 2.8 2.8 6.9 2.8 12s4.1 9.2 9.2 9.2c5.3 0 8.8-3.7 8.8-9 0-.6-.1-1.1-.2-1.6H12z"/>
    </svg>
  );
}
