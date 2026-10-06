import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell, ReferenceLine } from 'recharts';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { formatINR, toDecimal } from '@everypaisa/shared';
import type { CashflowMonth } from '@/api/analytics.api';
import { CHART_COLORS, shortInr } from '../chartColors';
import { AnalyticsInfo } from '../AnalyticsInfo';

const TOOLTIP_STYLE = {
  background: 'hsl(var(--popover))',
  border: '1px solid hsl(var(--border))',
  borderRadius: '8px',
  fontSize: 12,
  padding: '10px 12px',
  boxShadow: '0 12px 28px -16px hsl(var(--shadow-color) / 0.35)',
};

/**
 * Money moving in and out of your investments, by month.
 *
 * Deliberately NOT green/red. "Net" here is cash coming back to you minus cash
 * you put in, so a month of disciplined SIPs is negative — and green-for-positive
 * told a regular investor that saving was the bad outcome. Two neutral colours
 * and a legend that names them instead, so the chart reports what happened and
 * leaves the judgement to the reader.
 */
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
        <CardTitle className="flex items-center gap-1.5">Money in and out<AnalyticsInfo k="netFlow" /></CardTitle>
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
                  `You invested ${formatINR((p.payload?.outflow ?? 0).toFixed(4))}  ·  came back to you ${formatINR((p.payload?.inflow ?? 0).toFixed(4))}`,
                  '',
                ]}
              />
              <Bar dataKey="net" radius={[2, 2, 2, 2]}>
                {data.map((d, i) => (
                  <Cell key={i} fill={d.net >= 0 ? CHART_COLORS[3]! : CHART_COLORS[0]!} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
        {data.length > 0 && (
          <div className="mt-2 flex items-center gap-4 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-sm" style={{ background: CHART_COLORS[0]! }} />
              Months you invested more than you took out
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-sm" style={{ background: CHART_COLORS[3]! }} />
              Months money came back to you
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
