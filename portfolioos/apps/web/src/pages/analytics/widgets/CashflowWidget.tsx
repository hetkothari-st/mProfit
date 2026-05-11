import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell, ReferenceLine } from 'recharts';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { formatINR, toDecimal } from '@portfolioos/shared';
import type { CashflowMonth } from '@/api/analytics.api';
import { POS_COLOR, NEG_COLOR, shortInr } from '../chartColors';

const TOOLTIP_STYLE = {
  background: 'hsl(var(--popover))',
  border: '1px solid hsl(var(--border))',
  borderRadius: '8px',
  fontSize: 12,
  padding: '10px 12px',
  boxShadow: '0 12px 28px -16px hsl(var(--shadow-color) / 0.35)',
};

export function CashflowWaterfall({ rows }: { rows: CashflowMonth[] }) {
  // True waterfall is awkward in Recharts; render net as a signed bar
  // and keep inflow/outflow visible in the tooltip.
  const data = rows.slice(-12).map((r) => ({
    month: r.month,
    net: toDecimal(r.net).toNumber(),
    inflow: toDecimal(r.inflow).toNumber(),
    outflow: toDecimal(r.outflow).toNumber(),
  }));
  return (
    <Card>
      <CardHeader className="pb-2">
        <p className="text-[10px] uppercase tracking-kerned text-accent-ink/80 mb-1">Cashflow</p>
        <CardTitle>Net flow by month</CardTitle>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <div className="h-56 grid place-items-center text-sm text-muted-foreground border border-dashed rounded-md">
            No cashflow recorded
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="2 4" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} minTickGap={24} />
              <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} width={72} tickFormatter={shortInr} />
              <ReferenceLine y={0} stroke="hsl(var(--border))" />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                formatter={(_v: number, _n: string, p: { payload?: { inflow?: number; outflow?: number; net?: number } }) => [
                  `In ${formatINR((p.payload?.inflow ?? 0).toFixed(4))}  ·  Out ${formatINR((p.payload?.outflow ?? 0).toFixed(4))}  ·  Net ${formatINR((p.payload?.net ?? 0).toFixed(4))}`,
                  '',
                ]}
              />
              <Bar dataKey="net" radius={[2, 2, 2, 2]}>
                {data.map((d, i) => (
                  <Cell key={i} fill={d.net >= 0 ? POS_COLOR : NEG_COLOR} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
