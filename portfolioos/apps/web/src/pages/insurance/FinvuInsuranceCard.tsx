/**
 * Finvu insurance sandbox panel.
 *
 * Mounted on the /insurance page. Mirrors the Mutual Funds sandbox
 * card — four endpoint buttons covering life + general, each
 * rendering its slice of the upstream response through a dedicated
 * view component plus a collapsible raw-JSON footer.
 */

import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ChevronDown, Loader2, Sparkles, Plug, AlertTriangle, Shield } from 'lucide-react';
import toast from 'react-hot-toast';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { finfactorApi } from '@/api/finfactor.api';
import { apiErrorMessage } from '@/api/client';
import { LifeInsuranceView } from './finvu/LifeInsuranceView';
import { GeneralInsuranceView } from './finvu/GeneralInsuranceView';
import { InsuranceStatementView } from './finvu/InsuranceStatementView';

const SAMPLE_UID = '6354483360C';

type EndpointKey = 'lifeLinked' | 'lifeStmt' | 'generalLinked' | 'generalStmt';

const BUTTONS: Array<{ key: EndpointKey; label: string; hint: string }> = [
  { key: 'lifeLinked', label: 'Life linked accounts', hint: 'policies + sum assured + surrender value' },
  { key: 'lifeStmt', label: 'Life statement', hint: 'premium payments + bonuses' },
  { key: 'generalLinked', label: 'General linked accounts', hint: 'motor / health / home policies + covers' },
  { key: 'generalStmt', label: 'General statement', hint: 'premium debits + claim credits' },
];

export function FinvuInsuranceCard() {
  const [uid, setUid] = useState(SAMPLE_UID);
  const [active, setActive] = useState<EndpointKey | null>(null);
  const [lastEndpoint, setLastEndpoint] = useState<EndpointKey | null>(null);
  const [rawOpen, setRawOpen] = useState(false);
  const [result, setResult] = useState<unknown>(null);

  const statusQ = useQuery({
    queryKey: ['finfactor-status'],
    queryFn: () => finfactorApi.status(),
    staleTime: 60_000,
  });

  const mutation = useMutation({
    mutationFn: async (key: EndpointKey) => {
      setActive(key);
      switch (key) {
        case 'lifeLinked':
          return finfactorApi.lifeInsuranceLinkedAccounts({ uniqueIdentifier: uid });
        case 'lifeStmt':
          return finfactorApi.lifeInsuranceStatement({ uniqueIdentifier: uid, txnOrder: 'DESC' });
        case 'generalLinked':
          return finfactorApi.generalInsuranceLinkedAccounts({ uniqueIdentifier: uid });
        case 'generalStmt':
          return finfactorApi.generalInsuranceStatement({ uniqueIdentifier: uid, txnOrder: 'DESC' });
      }
    },
    onSuccess: (data, key) => {
      setResult(data);
      setLastEndpoint(key);
      toast.success(`Finvu /${key} ✓`);
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
    onSettled: () => setActive(null),
  });

  const configured = statusQ.data?.configured ?? false;
  const demoMode = statusQ.data?.demoMode ?? false;
  const activeLabel = BUTTONS.find((b) => b.key === lastEndpoint)?.label ?? null;

  return (
    <Card>
      <CardContent className="pt-5 pb-5 space-y-4">
        <div className="flex items-start gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-md bg-accent/10 text-accent shrink-0">
            <Shield className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-semibold flex items-center gap-2 flex-wrap">
              Insurance via Account Aggregator{' '}
              <span className="text-xs text-muted-foreground font-normal">via Finfactor Wealthscape</span>
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Pull life and general insurance policies, covers and premium history from the user's
              linked AAs. Sandbox UAT returns documented dummy data.
            </p>
          </div>
          {statusQ.data && (
            <span
              className={`text-[10px] uppercase tracking-kerned px-2 py-1 rounded-full font-medium ${
                demoMode
                  ? 'bg-accent/15 text-accent-ink ring-1 ring-accent/30'
                  : configured
                  ? 'bg-positive/10 text-positive ring-1 ring-positive/20'
                  : 'bg-amber-500/10 text-amber-700 ring-1 ring-amber-500/20'
              }`}
            >
              {demoMode ? 'Demo mode' : configured ? 'Configured' : 'Token missing'}
            </span>
          )}
        </div>

        {statusQ.data && demoMode && (
          <div className="flex items-start gap-2 rounded-md border border-accent/30 bg-accent/10 px-3 py-2 text-xs text-accent-ink">
            <Sparkles className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
            <div>
              Demo mode is active — responses come from canned fixtures, not Finfactor.
            </div>
          </div>
        )}

        {statusQ.data && !configured && (
          <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-800">
            <AlertTriangle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
            <div>
              Set <code className="font-mono">FINFACTOR_API_TOKEN</code> in the API env to enable
              sandbox calls, or <code className="font-mono">FINFACTOR_DEMO_MODE=true</code> for
              canned responses.
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[240px]">
            <Label>Unique identifier</Label>
            <Input
              value={uid}
              onChange={(e) => setUid(e.target.value)}
              placeholder={SAMPLE_UID}
              className="mt-1 font-mono"
            />
            <p className="text-[11px] text-muted-foreground mt-1">
              Sandbox accepts any string; <code className="font-mono">{SAMPLE_UID}</code> returns
              the documented dummy payload.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {BUTTONS.map((b) => (
            <Button
              key={b.key}
              variant={lastEndpoint === b.key ? 'default' : 'outline'}
              size="sm"
              disabled={!configured || mutation.isPending || !uid.trim()}
              onClick={() => mutation.mutate(b.key)}
              className="justify-start h-auto py-2"
            >
              {active === b.key ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Plug className="h-3.5 w-3.5" />
              )}
              <span className="flex flex-col items-start text-left ml-2">
                <span className="text-sm font-medium">{b.label}</span>
                <span
                  className={`text-[10.5px] font-normal ${
                    lastEndpoint === b.key
                      ? 'text-primary-foreground/80'
                      : 'text-muted-foreground'
                  }`}
                >
                  {b.hint}
                </span>
              </span>
            </Button>
          ))}
        </div>

        {result !== null && lastEndpoint && (
          <div className="border-t border-border/60 pt-4 space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h4 className="text-base font-semibold">{activeLabel}</h4>
              <span className="text-[10.5px] uppercase tracking-kerned text-muted-foreground">
                Endpoint response
              </span>
            </div>
            {renderEndpointView(lastEndpoint, result)}
            <RawJsonPanel data={result} open={rawOpen} onToggle={() => setRawOpen((v) => !v)} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function renderEndpointView(key: EndpointKey, data: unknown) {
  switch (key) {
    case 'lifeLinked':
      return <LifeInsuranceView data={data} />;
    case 'generalLinked':
      return <GeneralInsuranceView data={data} />;
    case 'lifeStmt':
      return <InsuranceStatementView data={data} label="Life" />;
    case 'generalStmt':
      return <InsuranceStatementView data={data} label="General" />;
  }
}

function RawJsonPanel({
  data,
  open,
  onToggle,
}: {
  data: unknown;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="rounded-md border border-border bg-muted/30">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-muted/50 transition-colors"
      >
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
        Raw upstream JSON (for debugging)
      </button>
      {open && (
        <pre className="max-h-[480px] overflow-auto px-3 pb-3 text-[11px] font-mono leading-relaxed text-foreground/80">
          {JSON.stringify(data, null, 2)}
        </pre>
      )}
    </div>
  );
}
