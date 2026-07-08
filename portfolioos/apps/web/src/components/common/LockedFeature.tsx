import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Lock } from 'lucide-react';
import { meetsMinTier, type PlanTierValue } from '@portfolioos/shared';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/stores/auth.store';
import { cn } from '@/lib/cn';

const TIER_LABEL: Record<PlanTierValue, string> = {
  FREE: 'Free',
  PLUS: 'Plus',
  FAMILY: 'Family',
  PRO_ADVISOR: 'Pro/Advisor',
};

export interface LockedFeatureProps {
  requiredTier: PlanTierValue;
  featureName: string;
  children: ReactNode;
  className?: string;
  /**
   * When true, skip rendering the blurred children behind the lock —
   * just show the lock card on its own. Use for large sections (a grid
   * of a dozen+ cards): blurring the full stack behind an absolutely-
   * positioned overlay makes the wrapper as tall as the blurred content,
   * so the lock card ends up centered deep inside a mostly-blank
   * scrollable area instead of appearing immediately.
   */
  compact?: boolean;
}

/**
 * Wraps a gated feature's normal UI. When the current user's plan doesn't
 * meet `requiredTier`, the children still render (dimmed + blurred, non-
 * interactive) behind an upgrade overlay — showing what's behind the
 * paywall drives upgrades better than hiding the section outright, which
 * just reads as a bug. Gated purely on `plan` — no ADMIN bypass, so
 * switching plan via the dev-set-plan button on an admin account
 * actually changes what's locked (and unlocks automatically once it does).
 */
export function LockedFeature({
  requiredTier,
  featureName,
  children,
  className,
  compact,
}: LockedFeatureProps) {
  const user = useAuthStore((s) => s.user);
  const allowed = !!user && meetsMinTier(user.plan as PlanTierValue, requiredTier);

  if (allowed) return <>{children}</>;

  const lockCard = (
    <Card tone="flat" className="max-w-xs w-full p-5 text-center shadow-elev-lg">
      <div className="mx-auto mb-3 grid h-10 w-10 place-items-center rounded-full bg-accent/10 text-accent">
        <Lock className="h-5 w-5" />
      </div>
      <h3 className="text-sm font-semibold text-foreground">{featureName} is locked</h3>
      <p className="mt-1.5 text-xs text-muted-foreground">
        Upgrade to {TIER_LABEL[requiredTier]} to unlock {featureName}.
      </p>
      <Button asChild size="sm" className="mt-4 w-full">
        <Link to="/pricing">View plans</Link>
      </Button>
    </Card>
  );

  if (compact) {
    return <div className={cn('flex items-center justify-center py-12', className)}>{lockCard}</div>;
  }

  return (
    <div className={cn('relative', className)}>
      <div aria-hidden="true" className="pointer-events-none select-none blur-[3px] opacity-40">
        {children}
      </div>
      <div className="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-background/60 backdrop-blur-[1px] p-4">
        {lockCard}
      </div>
    </div>
  );
}
