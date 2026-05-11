import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from 'recharts';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { formatINR, toDecimal } from '@portfolioos/shared';
import type { LiabilitiesVsAssets } from '@/api/analytics.api';
import { CHART_COLORS, shortInr } from '../chartColors';

const TOOLTIP_STYLE = {
  background: 'hsl(var(--popover))',
  border: '1px solid hsl(var(--border))',
  borderRadius: '8px',
  fontSize: 12,
  padding: '10px 12px',
  boxShadow: '0 12px 28px -16px hsl(var(--shadow-color) / 0.35)',
};

export function LiabilitiesVsAssetsCard({ data }: { data: LiabilitiesVsAssets }) {
  const a = toDecimal(data.assets);
  const l = toDecimal(data.liabilities);
  const n = toDecimal(data.netWorth);
  const ratio = a.gt(0) ? l.dividedBy(a).times(100).toNumber() : 0;
  const chart = [
    { name: 'Assets', value: a.toNumber() },
    { name: 'Liabilities', value: l.toNumber() },
    { name: 'Net worth', value: n.toNumber() },
  ];
  return (
    <Card>
      <CardHeader className="pb-2">
        <p className="text-[10px] uppercase tracking-kerned text-accent-ink/80 mb-1">Balance sheet</p>
        <CardTitle>Assets vs liabilities</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={chart} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="2 4" stroke="hsl(var(--border))" vertical={false} />
            <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} width={72} tickFormatter={shortInr} />
            <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => formatINR(v.toFixed(4))} />
            <Bar dataKey="value" radius={[6, 6, 0, 0]}>
              <Cell fill={CHART_COLORS[2]!} />
              <Cell fill={CHART_COLORS[3]!} />
              <Cell fill={CHART_COLORS[0]!} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
          <div>
            <p className="text-muted-foreground">Assets</p>
            <p className="font-semibold tabular-nums">{formatINR(data.assets)}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Liabilities</p>
            <p className="font-semibold tabular-nums text-red-600 dark:text-red-400">{formatINR(data.liabilities)}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Net worth</p>
            <p className="font-semibold tabular-nums">{formatINR(data.netWorth)}</p>
          </div>
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">
          Debt-to-asset ratio: {ratio.toFixed(1)}%
          {ratio > 50 ? ' — high leverage' : ratio > 30 ? ' — moderate leverage' : ' — comfortable'}
        </p>
      </CardContent>
    </Card>
  );
}
