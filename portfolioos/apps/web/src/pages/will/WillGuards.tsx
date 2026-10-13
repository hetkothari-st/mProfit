import { useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { FEATURE_MIN_TIER, meetsMinTier, type PlanTierValue } from '@everypaisa/shared';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { LockedFeature } from '@/components/common/LockedFeature';
import { useActingAsStore } from '@/stores/actingAs.store';
import { useAuthStore } from '@/stores/auth.store';
import { apiErrorMessage } from '@/api/client';
import { willApi } from '@/api/will.api';

export function OwnAccountOnly() {
  return (
    <Card className="p-5 text-sm text-foreground">
      Will Maker works on your own account only. Switch back to your own account to make or view your will.
    </Card>
  );
}

/**
 * A user always keeps their own will, whatever their plan: on the locked card,
 * the live will's PDF and signed copy stay downloadable.
 */
export function OwnWillDocuments() {
  const docs = useQuery({ queryKey: ['will', 'own-documents'], queryFn: async () => (await willApi.documents()) ?? null });
  const [busy, setBusy] = useState<'pdf' | 'signed' | null>(null);
  const live = docs.data;
  if (!live) return null;
  async function run(kind: 'pdf' | 'signed', fn: () => Promise<void>) {
    setBusy(kind);
    try {
      await fn();
    } catch (err) {
      toast.error(apiErrorMessage(err, "Couldn't download the file"));
    } finally {
      setBusy(null);
    }
  }
  return (
    <Card className="space-y-3 p-5">
      <div>
        <h2 className="text-sm font-semibold text-foreground">Your will documents</h2>
        <p className="mt-1 text-xs text-muted-foreground">Version {live.version} stays yours to download on any plan.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => void run('pdf', () => willApi.downloadPdf(live.versionId, live.version))}>
          {busy === 'pdf' ? 'Downloading...' : 'Download PDF'}
        </Button>
        {live.hasSignedCopy && (
          <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => void run('signed', () => willApi.downloadOwnSignedCopy(live.willId, live.version))}>
            {busy === 'signed' ? 'Downloading...' : 'Download signed copy'}
          </Button>
        )}
      </div>
    </Card>
  );
}

/** Plan gate + own-account rule. Children never mount (so never call the API) while either applies. */
export function WillGate({ children }: { children: ReactNode }) {
  const acting = useActingAsStore((s) => s.profile);
  const user = useAuthStore((s) => s.user);
  if (acting) return <OwnAccountOnly />;
  const allowed = !!user && meetsMinTier(user.plan as PlanTierValue, FEATURE_MIN_TIER.WILL_MAKER);
  if (allowed) return <>{children}</>;
  return (
    <div className="space-y-3">
      <LockedFeature requiredTier={FEATURE_MIN_TIER.WILL_MAKER} featureName="Will Maker" compact>
        {children}
      </LockedFeature>
      {user && <OwnWillDocuments />}
    </div>
  );
}
