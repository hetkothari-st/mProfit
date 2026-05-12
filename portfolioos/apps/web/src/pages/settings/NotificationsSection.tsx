import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Loader2, Send, Trash2, Mail, Check, ExternalLink } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuthStore } from '@/stores/auth.store';
import { notificationsApi } from '@/api/notifications.api';

/**
 * Minimal email setup — the user only enters their mail provider's app
 * password. Everything else (SMTP host/port, from address, name) is
 * derived from the auth profile + a domain → provider map on the server.
 */
export function NotificationsSection() {
  const qc = useQueryClient();
  const { user } = useAuthStore();
  const [appPassword, setAppPassword] = useState<string>('');
  const [testEmail, setTestEmail] = useState<string>('');

  const configQuery = useQuery({
    queryKey: ['notifications', 'config'],
    queryFn: () => notificationsApi.getConfig(),
  });
  const hasConfig = !!configQuery.data?.hasPassword;

  const saveMut = useMutation({
    mutationFn: () => notificationsApi.upsertConfig({ smtpPass: appPassword }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications', 'config'] });
      toast.success('Email setup saved');
      setAppPassword('');
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Save failed'),
  });

  const testMut = useMutation({
    mutationFn: () => notificationsApi.testEmail(testEmail),
    onSuccess: (r) => {
      if (r.ok) toast.success(`Test email sent to ${testEmail}`);
      else toast.error(`Test failed — ${r.reason ?? 'unknown'}`, { duration: 8000 });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Test failed'),
  });

  const deleteMut = useMutation({
    mutationFn: () => notificationsApi.deleteConfig(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications', 'config'] });
      toast.success('Email setup cleared');
      setAppPassword('');
    },
  });

  const emailDomain = user?.email?.split('@')[1]?.toLowerCase() ?? '';
  const helpLink = (() => {
    if (emailDomain === 'gmail.com' || emailDomain === 'googlemail.com') {
      return {
        label: 'Generate a Google app password',
        href: 'https://myaccount.google.com/apppasswords',
      };
    }
    if (
      emailDomain === 'outlook.com'
      || emailDomain === 'hotmail.com'
      || emailDomain === 'live.com'
    ) {
      return {
        label: 'Generate a Microsoft app password',
        href: 'https://account.microsoft.com/security',
      };
    }
    if (emailDomain === 'yahoo.com' || emailDomain === 'yahoo.in') {
      return {
        label: 'Generate a Yahoo app password',
        href: 'https://login.yahoo.com/account/security/app-passwords',
      };
    }
    if (emailDomain === 'icloud.com' || emailDomain === 'me.com') {
      return {
        label: 'Generate an iCloud app-specific password',
        href: 'https://appleid.apple.com/account/manage',
      };
    }
    if (emailDomain === 'zoho.com' || emailDomain === 'zoho.in') {
      return {
        label: 'Generate a Zoho app password',
        href: 'https://accounts.zoho.com/u/h#security/app_password',
      };
    }
    return null;
  })();

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Mail className="h-4 w-4 text-accent-ink/70" />
          <CardTitle>Email notifications</CardTitle>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          Used to send rent reminders to tenants on your behalf. We derive
          the mail server, sender name and address from your account profile —
          you only need to paste your app password.
        </p>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Read-only summary so the user knows what we'll send as */}
          <div className="rounded-md border border-border bg-muted/30 px-3 py-2.5 text-sm flex flex-wrap items-center gap-x-4 gap-y-1.5">
            <span className="text-muted-foreground text-xs">Sending as</span>
            <span className="font-medium">{user?.name ?? '—'}</span>
            <span className="text-muted-foreground">·</span>
            <span className="font-mono text-xs">{user?.email ?? '—'}</span>
            {hasConfig && (
              <span className="inline-flex items-center gap-1 text-xs text-emerald-700 font-medium ml-auto">
                <Check className="h-3.5 w-3.5" /> App password saved
              </span>
            )}
          </div>

          <div>
            <Label>
              App password
              {hasConfig && (
                <span className="text-[10px] text-muted-foreground font-normal ml-2">
                  (leave blank to keep current)
                </span>
              )}
            </Label>
            <Input
              type="password"
              value={appPassword}
              onChange={(e) => setAppPassword(e.target.value)}
              placeholder={hasConfig ? '••••••••••••••••' : 'Paste your provider app password here'}
              autoComplete="new-password"
            />
            {helpLink && (
              <a
                href={helpLink.href}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-accent-ink/80 hover:underline inline-flex items-center gap-1 mt-1.5"
              >
                {helpLink.label} <ExternalLink className="h-3 w-3" />
              </a>
            )}
            {!helpLink && emailDomain && (
              <p className="text-xs text-amber-700 mt-1.5">
                We don't have an auto-setup for <strong>@{emailDomain}</strong> yet.
                Try a Gmail / Outlook / Yahoo / iCloud / Zoho address.
              </p>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => saveMut.mutate()}
              disabled={(!appPassword.trim() && !hasConfig) || saveMut.isPending}
            >
              {saveMut.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Save app password
            </Button>
            {hasConfig && (
              <Button
                variant="outline"
                onClick={() => deleteMut.mutate()}
                disabled={deleteMut.isPending}
              >
                {deleteMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                Clear
              </Button>
            )}
          </div>

          {hasConfig && (
            <div className="pt-3 border-t border-border/60">
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
          )}
        </div>
      </CardContent>
    </Card>
  );
}
