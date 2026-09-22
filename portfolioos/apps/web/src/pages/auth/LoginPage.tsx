import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useNextPath } from '@/hooks/useNextPath';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Loader2 } from 'lucide-react';
import { AuthLayout } from '@/components/layout/AuthLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { Label } from '@/components/ui/label';
import { authApi } from '@/api/auth.api';
import { isSessionRemembered, useAuthStore } from '@/stores/auth.store';
import { apiErrorCode, apiErrorMessage } from '@/api/client';
import { isOnboardingUnfinished } from '@/lib/onboardingProgress';
import { GoogleSignInButton } from '@/components/auth/GoogleSignInButton';
import { RestoreAccountNotice, pendingDeletionDate } from '@/components/auth/RestoreAccountNotice';

const schema = z.object({
  email: z.string().email({ message: 'Enter a valid email address' }),
  password: z.string().min(1, { message: 'Password is required' }),
  rememberMe: z.boolean().optional(),
});
type FormValues = z.infer<typeof schema>;

export function LoginPage() {
  const navigate = useNavigate();
  const nextPath = useNextPath();
  const location = useLocation();
  const setSession = useAuthStore((s) => s.setSession);
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken && s.user));
  // Wrong email/password, shown under the field with a way out.
  const [credentialsRejected, setCredentialsRejected] = useState(false);

  useEffect(() => {
    if (isAuthed) navigate(nextPath ?? '/dashboard', { replace: true });
  }, [isAuthed, navigate, nextPath]);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      // Signup sends people here with the address they already tried.
      email: (() => {
        const prefill = (location.state as { email?: unknown } | null)?.email;
        return typeof prefill === 'string' ? prefill : '';
      })(),
      rememberMe: isSessionRemembered(),
    },
  });
  // Carried to the reset page so the user doesn't retype it.
  const forgotLinkState = { email: watch('email') };

  // Set when sign-in was refused because the account is pending deletion.
  const [pendingRestore, setPendingRestore] = useState<{ values: FormValues; scheduledFor: string } | null>(null);

  const loginMutation = useMutation({
    mutationFn: ({ values, restore }: { values: FormValues; restore?: boolean }) =>
      authApi.login({ email: values.email, password: values.password, ...(restore ? { restore } : {}) }),
    onSuccess: (data, { values, restore }) => {
      setPendingRestore(null);
      if (restore) toast.success('Your account has been restored.');
      setSession(data.user, data.tokens, { remember: values.rememberMe ?? true });
      toast.success(`Welcome back, ${data.user.name.split(' ')[0]}!`);
      // An account that left setup unfinished picks it back up.
      // An explicit `?next=` outranks everything: the person was in the
      // middle of something — accepting an invitation, usually — and signing
      // in was the interruption, not the errand.
      const to =
        nextPath ??
        (isOnboardingUnfinished(data.user.id)
          ? '/onboarding'
          : ((location.state as { from?: { pathname?: string } } | null)?.from?.pathname ??
            '/dashboard'));
      navigate(to, { replace: true });
    },
    onError: (err, { values }) => {
      const scheduledFor = pendingDeletionDate(err);
      if (scheduledFor !== null) {
        setPendingRestore({ values, scheduledFor });
        return;
      }
      if (apiErrorCode(err) === 'UNAUTHORIZED') {
        setCredentialsRejected(true);
        return;
      }
      toast.error(apiErrorMessage(err, 'Login failed'));
    },
  });

  const onSubmit = (values: FormValues) => {
    setCredentialsRejected(false);
    setPendingRestore(null);
    loginMutation.mutate({ values });
  };

  return (
    <AuthLayout
      title="Sign in"
      subtitle="Track all your Indian investments in one place."
      footer={
        <>
          Don&apos;t have an account?{' '}
          {/* Carries the errand across: someone who came to accept an
              invitation and decides to register instead must not lose it. */}
          <Link
            to={`/register${nextPath ? `?next=${encodeURIComponent(nextPath)}` : ''}`}
            className="font-medium text-primary hover:underline"
          >
            Create one
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {pendingRestore && (
          <RestoreAccountNotice
            scheduledFor={pendingRestore.scheduledFor}
            pending={loginMutation.isPending}
            onRestore={() => loginMutation.mutate({ values: pendingRestore.values, restore: true })}
            onCancel={() => setPendingRestore(null)}
          />
        )}
        <div>
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            className="mt-1"
            aria-invalid={Boolean(errors.email) || credentialsRejected}
            {...register('email')}
          />
          {errors.email && <p className="text-xs text-negative mt-1">{errors.email.message}</p>}
        </div>

        <div>
          <Label htmlFor="password">Password</Label>
          <PasswordInput
            id="password"
            autoComplete="current-password"
            containerClassName="mt-1"
            aria-invalid={Boolean(errors.password) || credentialsRejected}
            {...register('password')}
          />
          {errors.password && (
            <p className="text-xs text-negative mt-1">{errors.password.message}</p>
          )}
          {credentialsRejected && (
            <p role="alert" className="text-xs text-negative mt-1">
              Incorrect email or password.{' '}
              <Link
                to="/forgot-password"
                state={forgotLinkState}
                className="font-medium text-primary hover:underline"
              >
                Forgot password?
              </Link>
            </p>
          )}
        </div>

        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-input text-primary"
            {...register('rememberMe')}
          />
          Remember me on this device
        </label>

        <Button type="submit" className="w-full" disabled={loginMutation.isPending}>
          {loginMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          Sign in
        </Button>

        <p className="text-center text-sm">
          <Link
            to="/forgot-password"
            state={forgotLinkState}
            className="font-medium text-primary hover:underline"
          >
            Forgot password?
          </Link>
        </p>

        <div className="relative my-3">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t border-border" />
          </div>
          <div className="relative flex justify-center text-[10px] uppercase tracking-wider">
            <span className="bg-background px-2 text-muted-foreground">or</span>
          </div>
        </div>

        <GoogleSignInButton text="signin_with" remember={watch('rememberMe') ?? true} />
      </form>
    </AuthLayout>
  );
}
