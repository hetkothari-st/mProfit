import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Sparkles, Loader2, RefreshCw, AlertTriangle, Info, AlertOctagon, ShieldAlert, ArrowRight } from 'lucide-react';
import toast from 'react-hot-toast';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { toDecimal } from '@portfolioos/shared';
import { analyticsApi } from '@/api/analytics.api';
import type {
  Period,
  InsightsResult,
  InsightCard,
  InsightSeverity,
  InsightCategory,
} from '@/api/analytics.api';
import { apiErrorMessage } from '@/api/client';

const CATEGORY_LABEL: Record<InsightCategory, string> = {
  diversification: 'Diversification',
  tax_optimisation: 'Tax optimisation',
  rebalancing: 'Rebalancing',
  underperformers: 'Underperformers',
  cash_drag: 'Cash drag',
  sector_tilt: 'Sector tilt',
  risk_concentration: 'Risk concentration',
};

function severityStyles(s: InsightSeverity) {
  if (s === 'HIGH')
    return {
      bg: 'border-red-200 bg-red-50/60 dark:border-red-900/60 dark:bg-red-950/30',
      icon: <AlertOctagon className="h-4 w-4 text-red-600 dark:text-red-400" />,
      pill: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300',
    };
  if (s === 'MEDIUM')
    return {
      bg: 'border-amber-200 bg-amber-50/60 dark:border-amber-900/60 dark:bg-amber-950/30',
      icon: <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />,
      pill: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
    };
  return {
    bg: 'border-sky-200 bg-sky-50/60 dark:border-sky-900/60 dark:bg-sky-950/30',
    icon: <Info className="h-4 w-4 text-sky-600 dark:text-sky-400" />,
    pill: 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300',
  };
}

function InsightCardView({ card }: { card: InsightCard }) {
  const s = severityStyles(card.severity);
  return (
    <div className={`rounded-lg border px-4 py-3 ${s.bg}`}>
      <div className="flex items-center gap-2 mb-1.5">
        {s.icon}
        <span className={`text-[10px] uppercase tracking-kerned font-medium rounded-full px-2 py-0.5 ${s.pill}`}>
          {CATEGORY_LABEL[card.category]}
        </span>
        <span className="ml-auto text-[10px] uppercase tracking-kerned text-muted-foreground">
          {card.severity}
        </span>
      </div>
      <p className="text-sm font-semibold leading-snug mb-1">{card.title}</p>
      <p className="text-[13px] text-muted-foreground leading-relaxed">{card.body}</p>
      {card.suggestedAction && (
        <div className="mt-2 flex items-start gap-1.5 text-[12px] text-foreground">
          <ArrowRight className="h-3.5 w-3.5 mt-0.5 text-accent" strokeWidth={2} />
          <span>{card.suggestedAction}</span>
        </div>
      )}
    </div>
  );
}

interface InsightsPanelProps {
  portfolioId: string | undefined;
  period: Period;
}

export function InsightsPanel({ portfolioId, period }: InsightsPanelProps) {
  const queryClient = useQueryClient();

  const latestQuery = useQuery({
    queryKey: ['analytics', 'insights', portfolioId ?? 'all'],
    queryFn: () => analyticsApi.insights(portfolioId),
    staleTime: 23 * 60 * 60 * 1000, // ~24h
  });

  const spendQuery = useQuery({
    queryKey: ['analytics', 'insights-spend'],
    queryFn: () => analyticsApi.insightsSpend(),
    staleTime: 60_000,
  });

  const generateMutation = useMutation({
    mutationFn: (force: boolean) => analyticsApi.generateInsights(portfolioId, period, force),
    onSuccess: (data) => {
      if (data.ok) {
        queryClient.setQueryData(['analytics', 'insights', portfolioId ?? 'all'], data);
        queryClient.invalidateQueries({ queryKey: ['analytics', 'insights-spend'] });
        toast.success(
          data.fromCache
            ? 'Loaded cached insight (under 24h old).'
            : `Generated · cost ₹${data.costInr}`,
        );
      } else {
        toast.error(data.message ?? 'Generate failed');
      }
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Generate failed')),
  });

  const latest = latestQuery.data;
  const spend = spendQuery.data;
  const capped = spend?.status === 'capped';
  const warning = spend?.status === 'warn';
  const okPayload: InsightsResult | null | undefined =
    latest && latest.ok ? latest : null;
  const failedPayload = latest && !latest.ok ? latest : null;

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between pb-3 gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-accent" strokeWidth={1.8} />
          <CardTitle>AI Portfolio Insights</CardTitle>
          {okPayload?.fromCache && (
            <span className="text-[10px] uppercase tracking-kerned text-muted-foreground border rounded-full px-2 py-0.5">
              Cached · {new Date(okPayload.generatedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {spend && (
            <div className="hidden sm:flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <span>Budget</span>
              <span className={`tabular-nums font-medium ${capped ? 'text-red-600 dark:text-red-400' : warning ? 'text-amber-600 dark:text-amber-400' : 'text-foreground'}`}>
                ₹{toDecimal(spend.monthToDate).toFixed(2)} / ₹{toDecimal(spend.capInr).toFixed(0)}
              </span>
            </div>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => generateMutation.mutate(true)}
            disabled={generateMutation.isPending || capped}
          >
            {generateMutation.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            <span className="ml-1.5">{okPayload ? 'Regenerate' : 'Generate'}</span>
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {latestQuery.isLoading && (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}

        {capped && (
          <div className="flex items-start gap-2 rounded-lg border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/30 px-3 py-2 mb-4 text-sm">
            <ShieldAlert className="h-4 w-4 text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-medium text-red-700 dark:text-red-300">Monthly LLM budget reached</p>
              <p className="text-xs text-red-600/80 dark:text-red-400/80">
                ₹{spend?.monthToDate} of ₹{spend?.capInr} spent this month. Insights generation paused
                until next month or cap is raised in settings.
              </p>
            </div>
          </div>
        )}

        {!latestQuery.isLoading && !okPayload && !failedPayload && (
          <div className="text-center py-10">
            <Sparkles className="h-8 w-8 mx-auto mb-3 text-muted-foreground" strokeWidth={1.4} />
            <p className="text-sm text-muted-foreground mb-4">
              No insights yet for this scope. Generate to analyse your portfolio.
            </p>
            <Button onClick={() => generateMutation.mutate(false)} disabled={generateMutation.isPending || capped}>
              {generateMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
              ) : (
                <Sparkles className="h-4 w-4 mr-1.5" />
              )}
              Generate insights
            </Button>
          </div>
        )}

        {failedPayload && (
          <div className="rounded-lg border border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-sm">
            {failedPayload.message}
          </div>
        )}

        {okPayload && okPayload.ok && (
          <div className="space-y-4">
            <p className="text-sm text-foreground leading-relaxed whitespace-pre-line">
              {okPayload.narrative}
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {okPayload.cards.map((c, i) => (
                <InsightCardView key={i} card={c} />
              ))}
            </div>
            {okPayload.recommendedAllocation && Object.keys(okPayload.recommendedAllocation).length > 0 && (
              <div className="rounded-lg border bg-muted/30 px-4 py-3">
                <p className="text-[10px] uppercase tracking-kerned text-muted-foreground mb-2">
                  Suggested target allocation
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 text-xs">
                  {Object.entries(okPayload.recommendedAllocation)
                    .sort(([, a], [, b]) => b - a)
                    .map(([cls, pct]) => (
                      <div key={cls} className="flex items-center justify-between border rounded px-2 py-1">
                        <span className="text-muted-foreground">{cls.replace(/_/g, ' ')}</span>
                        <span className="tabular-nums font-medium">{pct.toFixed(0)}%</span>
                      </div>
                    ))}
                </div>
              </div>
            )}
            <p className="text-[11px] text-muted-foreground border-t pt-3">
              <span className="font-medium">Disclaimer.</span> {okPayload.disclaimer} Model: {okPayload.model}.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
