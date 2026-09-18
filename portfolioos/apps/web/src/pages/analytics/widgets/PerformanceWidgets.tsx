import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { formatINR, toDecimal } from '@everypaisa/shared';
import type { ValuationPoint } from '@/api/analytics.api';
import { shortInr } from '../chartColors';
import { AnalyticsInfo } from '../AnalyticsInfo';

const TOOLTIP_STYLE = {
  background: 'hsl(var(--popover))',
  border: '1px solid hsl(var(--border))',
  borderRadius: '8px',
  fontSize: 12,
  padding: '10px 12px',
  boxShadow: '0 12px 28px -16px hsl(var(--shadow-color) / 0.35)',
};

interface ValueLineProps {
  points: ValuationPoint[];
}

export function PortfolioValueLine({ points }: ValueLineProps) {
  const data = points.map((p) => ({
    label: new Date(p.date).toLocaleDateString('en-IN', { month: 'short', year: '2-digit' }),
    invested: toDecimal(p.cost).toNumber(),
    value: toDecimal(p.value).toNumber(),
  }));
  return (
    <Card className="lg:col-span-2">
      <CardHeader className="pb-2">
        <p className="text-[10px] uppercase tracking-kerned text-accent-ink/80 mb-1">Trajectory</p>
        <CardTitle className="flex items-center gap-1.5">Portfolio value over time<AnalyticsInfo k="valueOverTime" /></CardTitle>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <div className="h-64 grid place-items-center text-sm text-muted-foreground border border-dashed rounded-md">
            No history yet
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="anaValueGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--foreground))" stopOpacity={0.22} />
                  <stop offset="55%" stopColor="hsl(var(--foreground))" stopOpacity={0.06} />
                  <stop offset="100%" stopColor="hsl(var(--foreground))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="2 4" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} minTickGap={48} />
              <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} width={72} tickFormatter={shortInr} />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                formatter={(v: number, name: string) => [formatINR(v.toFixed(4)), name === 'value' ? 'Market value' : 'Invested']}
              />
              <Area type="monotone" dataKey="invested" stroke="hsl(var(--muted-foreground))" strokeWidth={1.25} strokeDasharray="4 4" fill="transparent" dot={false} />
              <Area type="monotone" dataKey="value" stroke="hsl(var(--foreground))" strokeWidth={2} fill="url(#anaValueGrad)" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
