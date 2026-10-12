import type { ReactNode } from 'react';
import { FEATURE_MIN_TIER } from '@everypaisa/shared';
import { Card } from '@/components/ui/card';
import { LockedFeature } from '@/components/common/LockedFeature';
import { useActingAsStore } from '@/stores/actingAs.store';

export function OwnAccountOnly() {
  return (
    <Card className="p-5 text-sm text-foreground">
      Will Maker works on your own account only. Switch back to your own account to make or view your will.
    </Card>
  );
}

/** Plan gate + own-account rule. Children never mount (so never call the API) while either applies. */
export function WillGate({ children }: { children: ReactNode }) {
  const acting = useActingAsStore((s) => s.profile);
  if (acting) return <OwnAccountOnly />;
  return (
    <LockedFeature requiredTier={FEATURE_MIN_TIER.WILL_MAKER} featureName="Will Maker" compact>
      {children}
    </LockedFeature>
  );
}
