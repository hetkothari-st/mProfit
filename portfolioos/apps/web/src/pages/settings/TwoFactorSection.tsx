import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import QRCode from 'qrcode';
import { Copy, Download, KeyRound, Loader2, ShieldCheck, ShieldOff } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { authApi } from '@/api/auth.api';
import { apiErrorMessage } from '@/api/client';

type Mode = 'setup' | 'codes' | 'disable' | 'regenerate' | null;

function CodeInput({ value, onChange, id }: { value: string; onChange: (v: string) => void; id: string }) {
  return (
    <Input
      id={id}
      className="mt-1 tracking-widest"
      autoComplete="one-time-code"
      inputMode="numeric"
      maxLength={12}
      placeholder="123456"
      value={value}
      onChange={(e) => onChange(e.target.value.toUpperCase())}
    />
  );
}

/** Backup codes, shown once: copy or download, with a clear "save these" prompt. */
function BackupCodes({ codes }: { codes: string[] }) {
  const text = codes.join('\n');
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Save these somewhere safe, like a password manager. Each code signs you in once if you lose your phone.
        They won&apos;t be shown again.
      </p>
      <div className="grid grid-cols-2 gap-2 rounded-md border border-border bg-muted/40 p-3 font-mono text-sm">
        {codes.map((c) => (
          <span key={c}>{c}</span>
        ))}
      </div>
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void navigator.clipboard.writeText(text).then(() => toast.success('Copied'))}
        >
          <Copy className="mr-2 h-4 w-4" /> Copy
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            const a = document.createElement('a');
            a.href = URL.createObjectURL(new Blob([`EveryPaisa backup codes\n\n${text}\n`], { type: 'text/plain' }));
            a.download = 'everypaisa-backup-codes.txt';
            a.click();
            URL.revokeObjectURL(a.href);
          }}
        >
          <Download className="mr-2 h-4 w-4" /> Download
        </Button>
      </div>
    </div>
  );
}

/**
 * Settings → Two-factor sign-in. Turning it on: scan a QR code with an
 * authenticator app, confirm one code, save the backup codes. Turning it off
 * or replacing the backup codes needs a current code.
 */
export function TwoFactorSection() {
  const qc = useQueryClient();
  const status = useQuery({ queryKey: ['two-factor-status'], queryFn: authApi.twoFactorStatus });
  const [mode, setMode] = useState<Mode>(null);
  const [code, setCode] = useState('');
  const [setup, setSetup] = useState<{ secret: string; otpauthUrl: string } | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);

  // Rendered locally: the secret never goes to a QR service.
  useEffect(() => {
    if (!setup) return;
    QRCode.toDataURL(setup.otpauthUrl, { margin: 1, width: 200 }).then(setQr, () => setQr(null));
  }, [setup]);

  const close = () => {
    setMode(null);
    setCode('');
    setSetup(null);
    setQr(null);
    setBackupCodes(null);
    void qc.invalidateQueries({ queryKey: ['two-factor-status'] });
  };

  const begin = useMutation({
    mutationFn: authApi.twoFactorSetup,
    onSuccess: (s) => {
      setSetup(s);
      setMode('setup');
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Could not start setup')),
  });
  const enable = useMutation({
    mutationFn: () => authApi.twoFactorEnable(code.trim()),
    onSuccess: (r) => {
      setBackupCodes(r.backupCodes);
      setMode('codes');
      setCode('');
      toast.success('Two-factor sign-in is on');
    },
    onError: (err) => toast.error(apiErrorMessage(err, "That code didn't match")),
  });
  const disable = useMutation({
    mutationFn: () => authApi.twoFactorDisable(code.trim()),
    onSuccess: () => {
      toast.success('Two-factor sign-in is off');
      close();
    },
    onError: (err) => toast.error(apiErrorMessage(err, "That code didn't match")),
  });
  const regenerate = useMutation({
    mutationFn: () => authApi.twoFactorBackupCodes(code.trim()),
    onSuccess: (r) => {
      setBackupCodes(r.backupCodes);
      setMode('codes');
      setCode('');
    },
    onError: (err) => toast.error(apiErrorMessage(err, "That code didn't match")),
  });

  const enabled = status.data?.enabled ?? false;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Two-factor sign-in</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {status.isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        ) : enabled ? (
          <>
            <div className="flex items-start gap-3">
              <ShieldCheck className="mt-0.5 h-5 w-5 text-primary" />
              <div className="text-sm">
                <p className="font-medium">On</p>
                <p className="text-muted-foreground">
                  Signing in needs a code from your authenticator app. {status.data?.backupCodesRemaining ?? 0} backup
                  code{status.data?.backupCodesRemaining === 1 ? '' : 's'} left.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => setMode('regenerate')}>
                <KeyRound className="mr-2 h-4 w-4" /> New backup codes
              </Button>
              <Button variant="outline" size="sm" onClick={() => setMode('disable')}>
                <ShieldOff className="mr-2 h-4 w-4" /> Turn off
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              Add a second step to signing in: a code from an authenticator app such as Google Authenticator, Microsoft
              Authenticator or Authy. Someone who learns your password still can&apos;t get in.
            </p>
            <Button size="sm" onClick={() => begin.mutate()} disabled={begin.isPending}>
              {begin.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Turn on
            </Button>
          </>
        )}
      </CardContent>

      <Dialog open={mode !== null} onOpenChange={(o) => !o && close()}>
        <DialogContent>
          {mode === 'setup' && setup && (
            <>
              <DialogHeader>
                <DialogTitle>Set up your authenticator app</DialogTitle>
                <DialogDescription>Scan the code with the app, then enter the 6-digit code it shows.</DialogDescription>
              </DialogHeader>
              <div className="flex flex-col items-center gap-3">
                {qr ? (
                  <img src={qr} alt="QR code for your authenticator app" width={200} height={200} className="rounded bg-white p-2" />
                ) : (
                  <Loader2 className="h-6 w-6 animate-spin" />
                )}
                <p className="text-center text-xs text-muted-foreground">
                  Can&apos;t scan? Enter this key in the app:
                  <br />
                  <span className="select-all font-mono text-sm text-foreground">{setup.secret.match(/.{1,4}/g)?.join(' ')}</span>
                </p>
              </div>
              <div>
                <Label htmlFor="tf-setup-code">Code from the app</Label>
                <CodeInput id="tf-setup-code" value={code} onChange={(v) => setCode(v.replace(/\D/g, ''))} />
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={close}>
                  Cancel
                </Button>
                <Button onClick={() => enable.mutate()} disabled={!/^\d{6}$/.test(code) || enable.isPending}>
                  {enable.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Turn on
                </Button>
              </DialogFooter>
            </>
          )}

          {mode === 'codes' && backupCodes && (
            <>
              <DialogHeader>
                <DialogTitle>Your backup codes</DialogTitle>
              </DialogHeader>
              <BackupCodes codes={backupCodes} />
              <DialogFooter>
                <Button onClick={close}>I&apos;ve saved them</Button>
              </DialogFooter>
            </>
          )}

          {(mode === 'disable' || mode === 'regenerate') && (
            <>
              <DialogHeader>
                <DialogTitle>{mode === 'disable' ? 'Turn off two-factor sign-in?' : 'Replace your backup codes?'}</DialogTitle>
                <DialogDescription>
                  {mode === 'disable'
                    ? 'Enter a code from your authenticator app (or a backup code) to confirm. Signing in will need only your password.'
                    : 'Your current backup codes will stop working. Enter a code from your authenticator app to confirm.'}
                </DialogDescription>
              </DialogHeader>
              <div>
                <Label htmlFor="tf-confirm-code">Code</Label>
                <CodeInput id="tf-confirm-code" value={code} onChange={setCode} />
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={close}>
                  Cancel
                </Button>
                <Button
                  variant={mode === 'disable' ? 'destructive' : 'default'}
                  disabled={code.trim().length < 6 || disable.isPending || regenerate.isPending}
                  onClick={() => (mode === 'disable' ? disable.mutate() : regenerate.mutate())}
                >
                  {(disable.isPending || regenerate.isPending) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {mode === 'disable' ? 'Turn off' : 'Replace codes'}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
