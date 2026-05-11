import { useQuery } from '@tanstack/react-query';
import { toDecimal } from '@portfolioos/shared';
import { ingestionApi } from '@/api/ingestion.api';
import { useAuthStore } from '@/stores/auth.store';

/**
 * §9 / §17 — sidebar gauge for the user's month-to-date LLM spend. Colour
 * tracks the tri-state BudgetStatus: green ok, amber warn, red capped.
 * Poll every 60s so an email parsed in another tab updates here too.
 */
export function BudgetGauge({ collapsed }: { collapsed: boolean }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated());
  const { data, isLoading } = useQuery({
    queryKey: ['ingestion', 'budget'],
    queryFn: () => ingestionApi.budget(),
    refetchInterval: 60_000,
    enabled: isAuthenticated,
    retry: false,
  });

  if (isLoading || !data) {
    if (collapsed) return null;
    return (
      <div className="px-4 py-2 text-[11px] text-sidebar-foreground/60">
        Loading budget…
      </div>
    );
  }

  const spent = toDecimal(data.spentInr);
  const cap = toDecimal(data.capInr);
  const pct = cap.gt(0)
    ? Math.min(100, Math.round(spent.div(cap).mul(100).toNumber()))
    : 0;
  const color =
    data.status === 'capped'
      ? 'bg-negative'
      : data.status === 'warn'
        ? 'bg-amber-500'
        : 'bg-positive';

  if (collapsed) {
    // Minimal stub when sidebar collapsed — just the colour dot.
    return (
      <div className="flex justify-center py-2" title={`LLM spend ${data.status}`}>
        <div className={`h-2 w-2 rounded-full ${color}`} />
      </div>
    );
  }

  return (
    <div className="px-4 py-2 space-y-1">
      <div className="flex items-center justify-between text-[11px] text-sidebar-foreground/70">
        <span>LLM spend (mo)</span>
        <span className="font-mono">
          ₹{spent.toFixed(0)} / ₹{cap.toFixed(0)}
        </span>
      </div>
      <div className="h-1 bg-sidebar-border rounded-full overflow-hidden">
        <div className={`h-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      {data.status !== 'ok' && (
        <div
          className={
            data.status === 'capped'
              ? 'text-[10px] text-negative'
              : 'text-[10px] text-amber-600'
          }
        >
          {data.status === 'capped'
            ? 'Cap reached — new emails archived'
            : 'Warning: nearing cap'}
        </div>
      )}
    </div>
  );
}
