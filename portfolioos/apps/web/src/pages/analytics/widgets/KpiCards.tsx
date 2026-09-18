import { TrendingUp, Wallet, LineChart as LineChartIcon } from 'lucide-react';
import { MetricCard } from '@/components/portfolio/MetricCard';
import { formatINR, formatPercent, toDecimal } from '@everypaisa/shared';
import type { KpiBlock } from '@/api/analytics.api';
import { AnalyticsInfo } from '../AnalyticsInfo';

/**
 * The three numbers this page exists to answer: what is it worth, am I up or
 * down, and what return is that.
 *
 * It used to carry six. "Total returns" added lifetime unrealised to one
 * financial year's realised, a sum that is neither — its own explanation had
 * to say so, which is reason enough to delete a number rather than annotate
 * it. Realised P&L and income are financial-year figures and now sit with the
 * other tax numbers, where a reader is already thinking in financial years.
 *
 * The labels say what the number is rather than what it is called: "profit if
 * you sold today" is the same figure as "unrealised P&L" without the homework.
 */
function pct(v: number | null, digits = 2): string {
  if (v == null) return '—';
  return formatPercent(v * 100, digits, true);
}

export function KpiCards({ kpis }: { kpis: KpiBlock }) {
  const unrealisedD = toDecimal(kpis.unrealisedPnL);
  const totalCostD = toDecimal(kpis.totalCost);
  const unrealisedPct = totalCostD.gt(0)
    ? unrealisedD.dividedBy(totalCostD).times(100).toNumber()
    : 0;
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <MetricCard
        label="Current value"
        info={<AnalyticsInfo k="currentValue" />}
        value={formatINR(kpis.currentValue)}
        icon={Wallet}
        hint={`You put in ${formatINR(kpis.totalCost)}`}
      />
      <MetricCard
        label="Profit if you sold today"
        info={<AnalyticsInfo k="unrealisedPnl" />}
        value={formatINR(kpis.unrealisedPnL, { showSign: true })}
        icon={LineChartIcon}
        trend={{
          direction: unrealisedD.gt(0) ? 'up' : unrealisedD.isNegative() ? 'down' : 'flat',
          value: formatPercent(unrealisedPct, 2, true),
        }}
      />
      <MetricCard
        label="Annualised return"
        info={<AnalyticsInfo k="xirrOverall" />}
        // Only suppress when the API explicitly flags it unreliable. If the
        // field is absent (older API build / version skew) fall back to showing
        // the value rather than a bare "—".
        value={kpis.xirrReliable === false ? '—' : pct(kpis.xirrOverall)}
        icon={TrendingUp}
        hint={
          kpis.xirrReliable === false
            ? `Needs ${
                Number.isFinite(kpis.xirrSpanDays)
                  ? `${Math.max(0, 90 - kpis.xirrSpanDays)} more days`
                  : 'more history'
              } · so far ${formatPercent(unrealisedPct, 2, true)}`
            : 'XIRR · counts when each rupee went in'
        }
      />
    </div>
  );
}
