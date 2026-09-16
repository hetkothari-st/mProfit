import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { ArrowLeft, Loader2, MailCheck } from 'lucide-react';
import { AuthLayout } from '@/components/layout/AuthLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { Label } from '@/components/ui/label';
import { authApi } from '@/api/auth.api';
import { apiErrorMessage } from '@/api/client';

// Mirrors the server's resend cooldown. The server never says whether a code
// actually went out, so the countdown is local.
const RESEND_COOLDOWN_S = 60;

const emailSchema = z.object({
  email: z.string().email('Enter a valid email address'),
});
type EmailValues = z.infer<typeof emailSchema>;

const resetSchema = z
  .object({
    code: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code'),
    newPassword: z.string().min(8, 'Minimum 8 characters'),
    confirmPassword: z.string(),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords do not match',
  });
type ResetValues = z.infer<typeof resetSchema>;

function useCountdown(): [number, () => void] {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (seconds <= 0) return;
    const id = window.setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => window.clearTimeout(id);
  }, [seconds]);
  return [seconds, () => setSeconds(RESEND_COOLDOWN_S)];
}

export function ForgotPasswordPage() {
  const navigate = useNavigate();
  // Set once a code has been requested — switches the page to the reset step.
  const [email, setEmail] = useState<string | null>(null);
  const [resendIn, startCountdown] = useCountdown();

  const emailForm = useForm<EmailValues>({ resolver: zodResolver(emailSchema) });
  const resetForm = useForm<ResetValues>({ resolver: zodResolver(resetSchema) });

  const requestMutation = useMutation({
    mutationFn: (address: string) => authApi.forgotPassword({ email: address }),
    onSuccess: (_data, address) => {
      setEmail(address);
      startCountdown();
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Could not send reset code')),
  });

  const resetMutation = useMutation({
    mutationFn: authApi.resetPassword,
    onSuccess: () => {
      toast.success('Password updated. Sign in with your new password.');
      navigate('/login', { replace: true });
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Could not reset password')),
  });

  const footer = (
    <Link to="/login" className="inline-flex items-center gap-1 text-primary hover:underline">
      <ArrowLeft className="h-3.5 w-3.5" /> Back to sign in
    </Link>
  );

  if (email) {
    const { register, handleSubmit, formState, setValue } = resetForm;
    const { errors } = formState;
    const codeField = register('code');
    return (
      <AuthLayout
        title="Set a new password"
        subtitle="Enter the code from your email and choose a new password."
        footer={footer}
      >
        <form
          onSubmit={handleSubmit((v) =>
            resetMutation.mutate({ email, code: v.code, newPassword: v.newPassword }),
          )}
          className="space-y-4"
        >
          <div className="flex items-start gap-3 rounded-md border bg-muted/40 p-3">
            <MailCheck className="h-5 w-5 text-primary shrink-0 mt-0.5" />
            <p className="text-sm">
              If an account exists for <span className="font-medium break-all">{email}</span>,
              we&apos;ve sent it a 6-digit code. It expires in 15 minutes — check your spam folder
              if you don&apos;t see it.
            </p>
          </div>

          <div>
            <Label htmlFor="code">Reset code</Label>
            <Input
              id="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              placeholder="000000"
              className="mt-1 h-12 text-center text-xl font-semibold tracking-[0.5em] tabular-nums"
              {...codeField}
              onChange={(e) => {
                e.target.value = e.target.value.replace(/\D/g, '').slice(0, 6);
                void codeField.onChange(e);
              }}
            />
            {errors.code && <p className="text-xs text-negative mt-1">{errors.code.message}</p>}
          </div>

          <div>
            <Label htmlFor="newPassword">New password</Label>
            <PasswordInput
              id="newPassword"
              autoComplete="new-password"
              containerClassName="mt-1"
              {...register('newPassword')}
            />
            {errors.newPassword && (
              <p className="text-xs text-negative mt-1">{errors.newPassword.message}</p>
            )}
          </div>

          <div>
            <Label htmlFor="confirmPassword">Confirm new password</Label>
            <PasswordInput
              id="confirmPassword"
              autoComplete="new-password"
              containerClassName="mt-1"
              {...register('confirmPassword')}
            />
            {errors.confirmPassword && (
              <p className="text-xs text-negative mt-1">{errors.confirmPassword.message}</p>
            )}
          </div>

          <Button type="submit" className="w-full" disabled={resetMutation.isPending}>
            {resetMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Reset password
          </Button>

          <div className="flex items-center justify-between gap-3 text-sm">
            <button
              type="button"
              onClick={() => setEmail(null)}
              className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Use a different email
            </button>
            <button
              type="button"
              onClick={() => {
                setValue('code', '');
                requestMutation.mutate(email, {
                  onSuccess: () => toast.success('If the account exists, a new code is on its way'),
                });
              }}
              disabled={resendIn > 0 || requestMutation.isPending}
              className="font-medium text-primary hover:underline disabled:cursor-not-allowed disabled:text-muted-foreground disabled:no-underline"
            >
              {resendIn > 0 ? `Resend code in ${resendIn}s` : 'Resend code'}
            </button>
          </div>
        </form>
      </AuthLayout>
    );
  }

  const { register, handleSubmit, formState } = emailForm;
  return (
    <AuthLayout
      title="Reset your password"
      subtitle="Enter the email linked to your account and we'll send you a reset code."
      footer={footer}
    >
      <form
        onSubmit={handleSubmit((v) => requestMutation.mutate(v.email.trim().toLowerCase()))}
        className="space-y-4"
      >
        <div>
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            className="mt-1"
            {...register('email')}
          />
          {formState.errors.email && (
            <p className="text-xs text-negative mt-1">{formState.errors.email.message}</p>
          )}
        </div>

        <Button type="submit" className="w-full" disabled={requestMutation.isPending}>
          {requestMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          Send reset code
        </Button>
      </form>
    </AuthLayout>
  );
}
