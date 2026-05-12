import { useEffect, useState } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { Decimal } from '@portfolioos/shared';
import { assetsApi } from '@/api/assets.api';

function formatPrice(val: string | null | undefined): string {
  if (!val) return '—';
  const d = new Decimal(val);
  const [whole, frac] = d.toFixed(2).split('.');
  const grouped = whole!.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `₹${grouped}.${frac}`;
}

function useSecondsAgo(fetchedAt: string | undefined) {
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    if (!fetchedAt) return;
    const tick = () =>
      setSecs(Math.floor((Date.now() - new Date(fetchedAt).getTime()) / 1000));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [fetchedAt]);
  return secs;
}

function freshnessLabel(secs: number): string {
  if (secs < 5) return 'just now';
  if (secs < 60) return `${secs}s ago`;
  const m = Math.floor(secs / 60);
  return m === 1 ? '1 min ago' : `${m} min ago`;
}

export function GoldSilverTopBar() {
  const { data, isFetching, error } = useQuery({
    queryKey: ['commodities-live'],
    queryFn: () => assetsApi.commoditiesLive(),
    refetchInterval: 10_000,
    staleTime: 10_000,
    placeholderData: keepPreviousData,
    retry: 2,
  });

  const secs = useSecondsAgo(data?.fetchedAt);

  return (
    <div className="sticky top-0 z-30 mb-5 px-4 sm:px-5 py-3 rounded-lg border border-border/60 bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/70 shadow-sm">
      <div className="flex items-center justify-between gap-6 flex-wrap">
        <div className="flex items-center gap-8 flex-wrap">
          {/* Gold */}
          <div className="flex items-center gap-3">
            <span className="text-xl leading-none">🪙</span>
            <div>
              <p className="text-[10px] font-medium uppercase tracking-kerned text-muted-foreground">
                Gold · 24K
              </p>
              <p className="text-xl font-semibold tabular-nums text-amber-600 dark:text-amber-400 leading-tight">
                {data?.GOLD ? formatPrice(data.GOLD) : '—'}
                <span className="text-xs font-normal text-muted-foreground ml-1">/g</span>
              </p>
            </div>
          </div>

          <div className="h-8 w-px bg-border/60" />

          {/* Silver */}
          <div className="flex items-center gap-3">
            <span className="text-xl leading-none">🥈</span>
            <div>
              <p className="text-[10px] font-medium uppercase tracking-kerned text-muted-foreground">
                Silver · 999
              </p>
              <p className="text-xl font-semibold tabular-nums text-slate-600 dark:text-slate-300 leading-tight">
                {data?.SILVER ? formatPrice(data.SILVER) : '—'}
                <span className="text-xs font-normal text-muted-foreground ml-1">/g</span>
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          {error && !data ? (
            <span className="text-destructive">Live feed unavailable</span>
          ) : (
            <>
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  isFetching ? 'bg-amber-500 animate-pulse' : 'bg-green-500 animate-pulse'
                }`}
              />
              <span>
                {isFetching && !data
                  ? 'Loading…'
                  : `Live · updated ${freshnessLabel(secs)}`}
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
