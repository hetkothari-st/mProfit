import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from 'recharts';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { formatINR, formatPercent, ASSET_CLASS_LABELS } from '@portfolioos/shared';
import type { HoldingRankRow, ConcentrationRow, AssetClassXirrRow } from '@/api/analytics.api';
import { POS_COLOR, NEG_COLOR } from '../chartColors';

const TOOLTIP_STYLE = {
  background: 'hsl(var(--popover))',
  border: '1px solid hsl(var(--border))',
  borderRadius: '8px',
  fontSize: 12,
  padding: '10px 12px',
  boxShadow: '0 12px 28px -16px hsl(var(--shadow-color) / 0.35)',
};

function ClassLabel(cls: string): string {
  return ASSET_CLASS_LABELS[cls as keyof typeof ASSET_CLASS_LABELS] ?? cls;
}

function HoldingRankTable({ title, rows, kind }: { title: string; rows: HoldingRankRow[]; kind: 'win' | 'lose' }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            {kind === 'win' ? 'No winners yet' : 'No losses recorded'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-muted-foreground text-xs">
                  <th className="text-left py-1.5 pr-3 font-medium">Asset</th>
                  <th className="text-left py-1.5 pr-3 font-medium hidden sm:table-cell">Class</th>
                  <th className="text-right py-1.5 pr-3 font-medium">Value</th>
                  <th className="text-right py-1.5 font-medium">Return</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={`${r.assetName}-${i}`} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                    <td className="py-2 pr-3 truncate max-w-[180px] font-medium">{r.assetName}</td>
                    <td className="py-2 pr-3 hidden sm:table-cell text-xs text-muted-foreground">{ClassLabel(r.assetClass)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{formatINR(r.currentValue)}</td>
                    <td className={`py-2 text-right tabular-nums font-medium ${r.pnlPct >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                      {formatPercent(r.pnlPct, 2, true)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function WinnersLosers({ winners, losers }: { winners: HoldingRankRow[]; losers: HoldingRankRow[] }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <HoldingRankTable title="Top 10 winners" rows={winners} kind="win" />
      <HoldingRankTable title="Top 10 losers" rows={losers} kind="lose" />
    </div>
  );
}

export function ConcentrationCard({ rows }: { rows: ConcentrationRow[] }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <p className="text-[10px] uppercase tracking-kerned text-accent-ink/80 mb-1">Risk lens</p>
        <CardTitle>Concentration — top {rows.length} holdings</CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">No holdings yet</div>
        ) : (
          <div className="space-y-2">
            {rows.map((r, i) => (
              <div key={`${r.assetName}-${i}`} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="truncate font-medium max-w-[60%]">{r.assetName}</span>
                  <span className="tabular-nums text-muted-foreground">
                    {r.pct.toFixed(1)}% · cum {r.cumulativePct.toFixed(1)}%
                  </span>
                </div>
                <div className="h-1.5 bg-muted/60 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${Math.min(r.pct, 100)}%`, background: 'hsl(213 53% 22%)' }}
                  />
                </div>
              </div>
            ))}
            {rows.length > 0 && (
              <p className="mt-3 text-[11px] text-muted-foreground">
                Top {rows.length} = {rows[rows.length - 1]!.cumulativePct.toFixed(1)}% of portfolio.
                {rows[rows.length - 1]!.cumulativePct > 60 && ' Highly concentrated — diversification review recommended.'}
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function AssetClassXirrBar({ rows }: { rows: AssetClassXirrRow[] }) {
  const data = rows
    .filter((r) => r.xirr != null)
    .map((r) => ({
      label: r.label,
      xirrPct: (r.xirr as number) * 100,
      invested: r.invested,
      currentValue: r.currentValue,
    }))
    .slice(0, 12);
  return (
    <Card>
      <CardHeader className="pb-2">
        <p className="text-[10px] uppercase tracking-kerned text-accent-ink/80 mb-1">Returns</p>
        <CardTitle>XIRR by asset class</CardTitle>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <div className="h-56 grid place-items-center text-sm text-muted-foreground border border-dashed rounded-md">
            Not enough cashflows to compute XIRR
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={Math.max(220, data.length * 30)}>
            <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="2 4" stroke="hsl(var(--border))" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} tickFormatter={(v: number) => `${v.toFixed(0)}%`} />
              <YAxis dataKey="label" type="category" tick={{ fontSize: 11, fill: 'hsl(var(--foreground))' }} axisLine={false} tickLine={false} width={120} />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                formatter={(v: number, _n: string, p: { payload?: { invested?: string; currentValue?: string } }) => [
                  `${v.toFixed(2)}% · ${formatINR(p.payload?.currentValue ?? '0')} value`,
                  'XIRR',
                ]}
              />
              <Bar dataKey="xirrPct" radius={[0, 4, 4, 0]}>
                {data.map((d, i) => (
                  <Cell key={i} fill={d.xirrPct >= 0 ? POS_COLOR : NEG_COLOR} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

