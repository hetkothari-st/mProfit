import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { forexApi } from '@/api/forex.api';

// Compact rates strip for the main dashboard. Shows the four most-referenced
// INR rates (USD, EUR, GBP, JPY) with source badge. 30s auto-poll mirrors the
// /forex page. Clicking the strip routes to the full Forex section.
const DASHBOARD_PAIRS = ['USDINR', 'EURINR', 'GBPINR', 'JPYINR'];

export function DashboardFxStrip() {
  const { data: rows } = useQuery({
    queryKey: ['forex', 'ticker', 'dashboard'],
    queryFn: () => forexApi.ticker(DASHBOARD_PAIRS),
    refetchInterval: 30_000,
    staleTime: 0,
  });

  if (!rows || rows.length === 0) return null;

  return (
    <Link
      to="/forex"
      className="flex items-center justify-between rounded-lg border border-border bg-card/60 px-3 py-2 text-xs transition-colors hover:bg-card"
    >
      <div className="flex items-center gap-4 overflow-x-auto">
        <span className="text-[10px] font-medium uppercase tracking-kerned text-muted-foreground shrink-0">
          FX
        </span>
        {rows.map((r) => (
          <span key={`${r.base}${r.quote}`} className="flex shrink-0 items-center gap-1.5">
            <span className="text-muted-foreground">
              {r.base}/{r.quote}
            </span>
            <span className="font-mono tabular-nums text-foreground">
              {Number(r.rate).toFixed(2)}
            </span>
            <span
              className={`rounded px-1 py-0.5 text-[8px] uppercase tracking-wider ${
                r.source === 'RBI'
                  ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                  : 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300'
              }`}
            >
              {r.source}
            </span>
          </span>
        ))}
      </div>
      <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground" />
    </Link>
  );
}
