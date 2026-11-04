import { Bar, BarChart, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Decimal, type SafeToInvestSummary } from '@everypaisa/shared';
import { lakh, monthLabel } from './safeToInvestView';

interface Props {
  data: SafeToInvestSummary;
  onPickMonth: (month: string) => void;
}

interface Row {
  month: string;
  label: string;
  inflow: number | null;
  /** Height of the placeholder drawn for a month with no data. */
  gap: number | null;
  lean: boolean;
  source: string;
}

function ChartTip({ active, payload }: { active?: boolean; payload?: { payload: Row }[] }) {
  const row = active ? payload?.[0]?.payload : undefined;
  if (!row) return null;
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-sm">
      <div className="font-medium">{monthLabel(row.month, true)}</div>
      <div className="text-muted-foreground mt-0.5">
        {row.inflow === null
          ? 'No bank data. Click to type the total.'
          : `${lakh(String(row.inflow))}${row.source === 'OVERRIDE' ? ' (typed by you)' : ''}. Click for credits.`}
      </div>
    </div>
  );
}

/**
 * Twelve months of income as bars, the lean-month line across them. Bars
 * under the line are amber; months with no bank data are dashed outlines,
 * so a gap never reads as a ₹0 month. Clicking a month opens its credits.
 */
export function InflowChart({ data, onPickMonth }: Props) {
  // Chart heights only: money maths stays in Decimal on the server.
  const toNum = (v: string | null) => (v == null ? null : new Decimal(v).toDecimalPlaces(0).toNumber());
  const placeholder = toNum(data.typicalInflow) ?? toNum(data.leanInflow) ?? 0;
  const rows: Row[] = data.months.map((m) => ({
    month: m.month,
    label: monthLabel(m.month),
    inflow: toNum(m.inflow),
    gap: m.source === 'GAP' ? placeholder : null,
    lean: m.lean,
    source: m.source,
  }));
  const lean = data.basis === 'BANK' ? toNum(data.leanInflow) : null;

  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={rows} margin={{ top: 18, right: 8, bottom: 0, left: 0 }} barCategoryGap="22%">
        <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
        <YAxis
          width={52}
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
          tickFormatter={(v: number) => lakh(String(v))}
        />
        <Tooltip cursor={{ fill: 'hsl(var(--muted))', opacity: 0.4 }} content={<ChartTip />} />
        {lean !== null && (
          <ReferenceLine
            y={lean}
            stroke="hsl(var(--warning))"
            strokeDasharray="5 4"
            ifOverflow="extendDomain"
          />
        )}
        <Bar dataKey="inflow" stackId="m" radius={[4, 4, 0, 0]} cursor="pointer" onClick={(r: Row) => onPickMonth(r.month)}>
          {rows.map((r) => (
            <Cell
              key={r.month}
              fill={r.lean ? 'hsl(var(--warning))' : 'hsl(var(--muted-foreground))'}
              fillOpacity={r.lean ? 0.9 : 0.55}
            />
          ))}
        </Bar>
        <Bar
          dataKey="gap"
          stackId="m"
          fill="transparent"
          stroke="hsl(var(--muted-foreground))"
          strokeDasharray="3 3"
          strokeOpacity={0.6}
          radius={[4, 4, 0, 0]}
          cursor="pointer"
          onClick={(r: Row) => onPickMonth(r.month)}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
