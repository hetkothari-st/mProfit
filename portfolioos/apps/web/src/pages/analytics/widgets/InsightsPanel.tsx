import { useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Sparkles, Loader2, RefreshCw, AlertTriangle, Info, AlertOctagon, ShieldAlert, Zap, ChevronDown } from 'lucide-react';
import toast from 'react-hot-toast';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { analyticsApi } from '@/api/analytics.api';
import type {
  Period,
  InsightsResult,
  InsightCard,
  InsightSeverity,
  InsightCategory,
  DeterministicInsight,
} from '@/api/analytics.api';
import { apiErrorMessage } from '@/api/client';
import { AnalyticsInfo } from '../AnalyticsInfo';

const CATEGORY_LABEL: Record<InsightCategory, string> = {
  diversification: 'Diversification',
  tax_optimisation: 'Tax optimisation',
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
      {card.action && (
        <Link
          to={card.action.href}
          className="mt-2 inline-flex items-center gap-1 text-[12px] font-medium text-accent hover:underline"
        >
          {card.action.label}
          <span aria-hidden>→</span>
        </Link>
      )}
    </div>
  );
}

function DeterministicInsightCardView({ card }: { card: DeterministicInsight }) {
  return (
    <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 dark:border-emerald-900/60 dark:bg-emerald-950/30 px-4 py-3">
      <div className="flex items-center gap-2 mb-1.5">
        <Zap className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
        <span className="text-[10px] uppercase tracking-kerned font-medium rounded-full px-2 py-0.5 bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
          Instant · from your data
        </span>
      </div>
      <p className="text-[13px] text-foreground leading-relaxed">{card.message}</p>
      {card.action && (
        <Link
          to={card.action.href}
          className="mt-2 inline-flex items-center gap-1 text-[12px] font-medium text-accent hover:underline"
        >
          {card.action.label}
          <span aria-hidden>→</span>
        </Link>
      )}
    </div>
  );
}

/**
 * Open/closed state for the panel, remembered per browser so a user who folds
 * it away doesn't have it spring open on every visit. Open by default. Storage
 * can be unavailable (private mode, blocked site data), so every access is
 * guarded and falls back to open.
 */
export const INSIGHTS_COLLAPSED_KEY = 'analytics_insights_collapsed';

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(INSIGHTS_COLLAPSED_KEY) === '1';
  } catch {
    return false;
  }
}

/** False when storage is blocked: the panel still folds, it just isn't remembered. */
function writeCollapsed(collapsed: boolean): boolean {
  try {
    if (collapsed) localStorage.setItem(INSIGHTS_COLLAPSED_KEY, '1');
    else localStorage.removeItem(INSIGHTS_COLLAPSED_KEY);
    return true;
  } catch {
    return false;
  }
}

interface InsightsPanelProps {
  portfolioId: string | undefined;
  period: Period;
}

export function InsightsPanel({ portfolioId, period }: InsightsPanelProps) {
  const queryClient = useQueryClient();
  const contentId = useId();
  const [open, setOpen] = useState(() => !readCollapsed());

  function toggle() {
    writeCollapsed(open);
    setOpen(!open);
  }

  const latestQuery = useQuery({
    queryKey: ['analytics', 'insights', portfolioId ?? 'all'],
    queryFn: () => analyticsApi.insights(portfolioId),
    staleTime: 23 * 60 * 60 * 1000, // ~24h
    // Folded away: nothing on screen needs this, so don't fetch until opened.
    enabled: open,
  });

  const spendQuery = useQuery({
    queryKey: ['analytics', 'insights-spend'],
    queryFn: () => analyticsApi.insightsSpend(),
    staleTime: 60_000,
    enabled: open,
  });

  // Deterministic cards are cheap (no LLM call) and always reflect current
  // data — fetched independently of the LLM insights above so they render
  // even while those are loading, capped, or absent.
  const deterministicQuery = useQuery({
    queryKey: ['analytics', 'insights-deterministic'],
    queryFn: () => analyticsApi.deterministicInsights(),
    staleTime: 5 * 60 * 1000,
    enabled: open,
  });

  const generateMutation = useMutation({
    mutationFn: (force: boolean) => analyticsApi.generateInsights(portfolioId, period, force),
    onSuccess: (data) => {
      if (data.ok) {
        queryClient.setQueryData(['analytics', 'insights', portfolioId ?? 'all'], data);
        queryClient.invalidateQueries({ queryKey: ['analytics', 'insights-spend'] });
        toast.success(data.fromCache ? 'Loaded cached insight (under 24h old).' : 'Insights generated.');
      } else {
        toast.error(data.message ?? 'Generate failed');
      }
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Generate failed')),
  });

  const latest = latestQuery.data;
  const spend = spendQuery.data;
  const capped = spend?.status === 'capped';
  const okPayload: InsightsResult | null | undefined =
    latest && latest.ok ? latest : null;
  const failedPayload = latest && !latest.ok ? latest : null;

  return (
    <Card>
      <CardHeader className={`flex-row items-center justify-between gap-3 flex-wrap ${open ? 'pb-3' : ''}`}>
        <div className="flex items-center gap-2">
          <CardTitle className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={toggle}
              aria-expanded={open}
              aria-controls={contentId}
              className="-ml-1 flex items-center gap-2 rounded-md px-1 py-0.5 text-left transition-colors hover:text-foreground/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
            >
              <ChevronDown
                aria-hidden
                className={`h-4 w-4 text-muted-foreground transition-transform ${open ? '' : '-rotate-90'}`}
                strokeWidth={1.9}
              />
              <Sparkles aria-hidden className="h-4 w-4 text-accent" strokeWidth={1.8} />
              AI Portfolio Insights
            </button>
            <AnalyticsInfo k="insights" />
          </CardTitle>
          {open && okPayload?.fromCache && (
            <span className="text-[10px] uppercase tracking-kerned text-muted-foreground border rounded-full px-2 py-0.5">
              Cached · {new Date(okPayload.generatedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
            </span>
          )}
        </div>
        {open && (
          <div className="flex items-center gap-2 flex-wrap">
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
        )}
      </CardHeader>
      <CardContent id={contentId} hidden={!open}>
        {!!deterministicQuery.data?.length && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
            {deterministicQuery.data.map((c) => (
              <DeterministicInsightCardView key={c.id} card={c} />
            ))}
          </div>
        )}

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
                New insights are paused until next month, or until the cap is raised in settings.
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
              {okPayload.cards
                .filter((c) => (c.category as string) !== 'rebalancing')
                .map((c, i) => (
                  <InsightCardView key={i} card={c} />
                ))}
            </div>
            <p className="text-[11px] text-muted-foreground border-t pt-3">
              <span className="font-medium">Disclaimer.</span> {okPayload.disclaimer}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
