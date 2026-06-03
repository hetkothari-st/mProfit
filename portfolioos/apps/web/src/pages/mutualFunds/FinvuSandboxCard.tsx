/**
 * Finvu (Finfactor) sandbox card.
 *
 * Lets the operator hit every Wealthscape MF endpoint from the UI so
 * the sandbox round-trip is visible without curl. Defaults are the
 * documented dummy `uniqueIdentifier` from the Finfactor sandbox; users
 * can override before each call.
 *
 * Headline numbers from /mutual-fund/insights are rendered as tiles
 * (current value, invested, XIRR, holdings) so the panel looks like
 * the rest of the app — the full upstream JSON is collapsed beneath
 * for verification.
 */

import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ChevronDown, Loader2, Sparkles, Plug, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatINR, toDecimal } from '@portfolioos/shared';
import { finfactorApi } from '@/api/finfactor.api';
import { apiErrorMessage } from '@/api/client';

const SAMPLE_UID = '96696595XX';

type EndpointKey =
  | 'insights'
  | 'insightsNoPii'
  | 'linkedAccounts'
  | 'linkedAccountsHoldingFolio'
  | 'statement'
  | 'analysis';

interface OverallSummary {
  totalHoldings?: number;
  foliosCount?: number;
  currentValue?: number;
  investedValue?: number;
  absoluteReturn?: number;
  absoluteReturnPercentage?: number;
  xirr?: number;
}

function isObj(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null;
}

function getOverallSummary(insights: unknown): OverallSummary | null {
  if (!isObj(insights)) return null;
  const s = insights['overallSummary'];
  if (!isObj(s)) return null;
  return s as OverallSummary;
}

function asNumber(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export function FinvuSandboxCard() {
  const [uid, setUid] = useState(SAMPLE_UID);
  const [active, setActive] = useState<EndpointKey | null>(null);
  const [expanded, setExpanded] = useState(false);
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
      }
    },
    onSuccess: (data, key) => {
      setResult(data);
      setExpanded(true);
      toast.success(`Finvu /${key} ✓`);
    },
    onError: (err) => {
      toast.error(apiErrorMessage(err));
    },
    onSettled: () => setActive(null),
  });

  const overall = result ? getOverallSummary(result) : null;
  const configured = statusQ.data?.configured ?? false;
  const demoMode = statusQ.data?.demoMode ?? false;

  const buttons: Array<{ key: EndpointKey; label: string; hint: string }> = [
    { key: 'insights', label: 'MF insights', hint: 'overallSummary + holdings' },
    { key: 'insightsNoPii', label: 'Insights (no PII)', hint: 'same, with PAN/mobile masked' },
    { key: 'linkedAccounts', label: 'Linked accounts', hint: 'FIP-level account list' },
    { key: 'linkedAccountsHoldingFolio', label: 'Holding folio', hint: 'per-folio breakdown' },
    { key: 'statement', label: 'Statement', hint: 'transaction list (DESC)' },
    { key: 'analysis', label: 'Analysis', hint: 'category / type rollup' },
  ];

  return (
    <Card>
      <CardContent className="pt-5 pb-5 space-y-4">
        <div className="flex items-start gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-md bg-accent/10 text-accent shrink-0">
            <Plug className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-semibold flex items-center gap-2">
              Finvu (Account Aggregator) <span className="text-xs text-muted-foreground font-normal">via Finfactor Wealthscape</span>
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
              Set <code className="font-mono">FINFACTOR_DEMO_MODE=false</code> + a real{' '}
              <code className="font-mono">FINFACTOR_API_TOKEN</code> to hit the sandbox UAT.
            </div>
          </div>
        )}

        {statusQ.data && !configured && (
          <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-800">
            <AlertTriangle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
            <div>
              Set <code className="font-mono">FINFACTOR_API_TOKEN</code> in the API env to enable sandbox calls,
              or <code className="font-mono">FINFACTOR_DEMO_MODE=true</code> for canned responses. Base URL:{' '}
              <code className="font-mono">{statusQ.data.baseUrl}</code>
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
          {buttons.map((b) => (
            <Button
              key={b.key}
              variant="outline"
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
                <span className="text-[10.5px] text-muted-foreground font-normal">{b.hint}</span>
              </span>
            </Button>
          ))}
        </div>

        {overall && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 pt-2">
            <SummaryTile
              label="Current value"
              value={overall.currentValue}
              format="money"
            />
            <SummaryTile
              label="Invested"
              value={overall.investedValue}
              format="money"
            />
            <SummaryTile
              label="Absolute return"
              value={overall.absoluteReturn}
              format="money"
              tone={
                asNumber(overall.absoluteReturn) != null && asNumber(overall.absoluteReturn)! >= 0
                  ? 'positive'
                  : 'negative'
              }
            />
            <SummaryTile
              label="XIRR"
              value={overall.xirr}
              format="pct"
              tone={
                asNumber(overall.xirr) != null && asNumber(overall.xirr)! >= 0
                  ? 'positive'
                  : 'negative'
              }
            />
            <SummaryTile label="Holdings" value={overall.totalHoldings} format="int" />
            <SummaryTile label="Folios" value={overall.foliosCount} format="int" />
            <SummaryTile
              label="Abs return %"
              value={overall.absoluteReturnPercentage}
              format="pct"
            />
          </div>
        )}

        {result !== null && (
          <div className="rounded-md border border-border bg-muted/30">
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-muted/50 transition-colors"
            >
              <ChevronDown
                className={`h-3.5 w-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`}
              />
              Raw response
            </button>
            {expanded && (
              <pre className="max-h-[480px] overflow-auto px-3 pb-3 text-[11px] font-mono leading-relaxed text-foreground/80">
                {JSON.stringify(result, null, 2)}
              </pre>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SummaryTile({
  label,
  value,
  format,
  tone,
}: {
  label: string;
  value: unknown;
  format: 'money' | 'pct' | 'int';
  tone?: 'positive' | 'negative';
}) {
  const n = asNumber(value);
  let display = '—';
  if (n != null) {
    if (format === 'money') display = formatINR(toDecimal(n).toFixed(2));
    else if (format === 'pct') display = `${n.toFixed(2)}%`;
    else display = String(Math.trunc(n));
  }
  const toneCls =
    tone === 'positive' ? 'text-positive' : tone === 'negative' ? 'text-negative' : '';
  return (
    <div className="rounded-lg border border-border/70 bg-card/40 p-3">
      <div className="text-[10px] uppercase tracking-kerned text-muted-foreground font-medium">
        {label}
      </div>
      <div className={`mt-1 text-[18px] font-semibold tabular-nums ${toneCls}`}>{display}</div>
    </div>
  );
}
