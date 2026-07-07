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
}

/**
 * Wraps a gated feature's normal UI. When the current user's plan doesn't
 * meet `requiredTier`, the children still render (dimmed + blurred, non-
 * interactive) behind an upgrade overlay — showing what's behind the
 * paywall drives upgrades better than hiding the section outright, which
 * just reads as a bug. ADMIN-role users always see the real thing.
 */
export function LockedFeature({ requiredTier, featureName, children, className }: LockedFeatureProps) {
  const user = useAuthStore((s) => s.user);
  const allowed =
    !!user && (user.role === 'ADMIN' || meetsMinTier(user.plan as PlanTierValue, requiredTier));

  if (allowed) return <>{children}</>;

  return (
    <div className={cn('relative', className)}>
      <div aria-hidden="true" className="pointer-events-none select-none blur-[3px] opacity-40">
        {children}
      </div>
      <div className="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-background/60 backdrop-blur-[1px] p-4">
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
      </div>
    </div>
  );
}
