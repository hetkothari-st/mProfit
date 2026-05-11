import { TrendingUp, Wallet, LineChart as LineChartIcon, Percent, ArrowDownToLine, Receipt } from 'lucide-react';
import { MetricCard } from '@/components/portfolio/MetricCard';
import { formatINR, formatPercent, toDecimal } from '@portfolioos/shared';
import type { KpiBlock } from '@/api/analytics.api';

function pct(v: number | null, digits = 2): string {
  if (v == null) return '—';
  return formatPercent(v * 100, digits, true);
}

export function KpiCards({ kpis }: { kpis: KpiBlock }) {
  const unrealisedD = toDecimal(kpis.unrealisedPnL);
  const realisedD = toDecimal(kpis.realisedYtd);
  const totalCostD = toDecimal(kpis.totalCost);
  const unrealisedPct = totalCostD.gt(0)
    ? unrealisedD.dividedBy(totalCostD).times(100).toNumber()
    : 0;
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <MetricCard
        label="Current value"
        value={formatINR(kpis.currentValue)}
        icon={Wallet}
        hint={`Invested ${formatINR(kpis.totalCost)}`}
      />
      <MetricCard
        label="Unrealised P&L"
        value={formatINR(kpis.unrealisedPnL, { showSign: true })}
        icon={LineChartIcon}
        trend={{
          direction: unrealisedD.gt(0) ? 'up' : unrealisedD.isNegative() ? 'down' : 'flat',
          value: formatPercent(unrealisedPct, 2, true),
        }}
      />
      <MetricCard
        label="XIRR overall"
        value={pct(kpis.xirrOverall)}
        icon={TrendingUp}
        hint={`1Y ${pct(kpis.xirr1y, 1)} · 3Y ${pct(kpis.xirr3y, 1)} · 5Y ${pct(kpis.xirr5y, 1)}`}
      />
      <MetricCard
        label="Realised P&L (FY)"
        value={formatINR(kpis.realisedYtd, { showSign: true })}
        icon={Percent}
        trend={{
          direction: realisedD.gt(0) ? 'up' : realisedD.isNegative() ? 'down' : 'flat',
          value: '',
        }}
      />
      <MetricCard
        label="Income (FY)"
        value={formatINR(kpis.incomeYtd)}
        icon={ArrowDownToLine}
        hint="Dividends + interest + maturity"
      />
      <MetricCard
        label="Total returns"
        value={formatINR(unrealisedD.plus(realisedD).toFixed(4), { showSign: true })}
        icon={Receipt}
        hint="Unrealised + realised (FY)"
      />
    </div>
  );
}
