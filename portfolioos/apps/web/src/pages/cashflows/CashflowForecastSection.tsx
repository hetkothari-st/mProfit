import { useQuery } from '@tanstack/react-query';
import { ArrowDownLeft, ArrowUpRight, AlertTriangle, Loader2 } from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { formatINR, toDecimal } from '@portfolioos/shared';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cashflowsApi, type ForecastEvent } from '@/api/cashflows.api';

const SOURCE_LABEL: Record<ForecastEvent['source'], string> = {
  LOAN_EMI: 'Loan EMI',
  RENT_DUE: 'Rent due',
  INSURANCE_PREMIUM: 'Premium',
  FD_MATURITY: 'FD matures',
  RD_MATURITY: 'RD matures',
};

export function CashflowForecastSection() {
  const { data, isLoading } = useQuery({
    queryKey: ['cashflow-forecast', 12],
    queryFn: () => cashflowsApi.forecast(12),
  });

  if (isLoading) {
    return (
      <div className="py-6 text-center text-muted-foreground text-sm">
        <Loader2 className="h-4 w-4 animate-spin inline" /> Loading forecast…
      </div>
    );
  }
  if (!data) return null;

  const chartData = data.monthly.map((m) => ({
    month: formatMonthLabel(m.month),
    inflow: toDecimal(m.inflow).toNumber(),
    outflow: -toDecimal(m.outflow).toNumber(),
    net: toDecimal(m.net).toNumber(),
  }));

  const next = data.events.slice(0, 6);
  const hasLiquidityGap = data.monthly.some((m) => toDecimal(m.net).lessThan(0));

  return (
    <Card className="mb-6">
      <CardHeader className="flex-row items-center justify-between pb-2">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-accent-ink/80 mb-1">
            Forecast · next {data.summary.horizonMonths} months
          </p>
          <CardTitle className="text-base">Scheduled cashflow</CardTitle>
        </div>
        {hasLiquidityGap && (
          <div className="flex items-center gap-1.5 text-xs text-amber-600">
            <AlertTriangle className="h-3.5 w-3.5" />
            Negative cashflow month ahead
          </div>
        )}
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
          <Tile
            label="Expected inflows"
            value={formatINR(data.summary.totalInflow)}
            tone="positive"
            icon={<ArrowDownLeft className="h-4 w-4" />}
          />
          <Tile
            label="Expected outflows"
            value={formatINR(data.summary.totalOutflow)}
            tone="negative"
            icon={<ArrowUpRight className="h-4 w-4" />}
          />
          <Tile
            label="Net"
            value={formatINR(data.summary.netCashflow)}
            tone={toDecimal(data.summary.netCashflow).greaterThanOrEqualTo(0) ? 'positive' : 'negative'}
          />
        </div>

        <div className="h-48 mb-4">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} stackOffset="sign" margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <XAxis dataKey="month" tick={{ fontSize: 10 }} />
              <YAxis
                tickFormatter={(v: number) => compactInr(v)}
                tick={{ fontSize: 10 }}
                width={56}
              />
              <Tooltip
                formatter={(v: number) => formatINR(Math.abs(v).toString())}
                labelClassName="text-xs"
                cursor={{ fill: 'rgba(0,0,0,0.04)' }}
              />
              <Bar dataKey="inflow" stackId="cf">
                {chartData.map((_, i) => (
                  <Cell key={`in-${i}`} fill="hsl(130 35% 38%)" />
                ))}
              </Bar>
              <Bar dataKey="outflow" stackId="cf">
                {chartData.map((_, i) => (
                  <Cell key={`out-${i}`} fill="hsl(0 60% 50%)" />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {next.length > 0 && (
          <>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
              Upcoming events
            </div>
            <div className="divide-y border rounded-md">
              {next.map((e) => (
                <div key={e.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                  <div
                    className={`h-6 w-6 rounded-full flex items-center justify-center shrink-0 ${
                      e.direction === 'INFLOW' ? 'bg-positive/10 text-positive' : 'bg-negative/10 text-negative'
                    }`}
                  >
                    {e.direction === 'INFLOW' ? (
                      <ArrowDownLeft className="h-3 w-3" />
                    ) : (
                      <ArrowUpRight className="h-3 w-3" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{e.description}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {SOURCE_LABEL[e.source]} ·{' '}
                      {new Date(e.date).toLocaleDateString('en-IN', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </div>
                  </div>
                  <div
                    className={`tabular-nums font-medium ${
                      e.direction === 'INFLOW' ? 'text-positive' : 'text-negative'
                    }`}
                  >
                    {e.direction === 'INFLOW' ? '+' : '−'}
                    {formatINR(e.amount)}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Tile({
  label,
  value,
  tone,
  icon,
}: {
  label: string;
  value: string;
  tone: 'positive' | 'negative' | 'neutral';
  icon?: React.ReactNode;
}) {
  const colorClass =
    tone === 'positive' ? 'text-positive' : tone === 'negative' ? 'text-negative' : 'text-foreground';
  return (
    <div className="border rounded-md px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1 mb-1">
        {icon}
        {label}
      </div>
      <div className={`text-lg font-semibold tabular-nums ${colorClass}`}>{value}</div>
    </div>
  );
}

function formatMonthLabel(key: string): string {
  // key = YYYY-MM
  const [y, m] = key.split('-');
  // eslint-disable-next-line portfolioos/no-money-coercion -- YYYY-MM split; not money
  const date = new Date(Number.parseInt(y ?? '0', 10), Number.parseInt(m ?? '1', 10) - 1, 1);
  return date.toLocaleDateString('en-IN', { month: 'short' });
}

function compactInr(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1e7) return `${(v / 1e7).toFixed(1)}Cr`;
  if (abs >= 1e5) return `${(v / 1e5).toFixed(1)}L`;
  if (abs >= 1e3) return `${(v / 1e3).toFixed(0)}k`;
  return `${v}`;
}
