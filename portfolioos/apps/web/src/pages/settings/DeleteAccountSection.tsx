import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { AlertTriangle, Loader2, Trash2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
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
import { useAuthStore } from '@/stores/auth.store';

type Step = 'warn' | 'verify' | 'final';

const ERASED = [
  'Portfolios, transactions, holdings and capital gains',
  'Bank accounts, FDs, loans, credit cards and insurance policies',
  'Property, vehicles, rental records and goals',
  'Uploaded documents, statements and photos',
  'Connected Gmail and broker links',
];

function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/**
 * Danger zone: delete the account. Three confirmations — a warning listing
 * what goes, typing DELETE plus a password (or emailed code for Google
 * sign-ins), and a last explicit button. The account is then locked and
 * erased after the grace period unless the user signs in and restores it.
 */
export function DeleteAccountSection() {
  const navigate = useNavigate();
  const clearSession = useAuthStore((s) => s.clearSession);
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>('warn');
  const [confirmText, setConfirmText] = useState('');
  const [password, setPassword] = useState('');
  const [useCode, setUseCode] = useState(false);
  const [code, setCode] = useState('');
  const [codeSentTo, setCodeSentTo] = useState<string | null>(null);

  const statusQuery = useQuery({
    queryKey: ['account-deletion-status'],
    queryFn: authApi.deletionStatus,
    enabled: open,
  });
  const graceDays = statusQuery.data?.graceDays ?? 30;
  const blockers = statusQuery.data?.blockers ?? [];

  const sendCode = useMutation({
    mutationFn: authApi.sendDeletionCode,
    onSuccess: (r) => {
      setCodeSentTo(r.sentTo);
      toast.success(`Code sent to ${r.sentTo}`);
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Could not send the code')),
  });

  const remove = useMutation({
    mutationFn: () =>
      authApi.requestDeletion({
        confirmText,
        ...(useCode ? { code } : { password }),
      }),
    onSuccess: ({ scheduledFor }) => {
      setOpen(false);
      clearSession();
      toast.success(
        `Your account will be deleted on ${formatDay(scheduledFor)}. Sign in before then to restore it.`,
        { duration: 8000 },
      );
      navigate('/login', { replace: true });
    },
    onError: (err) => {
      toast.error(apiErrorMessage(err, 'Could not delete the account'));
      // Wrong password/code or a new blocker: go back to fix it.
      setStep('verify');
    },
  });

  const reset = () => {
    setStep('warn');
    setConfirmText('');
    setPassword('');
    setUseCode(false);
    setCode('');
    setCodeSentTo(null);
  };

  const verified =
    confirmText === 'DELETE' && (useCode ? /^\d{6}$/.test(code) : password.length > 0);

  return (
    <Card className="border-negative/40">
      <CardHeader>
        <CardTitle className="text-negative">Danger zone</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="text-sm">
          <div className="font-medium">Delete account</div>
          <p className="text-muted-foreground">
            Permanently erase your account and all its data. You get {graceDays} days to change your
            mind.
          </p>
        </div>
        <Button
          variant="destructive"
          onClick={() => {
            reset();
            setOpen(true);
          }}
        >
          <Trash2 className="h-4 w-4" />
          Delete account
        </Button>
      </CardContent>

      <Dialog
        open={open}
        onOpenChange={(o) => {
          if (!remove.isPending) setOpen(o);
        }}
      >
        <DialogContent className="max-w-md">
          {step === 'warn' && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-negative" />
                  Delete your account?
                </DialogTitle>
                <DialogDescription>
                  Everything below is permanently erased {graceDays} days after you confirm. Until
                  then your account is locked — signing in lets you restore it.
                </DialogDescription>
              </DialogHeader>
              <ul className="list-disc pl-5 space-y-1 text-sm">
                {ERASED.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
              {statusQuery.isLoading && (
                <div className="flex justify-center py-2">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              )}
              {blockers.length > 0 && (
                <div
                  role="alert"
                  className="rounded-md border border-negative/40 bg-negative/10 p-3 text-sm"
                >
                  You own {blockers.length === 1 ? 'a family' : 'families'} with other members:{' '}
                  <span className="font-medium">
                    {blockers.map((b) => b.familyName).join(', ')}
                  </span>
                  . Remove the members or hand over the family first.
                </div>
              )}
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  disabled={statusQuery.isLoading || blockers.length > 0}
                  onClick={() => setStep('verify')}
                >
                  Continue
                </Button>
              </DialogFooter>
            </>
          )}

          {step === 'verify' && (
            <>
              <DialogHeader>
                <DialogTitle>Confirm it&apos;s you</DialogTitle>
                <DialogDescription>Type DELETE and verify your identity.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="delete-confirm">
                    Type <span className="font-mono font-semibold">DELETE</span> to confirm
                  </Label>
                  <Input
                    id="delete-confirm"
                    className="mt-1 font-mono"
                    autoComplete="off"
                    value={confirmText}
                    onChange={(e) => setConfirmText(e.target.value)}
                  />
                </div>

                {!useCode ? (
                  <div>
                    <Label htmlFor="delete-password">Password</Label>
                    <PasswordInput
                      id="delete-password"
                      containerClassName="mt-1"
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                    <button
                      type="button"
                      className="mt-1 text-xs text-primary hover:underline"
                      onClick={() => setUseCode(true)}
                    >
                      Signed up with Google? Email me a code instead
                    </button>
                  </div>
                ) : (
                  <div>
                    <Label htmlFor="delete-code">Code from your email</Label>
                    <div className="mt-1 flex gap-2">
                      <Input
                        id="delete-code"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        placeholder="000000"
                        className="font-mono tracking-widest"
                        value={code}
                        onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        disabled={sendCode.isPending}
                        onClick={() => sendCode.mutate()}
                      >
                        {sendCode.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                        {codeSentTo ? 'Resend' : 'Send code'}
                      </Button>
                    </div>
                    {codeSentTo && (
                      <p className="mt-1 text-xs text-muted-foreground">Sent to {codeSentTo}</p>
                    )}
                    <button
                      type="button"
                      className="mt-1 text-xs text-primary hover:underline"
                      onClick={() => setUseCode(false)}
                    >
                      Use my password instead
                    </button>
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setStep('warn')}>
                  Back
                </Button>
                <Button variant="destructive" disabled={!verified} onClick={() => setStep('final')}>
                  Continue
                </Button>
              </DialogFooter>
            </>
          )}

          {step === 'final' && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-negative" />
                  Last chance
                </DialogTitle>
                <DialogDescription>
                  You&apos;ll be signed out on every device now. Unless you sign in and restore
                  within {graceDays} days, your account and all its data are erased for good and
                  cannot be recovered.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button
                  variant="outline"
                  disabled={remove.isPending}
                  onClick={() => setOpen(false)}
                >
                  Keep my account
                </Button>
                <Button
                  variant="destructive"
                  disabled={remove.isPending}
                  onClick={() => remove.mutate()}
                >
                  {remove.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                  Delete my account
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
