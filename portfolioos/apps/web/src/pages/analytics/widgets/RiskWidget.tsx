import { Activity, TrendingDown, Shield, Scale } from 'lucide-react';
import { MetricCard } from '@/components/portfolio/MetricCard';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import type { RiskMetrics, ValuationPoint, AllocationSlice } from '@/api/analytics.api';

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
        value={fmt(metrics.volatilityPct)}
        icon={Activity}
        hint={`${metrics.observations} monthly returns`}
      />
      <MetricCard
        label="Sharpe ratio"
        value={metrics.sharpe == null ? '—' : metrics.sharpe.toFixed(2)}
        icon={Shield}
        trend={{
          direction: sharpeBucket as 'up' | 'down' | 'flat',
          value: metrics.sharpe == null ? '' : metrics.sharpe >= 1 ? 'Strong' : metrics.sharpe >= 0 ? 'Modest' : 'Weak',
        }}
      />
      <MetricCard
        label="Max drawdown"
        value={fmt(metrics.maxDrawdownPct == null ? null : -Math.abs(metrics.maxDrawdownPct))}
        icon={TrendingDown}
        hint="Peak-to-trough"
      />
      <MetricCard
        label="Beta vs NIFTY"
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
 * Light client-side correlation heatmap derived from portfolio monthly
 * returns split by asset class. For v1 we approximate by simply showing
 * correlation between each class's monthly weight (proxy) and the
 * overall portfolio — full per-asset return matrix is deferred.
 *
 * The heatmap here renders a simple class-by-class diversification grid
 * coloured by the class's percentage weight, with a diagonal flagged.
 */
export function AllocationCorrelationGrid({
  allocation,
  valueLine,
}: {
  allocation: AllocationSlice[];
  valueLine: ValuationPoint[];
}) {
  // Tiny heuristic correlation matrix: each cell = min(weight_i, weight_j),
  // so concentrated pairs stand out visually. Real return correlation
  // requires daily per-asset price history (deferred).
  const classes = allocation.filter((a) => a.pct >= 1).slice(0, 8);
  const n = classes.length;
  if (n === 0) return null;
  return (
    <Card>
      <CardHeader className="pb-2">
        <p className="text-[10px] uppercase tracking-kerned text-accent-ink/80 mb-1">Diversification</p>
        <CardTitle>Asset class weight grid</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="text-xs border-collapse mx-auto">
            <thead>
              <tr>
                <th className="pr-2"></th>
                {classes.map((c) => (
                  <th key={c.key} className="px-1.5 py-1 font-medium text-[10px] text-muted-foreground rotate-[-30deg] origin-bottom-left whitespace-nowrap">
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {classes.map((row) => (
                <tr key={row.key}>
                  <th className="pr-2 py-1 text-left font-medium text-[10px] text-muted-foreground whitespace-nowrap">
                    {row.label}
                  </th>
                  {classes.map((col) => {
                    const score = Math.min(row.pct, col.pct);
                    const isDiag = row.key === col.key;
                    const opacity = Math.min(score / 40, 1); // saturate around 40%
                    return (
                      <td
                        key={`${row.key}-${col.key}`}
                        className="border border-border/40 w-8 h-8 text-center align-middle"
                        title={`${row.label} × ${col.label}: ${score.toFixed(1)}%`}
                        style={{
                          background: isDiag
                            ? `hsl(213 53% 22% / ${0.4 + opacity * 0.6})`
                            : `hsl(213 53% 22% / ${opacity * 0.65})`,
                          color: opacity > 0.55 ? '#fff' : 'hsl(var(--muted-foreground))',
                        }}
                      >
                        {score >= 5 ? score.toFixed(0) : ''}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-[11px] text-muted-foreground">
          Darker = larger combined exposure. Diagonal cells show single-class concentration.
          {valueLine.length < 6 && ' Insufficient history for return-based correlation.'}
        </p>
      </CardContent>
    </Card>
  );
}

