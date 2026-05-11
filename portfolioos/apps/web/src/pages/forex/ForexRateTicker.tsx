import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { RefreshCw, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui/button';
import { forexApi } from '@/api/forex.api';
import { apiErrorMessage } from '@/api/client';

const CURRENCY_FLAGS: Record<string, string> = {
  USD: '🇺🇸', EUR: '🇪🇺', GBP: '🇬🇧', JPY: '🇯🇵',
  AED: '🇦🇪', SGD: '🇸🇬', AUD: '🇦🇺', CAD: '🇨🇦', CHF: '🇨🇭',
  INR: '🇮🇳', HKD: '🇭🇰', CNY: '🇨🇳',
};

export function ForexRateTicker() {
  const queryClient = useQueryClient();

  // Page-load + 30s auto-poll per spec. staleTime 0 keeps the rate visibly
  // fresh; refetchInterval 30000 is the actual polling cadence.
  const { data: rows, isFetching } = useQuery({
    queryKey: ['forex', 'ticker'],
    queryFn: () => forexApi.ticker(),
    refetchInterval: 30_000,
    staleTime: 0,
  });

  const refresh = useMutation({
    mutationFn: () => forexApi.refreshTicker(),
    onSuccess: (res) => {
      toast.success(`Refreshed ${res.updated} rates`);
      queryClient.invalidateQueries({ queryKey: ['forex', 'ticker'] });
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'FX refresh failed')),
  });

  return (
    <div className="rounded-lg border border-border bg-card p-3 shadow-sm">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-medium text-foreground">Live FX rates</h3>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => refresh.mutate()}
          disabled={refresh.isPending}
          className="h-7 px-2 text-xs"
        >
          {refresh.isPending ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <RefreshCw className="h-3 w-3" />
          )}
          <span className="ml-1">Refresh</span>
        </Button>
      </div>
      {!rows ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" /> Loading…
        </div>
      ) : rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">No rates yet — hit refresh.</p>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {rows.map((r) => (
            <div
              key={`${r.base}${r.quote}`}
              className="flex items-center justify-between rounded border border-border/50 bg-background/50 px-3 py-2 text-xs"
            >
              <span className="flex items-center gap-1.5 font-medium text-foreground">
                <span>{CURRENCY_FLAGS[r.base] ?? ''}</span>
                <span>
                  {r.base}/{r.quote}
                </span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="font-mono tabular-nums text-foreground">
                  {Number(r.rate).toFixed(r.quote === 'INR' ? 4 : 6)}
                </span>
                <span
                  className={`rounded px-1 py-0.5 text-[9px] uppercase tracking-wider ${
                    r.source === 'RBI' || r.source === 'FRANKFURTER'
                      ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                      : r.source === 'DERIVED'
                        ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300'
                        : 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300'
                  }`}
                >
                  {r.source}
                </span>
              </span>
            </div>
          ))}
        </div>
      )}
      {isFetching && (
        <p className="mt-1.5 text-[10px] text-muted-foreground">Updating…</p>
      )}
    </div>
  );
}
