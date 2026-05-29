import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Split, RefreshCw, Download, Loader2, CalendarClock, CheckCircle2,
  Clock, AlertTriangle, Coins, TrendingUp,
} from 'lucide-react';
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';
import toast from 'react-hot-toast';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/common/EmptyState';
import { MetricCard } from '@/components/portfolio/MetricCard';
import { CHART_COLORS, POS_COLOR } from '@/pages/analytics/chartColors';
import { portfoliosApi } from '@/api/portfolios.api';
import {
  corporateActionsApi,
  type CorporateActionStatus,
  type CorporateActionType,
  type CorporateActionRow,
} from '@/api/corporateActions.api';
import { apiErrorMessage } from '@/api/client';
import { formatINR } from '@portfolioos/shared';

const TYPE_LABELS: Record<CorporateActionType, string> = {
  DIVIDEND: 'Dividend', BONUS: 'Bonus', SPLIT: 'Split',
  MERGER: 'Merger', DEMERGER: 'Demerger', RIGHTS: 'Rights', BUYBACK: 'Buyback',
};

const STATUS_STYLE: Record<CorporateActionStatus, { label: string; cls: string }> = {
  APPLIED: { label: 'Applied', cls: 'bg-positive/10 text-positive border-positive/30' },
  PENDING: { label: 'Pending', cls: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30' },
  UPCOMING: { label: 'Upcoming', cls: 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/30' },
  NEEDS_ACTION: { label: 'Needs action', cls: 'bg-negative/10 text-negative border-negative/30' },
};

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function StatusBadge({ status }: { status: CorporateActionStatus }) {
  const s = STATUS_STYLE[status];
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${s.cls}`}>
      {s.label}
    </span>
  );
}

export function CorporateActionsPage() {
  const queryClient = useQueryClient();
  const [portfolioId, setPortfolioId] = useState<string>('all');
  const [type, setType] = useState<string>('all');
  const [status, setStatus] = useState<string>('all');

  const { data: portfolios } = useQuery({
    queryKey: ['portfolios'],
    queryFn: () => portfoliosApi.list(),
  });

  const filters = useMemo(
    () => ({
      portfolioId: portfolioId === 'all' ? undefined : portfolioId,
      type: type === 'all' ? undefined : (type as CorporateActionType),
      status: status === 'all' ? undefined : (status as CorporateActionStatus),
    }),
    [portfolioId, type, status],
  );

  const { data: report, isLoading } = useQuery({
    queryKey: ['corporate-actions', filters],
    queryFn: () => corporateActionsApi.list(filters),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['corporate-actions'] });
    queryClient.invalidateQueries({ queryKey: ['portfolio-holdings'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  };

  const syncMutation = useMutation({
    mutationFn: () => corporateActionsApi.sync(),
    onSuccess: () => { toast.success('Corporate actions synced from NSE'); invalidate(); },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });

  const applyMutation = useMutation({
    mutationFn: () => corporateActionsApi.apply(),
    onSuccess: (r) => { toast.success(`Applied ${r.applied} action${r.applied === 1 ? '' : 's'} to holdings`); invalidate(); },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });

  const summary = report?.summary;
  const rows = report?.rows ?? [];

  const byTypeData = useMemo(
    () => (summary?.byType ?? []).map((b) => ({ name: TYPE_LABELS[b.type], value: b.count })),
    [summary],
  );
  const dividendData = useMemo(
    () => (report?.dividendByMonth ?? []).map((d) => ({ month: d.month, amount: Number(d.amount) })),
    [report],
  );

  const busy = syncMutation.isPending || applyMutation.isPending;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Portfolio"
        title="Corporate Actions"
        description="Splits, bonuses, dividends, mergers and rights across your holdings — detected, applied, and pending your review."
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => syncMutation.mutate()} disabled={busy}>
              {syncMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              <span className="ml-1.5">Sync from NSE</span>
            </Button>
            <Button onClick={() => applyMutation.mutate()} disabled={busy}>
              {applyMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              <span className="ml-1.5">Apply to holdings</span>
            </Button>
          </div>
        }
      />

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <MetricCard label="Total actions" value={String(summary?.total ?? 0)} icon={Split} />
        <MetricCard label="Applied" value={String(summary?.applied ?? 0)} icon={CheckCircle2} hint="Folded into holdings" />
        <MetricCard label="Pending" value={String(summary?.pending ?? 0)} icon={Clock} hint="Will apply on next sync" />
        <MetricCard label="Needs action" value={String(summary?.needsAction ?? 0)} icon={AlertTriangle} hint="Merger / rights / buyback" />
        <MetricCard label="Dividend income" value={formatINR(summary?.dividendIncome ?? '0')} icon={Coins} hint="From applied dividends" />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <p className="text-[10px] uppercase tracking-kerned text-accent-ink/80 mb-1">Mix</p>
            <CardTitle>Actions by type</CardTitle>
          </CardHeader>
          <CardContent>
            {byTypeData.length === 0 ? (
              <div className="h-56 grid place-items-center text-sm text-muted-foreground border border-dashed rounded-md">No actions yet</div>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie data={byTypeData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={90} paddingAngle={2}>
                    {byTypeData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v: number, n: string) => [`${v} action${v === 1 ? '' : 's'}`, n]} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <p className="text-[10px] uppercase tracking-kerned text-accent-ink/80 mb-1">Income</p>
            <CardTitle>Dividend income by month</CardTitle>
          </CardHeader>
          <CardContent>
            {dividendData.length === 0 ? (
              <div className="h-56 grid place-items-center text-sm text-muted-foreground border border-dashed rounded-md">No dividend income recorded</div>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={dividendData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="2 4" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} tickFormatter={(v: number) => `₹${v}`} />
                  <Tooltip formatter={(v: number) => [formatINR(String(v)), 'Dividend']} />
                  <Bar dataKey="amount" radius={[4, 4, 0, 0]} fill={POS_COLOR} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <select value={portfolioId} onChange={(e) => setPortfolioId(e.target.value)} className="rounded-md border bg-background px-3 py-1.5 text-sm">
          <option value="all">All portfolios</option>
          {portfolios?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select value={type} onChange={(e) => setType(e.target.value)} className="rounded-md border bg-background px-3 py-1.5 text-sm">
          <option value="all">All types</option>
          {(Object.keys(TYPE_LABELS) as CorporateActionType[]).map((t) => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-md border bg-background px-3 py-1.5 text-sm">
          <option value="all">All statuses</option>
          <option value="APPLIED">Applied</option>
          <option value="PENDING">Pending</option>
          <option value="UPCOMING">Upcoming</option>
          <option value="NEEDS_ACTION">Needs action</option>
        </select>
      </div>

      {/* Table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2"><CalendarClock className="h-4 w-4" /> Action ledger</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="py-12 grid place-items-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : rows.length === 0 ? (
            <EmptyState
              icon={TrendingUp}
              title="No corporate actions"
              description="Once you hold a stock with a split, bonus or dividend, it shows here. Use “Sync from NSE” to fetch the latest, then “Apply to holdings”."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground text-xs">
                    <th className="text-left py-2 pr-3 font-medium">Asset</th>
                    <th className="text-left py-2 pr-3 font-medium">Type</th>
                    <th className="text-left py-2 pr-3 font-medium hidden sm:table-cell">Ex-date</th>
                    <th className="text-right py-2 pr-3 font-medium">Ratio / Amount</th>
                    <th className="text-right py-2 pr-3 font-medium hidden md:table-cell">Qty held</th>
                    <th className="text-right py-2 pr-3 font-medium">Impact</th>
                    <th className="text-left py-2 pr-3 font-medium hidden lg:table-cell">Portfolio</th>
                    <th className="text-right py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r: CorporateActionRow) => (
                    <tr key={`${r.caId}-${r.holdingId}`} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                      <td className="py-2 pr-3">
                        <div className="font-medium">{r.stockSymbol ?? r.stockName ?? r.assetName ?? '—'}</div>
                        {r.stockName && r.stockSymbol && <div className="text-[11px] text-muted-foreground truncate max-w-[180px]">{r.stockName}</div>}
                      </td>
                      <td className="py-2 pr-3">{TYPE_LABELS[r.type]}</td>
                      <td className="py-2 pr-3 hidden sm:table-cell tabular-nums text-muted-foreground">{fmtDate(r.exDate)}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">
                        {r.ratio ? `${r.ratio}×` : r.amount ? `${formatINR(r.amount)}/sh` : '—'}
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums hidden md:table-cell">{r.qtyHeld}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">
                        {r.qtyDelta ? <span className="text-positive">+{r.qtyDelta} sh</span>
                          : r.cashImpact ? <span className="text-positive">{formatINR(r.cashImpact)}</span>
                          : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="py-2 pr-3 hidden lg:table-cell text-xs text-muted-foreground truncate max-w-[140px]">{r.portfolioName}</td>
                      <td className="py-2 text-right"><StatusBadge status={r.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-3 text-[11px] text-muted-foreground">
                Splits, bonuses and dividends apply automatically. Mergers, rights and buybacks are flagged “needs action” — they require your decision and aren’t applied automatically.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
