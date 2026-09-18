import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from 'recharts';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { formatINR, formatPercent, toDecimal, ASSET_CLASS_LABELS } from '@everypaisa/shared';
import type { HoldingRankRow, ConcentrationRow, AssetClassXirrRow } from '@/api/analytics.api';
import { POS_COLOR, NEG_COLOR } from '../chartColors';
import { AnalyticsInfo } from '../AnalyticsInfo';

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

/**
 * Best and worst holdings in one table, ranked by RUPEES gained or lost.
 *
 * This replaces separate "top 10 winners" and "top 10 losers" tables ranked by
 * percentage. Percentage ranking flatters small positions: a ₹5,000 punt down
 * 40% outranked a ₹6 lakh fund quietly losing ₹40,000, so the table drew the
 * eye to the loss that did not matter. Percentage is still shown, as a column.
 */
function rupeeRank(rows: HoldingRankRow[]): HoldingRankRow[] {
  return [...rows].sort((a, b) => toDecimal(b.pnl).comparedTo(toDecimal(a.pnl)));
}

export function BestAndWorst({
  winners,
  losers,
  limit = 5,
}: {
  winners: HoldingRankRow[];
  losers: HoldingRankRow[];
  limit?: number;
}) {
  // The API ranks each list by %, so re-rank the union by rupees and take the
  // extremes of that ordering instead of trusting either list's own order.
  const ranked = rupeeRank([...winners, ...losers]);
  const best = ranked.filter((r) => toDecimal(r.pnl).gt(0)).slice(0, limit);
  const worst = rupeeRank(ranked.filter((r) => toDecimal(r.pnl).isNegative()))
    .reverse()
    .slice(0, limit);
  const rows = [...worst, ...best];

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-1.5">
          Best and worst holdings<AnalyticsInfo k="bestAndWorst" />
        </CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">No holdings yet</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm rtable">
              <thead>
                <tr className="border-b text-muted-foreground text-xs">
                  <th className="text-left py-1.5 pr-3 font-medium">Asset</th>
                  <th className="text-left py-1.5 pr-3 font-medium max-sm:hidden sm:table-cell">Class</th>
                  <th className="text-right py-1.5 pr-3 font-medium">Value</th>
                  <th className="text-right py-1.5 pr-3 font-medium">Gain / loss</th>
                  <th className="text-right py-1.5 font-medium">%</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const down = toDecimal(r.pnl).isNegative();
                  const tone = down ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400';
                  return (
                    <tr key={`${r.assetName}-${i}`} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                      <td data-label="Asset" className="py-2 pr-3 sm:truncate sm:max-w-[180px] min-w-0 break-words font-medium">{r.assetName}</td>
                      <td data-label="Class" className="py-2 pr-3 max-sm:!hidden sm:table-cell text-xs text-muted-foreground">{ClassLabel(r.assetClass)}</td>
                      <td data-label="Value" className="py-2 pr-3 text-right tabular-nums">{formatINR(r.currentValue)}</td>
                      <td data-label="Gain / loss" className={`py-2 pr-3 text-right tabular-nums font-medium ${tone}`}>
                        {formatINR(r.pnl, { showSign: true })}
                      </td>
                      <td data-label="%" className={`py-2 text-right tabular-nums ${tone}`}>
                        {formatPercent(r.pnlPct, 1, true)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function ConcentrationCard({ rows }: { rows: ConcentrationRow[] }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-1.5">Concentration<AnalyticsInfo k="concentration" /></CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">No holdings yet</div>
        ) : (
          <div className="space-y-2">
            {/* The headline in words — the bars below are the detail behind it. */}
            <p className="mb-3 text-sm text-foreground">
              Your top {rows.length} holdings are{' '}
              <span className="font-semibold">{rows[rows.length - 1]!.cumulativePct.toFixed(0)}%</span> of
              everything you own.
            </p>
            {rows.map((r, i) => (
              <div key={`${r.assetName}-${i}`} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="truncate font-medium max-w-[60%]">{r.assetName}</span>
                  <span className="tabular-nums text-muted-foreground">{r.pct.toFixed(1)}%</span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full bg-accent"
                    style={{ width: `${Math.min(r.pct, 100)}%` }}
                  />
                </div>
              </div>
            ))}
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
        <CardTitle className="flex items-center gap-1.5">XIRR by asset class<AnalyticsInfo k="xirrByClass" /></CardTitle>
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

