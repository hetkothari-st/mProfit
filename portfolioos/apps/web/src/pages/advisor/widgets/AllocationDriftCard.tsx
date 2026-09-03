import { useMemo } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Loader2, Scale } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Money } from '@/components/ui/money';
import { cn } from '@/lib/cn';
import { formatINR } from '@portfolioos/shared';
import { useThemeStore } from '@/stores/theme.store';
import { bucketLabel, type AllocationResponse } from '@/api/advisor.api';

// CRED-style paired palette — "current" reads as ink, "target" as the lime accent.
// Kept in the same hue families as DashboardPage so the two surfaces feel related.
const CHART_DARK = {
  current: 'hsl(0 0% 82%)',
  target: 'hsl(70 95% 65%)',
  over: 'hsl(4 85% 66%)',
  under: 'hsl(210 85% 65%)',
};

const CHART_LIGHT = {
  current: 'hsl(0 0% 28%)',
  target: 'hsl(70 80% 34%)',
  over: 'hsl(4 75% 45%)',
  under: 'hsl(210 75% 45%)',
};

/** A drift bigger than this many percentage points is worth acting on. */
const MATERIAL_DRIFT_PP = 5;

export interface AllocationDriftCardProps {
  data: AllocationResponse | undefined;
  isLoading: boolean;
  isError: boolean;
}

export function AllocationDriftCard({ data, isLoading, isError }: AllocationDriftCardProps) {
  const dark = useThemeStore((s) => s.dark);
  const C = dark ? CHART_DARK : CHART_LIGHT;

  // Union of every bucket that appears in current, target, or drift — a bucket
  // you hold nothing of but should (or vice versa) is exactly the interesting case.
  const rows = useMemo(() => {
    if (!data) return [];
    const byBucket = new Map<
      string,
      { bucket: string; label: string; currentPct: number; targetPct: number; driftPp: number; driftValue: string | null; currentValue: string | null }
    >();
    const ensure = (bucket: string) => {
      let row = byBucket.get(bucket);
      if (!row) {
        row = {
          bucket,
          label: bucketLabel(bucket),
          currentPct: 0,
          targetPct: 0,
          driftPp: 0,
          driftValue: null,
          currentValue: null,
        };
        byBucket.set(bucket, row);
      }
      return row;
    };
    // `?? []` on all three arrays, `?? 0` on every number: a partial payload
    // should collapse to the empty state, not throw inside a for…of.
    for (const c of data.current ?? []) {
      const row = ensure(c.bucket);
      row.currentPct = c.currentPct ?? 0;
      row.currentValue = c.currentValueInr ?? null;
    }
    for (const t of data.target ?? []) {
      ensure(t.bucket).targetPct = t.targetPct ?? 0;
    }
    for (const d of data.drift ?? []) {
      const row = ensure(d.bucket);
      row.currentPct = d.currentPct ?? 0;
      row.targetPct = d.targetPct ?? 0;
      row.driftPp = d.driftPp ?? 0;
      row.driftValue = d.driftValueInr ?? null;
    }
    // Biggest absolute drift first — the rows that demand attention lead.
    return [...byBucket.values()].sort((a, b) => Math.abs(b.driftPp) - Math.abs(a.driftPp));
  }, [data]);

  const worst = rows.length > 0 ? rows[0]! : null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-medium uppercase tracking-kerned text-accent-ink/85">
              Allocation
            </p>
            <CardTitle className="mt-1">Where you sit vs. your target</CardTitle>
          </div>
          {data && (
            <div className="text-right">
              <p className="text-[10px] font-medium uppercase tracking-kerned text-muted-foreground">
                Total value
              </p>
              <Money className="text-[15px] font-medium">{formatINR(data.totalValueInr)}</Money>
            </div>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        {isLoading && (
          <div className="flex h-56 items-center justify-center text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        )}

        {isError && !isLoading && (
          <p className="py-6 text-sm text-negative">
            Couldn't load your allocation. Try again shortly.
          </p>
        )}

        {!isLoading && !isError && rows.length === 0 && (
          <div className="grid h-40 place-items-center rounded-md border border-dashed text-center text-sm text-muted-foreground">
            <span className="max-w-sm px-4">
              No allocation yet. Add holdings and we'll measure them against your model portfolio.
            </span>
          </div>
        )}

        {!isLoading && !isError && rows.length > 0 && (
          <>
            {/* The backend flags this explicitly rather than leaving us to infer
                it from an all-zero target column. */}
            {data?.hasTargets === false && (
              <p className="rounded-lg border border-border/60 bg-muted/25 px-3 py-2.5 text-[13px] text-muted-foreground">
                No target weights are set yet, so every bucket below reads as a
                100% overweight. Take the risk assessment to get a model portfolio to measure
                against.
              </p>
            )}

            {data?.hasTargets !== false && worst && Math.abs(worst.driftPp) >= MATERIAL_DRIFT_PP && (
              <p className="flex items-start gap-2 rounded-lg border border-accent/25 bg-accent/[0.06] px-3 py-2.5 text-[13px] text-foreground">
                <Scale className="mt-0.5 h-4 w-4 shrink-0 text-accent-ink" strokeWidth={1.8} />
                <span>
                  Your largest gap is <strong className="font-medium">{worst.label}</strong> —{' '}
                  {worst.driftPp > 0 ? 'over' : 'under'}weight by{' '}
                  <span className="numeric">{Math.abs(worst.driftPp).toFixed(1)} pp</span>
                  {worst.driftValue ? (
                    <>
                      {' '}(<Money>{formatINR(worst.driftValue)}</Money>)
                    </>
                  ) : null}
                  .
                </span>
              </p>
            )}

            <ResponsiveContainer width="100%" height={Math.max(200, rows.length * 42)}>
              <BarChart
                data={rows}
                layout="vertical"
                margin={{ top: 4, right: 16, left: 4, bottom: 0 }}
                barGap={2}
              >
                <CartesianGrid strokeDasharray="2 4" stroke="hsl(var(--border))" horizontal={false} />
                <XAxis
                  type="number"
                  unit="%"
                  tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))', fontFamily: 'JetBrains Mono' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  type="category"
                  dataKey="label"
                  width={124}
                  tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  cursor={{ fill: 'hsl(var(--muted) / 0.35)' }}
                  contentStyle={{
                    background: 'hsl(var(--popover))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                    fontSize: 12,
                    padding: '10px 12px',
                    boxShadow: '0 12px 28px -16px hsl(var(--shadow-color) / 0.35)',
                  }}
                  itemStyle={{ color: 'hsl(var(--popover-foreground))' }}
                  labelStyle={{
                    color: 'hsl(var(--muted-foreground))',
                    marginBottom: 4,
                    fontSize: 10,
                    textTransform: 'uppercase',
                    letterSpacing: '0.1em',
                  }}
                  formatter={(v: number, name: string) => [
                    `${v.toFixed(1)}%`,
                    name === 'currentPct' ? 'Current' : 'Target',
                  ]}
                />
                <Legend
                  verticalAlign="bottom"
                  height={28}
                  iconType="circle"
                  iconSize={8}
                  formatter={(name: string) => (
                    <span style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))' }}>
                      {name === 'currentPct' ? 'Current' : 'Target'}
                    </span>
                  )}
                />
                <Bar dataKey="currentPct" radius={[0, 3, 3, 0]} barSize={9}>
                  {rows.map((r) => (
                    <Cell
                      key={r.bucket}
                      fill={
                        Math.abs(r.driftPp) < MATERIAL_DRIFT_PP
                          ? C.current
                          : r.driftPp > 0
                            ? C.over
                            : C.under
                      }
                    />
                  ))}
                </Bar>
                <Bar dataKey="targetPct" fill={C.target} radius={[0, 3, 3, 0]} barSize={9} />
              </BarChart>
            </ResponsiveContainer>

            {/* Readable fallback — the chart shows shape, the table carries the numbers. */}
            <div className="-mx-1 overflow-x-auto">
              <table className="w-full min-w-[460px] border-collapse text-[13px]">
                <thead>
                  <tr className="border-b border-border/70">
                    <th className="px-1 py-2 text-left text-[10px] font-medium uppercase tracking-kerned text-muted-foreground">
                      Bucket
                    </th>
                    <th className="px-1 py-2 text-right text-[10px] font-medium uppercase tracking-kerned text-muted-foreground">
                      Current
                    </th>
                    <th className="px-1 py-2 text-right text-[10px] font-medium uppercase tracking-kerned text-muted-foreground">
                      Target
                    </th>
                    <th className="px-1 py-2 text-right text-[10px] font-medium uppercase tracking-kerned text-muted-foreground">
                      Drift
                    </th>
                    <th className="px-1 py-2 text-right text-[10px] font-medium uppercase tracking-kerned text-muted-foreground">
                      In rupees
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const material = Math.abs(r.driftPp) >= MATERIAL_DRIFT_PP;
                    return (
                      <tr key={r.bucket} className="border-b border-border/40 last:border-0">
                        <td className="px-1 py-2 text-foreground">{r.label}</td>
                        <td className="numeric px-1 py-2 text-right text-muted-foreground">
                          {r.currentPct.toFixed(1)}%
                        </td>
                        <td className="numeric px-1 py-2 text-right text-muted-foreground">
                          {r.targetPct.toFixed(1)}%
                        </td>
                        <td
                          className={cn(
                            'numeric px-1 py-2 text-right font-medium',
                            !material
                              ? 'text-muted-foreground'
                              : r.driftPp > 0
                                ? 'text-negative'
                                : 'text-positive',
                          )}
                        >
                          {r.driftPp > 0 ? '+' : ''}
                          {r.driftPp.toFixed(1)} pp
                        </td>
                        <td className="px-1 py-2 text-right text-muted-foreground">
                          {r.driftValue ? (
                            <Money>{formatINR(r.driftValue, { showSign: true })}</Money>
                          ) : (
                            <span className="text-muted-foreground/60">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <p className="text-[12px] leading-relaxed text-muted-foreground">
              Drift is your current weight minus your target weight, in percentage points. Anything
              under {MATERIAL_DRIFT_PP} pp is usually noise — rebalancing it costs more in tax and
              charges than it gains.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
