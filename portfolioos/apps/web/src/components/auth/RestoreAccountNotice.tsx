import axios from 'axios';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { apiErrorCode } from '@/api/client';

/** The deletion date when sign-in was refused because the account is pending deletion. */
// eslint-disable-next-line react-refresh/only-export-components
export function pendingDeletionDate(err: unknown): string | null {
  if (apiErrorCode(err) !== 'ACCOUNT_PENDING_DELETION' || !axios.isAxiosError(err)) return null;
  const details = (err.response?.data as { details?: { scheduledFor?: unknown } } | undefined)
    ?.details;
  return typeof details?.scheduledFor === 'string' ? details.scheduledFor : '';
}

/** Shown on sign-in when the account is scheduled for deletion. */
export function RestoreAccountNotice({
  scheduledFor,
  pending,
  onRestore,
  onCancel,
}: {
  scheduledFor: string;
  pending: boolean;
  onRestore: () => void;
  onCancel: () => void;
}) {
  const when = scheduledFor
    ? new Date(scheduledFor).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : 'soon';
  return (
    <div role="alert" className="rounded-lg border border-negative/40 bg-negative/10 p-3">
      <p className="text-sm">
        This account is scheduled for deletion on <span className="font-medium">{when}</span>.
        Restore it to keep your data and sign in.
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button type="button" size="sm" onClick={onRestore} disabled={pending}>
          {pending && <Loader2 className="h-4 w-4 animate-spin" />}
          Restore account
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={onCancel} disabled={pending}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
