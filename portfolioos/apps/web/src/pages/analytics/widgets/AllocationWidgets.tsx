import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { formatINR, toDecimal } from '@everypaisa/shared';
import type { AllocationSlice, SectorSlice } from '@/api/analytics.api';
import { CHART_COLORS, colorFor } from '../chartColors';
import { AnalyticsInfo } from '../AnalyticsInfo';

const TOOLTIP_STYLE = {
  background: 'hsl(var(--popover))',
  border: '1px solid hsl(var(--border))',
  borderRadius: '8px',
  fontSize: 12,
  padding: '10px 12px',
  boxShadow: '0 12px 28px -16px hsl(var(--shadow-color) / 0.35)',
};

interface ClassPieProps {
  slices: AllocationSlice[];
}

export function AllocationByClassPie({ slices }: ClassPieProps) {
  const data = slices.filter((s) => toDecimal(s.value).gt(0));
  return (
    <Card>
      <CardHeader className="pb-2">
        <p className="text-[10px] uppercase tracking-kerned text-accent-ink/80 mb-1">Composition</p>
        <CardTitle className="flex items-center gap-1.5">Allocation by class<AnalyticsInfo k="allocationByClass" /></CardTitle>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <div className="h-56 grid place-items-center text-sm text-muted-foreground border border-dashed rounded-md">
            No holdings yet
          </div>
        ) : (
          <div>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={data}
                  dataKey="pct"
                  nameKey="label"
                  cx="50%"
                  cy="50%"
                  innerRadius={56}
                  outerRadius={96}
                  paddingAngle={2}
                >
                  {data.map((entry, i) => (
                    <Cell key={entry.key} fill={colorFor(i)} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  formatter={(_v: number, _n: string, p: { payload?: { label?: string; value?: string; pct?: number } }) => [
                    `${formatINR(p.payload?.value ?? '0')} (${(p.payload?.pct ?? 0).toFixed(1)}%)`,
                    p.payload?.label ?? '',
                  ]}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="mt-3 space-y-1.5 max-h-48 overflow-y-auto pr-1">
              {data.map((s, i) => (
                <div key={s.key} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="inline-block h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ background: colorFor(i) }} />
                    <span className="truncate text-muted-foreground">{s.label}</span>
                  </div>
                  <div className="flex items-center gap-2 ml-2 flex-shrink-0">
                    <span className="tabular-nums text-muted-foreground">{formatINR(s.value)}</span>
                    <span className="tabular-nums font-medium w-12 text-right">{s.pct.toFixed(1)}%</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface SectorPieProps {
  slices: SectorSlice[];
}

export function SectorPie({ slices }: SectorPieProps) {
  const data = slices.filter((s) => toDecimal(s.value).gt(0));
  return (
    <Card>
      <CardHeader className="pb-2">
        <p className="text-[10px] uppercase tracking-kerned text-accent-ink/80 mb-1">Equity exposure</p>
        <CardTitle className="flex items-center gap-1.5">Sector allocation<AnalyticsInfo k="sectorAllocation" /></CardTitle>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <div className="h-56 grid place-items-center text-sm text-muted-foreground border border-dashed rounded-md">
            No equity holdings to classify
          </div>
        ) : (
          <div>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={data}
                  dataKey="pct"
                  nameKey="sector"
                  cx="50%"
                  cy="50%"
                  outerRadius={92}
                  paddingAngle={1}
                  label={(entry: { pct: number }) => (entry.pct > 6 ? `${entry.pct.toFixed(0)}%` : '')}
                  labelLine={false}
                >
                  {data.map((entry, i) => (
                    <Cell key={entry.sector} fill={CHART_COLORS[(i + 2) % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  formatter={(_v: number, _n: string, p: { payload?: { sector?: string; value?: string; pct?: number } }) => [
                    `${formatINR(p.payload?.value ?? '0')} (${(p.payload?.pct ?? 0).toFixed(1)}%)`,
                    p.payload?.sector ?? '',
                  ]}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="mt-3 space-y-1.5 max-h-32 overflow-y-auto pr-1">
              {data.map((s, i) => (
                <div key={s.sector} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="inline-block h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ background: CHART_COLORS[(i + 2) % CHART_COLORS.length] }} />
                    <span className="truncate text-muted-foreground">{s.sector}</span>
                  </div>
                  <span className="tabular-nums font-medium w-12 text-right">{s.pct.toFixed(1)}%</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
