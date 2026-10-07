import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Loader2, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { authApi, type AuthResult } from '@/api/auth.api';
import { apiErrorMessage } from '@/api/client';

interface Props {
  mfaToken: string;
  onVerified: (result: AuthResult) => void;
  onCancel: () => void;
}

/**
 * Second step of sign-in for accounts with two-factor on: a 6-digit code
 * from the authenticator app, or one of the backup codes.
 */
export function TwoFactorChallenge({ mfaToken, onVerified, onCancel }: Props) {
  const [useBackup, setUseBackup] = useState(false);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);

  const verify = useMutation({
    mutationFn: () => authApi.verifyTwoFactor(mfaToken, code.trim()),
    onSuccess: onVerified,
    onError: (err) => {
      setCode('');
      setError(apiErrorMessage(err, "That code didn't match."));
    },
  });

  const ready = useBackup ? code.replace(/[\s-]/g, '').length >= 8 : /^\d{6}$/.test(code.trim());

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        if (ready) verify.mutate();
      }}
    >
      <div className="flex items-start gap-3 rounded-md border border-border p-3">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
        <p className="text-sm text-muted-foreground">
          {useBackup
            ? 'Enter one of the backup codes you saved when you turned on two-factor sign-in. Each code works once.'
            : 'Enter the 6-digit code from your authenticator app.'}
        </p>
      </div>
      <div>
        <Label htmlFor="mfa-code">{useBackup ? 'Backup code' : 'Authentication code'}</Label>
        <Input
          id="mfa-code"
          className="mt-1 tracking-widest"
          autoFocus
          autoComplete="one-time-code"
          inputMode={useBackup ? 'text' : 'numeric'}
          maxLength={useBackup ? 12 : 6}
          placeholder={useBackup ? 'ABCD-EFGH' : '123456'}
          value={code}
          aria-invalid={Boolean(error)}
          onChange={(e) => setCode(useBackup ? e.target.value.toUpperCase() : e.target.value.replace(/\D/g, ''))}
        />
        {error && <p className="mt-1 text-sm text-destructive">{error}</p>}
      </div>
      <Button type="submit" className="w-full" disabled={!ready || verify.isPending}>
        {verify.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Verify and sign in
      </Button>
      <div className="flex justify-between text-sm">
        <button
          type="button"
          className="text-primary hover:underline"
          onClick={() => {
            setUseBackup((v) => !v);
            setCode('');
            setError(null);
          }}
        >
          {useBackup ? 'Use the authenticator app' : 'Use a backup code'}
        </button>
        <button type="button" className="text-muted-foreground hover:underline" onClick={onCancel}>
          Back to sign in
        </button>
      </div>
    </form>
  );
}
