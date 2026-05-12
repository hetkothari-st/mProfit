import { useMemo, useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, Fuel, Zap, RefreshCw, Flame, MapPin } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select } from '@/components/ui/select';
import { vehiclesApi, type StateFuelPricesDTO } from '@/api/vehicles.api';

function formatRupees(val: string | null | undefined): string {
  if (val === null || val === undefined || val === '') return '—';
  const num = Number(val);
  if (Number.isNaN(num)) return '—';
  return '₹' + num.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function stateFromRtoCode(rtoCode: string | null | undefined): string | null {
  if (!rtoCode) return null;
  const m = rtoCode.match(/^([A-Z]{2})/);
  return m ? m[1]! : null;
}

function SecondsAgo({ fetchedAt }: { fetchedAt: string }) {
  const [label, setLabel] = useState('');
  useEffect(() => {
    const update = () => {
      const secs = Math.floor((Date.now() - new Date(fetchedAt).getTime()) / 1000);
      if (secs < 60) setLabel(`${secs}s ago`);
      else if (secs < 3600) setLabel(`${Math.floor(secs / 60)}m ago`);
      else setLabel(`${Math.floor(secs / 3600)}h ago`);
    };
    update();
    const id = setInterval(update, 30_000);
    return () => clearInterval(id);
  }, [fetchedAt]);
  return <span>{label}</span>;
}

interface PriceRowProps {
  icon: React.ReactNode;
  label: string;
  unit: string;
  value: string | null;
  accent: string;
}

function PriceRow({ icon, label, unit, value, accent }: PriceRowProps) {
  return (
    <div className="flex items-center gap-3 py-2.5 border-b last:border-b-0">
      <div className={`flex h-9 w-9 items-center justify-center rounded-md ${accent}`}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium">{label}</div>
        <div className="text-xs text-muted-foreground">{unit}</div>
      </div>
      <div className="text-base font-semibold tabular-nums">{formatRupees(value)}</div>
    </div>
  );
}

export interface FuelPricesCardProps {
  /** Optional vehicle rtoCode used to pick the default state (e.g. "MH47"). */
  defaultRtoCode?: string | null;
  /** Optional title override. */
  title?: string;
}

export function FuelPricesCard({ defaultRtoCode, title = 'Fuel & energy prices' }: FuelPricesCardProps) {
  const defaultCode = useMemo(() => stateFromRtoCode(defaultRtoCode) ?? 'MH', [defaultRtoCode]);
  const [selected, setSelected] = useState<string>(defaultCode);

  // Keep selection in sync when the default changes (eg. user navigates to a
  // different vehicle from the same card).
  useEffect(() => {
    setSelected(defaultCode);
  }, [defaultCode]);

  const statesQuery = useQuery({
    queryKey: ['fuel-prices', 'states'],
    queryFn: () => vehiclesApi.listStates(),
    staleTime: 24 * 3600_000,
  });

  const pricesQuery = useQuery<StateFuelPricesDTO>({
    queryKey: ['fuel-prices', selected],
    queryFn: () => vehiclesApi.getFuelPrices(selected),
    enabled: Boolean(selected),
    refetchInterval: 30 * 60_000,
    staleTime: 10 * 60_000,
  });

  const data = pricesQuery.data;
  const isLoading = pricesQuery.isLoading;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Fuel className="h-4 w-4" /> {title}
          </CardTitle>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {pricesQuery.isFetching ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <span className="h-2 w-2 rounded-full bg-green-500" />
            )}
            {data?.fetchedAt ? <SecondsAgo fetchedAt={data.fetchedAt} /> : 'Loading…'}
            <span className="hidden sm:inline">·</span>
            <RefreshCw className="h-3 w-3 hidden sm:inline" />
            <span className="hidden sm:inline">auto 30m</span>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="mb-3 flex items-center gap-2">
          <MapPin className="h-4 w-4 text-muted-foreground" />
          <Select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            className="h-9 text-sm max-w-[240px]"
          >
            {(statesQuery.data ?? [{ code: defaultCode, name: defaultCode }]).map((s) => (
              <option key={s.code} value={s.code}>{s.name}</option>
            ))}
          </Select>
          {data?.petrolDieselSource === 'seed' && (
            <span className="text-[10px] uppercase tracking-wider text-amber-600 ml-2">
              cached
            </span>
          )}
        </div>

        {isLoading && !data && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-6 justify-center">
            <Loader2 className="h-4 w-4 animate-spin" /> Fetching prices…
          </div>
        )}

        {data && (
          <div>
            <PriceRow
              icon={<Fuel className="h-4 w-4 text-red-600" />}
              label="Petrol"
              unit="per litre"
              value={data.petrol}
              accent="bg-red-50 dark:bg-red-950/40"
            />
            <PriceRow
              icon={<Fuel className="h-4 w-4 text-blue-600" />}
              label="Diesel"
              unit="per litre"
              value={data.diesel}
              accent="bg-blue-50 dark:bg-blue-950/40"
            />
            <PriceRow
              icon={<Flame className="h-4 w-4 text-emerald-600" />}
              label="CNG"
              unit="per kg"
              value={data.cng}
              accent="bg-emerald-50 dark:bg-emerald-950/40"
            />
            <PriceRow
              icon={<Flame className="h-4 w-4 text-orange-600" />}
              label="LPG (14.2 kg)"
              unit="domestic cylinder"
              value={data.lpg}
              accent="bg-orange-50 dark:bg-orange-950/40"
            />
            <PriceRow
              icon={<Zap className="h-4 w-4 text-yellow-600" />}
              label="Electricity"
              unit="per kWh (0–100 unit slab)"
              value={data.electricity}
              accent="bg-yellow-50 dark:bg-yellow-950/40"
            />
          </div>
        )}

        <p className="mt-3 pt-3 border-t text-[10px] text-muted-foreground">
          Petrol &amp; diesel from Goodreturns; CNG / LPG / electricity are
          representative residential rates. Actual prices vary by city, DISCOM
          and slab.
        </p>
      </CardContent>
    </Card>
  );
}
