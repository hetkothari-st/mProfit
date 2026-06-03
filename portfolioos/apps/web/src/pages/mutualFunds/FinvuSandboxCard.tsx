/**
 * Finvu (Finfactor) sandbox card.
 *
 * Lets the operator hit every Wealthscape MF endpoint from the UI so
 * the sandbox round-trip is visible without curl. The default
 * uniqueIdentifier is the documented dummy from the Finfactor sandbox.
 *
 * Each endpoint's response is rendered by a dedicated view component
 * (insights → charts + holdings table, statement → txn table with
 * filters, etc). The raw JSON stays available as a collapsible footer
 * so the operator can still verify every key Finfactor returns.
 */

import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ChevronDown, Loader2, Sparkles, Plug, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { finfactorApi } from '@/api/finfactor.api';
import { apiErrorMessage } from '@/api/client';
import { InsightsView } from './finvu/InsightsView';
import { LinkedAccountsView } from './finvu/LinkedAccountsView';
import { HoldingFolioView } from './finvu/HoldingFolioView';
import { StatementView } from './finvu/StatementView';
import { AnalysisView } from './finvu/AnalysisView';
import { BenchmarkTrailingView, BenchmarkP2PView } from './finvu/BenchmarkView';

const SAMPLE_UID = '96696595XX';
const SAMPLE_BENCHMARKS = 'OB163,OB48,OB97';
const SAMPLE_TRAILING_RANGES = '1M,3M,6M,9M,1Y,2Y,3Y,5Y,7Y,10Y';
const TODAY_ISO = '2025-10-21';
const P2P_FROM = '2024-02-01';
const P2P_TO = '2024-02-29';

type EndpointKey =
  | 'insights'
  | 'insightsNoPii'
  | 'linkedAccounts'
  | 'linkedAccountsHoldingFolio'
  | 'statement'
  | 'analysis'
  | 'benchmarkTrailing'
  | 'benchmarkPointToPoint';

const BUTTONS: Array<{ key: EndpointKey; label: string; hint: string }> = [
  { key: 'insights', label: 'MF insights', hint: 'KPIs + distribution charts + holdings table' },
  { key: 'insightsNoPii', label: 'Insights (no PII)', hint: 'same view, PAN / mobile masked' },
  { key: 'linkedAccounts', label: 'Linked accounts', hint: 'FIP-grouped account list' },
  { key: 'linkedAccountsHoldingFolio', label: 'Holding folio', hint: 'per-scheme folio breakdown' },
  { key: 'statement', label: 'Statement', hint: 'transaction table with filters' },
  { key: 'analysis', label: 'Analysis', hint: 'category and type pies' },
  { key: 'benchmarkTrailing', label: 'Benchmark trailing', hint: '% returns by range (1M…10Y)' },
  { key: 'benchmarkPointToPoint', label: 'Benchmark P2P', hint: 'value between two dates' },
];

export function FinvuSandboxCard() {
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
        case 'insights':
          return finfactorApi.mfInsights({ uniqueIdentifier: uid });
        case 'insightsNoPii':
          return finfactorApi.mfInsightsNoPii({ uniqueIdentifier: uid });
        case 'linkedAccounts':
          return finfactorApi.mfLinkedAccounts({ uniqueIdentifier: uid });
        case 'linkedAccountsHoldingFolio':
          return finfactorApi.mfLinkedAccountsHoldingFolio({ uniqueIdentifier: uid });
        case 'statement':
          return finfactorApi.mfStatement({ uniqueIdentifier: uid, txnOrder: 'DESC' });
        case 'analysis':
          return finfactorApi.mfAnalysis({ uniqueIdentifier: uid });
        case 'benchmarkTrailing':
          return finfactorApi.benchmarkTrailing({
            benchmarks: SAMPLE_BENCHMARKS,
            from: TODAY_ISO,
            ranges: SAMPLE_TRAILING_RANGES,
          });
        case 'benchmarkPointToPoint':
          return finfactorApi.benchmarkPointToPoint({
            benchmarks: SAMPLE_BENCHMARKS,
            point_1: P2P_FROM,
            point_2: P2P_TO,
          });
      }
    },
    onSuccess: (data, key) => {
      setResult(data);
      setLastEndpoint(key);
      toast.success(`Finvu /${key} ✓`);
    },
    onError: (err) => {
      toast.error(apiErrorMessage(err));
    },
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
            <Plug className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-semibold flex items-center gap-2 flex-wrap">
              Finvu (Account Aggregator){' '}
              <span className="text-xs text-muted-foreground font-normal">via Finfactor Wealthscape</span>
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Pull mutual fund holdings, folios, transactions and insights from the user's linked AAs.
              The sandbox UAT serves dummy data — useful for verifying the round-trip before consent goes live.
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
              Demo mode is active — every call returns the documented sample payload from
              <code className="font-mono"> docs.finfactor.in/wealth-scape</code>. No upstream request is made.
            </div>
          </div>
        )}

        {statusQ.data && !configured && (
          <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-800">
            <AlertTriangle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
            <div>
              Set <code className="font-mono">FINFACTOR_API_TOKEN</code> in the API env to enable sandbox
              calls, or <code className="font-mono">FINFACTOR_DEMO_MODE=true</code> for canned responses.
              Base URL: <code className="font-mono">{statusQ.data.baseUrl}</code>
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
              The Finfactor sandbox accepts any string; <code className="font-mono">{SAMPLE_UID}</code> returns the documented dummy payload.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
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
                <Sparkles className="h-3.5 w-3.5" />
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
    case 'insights':
      return <InsightsView data={data} />;
    case 'insightsNoPii':
      return <InsightsView data={data} masked />;
    case 'linkedAccounts':
      return <LinkedAccountsView data={data} />;
    case 'linkedAccountsHoldingFolio':
      return <HoldingFolioView data={data} />;
    case 'statement':
      return <StatementView data={data} />;
    case 'analysis':
      return <AnalysisView data={data} />;
    case 'benchmarkTrailing':
      return <BenchmarkTrailingView data={data} />;
    case 'benchmarkPointToPoint':
      return <BenchmarkP2PView data={data} />;
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
