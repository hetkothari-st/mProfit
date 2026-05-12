import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Loader2 } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { authApi } from '@/api/auth.api';
import { useAuthStore } from '@/stores/auth.store';
import { apiErrorMessage } from '@/api/client';
import { NotificationsSection } from './NotificationsSection';

const schema = z.object({
  name: z.string().min(2).max(100),
  phone: z.string().optional(),
  pan: z
    .string()
    .transform((v) => v.trim().toUpperCase())
    .refine((v) => v === '' || /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(v), {
      message: 'Invalid PAN format (e.g., ABCDE1234F)',
    })
    .optional(),
  dob: z
    .string()
    .optional()
    .refine((v) => !v || /^\d{4}-\d{2}-\d{2}$/.test(v), {
      message: 'Use YYYY-MM-DD',
    }),
});
type FormValues = z.infer<typeof schema>;

export function SettingsPage() {
  const { user, setUser } = useAuthStore();

  const { register, handleSubmit, formState } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: user?.name ?? '',
      phone: user?.phone ?? '',
      pan: user?.pan ?? '',
      dob: user?.dob ?? '',
    },
  });

  const mutation = useMutation({
    mutationFn: authApi.updateProfile,
    onSuccess: (updated) => {
      setUser(updated);
      toast.success('Profile updated');
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Update failed')),
  });

  return (
    <div>
      <PageHeader title="Settings" description="Manage your profile and account preferences" />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Profile</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={handleSubmit((v) =>
                mutation.mutate({
                  name: v.name,
                  phone: v.phone ?? undefined,
                  pan: v.pan ? v.pan.toUpperCase() : undefined,
                  dob: v.dob ? v.dob : undefined,
                }),
              )}
              className="space-y-4"
            >
              <div>
                <Label htmlFor="name">Full name</Label>
                <Input id="name" className="mt-1" {...register('name')} />
                {formState.errors.name && (
                  <p className="text-xs text-negative mt-1">{formState.errors.name.message}</p>
                )}
              </div>
              <div>
                <Label htmlFor="email">Email</Label>
                <Input id="email" className="mt-1" value={user?.email ?? ''} disabled />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="phone">Phone</Label>
                  <Input id="phone" className="mt-1" {...register('phone')} />
                </div>
                <div>
                  <Label htmlFor="pan">PAN</Label>
                  <Input
                    id="pan"
                    className="mt-1 uppercase"
                    placeholder="ABCDE1234F"
                    maxLength={10}
                    {...register('pan')}
                  />
                  {formState.errors.pan && (
                    <p className="text-xs text-negative mt-1">{formState.errors.pan.message}</p>
                  )}
                </div>
              </div>
              <div>
                <Label htmlFor="dob">Date of birth</Label>
                <Input id="dob" type="date" className="mt-1" {...register('dob')} />
                <p className="text-xs text-muted-foreground mt-1">
                  Used only as a password for encrypted CAS PDFs (CAMS sometimes uses PAN+DOB).
                </p>
                {formState.errors.dob && (
                  <p className="text-xs text-negative mt-1">{formState.errors.dob.message}</p>
                )}
              </div>
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Save profile
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Plan</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div>
              <div className="text-xs text-muted-foreground">Current plan</div>
              <div className="text-lg font-semibold">{user?.plan}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Role</div>
              <div className="font-medium">{user?.role}</div>
            </div>
            <p className="text-xs text-muted-foreground pt-2">
              Plan upgrades are available in the subscriptions section (Phase 8).
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="mt-6">
        <NotificationsSection />
      </div>
    </div>
  );
}
