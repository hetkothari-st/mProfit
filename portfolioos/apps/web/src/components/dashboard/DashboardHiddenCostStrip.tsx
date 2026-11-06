import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ScanSearch } from 'lucide-react';
import { formatINR } from '@everypaisa/shared';
import { HIDDEN_COSTS_KEY, hiddenCostsApi } from '@/api/hiddenCosts.api';
import { compactInr } from '@/pages/hiddenCosts/hiddenCostsView';

/** One line on the dashboard: this year's hidden costs and their 20-year cost. Hidden when there are none. */
export function DashboardHiddenCostStrip() {
  const { data } = useQuery({ queryKey: HIDDEN_COSTS_KEY, queryFn: () => hiddenCostsApi.view(), staleTime: 10 * 60_000 });
  if (!data || data.totalInr === '0.00') return null;
  return (
    <Link
      to="/hidden-costs"
      className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card/60 px-3 py-2.5 text-xs transition-colors hover:border-foreground/30"
    >
      <span className="flex min-w-0 items-center gap-2">
        <ScanSearch className="h-3.5 w-3.5 shrink-0 text-negative" />
        <span className="text-muted-foreground">Hidden costs this year</span>
        <span className="numeric-display font-semibold text-foreground">{formatINR(data.totalInr, { fractionDigits: 0 })}</span>
        <span className="hidden text-muted-foreground sm:inline">· {compactInr(data.compound.valueInr)} over {data.compound.years} years</span>
      </span>
      <span className="shrink-0 font-medium text-accent-ink">See where</span>
    </Link>
  );
}
