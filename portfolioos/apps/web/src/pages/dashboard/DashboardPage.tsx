import { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  TrendingUp, Wallet, LineChart as LineChartIcon, Percent, Briefcase,
  RefreshCw, Loader2, ArrowRight, Car, Home, Shield,
  AlertTriangle, Bell, CheckCircle2, XCircle, CalendarDays, Layers, ChevronDown,
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  PieChart, Pie, Cell,
} from 'recharts';
import { PageHeader } from '@/components/layout/PageHeader';
import { DownloadReportButton } from '@/components/reports/DownloadReportButton';
import { MetricCard } from '@/components/portfolio/MetricCard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Money } from '@/components/ui/money';
import { Select } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/common/EmptyState';
import { portfoliosApi } from '@/api/portfolios.api';
import { transactionsApi } from '@/api/transactions.api';
import { assetsApi } from '@/api/assets.api';
import { dashboardApi } from '@/api/dashboard.api';
import { mailboxesApi } from '@/api/mailboxes.api';
import { ConnectGmailCard } from '@/components/dashboard/ConnectGmailCard';
import { GmailScanProgressCard } from '@/components/dashboard/GmailScanProgressCard';
import { DashboardFxStrip } from '@/pages/forex/DashboardFxStrip';
import { apiErrorMessage } from '@/api/client';
import { usePrivacyStore } from '@/stores/privacy.store';
import {
  formatINR,
  formatPercent,
  ASSET_CLASS_LABELS,
  Decimal,
  toDecimal,
} from '@portfolioos/shared';

const PERIOD_OPTIONS = [
  { label: '1M', days: 30 },
  { label: '3M', days: 90 },
  { label: '6M', days: 180 },
  { label: '1Y', days: 365 },
  { label: 'All', days: 0 },
];

// Editorial chart palette — refined, restrained, never neon
const PIE_COLORS = [
  'hsl(213 53% 22%)',   // ink
  'hsl(36 60% 48%)',    // gold
  'hsl(130 35% 34%)',   // forest
  'hsl(12 50% 44%)',    // terracotta
  'hsl(260 28% 42%)',   // plum
  'hsl(195 40% 34%)',   // slate teal
  'hsl(28 70% 54%)',    // amber
  'hsl(340 35% 40%)',   // rosewood
  'hsl(80 28% 38%)',    // moss
  'hsl(220 25% 50%)',   // dust blue
  'hsl(50 55% 45%)',    // mustard
  'hsl(165 30% 36%)',   // pine
];

function urgencyColor(urgency: 'HIGH' | 'MEDIUM' | 'LOW') {
  if (urgency === 'HIGH') return 'text-red-600 dark:text-red-400';
  if (urgency === 'MEDIUM') return 'text-amber-600 dark:text-amber-400';
  return 'text-blue-600 dark:text-blue-400';
}

function urgencyBg(urgency: 'HIGH' | 'MEDIUM' | 'LOW') {
  if (urgency === 'HIGH') return 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800';
  if (urgency === 'MEDIUM') return 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800';
  return 'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800';
}

function UrgencyIcon({ urgency }: { urgency: 'HIGH' | 'MEDIUM' | 'LOW' }) {
  if (urgency === 'HIGH') return <XCircle className={`h-4 w-4 flex-shrink-0 ${urgencyColor(urgency)}`} />;
  if (urgency === 'MEDIUM') return <AlertTriangle className={`h-4 w-4 flex-shrink-0 ${urgencyColor(urgency)}`} />;
  return <Bell className={`h-4 w-4 flex-shrink-0 ${urgencyColor(urgency)}`} />;
}

function labelForKey(key: string): string {
  return ASSET_CLASS_LABELS[key as keyof typeof ASSET_CLASS_LABELS] ?? key.replace(/_/g, ' ');
}

// Editorial palette per asset class — paired with PIE_COLORS for visual coherence.
const ASSET_CLASS_COLORS: Record<string, string> = {
  EQUITY: 'hsl(213 53% 22%)',
  FUTURES: 'hsl(213 53% 22%)',
  OPTIONS: 'hsl(213 53% 22%)',
  MUTUAL_FUND: 'hsl(260 28% 42%)',
  ETF: 'hsl(260 28% 42%)',
  BOND: 'hsl(195 40% 34%)',
  GOVT_BOND: 'hsl(195 40% 34%)',
  CORPORATE_BOND: 'hsl(195 40% 34%)',
  FIXED_DEPOSIT: 'hsl(220 25% 50%)',
  RECURRING_DEPOSIT: 'hsl(220 25% 50%)',
  NPS: 'hsl(130 35% 34%)',
  PPF: 'hsl(130 35% 34%)',
  EPF: 'hsl(130 35% 34%)',
  PMS: 'hsl(165 30% 36%)',
  AIF: 'hsl(165 30% 36%)',
  PRIVATE_EQUITY: 'hsl(165 30% 36%)',
  REIT: 'hsl(12 50% 44%)',
  INVIT: 'hsl(12 50% 44%)',
  GOLD_BOND: 'hsl(36 60% 48%)',
  GOLD_ETF: 'hsl(36 60% 48%)',
  PHYSICAL_GOLD: 'hsl(36 60% 48%)',
  PHYSICAL_SILVER: 'hsl(220 10% 60%)',
  ULIP: 'hsl(340 35% 40%)',
  INSURANCE: 'hsl(340 35% 40%)',
  REAL_ESTATE: 'hsl(12 50% 44%)',
  CRYPTOCURRENCY: 'hsl(28 70% 54%)',
  CASH: 'hsl(80 28% 38%)',
  NSC: 'hsl(50 55% 45%)',
  ART_COLLECTIBLES: 'hsl(220 10% 60%)',
  OTHER: 'hsl(220 10% 60%)',
};
function assetClassColor(cls: string): string {
  return ASSET_CLASS_COLORS[cls] ?? 'hsl(220 10% 60%)';
}

export function DashboardPage() {
  const [selectedId, setSelectedId] = useState<string>('ALL');
  const [period, setPeriod] = useState<number>(365);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const hideSensitive = usePrivacyStore((s) => s.hideSensitive);
  // In-session collapse for the alerts bar. Intentionally NOT persisted —
  // every fresh load shows alerts expanded so the user re-sees them.
  const [alertsCollapsed, setAlertsCollapsed] = useState(false);

  const portfoliosQuery = useQuery({
    queryKey: ['portfolios'],
    queryFn: () => portfoliosApi.list(),
  });
  const portfolios = portfoliosQuery.data ?? [];

  useEffect(() => {
    if (!portfoliosQuery.isLoading && portfolios.length === 0 && !localStorage.getItem('onboarding_v2_done')) {
      navigate('/onboarding', { replace: true });
    }
  }, [portfoliosQuery.isLoading, portfolios.length, navigate]);

  const netWorthQuery = useQuery({
    queryKey: ['dashboard', 'net-worth', selectedId],
    queryFn: () => dashboardApi.netWorth(selectedId !== 'ALL' ? selectedId : undefined),
  });

  const summariesQuery = useQuery({
    queryKey: ['dashboard', 'summaries', portfolios.map((p) => p.id).join(',')],
    queryFn: async () => Promise.all(portfolios.map((p) => portfoliosApi.summary(p.id))),
    enabled: portfolios.length > 0,
  });

  const recentTxQuery = useQuery({
    queryKey: ['transactions', 'recent'],
    queryFn: () => transactionsApi.list({ pageSize: 5 }),
  });

  const valuationQuery = useQuery({
    queryKey: ['dashboard', 'valuation', selectedId, period, portfolios.map((p) => p.id).join(',')],
    queryFn: async () => {
      const ids = selectedId === 'ALL' ? portfolios.map((p) => p.id) : [selectedId];
      const allSeries = await Promise.all(ids.map((id) => portfoliosApi.historicalValuation(id, period)));
      const merged: Record<string, { value: Decimal; invested: Decimal }> = {};
      for (const series of allSeries) {
        for (const pt of series) {
          const m = merged[pt.date] ?? { value: new Decimal(0), invested: new Decimal(0) };
          m.value = m.value.plus(toDecimal(pt.value));
          m.invested = m.invested.plus(toDecimal(pt.invested));
          merged[pt.date] = m;
        }
      }
      return Object.entries(merged)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, m]) => ({
          date,
          label: new Date(date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' }),
          value: m.value.toNumber(),
          invested: m.invested.toNumber(),
        }));
    },
    enabled: portfolios.length > 0,
  });

  const holdingsQuery = useQuery({
    queryKey: ['dashboard', 'holdings', selectedId, portfolios.map((p) => p.id).join(',')],
    queryFn: async () => {
      const ids = selectedId === 'ALL' ? portfolios.map((p) => p.id) : [selectedId];
      const all = await Promise.all(ids.map((id) => portfoliosApi.holdings(id)));
      // Sort by effective value: live price if available, otherwise cost basis
      return all.flat().sort((a, b) => {
        const av = toDecimal(a.currentValue ?? a.totalCost);
        const bv = toDecimal(b.currentValue ?? b.totalCost);
        return bv.comparedTo(av);
      });
    },
    enabled: portfolios.length > 0,
  });

  const refreshMutation = useMutation({
    mutationFn: () => assetsApi.refreshAll(),
    onSuccess: async (r) => {
      const updatedCount = r.stocks.updated + r.holdings.updated;
      toast.success(
        updatedCount > 0
          ? `Updated ${r.stocks.updated} price${r.stocks.updated !== 1 ? 's' : ''} · ${r.holdings.updated} holding${r.holdings.updated !== 1 ? 's' : ''}`
          : 'Data refreshed — no new prices available',
      );
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
        queryClient.invalidateQueries({ queryKey: ['portfolios'] }),
        queryClient.invalidateQueries({ queryKey: ['holdings'] }),
      ]);
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Refresh failed')),
  });

  const totals = useMemo(() => {
    const summaries = summariesQuery.data ?? [];
    const filtered = selectedId === 'ALL' ? summaries : summaries.filter((s) => s.id === selectedId);
    const sum = (key: 'currentValue' | 'totalInvestment' | 'unrealisedPnL' | 'todaysChange') =>
      filtered.reduce((acc, s) => (s[key] != null ? acc.plus(toDecimal(s[key])) : acc), new Decimal(0));
    const currentValueD = sum('currentValue');
    const totalInvestmentD = sum('totalInvestment');
    const unrealisedPnLD = sum('unrealisedPnL');
    const todaysChangeD = sum('todaysChange');
    const unrealisedPct = totalInvestmentD.greaterThan(0)
      ? unrealisedPnLD.dividedBy(totalInvestmentD).times(100).toNumber() : 0;
    const priorValueD = currentValueD.minus(todaysChangeD);
    const todaysChangePct = priorValueD.greaterThan(0)
      ? todaysChangeD.dividedBy(priorValueD).times(100).toNumber() : null;
    const xirrVals = filtered.map((s) => s.xirr).filter((x): x is number => x != null);
    return {
      currentValue: currentValueD.toFixed(4),
      totalInvestment: totalInvestmentD.toFixed(4),
      unrealisedPnL: unrealisedPnLD.toFixed(4),
      unrealisedPnLD,
      unrealisedPct,
      todaysChange: todaysChangeD.toFixed(4),
      todaysChangeD,
      todaysChangePct,
      holdingCount: filtered.reduce((a, s) => a + (s.holdingCount ?? 0), 0),
      xirr: xirrVals.length ? xirrVals.reduce((a, b) => a + b, 0) / xirrVals.length : null,
    };
  }, [summariesQuery.data, selectedId]);

  if (portfoliosQuery.isLoading) return <DashboardSkeleton />;

  if (portfolios.length === 0) {
    return (
      <div>
        <PageHeader title="Dashboard" description="Your financial command centre" />
        <EmptyState
          icon={Briefcase}
          title="No portfolios yet"
          description="Create your first portfolio to start tracking investments and other assets."
          action={<Button asChild><Link to="/onboarding">Get started</Link></Button>}
        />
      </div>
    );
  }

  const nw = netWorthQuery.data;
  const chartData = valuationQuery.data ?? [];
  const topHoldings = (holdingsQuery.data ?? []).slice(0, 10);
  const pieData = (nw?.allocationBreakdown ?? []).filter((s) => s.numericValue > 0);
  const alerts = nw?.alerts ?? [];

  return (
    <div className="space-y-7">
      <GmailDashboardCards />
      <PageHeader
        eyebrow="Dashboard"
        title="Your financial portrait"
        description="A complete, hand-curated view of every asset, liability, and signal — engineered for investors who read between the lines."
        actions={
          <div className="flex items-center gap-2">
            <Select value={selectedId} onChange={(e) => setSelectedId(e.target.value)} className="w-52">
              <option value="ALL">All portfolios ({portfolios.length})</option>
              {portfolios.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
            <DownloadReportButton type="dashboard" label="Export" />
            <Button variant="outline" onClick={() => refreshMutation.mutate()} disabled={refreshMutation.isPending}>
              {refreshMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Refresh
            </Button>
          </div>
        }
      />

      {/* Net Worth Hero — editorial */}
      {nw && (
        <Card tone="hero" className="reveal">
          <div className="relative px-7 py-7 sm:px-9 sm:py-8">
            <div className="flex items-start justify-between gap-6 flex-wrap">
              <div className="min-w-0">
                <p className="text-[10px] font-medium uppercase tracking-kerned text-accent-ink/85 mb-2">
                  Total Net Worth · Consolidated
                </p>
                <Money
                  hero
                  className="numeric-display-lg text-[clamp(2.4rem,5.6vw,4rem)] leading-[1.02] text-foreground"
                  symbolClassName="text-[0.6em] -translate-y-[0.18em] text-accent"
                >
                  {formatINR(nw.totalNetWorth)}
                </Money>
                <div className="mt-5 flex flex-wrap items-stretch gap-3 text-[11px] text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5">
                    <CalendarDays className="h-3.5 w-3.5 text-accent-ink/70" strokeWidth={1.7} />
                    <span className="tracking-tight">
                      {new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </span>
                  </span>
                  <span className="w-px self-stretch bg-border/80" />
                  <span className="inline-flex items-baseline gap-1.5">
                    <span className="numeric text-[12px] font-medium text-foreground/90 tabular-nums">{totals.holdingCount}</span>
                    <span className="uppercase tracking-kerned text-[9.5px]">
                      {totals.holdingCount === 1 ? 'Holding' : 'Holdings'}
                    </span>
                  </span>
                  <span className="w-px self-stretch bg-border/80" />
                  <span className="inline-flex items-baseline gap-1.5">
                    <span className="numeric text-[12px] font-medium text-foreground/90 tabular-nums">{portfolios.length}</span>
                    <span className="uppercase tracking-kerned text-[9.5px]">
                      {portfolios.length === 1 ? 'Portfolio' : 'Portfolios'}
                    </span>
                  </span>
                  <span className="w-px self-stretch bg-border/80" />
                  <span className="inline-flex items-center gap-1.5">
                    <Layers className="h-3.5 w-3.5 text-accent-ink/70" strokeWidth={1.7} />
                    <span className="uppercase tracking-kerned text-[9.5px]">
                      {selectedId === 'ALL' ? 'All accounts' : 'Filtered'}
                    </span>
                  </span>
                </div>
              </div>
              <div className="hidden md:flex flex-col items-end gap-2 text-right max-w-[280px]">
                <span className="text-[10px] uppercase tracking-kerned text-muted-foreground">Composition</span>
                <p className="font-display-italic text-[18px] leading-[1.25] text-foreground/85">
                  &ldquo;Diversification is the only free lunch.&rdquo;
                </p>
                <span className="text-[10px] uppercase tracking-kerned text-muted-foreground/80">— Harry Markowitz</span>
              </div>
            </div>

            {/* Ornamental divider */}
            <div className="my-6 rule-ornament"><span /></div>

            {/* Breakdown row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-x-0 gap-y-5">
              {[
                { label: 'Investments', value: nw.portfolio.currentValue, color: 'hsl(213 53% 22%)', show: true },
                { label: 'Real Estate', value: nw.realEstate.totalValue, color: 'hsl(130 35% 34%)', show: toDecimal(nw.realEstate.totalValue).greaterThan(0) },
                { label: 'Vehicles', value: nw.vehicles.totalValue, color: 'hsl(36 60% 48%)', show: toDecimal(nw.vehicles.totalValue).greaterThan(0) },
                { label: 'Sum Assured', value: nw.insurance.totalSumAssured, color: 'hsl(260 28% 42%)', show: nw.insurance.activePoliciesCount > 0 },
              ]
                .filter((item) => item.show)
                .map((item, i, arr) => (
                  <div
                    key={item.label}
                    className={`min-w-0 px-5 ${i === 0 ? 'pl-0' : ''} ${i < arr.length - 1 ? 'md:border-r md:border-border/60' : ''}`}
                  >
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="inline-block h-2 w-2 rounded-[1px] rotate-45 flex-shrink-0" style={{ background: item.color }} />
                      <span className="text-[10px] uppercase tracking-kerned text-muted-foreground">{item.label}</span>
                    </div>
                    <Money className="numeric-display text-[19px] text-foreground">{formatINR(item.value)}</Money>
                  </div>
                ))}
            </div>
          </div>
        </Card>
      )}

      {/* Alerts bar — collapsible. In-session only; reload re-expands. */}
      {alerts.length > 0 && (() => {
        const shown = alerts.slice(0, 4);
        const highest = shown.some(a => a.urgency === 'HIGH') ? 'HIGH'
          : shown.some(a => a.urgency === 'MEDIUM') ? 'MEDIUM' : 'LOW';
        return (
          <div className="space-y-2">
            {!alertsCollapsed ? (
              <>
                {shown.map((a, i) => (
                  <div key={i} className={`flex items-start gap-3 rounded-lg border px-4 py-2.5 text-sm ${urgencyBg(a.urgency)}`}>
                    <UrgencyIcon urgency={a.urgency} />
                    <div className="flex-1 min-w-0">
                      <span className="font-medium">{a.title}</span>
                      <span className="text-muted-foreground ml-2">{a.description}</span>
                    </div>
                    {a.daysUntil != null && (
                      <span className={`text-xs font-medium flex-shrink-0 ${urgencyColor(a.urgency)}`}>
                        {a.daysUntil <= 0 ? 'Overdue' : `${a.daysUntil}d`}
                      </span>
                    )}
                    {i === 0 && (
                      <button
                        type="button"
                        onClick={() => setAlertsCollapsed(true)}
                        aria-label="Collapse alerts"
                        title="Collapse alerts"
                        className="ml-1 flex-shrink-0 h-6 w-6 rounded-md grid place-items-center text-muted-foreground hover:text-foreground hover:bg-foreground/5 transition-colors"
                      >
                        <ChevronDown className="h-4 w-4 rotate-180" strokeWidth={1.8} />
                      </button>
                    )}
                  </div>
                ))}
              </>
            ) : (
              <button
                type="button"
                onClick={() => setAlertsCollapsed(false)}
                aria-label="Expand alerts"
                className={`w-full flex items-center gap-3 rounded-lg border px-4 py-2 text-sm text-left transition-colors hover:bg-foreground/[0.02] ${urgencyBg(highest)}`}
              >
                <UrgencyIcon urgency={highest} />
                <span className="flex-1 font-medium">
                  {alerts.length} alert{alerts.length === 1 ? '' : 's'}
                  <span className="text-muted-foreground font-normal ml-2">— click to expand</span>
                </span>
                <ChevronDown className="h-4 w-4 text-muted-foreground" strokeWidth={1.8} />
              </button>
            )}
          </div>
        );
      })()}

      {/* Live FX rates strip — quick glance + click-through to /forex */}
      <DashboardFxStrip />

      {/* Investment metric cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="reveal reveal-delay-1">
          <MetricCard
            label="Portfolio value"
            value={formatINR(totals.currentValue)}
            icon={Wallet}
            hint={`${totals.holdingCount} holdings`}
          />
        </div>
        <div className="reveal reveal-delay-2">
          <MetricCard
            label="Total invested"
            value={formatINR(totals.totalInvestment)}
            icon={TrendingUp}
            hint={totals.xirr != null ? `XIRR ${formatPercent(totals.xirr * 100, 1)}` : undefined}
          />
        </div>
        <div className="reveal reveal-delay-3">
          <MetricCard
            label="Unrealised P&L"
            value={formatINR(totals.unrealisedPnL, { showSign: true })}
            icon={LineChartIcon}
            trend={{
              direction: totals.unrealisedPnLD.greaterThan(0) ? 'up' : totals.unrealisedPnLD.isNegative() ? 'down' : 'flat',
              value: formatPercent(totals.unrealisedPct, 2, true),
            }}
          />
        </div>
        <div className="reveal reveal-delay-4">
          <MetricCard
            label="Today's change"
            value={formatINR(totals.todaysChange, { showSign: true })}
            icon={Percent}
            trend={{
              direction: totals.todaysChangeD.greaterThan(0) ? 'up' : totals.todaysChangeD.isNegative() ? 'down' : 'flat',
              value: totals.todaysChangePct != null ? formatPercent(totals.todaysChangePct, 2, true) : '—',
            }}
          />
        </div>
      </div>

      {/* Chart + Full Allocation Pie */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between pb-2">
            <div>
              <p className="text-[10px] uppercase tracking-kerned text-accent-ink/80 mb-1">Trajectory</p>
              <CardTitle className="text-[16px]">Portfolio value over time</CardTitle>
            </div>
            <div className="flex gap-0.5 rounded-md border border-border/70 bg-background/40 p-0.5">
              {PERIOD_OPTIONS.map((opt) => (
                <button
                  key={opt.label}
                  onClick={() => setPeriod(opt.days)}
                  className={`px-2.5 py-1 rounded-[5px] text-[11px] font-medium tracking-wide transition-all ${
                    period === opt.days
                      ? 'bg-foreground text-background shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </CardHeader>
          <CardContent>
            {valuationQuery.isLoading ? (
              <div className="h-64 flex items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
            ) : chartData.length === 0 ? (
              <div className="h-64 grid place-items-center text-sm text-muted-foreground border border-dashed rounded-md">
                Add transactions to see your portfolio value over time
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gradValue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%"  stopColor="hsl(var(--foreground))" stopOpacity={0.22} />
                      <stop offset="55%" stopColor="hsl(var(--foreground))" stopOpacity={0.06} />
                      <stop offset="100%" stopColor="hsl(var(--foreground))" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gradInvested" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--muted-foreground))" stopOpacity={0.10} />
                      <stop offset="95%" stopColor="hsl(var(--muted-foreground))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="2 4" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))', fontFamily: 'JetBrains Mono' }}
                    axisLine={false}
                    tickLine={false}
                    interval="preserveStartEnd"
                    minTickGap={64}
                    dy={6}
                    padding={{ left: 8, right: 8 }}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))', fontFamily: 'JetBrains Mono' }}
                    axisLine={false} tickLine={false} width={72}
                    tickFormatter={(v: number) =>
                      hideSensitive ? '•••'
                        : v >= 10_000_000 ? `₹${(v / 10_000_000).toFixed(1)}Cr`
                          : v >= 100_000 ? `₹${(v / 100_000).toFixed(1)}L`
                            : v >= 1_000 ? `₹${(v / 1_000).toFixed(0)}K`
                              : `₹${v.toFixed(0)}`}
                  />
                  <Tooltip
                    cursor={{ stroke: 'hsl(var(--foreground))', strokeWidth: 1, strokeDasharray: '3 3', strokeOpacity: 0.4 }}
                    contentStyle={{ background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: '8px', fontSize: 12, padding: '10px 12px', boxShadow: '0 12px 28px -16px hsl(var(--shadow-color) / 0.35)' }}
                    formatter={(v: number, name: string) => [hideSensitive ? '•••' : formatINR(v.toFixed(4)), name === 'value' ? 'Market value' : 'Invested']}
                    labelStyle={{ color: 'hsl(var(--muted-foreground))', marginBottom: 4, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em' }}
                  />
                  <Area type="monotone" dataKey="invested" stroke="hsl(var(--muted-foreground))" strokeWidth={1.25} strokeDasharray="4 4" fill="url(#gradInvested)" dot={false} />
                  <Area type="monotone" dataKey="value" stroke="hsl(var(--foreground))" strokeWidth={2} fill="url(#gradValue)" dot={chartData.length <= 10 ? { r: 2.5, fill: 'hsl(var(--foreground))', stroke: 'hsl(var(--card))', strokeWidth: 1.5 } : false} activeDot={{ r: 5, fill: 'hsl(var(--foreground))', stroke: 'hsl(var(--card))', strokeWidth: 2 }} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Full net-worth allocation pie */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle>Net worth breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            {netWorthQuery.isLoading ? (
              <div className="h-64 flex items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
            ) : pieData.length === 0 ? (
              <div className="h-64 grid place-items-center text-sm text-muted-foreground border border-dashed rounded-md">Add holdings to see breakdown</div>
            ) : (
              <div>
                <ResponsiveContainer width="100%" height={180}>
                  <PieChart>
                    <Pie data={pieData} dataKey="numericValue" nameKey="label" cx="50%" cy="50%" innerRadius={48} outerRadius={80} paddingAngle={2}>
                      {pieData.map((entry, index) => (
                        <Cell key={entry.key} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: '8px', fontSize: 12, padding: '10px 12px', boxShadow: '0 12px 28px -16px hsl(var(--shadow-color) / 0.35)' }}
                      itemStyle={{ color: 'hsl(var(--popover-foreground))' }}
                      labelStyle={{ color: 'hsl(var(--muted-foreground))', marginBottom: 4, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em' }}
                      formatter={(v: number, _n: string, p: { payload?: { percent?: number; label?: string } }) => [
                        hideSensitive ? '•••' : `${formatINR(v.toFixed(4))} (${(p.payload?.percent ?? 0).toFixed(1)}%)`,
                        p.payload?.label ?? _n,
                      ]}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="mt-1 space-y-1.5 max-h-44 overflow-y-auto pr-1">
                  {pieData.map((s, i) => (
                    <div key={s.key} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="inline-block h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                        <span className="truncate text-muted-foreground">{labelForKey(s.key)}</span>
                      </div>
                      <div className="flex items-center gap-2 ml-2 flex-shrink-0">
                        <Money className="tabular-nums text-muted-foreground">{formatINR(s.value)}</Money>
                        <span className="tabular-nums font-medium w-12 text-right">{s.percent.toFixed(1)}%</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Top Holdings — editorial ledger */}
      <Card className="overflow-hidden">
        <CardHeader className="flex-row items-end justify-between gap-4 pb-3 border-b border-dashed border-border/60">
          <div className="space-y-0.5">
            <CardTitle>Top holdings</CardTitle>
            <p className="text-xs italic font-serif text-muted-foreground">
              Ranked by current value{topHoldings.length > 0 ? ` · ${topHoldings.length} position${topHoldings.length === 1 ? '' : 's'}` : ''}
            </p>
          </div>
          <Button asChild variant="ghost" size="sm">
            <Link to="/holdings">View all <ArrowRight className="h-3 w-3 ml-1" /></Link>
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {holdingsQuery.isLoading ? (
            <div className="flex items-center justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : topHoldings.length === 0 ? (
            <p className="text-sm italic font-serif text-muted-foreground py-8 text-center">Add transactions to see your top holdings</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground/70 bg-muted/20">
                    <th className="w-12 py-2.5 pl-6 font-normal text-left" aria-hidden></th>
                    <th className="py-2.5 pr-4 font-normal text-left">Asset</th>
                    <th className="py-2.5 pr-4 font-normal text-left hidden sm:table-cell">Class</th>
                    <th className="py-2.5 pr-4 font-normal text-right hidden md:table-cell">Qty</th>
                    <th className="py-2.5 pr-4 font-normal text-right hidden md:table-cell">Avg cost</th>
                    <th className="py-2.5 pr-4 font-normal text-right">Value</th>
                    <th className="py-2.5 pr-6 font-normal text-right">Unrealised&nbsp;P&amp;L</th>
                  </tr>
                </thead>
                <tbody>
                  {topHoldings.map((h, idx) => {
                    const pnlD = toDecimal(h.unrealisedPnL ?? '0');
                    const pos = pnlD.greaterThan(0), neg = pnlD.lessThan(0);
                    const color = assetClassColor(h.assetClass);
                    return (
                      <tr
                        key={h.id}
                        className="group border-t border-dashed border-border/40 hover:bg-muted/25 transition-colors animate-in fade-in fill-mode-both"
                        style={{ animationDelay: `${idx * 25}ms`, animationDuration: '350ms' }}
                      >
                        {/* Rank + class-coloured hover accent */}
                        <td className="relative w-12 py-4 pl-6 pr-2 align-middle">
                          <span
                            aria-hidden
                            className="absolute left-0 top-1 bottom-1 w-[3px] rounded-r opacity-0 group-hover:opacity-100 transition-opacity"
                            style={{ backgroundColor: color }}
                          />
                          <span className="font-serif italic text-base leading-none text-muted-foreground/55 tabular-nums group-hover:text-foreground/75 transition-colors">
                            {String(idx + 1).padStart(2, '0')}
                          </span>
                        </td>

                        {/* Asset */}
                        <td className="py-4 pr-4 align-middle">
                          <div className="font-serif text-[15px] leading-tight text-foreground truncate max-w-[220px]">{h.assetName}</div>
                          {h.symbol && (
                            <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground mt-0.5">{h.symbol}</div>
                          )}
                        </td>

                        {/* Class — colour dot + italic serif label, not a pill */}
                        <td className="py-4 pr-4 align-middle hidden sm:table-cell">
                          <div className="inline-flex items-center gap-2">
                            <span
                              aria-hidden
                              className="h-1.5 w-1.5 rounded-full flex-shrink-0"
                              style={{ backgroundColor: color }}
                            />
                            <span className="text-xs italic font-serif text-muted-foreground">
                              {ASSET_CLASS_LABELS[h.assetClass] ?? h.assetClass}
                            </span>
                          </div>
                        </td>

                        {/* Qty */}
                        <td className="py-4 pr-4 text-right font-mono text-xs text-muted-foreground tabular-nums hidden md:table-cell">
                          {parseFloat(h.quantity).toLocaleString('en-IN', { maximumFractionDigits: 4 })}
                        </td>

                        {/* Avg cost */}
                        <td className="py-4 pr-4 text-right hidden md:table-cell">
                          <Money className="font-mono text-xs text-muted-foreground tabular-nums">{formatINR(h.avgCostPrice)}</Money>
                        </td>

                        {/* Value */}
                        <td className="py-4 pr-4 text-right align-middle">
                          <Money className="font-mono text-sm tabular-nums text-foreground">{h.currentValue ? formatINR(h.currentValue) : formatINR(h.totalCost)}</Money>
                          {!h.currentValue && (
                            <div className="text-[10px] italic font-serif text-muted-foreground/70 mt-0.5">cost basis</div>
                          )}
                        </td>

                        {/* P&L */}
                        <td className="py-4 pr-6 text-right align-middle">
                          {h.currentValue ? (
                            <>
                              <div className={`inline-flex items-center justify-end gap-1.5 ${pos ? 'text-positive' : neg ? 'text-negative' : 'text-muted-foreground'}`}>
                                {pos && <span aria-hidden className="text-[9px] leading-none translate-y-px">▲</span>}
                                {neg && <span aria-hidden className="text-[9px] leading-none translate-y-px">▼</span>}
                                <Money className="font-mono text-sm tabular-nums">{h.unrealisedPnL ? formatINR(h.unrealisedPnL, { showSign: true }) : '—'}</Money>
                              </div>
                              {h.unrealisedPnLPct != null && (
                                <div className={`text-[10px] font-mono tabular-nums mt-1 ${pos ? 'text-positive/75' : neg ? 'text-negative/75' : 'text-muted-foreground'}`}>
                                  {pos ? '+' : ''}{h.unrealisedPnLPct.toFixed(2)}%
                                </div>
                              )}
                            </>
                          ) : (
                            <span className="text-[10px] italic font-serif text-muted-foreground/70">no price</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Real Estate | Vehicles | Insurance */}
      {nw && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

          {/* Real Estate */}
          <Card>
            <CardHeader className="flex-row items-center justify-between pb-2">
              <div className="flex items-center gap-2">
                <Home className="h-4 w-4 text-muted-foreground" />
                <CardTitle>Real Estate</CardTitle>
              </div>
              <Button asChild variant="ghost" size="sm">
                <Link to="/rental">Manage <ArrowRight className="h-3 w-3 ml-1" /></Link>
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              {nw.realEstate.count === 0 ? (
                <p className="text-sm text-muted-foreground">No properties added yet.</p>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-lg bg-muted/50 p-3">
                      <p className="text-xs text-muted-foreground">Property value</p>
                      <Money className="text-base font-semibold mt-0.5 block">{formatINR(nw.realEstate.totalValue)}</Money>
                      <p className="text-xs text-muted-foreground">{nw.realEstate.count} {nw.realEstate.count === 1 ? 'property' : 'properties'}</p>
                    </div>
                    <div className="rounded-lg bg-muted/50 p-3">
                      <p className="text-xs text-muted-foreground">Monthly rent</p>
                      <Money className="text-base font-semibold mt-0.5 block">{formatINR(nw.realEstate.monthlyRent)}</Money>
                      <p className="text-xs text-muted-foreground">active tenancies</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-lg bg-muted/50 p-3">
                      <p className="text-xs text-muted-foreground">Income YTD</p>
                      <Money className="text-base font-semibold mt-0.5 block text-green-600 dark:text-green-400">{formatINR(nw.realEstate.incomeYTD)}</Money>
                    </div>
                    <div className="rounded-lg bg-muted/50 p-3">
                      <p className="text-xs text-muted-foreground">Net P&L YTD</p>
                      <Money className={`text-base font-semibold mt-0.5 block ${toDecimal(nw.realEstate.netYTD).greaterThanOrEqualTo(0) ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                        {formatINR(nw.realEstate.netYTD, { showSign: true })}
                      </Money>
                    </div>
                  </div>
                  {nw.realEstate.overdueCount > 0 && (
                    <div className="flex items-center gap-2 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 px-3 py-2 text-sm text-red-700 dark:text-red-400">
                      <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                      {nw.realEstate.overdueCount} overdue receipt{nw.realEstate.overdueCount > 1 ? 's' : ''}
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          {/* Vehicles */}
          <Card>
            <CardHeader className="flex-row items-center justify-between pb-2">
              <div className="flex items-center gap-2">
                <Car className="h-4 w-4 text-muted-foreground" />
                <CardTitle>Vehicles</CardTitle>
              </div>
              <Button asChild variant="ghost" size="sm">
                <Link to="/vehicles">Manage <ArrowRight className="h-3 w-3 ml-1" /></Link>
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              {nw.vehicles.count === 0 ? (
                <p className="text-sm text-muted-foreground">No vehicles added yet.</p>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-lg bg-muted/50 p-3">
                      <p className="text-xs text-muted-foreground">Total value</p>
                      <Money className="text-base font-semibold mt-0.5 block">{formatINR(nw.vehicles.totalValue)}</Money>
                      <p className="text-xs text-muted-foreground">{nw.vehicles.count} vehicle{nw.vehicles.count !== 1 ? 's' : ''}</p>
                    </div>
                    <div className="rounded-lg bg-muted/50 p-3">
                      <p className="text-xs text-muted-foreground">Pending challans</p>
                      <p className={`text-base font-semibold mt-0.5 numeric ${nw.vehicles.pendingChallans > 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
                        {nw.vehicles.pendingChallans > 0 ? nw.vehicles.pendingChallans : 'None'}
                      </p>
                      <p className="text-xs text-muted-foreground">traffic fines</p>
                    </div>
                  </div>
                  {nw.vehicles.expiringItems.length > 0 ? (
                    <div className="space-y-1.5">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Expiring soon</p>
                      {nw.vehicles.expiringItems.slice(0, 4).map((item, i) => (
                        <div key={i} className={`flex items-center justify-between rounded px-2.5 py-1.5 text-xs border ${urgencyBg(item.daysUntil <= 7 ? 'HIGH' : item.daysUntil <= 15 ? 'MEDIUM' : 'LOW')}`}>
                          <span className="font-medium truncate">{item.type} — {item.label}</span>
                          <span className={`ml-2 flex-shrink-0 font-semibold ${urgencyColor(item.daysUntil <= 7 ? 'HIGH' : item.daysUntil <= 15 ? 'MEDIUM' : 'LOW')}`}>
                            {item.daysUntil <= 0 ? 'Expired' : `${item.daysUntil}d`}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 rounded-lg border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/30 px-3 py-2 text-sm text-green-700 dark:text-green-400">
                      <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
                      All documents up to date
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          {/* Insurance */}
          <Card>
            <CardHeader className="flex-row items-center justify-between pb-2">
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-muted-foreground" />
                <CardTitle>Insurance</CardTitle>
              </div>
              <Button asChild variant="ghost" size="sm">
                <Link to="/insurance">Manage <ArrowRight className="h-3 w-3 ml-1" /></Link>
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              {nw.insurance.activePoliciesCount === 0 ? (
                <p className="text-sm text-muted-foreground">No policies added yet.</p>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-lg bg-muted/50 p-3">
                      <p className="text-xs text-muted-foreground">Total sum assured</p>
                      <Money className="text-base font-semibold mt-0.5 block">{formatINR(nw.insurance.totalSumAssured)}</Money>
                      <p className="text-xs text-muted-foreground">{nw.insurance.activePoliciesCount} active {nw.insurance.activePoliciesCount === 1 ? 'policy' : 'policies'}</p>
                    </div>
                    <div className="rounded-lg bg-muted/50 p-3">
                      <p className="text-xs text-muted-foreground">Annual premium</p>
                      <Money className="text-base font-semibold mt-0.5 block">{formatINR(nw.insurance.annualPremiumTotal)}</Money>
                      <p className="text-xs text-muted-foreground">per year total</p>
                    </div>
                  </div>
                  {nw.insurance.upcomingRenewals.length > 0 ? (
                    <div className="space-y-1.5">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Upcoming premiums</p>
                      {nw.insurance.upcomingRenewals.slice(0, 4).map((r) => (
                        <div key={r.policyId} className={`flex items-center justify-between rounded px-2.5 py-1.5 text-xs border ${urgencyBg(r.daysUntil <= 7 ? 'HIGH' : r.daysUntil <= 15 ? 'MEDIUM' : 'LOW')}`}>
                          <div className="min-w-0">
                            <span className="font-medium">{r.insurer}</span>
                            <span className="text-muted-foreground ml-1">({r.type})</span>
                          </div>
                          <div className="ml-2 flex-shrink-0 text-right">
                            <div className={`font-semibold ${urgencyColor(r.daysUntil <= 7 ? 'HIGH' : r.daysUntil <= 15 ? 'MEDIUM' : 'LOW')}`}>
                              {r.daysUntil <= 0 ? 'Due now' : `${r.daysUntil}d`}
                            </div>
                            <Money className="text-muted-foreground block">{formatINR(r.amount)}</Money>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 rounded-lg border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/30 px-3 py-2 text-sm text-green-700 dark:text-green-400">
                      <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
                      No premiums due in the next 30 days
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Recent transactions */}
      <Card>
        <CardHeader className="flex-row items-center justify-between pb-2">
          <CardTitle>Recent transactions</CardTitle>
          <Button asChild variant="ghost" size="sm">
            <Link to="/transactions">View all <ArrowRight className="h-3 w-3 ml-1" /></Link>
          </Button>
        </CardHeader>
        <CardContent>
          {recentTxQuery.data && recentTxQuery.data.items.length > 0 ? (
            <div className="space-y-0">
              {recentTxQuery.data.items.map((t) => (
                <div key={t.id} className="flex items-center justify-between py-2.5 border-b last:border-0 text-sm">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium truncate">{t.assetName}</div>
                    <div className="text-xs text-muted-foreground">
                      {t.tradeDate} · {t.transactionType.replace(/_/g, ' ')}
                    </div>
                  </div>
                  <div className="text-right tabular-nums ml-3 flex-shrink-0">
                    <div className="font-medium">{formatINR(t.netAmount)}</div>
                    <div className="text-xs text-muted-foreground">
                      {parseFloat(t.quantity).toLocaleString('en-IN', { maximumFractionDigits: 4 })} @ {formatINR(t.price)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground py-4 text-center">Add a manual transaction to see activity here.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <PageHeader title="Dashboard" />
      <Card className="h-24 animate-pulse bg-muted/60" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => <Card key={i} className="h-28 animate-pulse bg-muted/60" />)}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2 h-80 animate-pulse bg-muted/60" />
        <Card className="h-80 animate-pulse bg-muted/60" />
      </div>
    </div>
  );
}

function GmailDashboardCards() {
  const q = useQuery({
    queryKey: ['mailboxes'],
    queryFn: () => mailboxesApi.list(),
  });
  const hasGmail = (q.data ?? []).some(
    (m) => m.provider === 'GMAIL_OAUTH' && m.isActive,
  );
  return (
    <div className="space-y-3">
      {!hasGmail && <ConnectGmailCard />}
      {hasGmail && <GmailScanProgressCard />}
    </div>
  );
}

