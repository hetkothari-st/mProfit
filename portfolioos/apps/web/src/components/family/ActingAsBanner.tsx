import { ArrowLeftRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useActingAsStore } from '@/stores/actingAs.store';
import { useManageProfile } from '@/hooks/useManageProfile';

/**
 * The strip that says, on every page, whose account this is.
 *
 * Everything added while it shows belongs to the managed member, so it must
 * be impossible to miss: full width, directly under the header, with the way
 * back on it. Renders nothing on your own account.
 */
export function ActingAsBanner() {
  const profile = useActingAsStore((s) => s.profile);
  const { leave } = useManageProfile();
  if (!profile) return null;

  return (
    <div
      role="status"
      className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-warning/40 bg-warning/10 px-3 py-2 sm:px-6 lg:px-10"
    >
      <p className="min-w-0 text-[13px] text-foreground">
        You are managing <span className="font-semibold">{profile.name}</span>’s account.{' '}
        <span className="text-muted-foreground">Everything you add here is theirs.</span>
      </p>
      <Button size="sm" variant="outline" onClick={leave} className="shrink-0">
        <ArrowLeftRight className="h-3.5 w-3.5" /> Back to my account
      </Button>
    </div>
  );
}
