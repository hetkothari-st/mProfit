import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, RefreshCw, TrendingUp } from 'lucide-react';
import { Decimal } from '@portfolioos/shared';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { assetsApi } from '@/api/assets.api';

const GOLD_CARATS = [
  { label: '24K (999.9)', value: '24', multiplier: '1' },
  { label: '22K (916)', value: '22', multiplier: '0.9167' },
  { label: '18K (750)', value: '18', multiplier: '0.75' },
  { label: '14K (583)', value: '14', multiplier: '0.5833' },
];

const SILVER_PURITIES = [
  { label: '999 (Fine)', value: '999', multiplier: '1' },
  { label: '925 (Sterling)', value: '925', multiplier: '0.925' },
  { label: '800', value: '800', multiplier: '0.800' },
];

function formatPrice(val: string | null | undefined): string {
  if (!val) return '—';
  const d = new Decimal(val);
  return '₹' + d.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function computeValue(basePrice: string | null, multiplier: string, grams: string): string | null {
  if (!basePrice || !grams || Number(grams) <= 0) return null;
  try {
    const val = new Decimal(basePrice)
      .times(new Decimal(multiplier))
      .times(new Decimal(grams));
    return val.toFixed(2);
  } catch {
    return null;
  }
}

function SecondsAgo({ fetchedAt }: { fetchedAt: string }) {
  const [secs, setSecs] = useState(0);

  useEffect(() => {
    setSecs(0);
    const id = setInterval(() => {
      setSecs(Math.floor((Date.now() - new Date(fetchedAt).getTime()) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [fetchedAt]);

  if (secs < 5) return <span className="text-green-500 dark:text-green-400">just now</span>;
  return <span>{secs}s ago</span>;
}

export function GoldLivePriceWidget() {
  const [goldCarat, setGoldCarat] = useState('24');
  const [goldGrams, setGoldGrams] = useState('');
  const [silverPurity, setSilverPurity] = useState('999');
  const [silverGrams, setSilverGrams] = useState('');

  const { data, isLoading, isFetching, error } = useQuery({
    queryKey: ['commodities-live'],
    queryFn: () => assetsApi.commoditiesLive(),
    refetchInterval: 60_000,
    staleTime: 60_000,
    retry: 2,
  });

  const goldMultiplier = GOLD_CARATS.find((c) => c.value === goldCarat)?.multiplier ?? '1';
  const silverMultiplier = SILVER_PURITIES.find((p) => p.value === silverPurity)?.multiplier ?? '1';

  const goldPerGram = data?.GOLD
    ? new Decimal(data.GOLD).times(new Decimal(goldMultiplier)).toFixed(2)
    : null;
  const silverPerGram = data?.SILVER
    ? new Decimal(data.SILVER).times(new Decimal(silverMultiplier)).toFixed(2)
    : null;

  const goldTotal = computeValue(data?.GOLD ?? null, goldMultiplier, goldGrams);
  const silverTotal = computeValue(data?.SILVER ?? null, silverMultiplier, silverGrams);

  return (
    <Card className="mb-6 border-amber-200/60 dark:border-amber-800/40 bg-gradient-to-br from-amber-50/60 to-yellow-50/30 dark:from-amber-950/20 dark:to-yellow-950/10">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CardTitle className="text-base font-semibold">Live Rates</CardTitle>
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              {isFetching ? (
                <Loader2 className="h-3 w-3 animate-spin text-amber-500" />
              ) : (
                <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
              )}
              {isFetching ? 'Refreshing…' : data?.fetchedAt ? (
                <SecondsAgo fetchedAt={data.fetchedAt} />
              ) : null}
            </span>
          </div>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <RefreshCw className="h-3 w-3" />
            <span>Auto-refreshes every 30s</span>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        {isLoading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-4 justify-center">
            <Loader2 className="h-4 w-4 animate-spin" />
            Fetching live prices…
          </div>
        )}

        {error && !data && (
          <p className="text-sm text-destructive py-2">
            Failed to fetch live prices. Retrying…
          </p>
        )}

        {!isLoading && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Gold */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="text-lg">🪙</span>
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Gold (24K base)</p>
                  <p className="text-2xl font-bold tabular-nums text-amber-700 dark:text-amber-400">
                    {data?.GOLD ? formatPrice(data.GOLD) : '—'}
                    <span className="text-sm font-normal text-muted-foreground ml-1">/gram</span>
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Carat</label>
                  <Select
                    value={goldCarat}
                    onChange={(e) => setGoldCarat(e.target.value)}
                    className="h-9 text-sm"
                  >
                    {GOLD_CARATS.map((c) => (
                      <option key={c.value} value={c.value}>{c.label}</option>
                    ))}
                  </Select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Weight (grams)</label>
                  <Input
                    type="number"
                    min="0"
                    step="0.1"
                    placeholder="0"
                    value={goldGrams}
                    onChange={(e) => setGoldGrams(e.target.value)}
                    className="h-9 text-sm"
                  />
                </div>
              </div>

              {goldPerGram && (
                <p className="text-xs text-muted-foreground">
                  {goldCarat}K price: <span className="font-medium text-foreground">{formatPrice(goldPerGram)}/g</span>
                </p>
              )}

              {goldTotal && (
                <div className="flex items-center gap-2 rounded-md bg-amber-100/60 dark:bg-amber-900/20 px-3 py-2">
                  <TrendingUp className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
                  <div>
                    <p className="text-xs text-muted-foreground">Estimated value</p>
                    <p className="text-lg font-bold tabular-nums text-amber-700 dark:text-amber-300">
                      {formatPrice(goldTotal)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {goldGrams}g × {goldCarat}K ({goldMultiplier} purity)
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Silver */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="text-lg">🥈</span>
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Silver (999 base)</p>
                  <p className="text-2xl font-bold tabular-nums text-slate-600 dark:text-slate-300">
                    {data?.SILVER ? formatPrice(data.SILVER) : '—'}
                    <span className="text-sm font-normal text-muted-foreground ml-1">/gram</span>
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Purity</label>
                  <Select
                    value={silverPurity}
                    onChange={(e) => setSilverPurity(e.target.value)}
                    className="h-9 text-sm"
                  >
                    {SILVER_PURITIES.map((p) => (
                      <option key={p.value} value={p.value}>{p.label}</option>
                    ))}
                  </Select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Weight (grams)</label>
                  <Input
                    type="number"
                    min="0"
                    step="0.1"
                    placeholder="0"
                    value={silverGrams}
                    onChange={(e) => setSilverGrams(e.target.value)}
                    className="h-9 text-sm"
                  />
                </div>
              </div>

              {silverPerGram && (
                <p className="text-xs text-muted-foreground">
                  {silverPurity} purity price: <span className="font-medium text-foreground">{formatPrice(silverPerGram)}/g</span>
                </p>
              )}

              {silverTotal && (
                <div className="flex items-center gap-2 rounded-md bg-slate-100/60 dark:bg-slate-800/30 px-3 py-2">
                  <TrendingUp className="h-4 w-4 text-slate-500 dark:text-slate-400 shrink-0" />
                  <div>
                    <p className="text-xs text-muted-foreground">Estimated value</p>
                    <p className="text-lg font-bold tabular-nums text-slate-700 dark:text-slate-200">
                      {formatPrice(silverTotal)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {silverGrams}g × {silverPurity} purity ({silverMultiplier})
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        <p className="text-xs text-muted-foreground mt-4 border-t pt-3">
          Rates sourced via Yahoo Finance ETF proxies (GOLDBEES.NS / SILVERBEES.NS). Approximate — not IBJA official rates.
        </p>
      </CardContent>
    </Card>
  );
}
