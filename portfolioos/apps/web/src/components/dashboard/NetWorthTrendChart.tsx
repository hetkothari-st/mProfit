import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { intelligenceApi, type NetWorthHistoryPeriod } from '@/api/intelligence.api';
import { formatINR, toDecimal } from '@everypaisa/shared';

const PERIOD_OPTIONS: { label: string; value: NetWorthHistoryPeriod }[] = [
  { label: '1M', value: '1M' },
  { label: '3M', value: '3M' },
  { label: '6M', value: '6M' },
  { label: '1Y', value: '1Y' },
  { label: 'All', value: 'ALL' },
];

/**
 * Personal net-worth trend — the "look how far you've come" dashboard
 * element. Backed by the daily NetWorthSnapshot cron; a brand-new user (or
 * one just past the day-1 backfill) will only have a single point, so this
 * intentionally shows a friendly placeholder instead of a broken/flat chart.
 */
export function NetWorthTrendChart() {
  const [period, setPeriod] = useState<NetWorthHistoryPeriod>('1Y');

  const { data, isLoading, isError } = useQuery({
    queryKey: ['intelligence', 'net-worth-history', period],
    queryFn: () => intelligenceApi.netWorthHistory(period),
  });

  const points = data?.points ?? [];
  const chartData = points.map((p) => ({
    label: new Date(p.asOf).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' }),
    value: toDecimal(p.netWorthAfterLiabilities).toNumber(),
  }));

  const changeAbsolute = data ? toDecimal(data.summary.changeAbsolute) : null;
  const changePct = data?.summary.changePct ?? null;
  const isPositive = changeAbsolute ? !changeAbsolute.isNegative() : true;
  const isFlat = changeAbsolute ? changeAbsolute.isZero() : true;
  const periodLabel = PERIOD_OPTIONS.find((o) => o.value === period)?.label ?? period;

  return (
    <Card className="reveal">
      <CardHeader className="flex-row items-center justify-between pb-2">
        <div>
          <p className="text-[10px] uppercase tracking-kerned text-accent-ink/80 mb-1">Trend</p>
          <CardTitle className="text-[16px]">Net worth over time</CardTitle>
        </div>
        <div className="flex gap-0.5 rounded-md border border-border/70 bg-background/40 p-0.5">
          {PERIOD_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setPeriod(opt.value)}
              className={`px-2.5 py-1 rounded-[5px] text-[11px] font-medium tracking-wide transition-all ${
                period === opt.value
                  ? 'bg-foreground text-background shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        {!isLoading && changeAbsolute && chartData.length >= 2 && (
          <div className="mb-3 flex flex-wrap items-center gap-1.5 text-sm">
            {isFlat ? (
              <Minus className="h-4 w-4 text-muted-foreground" />
            ) : isPositive ? (
              <TrendingUp className="h-4 w-4 text-positive" />
            ) : (
              <TrendingDown className="h-4 w-4 text-negative" />
            )}
            <span
              className={`font-medium tabular-nums ${
                isFlat ? 'text-muted-foreground' : isPositive ? 'text-positive' : 'text-negative'
              }`}
            >
              {isPositive && !isFlat ? '+' : ''}
              {formatINR(changeAbsolute.toFixed(4))}
            </span>
            {changePct !== null && (
              <span className="text-muted-foreground">
                ({isPositive && !isFlat ? '+' : ''}
                {changePct.toFixed(1)}%)
              </span>
            )}
            <span className="text-muted-foreground">this {periodLabel}</span>
          </div>
        )}

        {isError ? (
          <div className="h-56 flex items-center justify-center text-sm text-negative">
            Couldn't load your net worth trend. Try again shortly.
          </div>
        ) : isLoading ? (
          <div className="h-56 flex items-center justify-center text-sm text-muted-foreground">
            Loading…
          </div>
        ) : chartData.length < 2 ? (
          <div className="h-56 grid place-items-center text-center text-sm text-muted-foreground border border-dashed rounded-md px-4">
            <div>
              <p>Come back tomorrow to see your net worth trend.</p>
              <p className="mt-1 text-xs">We snapshot your net worth once a day.</p>
            </div>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="gradNetWorthTrend" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--foreground))" stopOpacity={0.22} />
                  <stop offset="55%" stopColor="hsl(var(--foreground))" stopOpacity={0.06} />
                  <stop offset="100%" stopColor="hsl(var(--foreground))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="2 4" stroke="hsl(var(--border))" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))', fontFamily: 'JetBrains Mono' }}
                axisLine={false}
                tickLine={false}
                interval="preserveStartEnd"
                minTickGap={64}
                dy={6}
              />
              <YAxis
                tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))', fontFamily: 'JetBrains Mono' }}
                axisLine={false}
                tickLine={false}
                width={72}
                tickFormatter={(v: number) =>
                  v >= 10_000_000
                    ? `₹${(v / 10_000_000).toFixed(1)}Cr`
                    : v >= 100_000
                      ? `₹${(v / 100_000).toFixed(1)}L`
                      : v >= 1_000
                        ? `₹${(v / 1_000).toFixed(0)}K`
                        : `₹${v.toFixed(0)}`
                }
              />
              <Tooltip
                cursor={{ stroke: 'hsl(var(--foreground))', strokeWidth: 1, strokeDasharray: '3 3', strokeOpacity: 0.4 }}
                contentStyle={{
                  background: 'hsl(var(--popover))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                  fontSize: 12,
                  padding: '10px 12px',
                }}
                formatter={(v: number) => [formatINR(v.toFixed(4)), 'Net worth']}
                labelStyle={{
                  color: 'hsl(var(--muted-foreground))',
                  marginBottom: 4,
                  fontSize: 10,
                  textTransform: 'uppercase',
                  letterSpacing: '0.1em',
                }}
              />
              <Area
                type="monotone"
                dataKey="value"
                stroke="hsl(var(--foreground))"
                strokeWidth={2}
                fill="url(#gradNetWorthTrend)"
                dot={chartData.length <= 10 ? { r: 2.5, fill: 'hsl(var(--foreground))', stroke: 'hsl(var(--card))', strokeWidth: 1.5 } : false}
                activeDot={{ r: 5, fill: 'hsl(var(--foreground))', stroke: 'hsl(var(--card))', strokeWidth: 2 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
