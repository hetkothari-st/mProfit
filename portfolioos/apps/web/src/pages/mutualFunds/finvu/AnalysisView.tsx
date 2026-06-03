/**
 * /mutual-fund/analysis renderer — headline tiles + 2 pies (scheme
 * category, scheme type). Compact view since the analysis endpoint
 * returns aggregates rather than per-holding detail.
 */

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { colorFor } from '@/pages/analytics/chartColors';
import {
  asArray,
  asNumber,
  asString,
  IntTile,
  isObj,
  MoneyTile,
  SectionHeader,
  shortInr,
} from './shared';

interface Slice {
  label: string;
  value: number;
  count: number;
}

function readSlices(arr: unknown, labelKey: string): Slice[] {
  return asArray<Record<string, unknown>>(arr)
    .map((r) => {
      const label = asString(r[labelKey]);
      const value = asNumber(r['currentValue']);
      const count = asNumber(r['totalHoldings']);
      if (!label || value == null) return null;
      return { label, value, count: count ?? 0 };
    })
    .filter((s): s is Slice => s !== null);
}

export function AnalysisView({ data }: { data: unknown }) {
  if (!isObj(data)) return null;
  const categories = readSlices(data['schemeCategory'], 'schemeCategory');
  const types = readSlices(data['schemeType'], 'schemeTypes');
  const totalValue = categories.reduce((s, c) => s + c.value, 0);

  return (
    <div className="space-y-5">
      <div>
        <SectionHeader
          title="Analysis overview"
          subtitle={
            asString(data['fipName']) ? `Source FIPs: ${asString(data['fipName'])}` : undefined
          }
        />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <MoneyTile label="Current value" value={data['currentValue']} />
          <MoneyTile label="Cost value" value={data['costValue']} />
          <IntTile label="Total holdings" value={data['totalHoldings']} />
          <IntTile label="FI data fetched" value={data['totalFiData']} />
        </div>
      </div>

      {(categories.length > 0 || types.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {categories.length > 0 && (
            <SlicesCard
              title="By scheme category"
              subtitle="Large-cap, mid-cap, liquid, etc."
              slices={categories}
              totalValue={totalValue}
            />
          )}
          {types.length > 0 && (
            <SlicesCard
              title="By scheme type"
              subtitle="Equity vs debt vs hybrid"
              slices={types}
              totalValue={types.reduce((s, t) => s + t.value, 0)}
            />
          )}
        </div>
      )}
    </div>
  );
}

function SlicesCard({
  title,
  subtitle,
  slices,
  totalValue,
}: {
  title: string;
  subtitle?: string;
  slices: Slice[];
  totalValue: number;
}) {
  return (
    <div className="rounded-xl border border-border/70 bg-card/40 p-4">
      <SectionHeader title={title} subtitle={subtitle} />
      <div className="h-[200px]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={slices}
              dataKey="value"
              nameKey="label"
              cx="50%"
              cy="50%"
              innerRadius={45}
              outerRadius={75}
              paddingAngle={2}
            >
              {slices.map((_, i) => (
                <Cell key={i} fill={colorFor(i)} />
              ))}
            </Pie>
            <Tooltip
              formatter={(v: number, _name, p) => [
                `${shortInr(v)} · ${
                  totalValue > 0 ? ((v / totalValue) * 100).toFixed(1) : '0'
                }%`,
                (p.payload as Slice).label,
              ]}
            />
            <Legend
              verticalAlign="bottom"
              wrapperStyle={{ fontSize: 11 }}
              formatter={(value) => <span className="text-muted-foreground">{value}</span>}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <table className="w-full mt-2 text-xs">
        <tbody>
          {slices.map((s, i) => (
            <tr key={s.label} className="border-t first:border-0">
              <td className="py-1.5">
                <div className="flex items-center gap-2">
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ background: colorFor(i) }}
                    aria-hidden="true"
                  />
                  <span className="text-foreground">{s.label}</span>
                </div>
              </td>
              <td className="py-1.5 text-right tabular-nums text-muted-foreground">
                {s.count} fund{s.count === 1 ? '' : 's'}
              </td>
              <td className="py-1.5 text-right tabular-nums font-medium">{shortInr(s.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
