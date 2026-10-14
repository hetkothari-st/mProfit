import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Bot, Copy } from 'lucide-react';
import { AI_CONNECTOR_AREA_INFO, FEATURE_MIN_TIER, formatDateIST, meetsMinTier, type AiConnectionWire, type PlanTierValue } from '@everypaisa/shared';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { LockedFeature } from '@/components/common/LockedFeature';
import { ConfirmDialog } from '@/pages/split/ConfirmDialog';
import { apiErrorMessage } from '@/api/client';
import { connectApi } from '@/api/connect.api';
import { useAuthStore } from '@/stores/auth.store';
import { SETUP, connectorUrl, type ConnectorApp } from './aiConnectorSetup';

/** Settings > AI connectors: connect ChatGPT/Claude, see and revoke connections. */
export function AiConnectorsPage() {
  const plan = (useAuthStore((s) => s.user?.plan) ?? 'FREE') as PlanTierValue;
  const allowed = meetsMinTier(plan, FEATURE_MIN_TIER.AI_CONNECTOR);
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ['connect', 'connections'], queryFn: connectApi.connections });
  const [guide, setGuide] = useState<ConnectorApp | null>(null);
  const [toRevoke, setToRevoke] = useState<AiConnectionWire | null>(null);
  const optIn = useQuery({ queryKey: ['connect', 'family-opt-in'], queryFn: connectApi.getFamilyOptIn });
  const setOptIn = useMutation({
    mutationFn: (v: boolean) => connectApi.setFamilyOptIn(v),
    onSuccess: (v) => qc.setQueryData(['connect', 'family-opt-in'], v),
    onError: (err) => toast.error(apiErrorMessage(err, 'Could not save. Try again.')),
  });
  const revoke = useMutation({
    mutationFn: (id: string) => connectApi.revoke(id),
    onSuccess: async () => {
      toast.success('Access revoked');
      setToRevoke(null);
      await qc.invalidateQueries({ queryKey: ['connect', 'connections'] });
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Could not revoke. Try again.')),
  });

  async function copyUrl(): Promise<boolean> {
    try {
      await navigator.clipboard.writeText(connectorUrl());
      return true;
    } catch {
      toast.error('Could not copy. Copy the address below by hand.');
      return false;
    }
  }

  async function start(app: ConnectorApp) {
    if (await copyUrl()) toast.success('Connector address copied');
    setGuide(app);
    window.open(SETUP[app].settingsUrl, '_blank', 'noopener,noreferrer');
  }

  const connect = (
    <Card className="space-y-4 p-5">
      <div className="flex items-start gap-3">
        <Bot className="mt-0.5 h-5 w-5 shrink-0 text-foreground" aria-hidden />
        <p className="text-sm text-foreground">
          Let your own ChatGPT or Claude answer questions about your money using your EveryPaisa data. It can only read what you choose, never change anything, and you can revoke it any time.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => void start('ChatGPT')}>Connect ChatGPT</Button>
        <Button variant="outline" onClick={() => void start('Claude')}>Connect Claude</Button>
      </div>
      <div className="flex min-w-0 items-center gap-2 rounded-md border border-border bg-muted/40 p-2">
        <code className="min-w-0 flex-1 truncate text-xs text-foreground">{connectorUrl()}</code>
        <Button size="sm" variant="ghost" aria-label="Copy connector address" onClick={() => void copyUrl().then((ok) => ok && toast.success('Copied'))}>
          <Copy className="h-4 w-4" />
        </Button>
      </div>
      {guide && (
        <ol className="list-decimal space-y-1 pl-5 text-sm text-foreground">
          {SETUP[guide].steps.map((s) => <li key={s}>{s}</li>)}
        </ol>
      )}
      <p className="text-xs text-muted-foreground">Custom connectors need a paid ChatGPT or Claude plan.</p>
    </Card>
  );

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Settings" title="AI connectors" description="Use your own ChatGPT or Claude with your EveryPaisa data." />
      {allowed ? connect : <LockedFeature requiredTier={FEATURE_MIN_TIER.AI_CONNECTOR} featureName="AI connectors" compact>{connect}</LockedFeature>}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-foreground">Connected</h2>
        {list.isError && <p className="text-sm text-destructive">{apiErrorMessage(list.error, 'Could not load your connections.')}</p>}
        {list.data?.length === 0 && <p className="text-sm text-muted-foreground">Nothing connected yet.</p>}
        {list.data?.map((c) => (
          <Card key={c.id} className="space-y-3 p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-medium text-foreground">{c.clientName}</p>
                <p className="text-xs text-muted-foreground">
                  Connected {c.connectedOn} - {c.lastUsedAt ? `last used ${formatDateIST(c.lastUsedAt)}` : 'Not used yet'}
                </p>
              </div>
              <Button size="sm" variant="outline" onClick={() => setToRevoke(c)}>Revoke</Button>
            </div>
            <div className="flex flex-wrap gap-1">
              {c.areas.length === 0 && <span className="text-xs text-muted-foreground">Overview only</span>}
              {c.areas.map((a) => <Badge key={a} variant="secondary">{AI_CONNECTOR_AREA_INFO[a].label}</Badge>)}
            </div>
          </Card>
        ))}
      </section>
      <Card className="space-y-2 p-4">
        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox" className="mt-1" checked={optIn.data ?? false}
            disabled={optIn.isLoading || setOptIn.isPending}
            onChange={(e) => setOptIn.mutate(e.target.checked)}
            aria-label="Allow family to include me in their AI connectors"
          />
          <span className="min-w-0">
            <span className="block font-medium text-foreground">Allow family to include me in their AI connectors</span>
            <span className="block text-xs text-muted-foreground">
              When on, family members who can already see your data in EveryPaisa may also let their own ChatGPT or Claude read it. Off by default.
            </span>
          </span>
        </label>
      </Card>
      <ConfirmDialog
        open={toRevoke !== null}
        onOpenChange={(o) => { if (!o) setToRevoke(null); }}
        title={`Revoke ${toRevoke?.clientName ?? ''}?`}
        description="It will lose access to your EveryPaisa data straight away. You can connect it again later."
        confirmLabel="Revoke access"
        destructive
        onConfirm={() => { if (toRevoke) revoke.mutate(toRevoke.id); }}
      />
    </div>
  );
}
