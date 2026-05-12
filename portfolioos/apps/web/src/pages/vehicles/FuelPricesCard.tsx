import { useMemo, useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, Fuel, Zap, Flame, MapPin } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
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
  const [label, setLabel] = useState('just now');
  useEffect(() => {
    const update = () => {
      const secs = Math.floor((Date.now() - new Date(fetchedAt).getTime()) / 1000);
      if (secs < 3) setLabel('just now');
      else if (secs < 60) setLabel(`${secs}s ago`);
      else if (secs < 3600) setLabel(`${Math.floor(secs / 60)}m ago`);
      else setLabel(`${Math.floor(secs / 3600)}h ago`);
    };
    update();
    // Tick every second so the "Xs ago" indicator feels live; cheaper than
    // a query refetch but visually communicates freshness.
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [fetchedAt]);
  return <span>{label}</span>;
}

interface StatCellProps {
  icon: React.ReactNode;
  label: string;
  unit: string;
  value: string | null;
  tone: string;
}

function StatCell({ icon, label, unit, value, tone }: StatCellProps) {
  return (
    <div className="flex-1 min-w-[120px] px-4 py-3 border-r last:border-r-0 border-border/60">
      <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        <span className={tone}>{icon}</span>
        <span>{label}</span>
      </div>
      <div className="mt-1 text-lg font-semibold tabular-nums">
        {formatRupees(value)}
      </div>
      <div className="text-[10px] text-muted-foreground">{unit}</div>
    </div>
  );
}

export interface FuelPricesCardProps {
  /** Optional vehicle rtoCode used to pick the default state (e.g. "MH47"). */
  defaultRtoCode?: string | null;
}

export function FuelPricesCard({ defaultRtoCode }: FuelPricesCardProps) {
  const defaultCode = useMemo(() => stateFromRtoCode(defaultRtoCode) ?? 'MH', [defaultRtoCode]);
  const [selected, setSelected] = useState<string>(defaultCode);

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
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    staleTime: 30_000,
  });

  const data = pricesQuery.data;
  const isLoading = pricesQuery.isLoading && !data;
  const isLive = data?.petrolDieselSource === 'cardekho';

  return (
    <Card>
      <CardContent className="p-0">
        <div className="flex flex-col lg:flex-row lg:items-stretch">
          {/* Header strip: state picker + freshness */}
          <div className="flex items-center justify-between gap-3 px-4 py-3 lg:py-0 lg:px-5 lg:border-r border-b lg:border-b-0 border-border/60 lg:w-[220px] lg:flex-shrink-0">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                <MapPin className="h-3 w-3" />
                <span>State</span>
              </div>
              <Select
                value={selected}
                onChange={(e) => setSelected(e.target.value)}
                className="h-8 mt-1 text-sm border-0 px-0 focus-visible:ring-0 font-medium"
              >
                {(statesQuery.data ?? [{ code: defaultCode, name: defaultCode }]).map((s) => (
                  <option key={s.code} value={s.code}>{s.name}</option>
                ))}
              </Select>
              <div className="text-[10px] text-muted-foreground flex items-center gap-1.5">
                {pricesQuery.isFetching ? (
                  <Loader2 className="h-2.5 w-2.5 animate-spin" />
                ) : (
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      isLive ? 'bg-green-500' : 'bg-amber-500'
                    }`}
                  />
                )}
                {data?.fetchedAt ? <SecondsAgo fetchedAt={data.fetchedAt} /> : 'loading…'}
                <span>·</span>
                <span className={isLive ? 'text-green-600 dark:text-green-400' : 'text-amber-600'}>
                  {isLive ? 'live' : 'cached'}
                </span>
              </div>
            </div>
          </div>

          {/* Stat cells */}
          {isLoading && (
            <div className="flex-1 flex items-center justify-center py-6 text-sm text-muted-foreground gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Fetching prices…
            </div>
          )}

          {data && (
            <div className="flex-1 flex flex-wrap lg:flex-nowrap divide-x-0">
              <StatCell
                icon={<Fuel className="h-3.5 w-3.5" />}
                label="Petrol"
                unit="₹ / litre"
                value={data.petrol}
                tone="text-red-600 dark:text-red-400"
              />
              <StatCell
                icon={<Fuel className="h-3.5 w-3.5" />}
                label="Diesel"
                unit="₹ / litre"
                value={data.diesel}
                tone="text-blue-600 dark:text-blue-400"
              />
              <StatCell
                icon={<Flame className="h-3.5 w-3.5" />}
                label="CNG"
                unit="₹ / kg"
                value={data.cng}
                tone="text-emerald-600 dark:text-emerald-400"
              />
              <StatCell
                icon={<Flame className="h-3.5 w-3.5" />}
                label="LPG"
                unit="14.2 kg cyl."
                value={data.lpg}
                tone="text-orange-600 dark:text-orange-400"
              />
              <StatCell
                icon={<Zap className="h-3.5 w-3.5" />}
                label="Electricity"
                unit="₹ / kWh"
                value={data.electricity}
                tone="text-yellow-600 dark:text-yellow-500"
              />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
