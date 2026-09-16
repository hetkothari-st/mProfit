import { useEffect, useState, type ReactNode } from 'react';
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
import { Select } from '@/components/ui/select';
import { authApi, type AuthResult } from '@/api/auth.api';
import { useAuthStore } from '@/stores/auth.store';
import { apiErrorMessage } from '@/api/client';
import { GoogleSignInButton } from '@/components/auth/GoogleSignInButton';
import { UserRole, type PendingRegistration } from '@everypaisa/shared';

const schema = z
  .object({
    name: z.string().min(2, 'Full name is required'),
    email: z.string().email('Enter a valid email address'),
    password: z.string().min(8, 'Minimum 8 characters'),
    confirmPassword: z.string(),
    role: z.nativeEnum(UserRole).default(UserRole.INVESTOR),
  })
  .refine((d) => d.password === d.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords do not match',
  });
type FormValues = z.infer<typeof schema>;

function secondsUntil(iso: string): number {
  return Math.max(0, Math.ceil((Date.parse(iso) - Date.now()) / 1000));
}

/** Seconds until `iso`, re-rendering once a second; 0 once it has passed. */
function useSecondsUntil(iso: string): number {
  const [seconds, setSeconds] = useState(() => secondsUntil(iso));
  useEffect(() => {
    setSeconds(secondsUntil(iso));
    const id = window.setInterval(() => setSeconds(secondsUntil(iso)), 1000);
    return () => window.clearInterval(id);
  }, [iso]);
  return seconds;
}

export function RegisterPage() {
  const navigate = useNavigate();
  const setSession = useAuthStore((s) => s.setSession);
  // Set once the code has been emailed — switches the page to the code step.
  const [pending, setPending] = useState<PendingRegistration | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { role: UserRole.INVESTOR },
  });

  const registerMutation = useMutation({
    mutationFn: authApi.register,
    onSuccess: (data) => {
      setPending(data);
      toast.success(`Verification code sent to ${data.email}`);
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Registration failed')),
  });

  const onSubmit = (values: FormValues) => {
    registerMutation.mutate({
      name: values.name,
      email: values.email,
      password: values.password,
      role: values.role,
    });
  };

  const footer = (
    <>
      Already have an account?{' '}
      <Link to="/login" className="font-medium text-primary hover:underline">
        Sign in
      </Link>
    </>
  );

  if (pending) {
    return (
      <VerifyEmailStep
        pending={pending}
        footer={footer}
        onResent={setPending}
        // The form stays registered while unmounted, so the details come back.
        onBack={() => setPending(null)}
        onVerified={(data) => {
          setSession(data.user, data.tokens);
          toast.success('Email verified. Welcome to EveryPaisa!');
          navigate('/dashboard', { replace: true });
        }}
      />
    );
  }

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Consolidate every asset. Automate capital gains. Stay ITR-ready."
      footer={footer}
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <Label htmlFor="name">Full name</Label>
          <Input id="name" placeholder="Jane Doe" className="mt-1" {...register('name')} />
          {errors.name && <p className="text-xs text-negative mt-1">{errors.name.message}</p>}
        </div>

        <div>
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            className="mt-1"
            {...register('email')}
          />
          {errors.email && <p className="text-xs text-negative mt-1">{errors.email.message}</p>}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label htmlFor="password">Password</Label>
            <PasswordInput
              id="password"
              autoComplete="new-password"
              containerClassName="mt-1"
              {...register('password')}
            />
            {errors.password && (
              <p className="text-xs text-negative mt-1">{errors.password.message}</p>
            )}
          </div>
          <div>
            <Label htmlFor="confirmPassword">Confirm password</Label>
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
        </div>

        <div>
          <Label htmlFor="role">I am</Label>
          <Select id="role" className="mt-1" {...register('role')}>
            <option value={UserRole.INVESTOR}>Individual Investor</option>
            <option value={UserRole.HNI}>HNI</option>
            <option value={UserRole.FAMILY_OFFICE}>Family Office</option>
            <option value={UserRole.ADVISOR}>Financial Advisor</option>
            <option value={UserRole.CA}>Chartered Accountant</option>
          </Select>
        </div>
        {/* Every new signup starts on the Free plan — upgrades happen via
            /pricing + billing, never by self-selecting a paid tier here. */}

        <Button type="submit" className="w-full mt-2" disabled={registerMutation.isPending}>
          {registerMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          Create account
        </Button>

        <div className="relative my-3">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t border-border" />
          </div>
          <div className="relative flex justify-center text-[10px] uppercase tracking-wider">
            <span className="bg-background px-2 text-muted-foreground">or</span>
          </div>
        </div>

        <GoogleSignInButton text="signup_with" />
      </form>
    </AuthLayout>
  );
}

function VerifyEmailStep({
  pending,
  footer,
  onResent,
  onBack,
  onVerified,
}: {
  pending: PendingRegistration;
  footer: ReactNode;
  onResent: (p: PendingRegistration) => void;
  onBack: () => void;
  onVerified: (data: AuthResult) => void;
}) {
  const [code, setCode] = useState('');
  const resendIn = useSecondsUntil(pending.resendAvailableAt);

  const verifyMutation = useMutation({
    mutationFn: authApi.verifyRegistration,
    onSuccess: onVerified,
    onError: (err) => toast.error(apiErrorMessage(err, 'Verification failed')),
  });

  const resendMutation = useMutation({
    mutationFn: () => authApi.resendRegistrationCode(pending.email),
    onSuccess: (data) => {
      setCode('');
      onResent(data);
      toast.success('A new code is on its way');
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Could not resend the code')),
  });

  const submit = (value: string) => {
    if (value.length === 6 && !verifyMutation.isPending) {
      verifyMutation.mutate({ email: pending.email, code: value });
    }
  };

  return (
    <AuthLayout
      title="Verify your email"
      subtitle="One last step before your account is created."
      footer={footer}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit(code);
        }}
        className="space-y-4"
      >
        <div className="flex items-start gap-3 rounded-md border bg-muted/40 p-3">
          <MailCheck className="h-5 w-5 text-primary shrink-0 mt-0.5" />
          <p className="text-sm">
            We sent a 6-digit code to{' '}
            <span className="font-medium break-all">{pending.email}</span>. It expires in 10
            minutes — check your spam folder if you don't see it.
          </p>
        </div>

        <div>
          <Label htmlFor="code">Verification code</Label>
          <Input
            id="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            placeholder="000000"
            className="mt-1 h-12 text-center text-xl font-semibold tracking-[0.5em] tabular-nums"
            value={code}
            onChange={(e) => {
              const digits = e.target.value.replace(/\D/g, '').slice(0, 6);
              setCode(digits);
              // Submit as soon as the sixth digit lands (typed or pasted).
              if (digits.length === 6 && code.length !== 6) submit(digits);
            }}
          />
        </div>

        <Button
          type="submit"
          className="w-full"
          disabled={code.length !== 6 || verifyMutation.isPending}
        >
          {verifyMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          Verify and create account
        </Button>

        <div className="flex items-center justify-between gap-3 text-sm">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Change details
          </button>
          <button
            type="button"
            onClick={() => resendMutation.mutate()}
            disabled={resendIn > 0 || resendMutation.isPending}
            className="font-medium text-primary hover:underline disabled:cursor-not-allowed disabled:text-muted-foreground disabled:no-underline"
          >
            {resendIn > 0 ? `Resend code in ${resendIn}s` : 'Resend code'}
          </button>
        </div>
      </form>
    </AuthLayout>
  );
}
