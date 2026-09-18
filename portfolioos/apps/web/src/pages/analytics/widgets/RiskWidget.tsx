import { Activity, TrendingDown, Shield, Scale } from 'lucide-react';
import { ASSET_CLASS_LABELS } from '@everypaisa/shared';
import { MetricCard } from '@/components/portfolio/MetricCard';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import type { RiskMetrics, AllocationSlice, ClassCorrelation } from '@/api/analytics.api';
import { AnalyticsInfo } from '../AnalyticsInfo';

interface RiskProps {
  metrics: RiskMetrics | undefined;
  loading: boolean;
}

export function RiskMetricsCards({ metrics, loading }: RiskProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="h-28 animate-pulse bg-muted/60" />
        ))}
      </div>
    );
  }
  if (!metrics) return null;
  const fmt = (v: number | null, suffix = '%') => (v == null ? '—' : `${v.toFixed(2)}${suffix}`);
  const sharpeBucket =
    metrics.sharpe == null
      ? 'flat'
      : metrics.sharpe >= 1
      ? 'up'
      : metrics.sharpe < 0
      ? 'down'
      : 'flat';
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <MetricCard
        label="Volatility (annualised)"
        info={<AnalyticsInfo k="volatility" />}
        value={fmt(metrics.volatilityPct)}
        icon={Activity}
        hint={`${metrics.observations} monthly returns`}
      />
      <MetricCard
        label="Sharpe ratio"
        info={<AnalyticsInfo k="sharpe" />}
        value={metrics.sharpe == null ? '—' : metrics.sharpe.toFixed(2)}
        icon={Shield}
        trend={{
          direction: sharpeBucket as 'up' | 'down' | 'flat',
          value: metrics.sharpe == null ? '' : metrics.sharpe >= 1 ? 'Strong' : metrics.sharpe >= 0 ? 'Modest' : 'Weak',
        }}
      />
      <MetricCard
        label="Max drawdown"
        info={<AnalyticsInfo k="maxDrawdown" />}
        value={fmt(metrics.maxDrawdownPct == null ? null : -Math.abs(metrics.maxDrawdownPct))}
        icon={TrendingDown}
        hint="Peak-to-trough"
      />
      <MetricCard
        label="Beta vs NIFTY"
        info={<AnalyticsInfo k="beta" />}
        value={metrics.betaVsNifty == null ? '—' : metrics.betaVsNifty.toFixed(2)}
        icon={Scale}
        hint={
          metrics.betaVsNifty == null
            ? 'Need more history'
            : metrics.betaVsNifty > 1
            ? 'More volatile than market'
            : metrics.betaVsNifty < 0.5
            ? 'Defensive vs market'
            : 'Tracks market'
        }
      />
    </div>
  );
}

/**
 * Correlation of monthly returns between asset classes.
 *
 * Replaces the "Asset class weight grid", which drew min(weight_i, weight_j)
 * in a correlation-matrix layout and so looked like something it wasn't.
 * These are real Pearson coefficients computed server-side
 * (analytics.risk.ts classMonthlyReturns / classCorrelationMatrix) from
 * start-of-month quantities × historical prices, so money added during a
 * month doesn't register as a return.
 *
 * Classes without price history (deposits, real estate…) have no return
 * series, so they're listed under the grid rather than shown as rows of dashes.
 */
export function ReturnCorrelationGrid({
  correlation,
  loading,
  allocation,
}: {
  correlation: ClassCorrelation | undefined;
  loading: boolean;
  allocation: AllocationSlice[];
}) {
  const header = (
    <CardHeader className="pb-2">
      <p className="text-[10px] uppercase tracking-kerned text-accent-ink/80 mb-1">Diversification</p>
      <CardTitle className="flex items-center gap-1.5">
        Return correlation by asset class
        <AnalyticsInfo k="returnCorrelation" />
      </CardTitle>
    </CardHeader>
  );

  if (loading) {
    return <Card className="h-72 animate-pulse bg-muted/60" />;
  }

  const labelOf = (key: string) =>
    allocation.find((a) => a.key === key)?.label ??
    ASSET_CLASS_LABELS[key as keyof typeof ASSET_CLASS_LABELS] ??
    key;
  const weightOf = (key: string) => allocation.find((a) => a.key === key)?.pct ?? 0;

  const classes = correlation?.classes ?? [];
  const idx = new Map(classes.map((c, i) => [c, i]));
  const hasReturns = (c: string) => {
    const i = idx.get(c)!;
    return correlation?.matrix[i]?.[i] != null;
  };
  // Largest holdings first; cap the grid so it stays readable on a phone.
  const shown = classes
    .filter(hasReturns)
    .sort((a, b) => weightOf(b) - weightOf(a))
    .slice(0, 8);
  const noPriceHistory = classes.filter((c) => !hasReturns(c) && weightOf(c) > 0);
  const minObs = correlation?.minObservations ?? 6;

  const noHistoryNote =
    noPriceHistory.length > 0 ? (
      <p className="mt-2 text-[11px] text-muted-foreground">
        Not shown — no price history: {noPriceHistory.map(labelOf).join(', ')}.
      </p>
    ) : null;

  if (!correlation || shown.length < 2) {
    return (
      <Card>
        {header}
        <CardContent>
          <div className="h-48 grid place-items-center text-center text-sm text-muted-foreground border border-dashed rounded-md px-6">
            Needs at least two asset classes with price history and {minObs}+ months of data in the
            selected period.
          </div>
          {noHistoryNote}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      {header}
      <CardContent>
        <div className="overflow-x-auto">
          <table className="text-xs border-collapse mx-auto">
            <thead>
              <tr>
                <th className="pr-2" />
                {shown.map((c) => (
                  <th
                    key={c}
                    className="px-1 pb-1 align-bottom font-medium text-[10px] text-muted-foreground whitespace-nowrap"
                  >
                    <span className="inline-block max-w-[5.5rem] truncate" title={labelOf(c)}>
                      {labelOf(c)}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((row) => (
                <tr key={row}>
                  <th className="pr-2 py-1 text-left font-medium text-[10px] text-muted-foreground whitespace-nowrap">
                    {labelOf(row)}
                  </th>
                  {shown.map((col) => {
                    const i = idx.get(row)!;
                    const j = idx.get(col)!;
                    const r = correlation.matrix[i]?.[j] ?? null;
                    const n = correlation.observations[i]?.[j] ?? 0;
                    return (
                      <td
                        key={`${row}-${col}`}
                        className="border border-border/40 w-12 h-9 text-center align-middle tabular-nums"
                        title={
                          r == null
                            ? `${labelOf(row)} × ${labelOf(col)}: not enough shared history (${n} of ${minObs} months)`
                            : `${labelOf(row)} × ${labelOf(col)}: ${r.toFixed(2)} over ${n} months`
                        }
                        style={cellStyle(r, row === col)}
                      >
                        {r == null ? '–' : r.toFixed(2)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-3 flex items-center justify-center gap-2 text-[10px] text-muted-foreground">
          <span>Move opposite</span>
          <span
            className="h-2 w-28 rounded-full"
            style={{
              background: `linear-gradient(to right, ${negativeTint(1)}, hsl(var(--muted)), ${positiveTint(1)})`,
            }}
          />
          <span>Move together</span>
        </div>
        {noHistoryNote}
      </CardContent>
    </Card>
  );
}

const positiveTint = (alpha: number) => `hsl(213 53% 32% / ${alpha})`;
const negativeTint = (alpha: number) => `hsl(24 78% 46% / ${alpha})`;

function cellStyle(r: number | null, isDiagonal: boolean): React.CSSProperties {
  if (r == null) return { color: 'hsl(var(--muted-foreground))' };
  // A class always correlates perfectly with itself — show it, but quietly.
  if (isDiagonal) return { background: 'hsl(var(--muted))', color: 'hsl(var(--muted-foreground))' };
  const strength = Math.min(Math.abs(r), 1);
  return {
    background: r >= 0 ? positiveTint(0.12 + strength * 0.78) : negativeTint(0.12 + strength * 0.78),
    color: strength > 0.55 ? '#fff' : 'hsl(var(--foreground))',
  };
}
