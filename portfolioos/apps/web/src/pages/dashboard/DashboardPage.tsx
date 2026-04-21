import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { TrendingUp, Wallet, LineChart as LineChartIcon, Percent, Briefcase, RefreshCw, Loader2, ArrowRight } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { MetricCard } from '@/components/portfolio/MetricCard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/common/EmptyState';
import { portfoliosApi } from '@/api/portfolios.api';
import { transactionsApi } from '@/api/transactions.api';
import { assetsApi } from '@/api/assets.api';
import { apiErrorMessage } from '@/api/client';
import { formatINR, formatPercent, ASSET_CLASS_LABELS } from '@portfolioos/shared';

export function DashboardPage() {
  const [selectedId, setSelectedId] = useState<string>('ALL');
  const queryClient = useQueryClient();

  const portfoliosQuery = useQuery({
    queryKey: ['portfolios'],
    queryFn: () => portfoliosApi.list(),
  });

  const portfolios = portfoliosQuery.data ?? [];

  const summariesQuery = useQuery({
    queryKey: ['dashboard', 'summaries', portfolios.map((p) => p.id).join(',')],
    queryFn: async () => {
      const ids = portfolios.map((p) => p.id);
      return Promise.all(ids.map((id) => portfoliosApi.summary(id)));
    },
    enabled: portfolios.length > 0,
  });

  const recentTxQuery = useQuery({
    queryKey: ['transactions', 'recent'],
    queryFn: () => transactionsApi.list({ pageSize: 5 }),
  });

  const allocationQuery = useQuery({
    queryKey: ['dashboard', 'allocation', portfolios.map((p) => p.id).join(',')],
    queryFn: async () => {
      const ids = portfolios.map((p) => p.id);
      const allSlices = await Promise.all(ids.map((id) => portfoliosApi.allocation(id)));
      const merged: Record<string, { assetClass: string; value: number; holdingCount: number }> = {};
      for (const list of allSlices) {
        for (const s of list) {
          const m = merged[s.assetClass] ?? { assetClass: s.assetClass, value: 0, holdingCount: 0 };
          m.value += s.value;
          m.holdingCount += s.holdingCount;
          merged[s.assetClass] = m;
        }
      }
      const total = Object.values(merged).reduce((a, b) => a + b.value, 0);
      return Object.values(merged)
        .map((m) => ({ ...m, percent: total > 0 ? (m.value / total) * 100 : 0 }))
        .sort((a, b) => b.value - a.value);
    },
    enabled: portfolios.length > 0,
  });

  const refreshMutation = useMutation({
    mutationFn: () => assetsApi.refreshAll(),
    onSuccess: (r) => {
      toast.success(`${r.stocks.updated} stock prices · ${r.holdings.updated} holdings refreshed`);
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['portfolio-summary'] });
      queryClient.invalidateQueries({ queryKey: ['portfolio-holdings'] });
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Refresh failed')),
  });

  const totals = useMemo(() => {
    const summaries = summariesQuery.data ?? [];
    const filtered =
      selectedId === 'ALL' ? summaries : summaries.filter((s) => s.id === selectedId);
    const sum = (key: 'currentValue' | 'totalInvestment' | 'unrealisedPnL' | 'todaysChange') =>
      filtered.reduce((acc, s) => acc + (s[key] ?? 0), 0);
    const currentValue = sum('currentValue');
    const totalInvestment = sum('totalInvestment');
    const unrealisedPnL = sum('unrealisedPnL');
    const unrealisedPct = totalInvestment > 0 ? (unrealisedPnL / totalInvestment) * 100 : 0;
    return {
      currentValue,
      totalInvestment,
      unrealisedPnL,
      unrealisedPct,
      todaysChange: sum('todaysChange'),
      holdingCount: filtered.reduce((a, s) => a + (s.holdingCount ?? 0), 0),
    };
  }, [summariesQuery.data, selectedId]);

  if (portfoliosQuery.isLoading) {
    return <DashboardSkeleton />;
  }

  if (portfolios.length === 0) {
    return (
      <div>
        <PageHeader title="Dashboard" description="Your financial command centre" />
        <EmptyState
          icon={Briefcase}
          title="No portfolios yet"
          description="Create your first portfolio to start tracking stocks, mutual funds, F&O, bonds, FDs and more."
          action={
            <Button asChild>
              <Link to="/portfolios">Create your first portfolio</Link>
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="Your consolidated portfolio view across all asset classes"
        actions={
          <div className="flex items-center gap-2">
            <Select value={selectedId} onChange={(e) => setSelectedId(e.target.value)} className="w-56">
              <option value="ALL">All portfolios ({portfolios.length})</option>
              {portfolios.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
            <Button
              variant="outline"
              onClick={() => refreshMutation.mutate()}
              disabled={refreshMutation.isPending}
            >
              {refreshMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Refresh
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          label="Current value"
          value={formatINR(totals.currentValue)}
          icon={Wallet}
          hint={`${totals.holdingCount} holdings`}
        />
        <MetricCard
          label="Total investment"
          value={formatINR(totals.totalInvestment)}
          icon={TrendingUp}
        />
        <MetricCard
          label="Unrealised P&L"
          value={formatINR(totals.unrealisedPnL, { showSign: true })}
          icon={LineChartIcon}
          trend={{
            direction:
              totals.unrealisedPnL > 0 ? 'up' : totals.unrealisedPnL < 0 ? 'down' : 'flat',
            value: formatPercent(totals.unrealisedPct, 2, true),
          }}
        />
        <MetricCard
          label="Today's change"
          value={formatINR(totals.todaysChange, { showSign: true })}
          icon={Percent}
          trend={{
            direction: totals.todaysChange > 0 ? 'up' : totals.todaysChange < 0 ? 'down' : 'flat',
            value:
              totals.currentValue - totals.todaysChange > 0
                ? formatPercent(
                    (totals.todaysChange / (totals.currentValue - totals.todaysChange)) * 100,
                    2,
                    true,
                  )
                : '—',
          }}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-6">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Portfolio value</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64 grid place-items-center text-sm text-muted-foreground border border-dashed rounded-md">
              Historical valuation chart · coming in Phase 4 (transaction-driven history)
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Asset allocation</CardTitle>
          </CardHeader>
          <CardContent>
            {(allocationQuery.data ?? []).length === 0 ? (
              <div className="h-64 grid place-items-center text-sm text-muted-foreground border border-dashed rounded-md">
                Add holdings to see allocation
              </div>
            ) : (
              <div className="space-y-2">
                {(allocationQuery.data ?? []).slice(0, 8).map((s) => (
                  <div key={s.assetClass}>
                    <div className="flex justify-between text-sm">
                      <span className="font-medium">
                        {ASSET_CLASS_LABELS[s.assetClass as keyof typeof ASSET_CLASS_LABELS] ?? s.assetClass}
                      </span>
                      <span className="tabular-nums text-muted-foreground">{s.percent.toFixed(1)}%</span>
                    </div>
                    <div className="mt-1 h-2 rounded-full bg-muted overflow-hidden">
                      <div className="h-full bg-primary" style={{ width: `${Math.min(100, s.percent)}%` }} />
                    </div>
                    <div className="mt-0.5 text-xs text-muted-foreground tabular-nums">
                      {formatINR(s.value)} · {s.holdingCount} holdings
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-6">
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Recent transactions</CardTitle>
            <Button asChild variant="ghost" size="sm">
              <Link to="/transactions">
                View all <ArrowRight className="h-3 w-3" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {recentTxQuery.data && recentTxQuery.data.items.length > 0 ? (
              <div className="space-y-2">
                {recentTxQuery.data.items.map((t) => (
                  <div
                    key={t.id}
                    className="flex items-center justify-between py-1.5 border-b last:border-0 text-sm"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="font-medium truncate">{t.assetName}</div>
                      <div className="text-xs text-muted-foreground">
                        {t.tradeDate} · {t.transactionType.replace(/_/g, ' ')}
                      </div>
                    </div>
                    <div className="text-right tabular-nums">
                      <div className="font-medium">{formatINR(t.netAmount)}</div>
                      <div className="text-xs text-muted-foreground">{t.quantity} @ {formatINR(t.price)}</div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Add a manual transaction to see activity here.
              </p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Upcoming alerts</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">Alerts & reminders land in a later phase.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div>
      <PageHeader title="Dashboard" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="h-32 animate-pulse bg-muted/60" />
        ))}
      </div>
    </div>
  );
}
