import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Loader2, Send, Trash2, Mail } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { notificationsApi, type NotificationConfigInput } from '@/api/notifications.api';

interface FormState extends NotificationConfigInput {}

const DEFAULT_FORM: FormState = {
  smtpHost: 'smtp.gmail.com',
  smtpPort: 587,
  smtpSecure: false,
  smtpUser: '',
  smtpPass: '',
  fromName: '',
  fromEmail: '',
  paymentInstructions: '',
};

export function NotificationsSection() {
  const qc = useQueryClient();
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [testEmail, setTestEmail] = useState<string>('');

  const configQuery = useQuery({
    queryKey: ['notifications', 'config'],
    queryFn: () => notificationsApi.getConfig(),
  });

  // Sync server config into form once it loads. Password field stays
  // blank because the server never sends it back — the "keep existing
  // password" sentinel is an empty string on save.
  useEffect(() => {
    const cfg = configQuery.data;
    if (cfg) {
      setForm({
        smtpHost: cfg.smtpHost,
        smtpPort: cfg.smtpPort,
        smtpSecure: cfg.smtpSecure,
        smtpUser: cfg.smtpUser,
        smtpPass: '',
        fromName: cfg.fromName,
        fromEmail: cfg.fromEmail,
        paymentInstructions: cfg.paymentInstructions ?? '',
      });
    }
  }, [configQuery.data]);

  const saveMut = useMutation({
    mutationFn: () =>
      notificationsApi.upsertConfig({
        ...form,
        smtpPass: form.smtpPass?.trim() || undefined,
        paymentInstructions: form.paymentInstructions?.trim() || null,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications', 'config'] });
      toast.success('Notification settings saved');
      setForm((f) => ({ ...f, smtpPass: '' }));
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
      toast.success('Notification settings cleared');
      setForm(DEFAULT_FORM);
    },
  });

  const hasConfig = !!configQuery.data;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Mail className="h-4 w-4 text-accent-ink/70" />
          <CardTitle>Email notifications (SMTP)</CardTitle>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          Per-user transactional email config used for rent reminders. Gmail,
          Brevo, SendGrid, Mailgun, Resend and self-hosted SMTP all work.
        </p>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={(e) => { e.preventDefault(); saveMut.mutate(); }}
          className="space-y-4"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>SMTP host</Label>
              <Input
                value={form.smtpHost}
                onChange={(e) => setForm({ ...form, smtpHost: e.target.value })}
                placeholder="smtp.gmail.com"
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Port</Label>
                <Input
                  type="number"
                  value={form.smtpPort}
                  onChange={(e) => setForm({ ...form, smtpPort: Number(e.target.value) })}
                  required
                />
              </div>
              <div>
                <Label>Secure (TLS)</Label>
                <div className="h-10 flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={form.smtpSecure}
                    onChange={(e) => setForm({ ...form, smtpSecure: e.target.checked })}
                    className="h-4 w-4"
                  />
                  <span className="text-xs text-muted-foreground">
                    {form.smtpSecure ? '465 / SSL' : '587 / STARTTLS'}
                  </span>
                </div>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>SMTP username</Label>
              <Input
                value={form.smtpUser}
                onChange={(e) => setForm({ ...form, smtpUser: e.target.value })}
                placeholder="you@gmail.com"
                required
              />
            </div>
            <div>
              <Label>
                SMTP password{' '}
                {hasConfig && (
                  <span className="text-[10px] text-muted-foreground font-normal">
                    (leave blank to keep current)
                  </span>
                )}
              </Label>
              <Input
                type="password"
                value={form.smtpPass ?? ''}
                onChange={(e) => setForm({ ...form, smtpPass: e.target.value })}
                placeholder={hasConfig ? '••••••••' : '16-char app password'}
                autoComplete="new-password"
              />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>From name</Label>
              <Input
                value={form.fromName}
                onChange={(e) => setForm({ ...form, fromName: e.target.value })}
                placeholder="Het Kothari"
                required
              />
            </div>
            <div>
              <Label>From email</Label>
              <Input
                type="email"
                value={form.fromEmail}
                onChange={(e) => setForm({ ...form, fromEmail: e.target.value })}
                placeholder="you@gmail.com"
                required
              />
            </div>
          </div>
          <div>
            <Label>
              Default payment instructions{' '}
              <span className="text-[10px] text-muted-foreground font-normal">
                (per-property override available)
              </span>
            </Label>
            <textarea
              value={form.paymentInstructions ?? ''}
              onChange={(e) => setForm({ ...form, paymentInstructions: e.target.value })}
              placeholder="UPI: yourname@upi · NEFT: HDFC A/c XXXXX1234, IFSC HDFC0001234"
              className="w-full min-h-[72px] rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
          </div>
          <div className="flex flex-wrap gap-2 pt-1">
            <Button type="submit" disabled={saveMut.isPending}>
              {saveMut.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Save settings
            </Button>
            {hasConfig && (
              <Button
                type="button"
                variant="outline"
                onClick={() => deleteMut.mutate()}
                disabled={deleteMut.isPending}
              >
                {deleteMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                Clear settings
              </Button>
            )}
          </div>
        </form>

        {hasConfig && (
          <div className="mt-6 pt-4 border-t border-border/60">
            <Label>Send test email</Label>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <Input
                type="email"
                value={testEmail}
                onChange={(e) => setTestEmail(e.target.value)}
                placeholder="your-email@example.com"
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
              Sends a small test email so you can verify creds before approving real reminders.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
