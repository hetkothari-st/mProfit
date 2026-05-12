import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Loader2 } from 'lucide-react';
import { AuthLayout } from '@/components/layout/AuthLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { authApi } from '@/api/auth.api';
import { useAuthStore } from '@/stores/auth.store';
import { apiErrorMessage } from '@/api/client';
import { GoogleSignInButton } from '@/components/auth/GoogleSignInButton';
import { UserRole, PlanTier } from '@portfolioos/shared';

const schema = z
  .object({
    name: z.string().min(2, 'Full name is required'),
    email: z.string().email('Enter a valid email address'),
    password: z.string().min(8, 'Minimum 8 characters'),
    confirmPassword: z.string(),
    role: z.nativeEnum(UserRole).default(UserRole.INVESTOR),
    plan: z.nativeEnum(PlanTier).default(PlanTier.FREE),
  })
  .refine((d) => d.password === d.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords do not match',
  });
type FormValues = z.infer<typeof schema>;

export function RegisterPage() {
  const navigate = useNavigate();
  const setSession = useAuthStore((s) => s.setSession);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { role: UserRole.INVESTOR, plan: PlanTier.FREE },
  });

  const registerMutation = useMutation({
    mutationFn: authApi.register,
    onSuccess: (data) => {
      setSession(data.user, data.tokens);
      toast.success('Account created. Welcome to PortfolioOS!');
      navigate('/dashboard', { replace: true });
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Registration failed')),
  });

  const onSubmit = (values: FormValues) => {
    registerMutation.mutate({
      name: values.name,
      email: values.email,
      password: values.password,
      role: values.role,
      plan: values.plan,
    });
  };

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Consolidate every asset. Automate capital gains. Stay ITR-ready."
      footer={
        <>
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-primary hover:underline">
            Sign in
          </Link>
        </>
      }
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

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              className="mt-1"
              {...register('password')}
            />
            {errors.password && (
              <p className="text-xs text-negative mt-1">{errors.password.message}</p>
            )}
          </div>
          <div>
            <Label htmlFor="confirmPassword">Confirm</Label>
            <Input
              id="confirmPassword"
              type="password"
              autoComplete="new-password"
              className="mt-1"
              {...register('confirmPassword')}
            />
            {errors.confirmPassword && (
              <p className="text-xs text-negative mt-1">{errors.confirmPassword.message}</p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
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
          <div>
            <Label htmlFor="plan">Plan</Label>
            <Select id="plan" className="mt-1" {...register('plan')}>
              <option value={PlanTier.FREE}>Free</option>
              <option value={PlanTier.LITE}>Lite</option>
              <option value={PlanTier.PLUS}>Plus</option>
              <option value={PlanTier.HNI}>HNI</option>
              <option value={PlanTier.FAMILY_OFFICE}>Family Office</option>
              <option value={PlanTier.ADVISOR}>Advisor</option>
            </Select>
          </div>
        </div>

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
