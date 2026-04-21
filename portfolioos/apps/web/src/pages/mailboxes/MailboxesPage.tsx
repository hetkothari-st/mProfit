import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Loader2, RefreshCw, Trash2, Mail, CheckCircle2, Chrome } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { EmptyState } from '@/components/common/EmptyState';
import { mailboxesApi, type MailboxCreateInput } from '@/api/mailboxes.api';
import { gmailApi } from '@/api/gmail.api';
import { apiErrorMessage } from '@/api/client';

const DEFAULT_FORM: MailboxCreateInput = {
  label: '',
  host: 'imap.gmail.com',
  port: 993,
  secure: true,
  username: '',
  password: '',
  folder: 'INBOX',
  fromFilter: '',
  subjectFilter: '',
  isActive: true,
};

export function MailboxesPage() {
  const qc = useQueryClient();
  const [form, setForm] = useState<MailboxCreateInput>(DEFAULT_FORM);

  const { data: mailboxes, isLoading } = useQuery({
    queryKey: ['mailboxes'],
    queryFn: () => mailboxesApi.list(),
  });

  const { data: gmailCfg } = useQuery({
    queryKey: ['gmail', 'config'],
    queryFn: () => gmailApi.config(),
  });

  const gmailAuthMut = useMutation({
    mutationFn: () => gmailApi.authUrl(),
    onSuccess: (r) => {
      window.location.href = r.url;
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });

  const gmailSyncMut = useMutation({
    mutationFn: (id: string) => gmailApi.sync(id),
    onSuccess: (r) => {
      toast.success(`Gmail: ${r.imported} imported / ${r.processed} processed`);
      qc.invalidateQueries({ queryKey: ['mailboxes'] });
      qc.invalidateQueries({ queryKey: ['imports'] });
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });

  const gmailDelMut = useMutation({
    mutationFn: (id: string) => gmailApi.remove(id),
    onSuccess: () => {
      toast.success('Gmail disconnected');
      qc.invalidateQueries({ queryKey: ['mailboxes'] });
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });

  const createMut = useMutation({
    mutationFn: (input: MailboxCreateInput) => mailboxesApi.create(input),
    onSuccess: () => {
      toast.success('Mailbox added');
      setForm(DEFAULT_FORM);
      qc.invalidateQueries({ queryKey: ['mailboxes'] });
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });

  const testMut = useMutation({
    mutationFn: () =>
      mailboxesApi.test({
        host: form.host,
        port: form.port ?? 993,
        secure: form.secure ?? true,
        username: form.username,
        password: form.password,
      }),
    onSuccess: (r) => {
      if (r.ok) {
        toast.success('Connection OK');
      } else {
        const parts = [r.message ?? 'Connection failed'];
        if (r.hint) parts.push(r.hint);
        toast.error(parts.join(' — '), { duration: 10000 });
      }
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });

  const pollMut = useMutation({
    mutationFn: (id: string) => mailboxesApi.poll(id),
    onSuccess: (r) => {
      toast.success(`Polled: ${r.imported} imported / ${r.processed} processed`);
      qc.invalidateQueries({ queryKey: ['mailboxes'] });
      qc.invalidateQueries({ queryKey: ['imports'] });
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });

  const delMut = useMutation({
    mutationFn: (id: string) => mailboxesApi.remove(id),
    onSuccess: () => {
      toast.success('Mailbox removed');
      qc.invalidateQueries({ queryKey: ['mailboxes'] });
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });

  return (
    <div>
      <PageHeader
        title="Email Inbox Gateway"
        description="Auto-import contract notes & CAS from your email"
      />

      <Card className="mb-6 border-accent/40">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Chrome className="h-4 w-4" /> Connect Gmail (recommended)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-sm text-muted-foreground">
            One-click sign-in via Google. No password, no App Password setup. We only request
            read-only access to Gmail and you can revoke anytime at{' '}
            <a
              className="text-accent underline"
              href="https://myaccount.google.com/permissions"
              target="_blank"
              rel="noreferrer"
            >
              myaccount.google.com/permissions
            </a>
            .
          </p>
          {gmailCfg && !gmailCfg.configured ? (
            <p className="text-xs text-negative">
              Gmail OAuth is not configured on the server. Set GOOGLE_OAUTH_CLIENT_ID,
              GOOGLE_OAUTH_CLIENT_SECRET, GOOGLE_OAUTH_REDIRECT_URL in{' '}
              <code>packages/api/.env</code>.
            </p>
          ) : null}
          <div>
            <Button
              onClick={() => gmailAuthMut.mutate()}
              disabled={!gmailCfg?.configured || gmailAuthMut.isPending}
            >
              {gmailAuthMut.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Chrome className="h-4 w-4" />
              )}
              Connect Gmail
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mail className="h-4 w-4" /> Add IMAP Mailbox (advanced)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">
              For Gmail, use an{' '}
              <a
                className="text-accent underline"
                href="https://support.google.com/mail/answer/185833"
                target="_blank"
                rel="noreferrer"
              >
                App Password
              </a>{' '}
              instead of your real password. IMAP must be enabled in your Gmail settings.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label>Label</Label>
                <Input
                  value={form.label ?? ''}
                  onChange={(e) => setForm({ ...form, label: e.target.value })}
                  placeholder="My Gmail"
                />
              </div>
              <div>
                <Label>IMAP Host</Label>
                <Input
                  value={form.host}
                  onChange={(e) => setForm({ ...form, host: e.target.value })}
                />
              </div>
              <div>
                <Label>Port</Label>
                <Input
                  type="number"
                  value={form.port ?? 993}
                  onChange={(e) => setForm({ ...form, port: Number(e.target.value) })}
                />
              </div>
              <div className="col-span-2">
                <Label>Username (email)</Label>
                <Input
                  type="email"
                  value={form.username}
                  onChange={(e) => setForm({ ...form, username: e.target.value })}
                />
              </div>
              <div className="col-span-2">
                <Label>Password / App password</Label>
                <Input
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                />
              </div>
              <div>
                <Label>Folder</Label>
                <Input
                  value={form.folder ?? 'INBOX'}
                  onChange={(e) => setForm({ ...form, folder: e.target.value })}
                />
              </div>
              <div>
                <Label>From filter (optional)</Label>
                <Input
                  value={form.fromFilter ?? ''}
                  onChange={(e) => setForm({ ...form, fromFilter: e.target.value })}
                  placeholder="noreply@camsonline.com"
                />
              </div>
              <div className="col-span-2">
                <Label>Subject filter (optional)</Label>
                <Input
                  value={form.subjectFilter ?? ''}
                  onChange={(e) => setForm({ ...form, subjectFilter: e.target.value })}
                  placeholder="Contract Note"
                />
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <Button
                variant="outline"
                onClick={() => testMut.mutate()}
                disabled={!form.username || !form.password || testMut.isPending}
              >
                {testMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                Test Connection
              </Button>
              <Button
                onClick={() => createMut.mutate(form)}
                disabled={!form.username || !form.password || createMut.isPending}
              >
                {createMut.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Save Mailbox
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Configured Mailboxes</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="py-8 text-center text-muted-foreground text-sm">Loading…</div>
            ) : !mailboxes || mailboxes.length === 0 ? (
              <EmptyState title="No mailboxes" description="Add an IMAP account to auto-import." />
            ) : (
              <div className="space-y-2">
                {mailboxes.map((m) => {
                  const isGmail = m.provider === 'GMAIL_OAUTH';
                  const displayName =
                    m.label ?? (isGmail ? m.googleEmail : m.username) ?? '(unnamed)';
                  const subtitle = isGmail
                    ? 'Gmail (OAuth) · read-only'
                    : `${m.host ?? '?'}:${m.port ?? '?'} · ${m.folder}`;
                  return (
                    <div
                      key={m.id}
                      className="flex items-center justify-between border rounded-md px-3 py-2"
                    >
                      <div>
                        <div className="font-medium text-sm flex items-center gap-2">
                          {isGmail ? (
                            <Chrome className="h-3.5 w-3.5" />
                          ) : (
                            <Mail className="h-3.5 w-3.5" />
                          )}
                          {displayName} ·{' '}
                          <span className={m.isActive ? 'text-positive' : 'text-muted-foreground'}>
                            {m.isActive ? 'Active' : 'Paused'}
                          </span>
                        </div>
                        <div className="text-xs text-muted-foreground">{subtitle}</div>
                        <div className="text-xs text-muted-foreground">
                          {m.lastPolledAt
                            ? `Last polled ${new Date(m.lastPolledAt).toLocaleString()}`
                            : 'Never polled'}
                        </div>
                        {m.lastError && (
                          <div className="text-xs text-negative truncate max-w-md">
                            {m.lastError}
                          </div>
                        )}
                      </div>
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            isGmail ? gmailSyncMut.mutate(m.id) : pollMut.mutate(m.id)
                          }
                          disabled={isGmail ? gmailSyncMut.isPending : pollMut.isPending}
                          title="Sync now"
                        >
                          <RefreshCw className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            const msg = isGmail
                              ? 'Disconnect this Gmail account?'
                              : 'Remove this mailbox?';
                            if (!confirm(msg)) return;
                            if (isGmail) gmailDelMut.mutate(m.id);
                            else delMut.mutate(m.id);
                          }}
                        >
                          <Trash2 className="h-4 w-4 text-negative" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
