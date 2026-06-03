/**
 * Benchmark comparison renderer — handles both /trailing (returns per
 * benchmark per range) and /point-to-point (value at two dates). Drives
 * a single shared view since the upstream payloads share an envelope.
 *
 * Trailing → bar chart of % return by range, grouped per benchmark + a
 * detail table. Point-to-point → side-by-side cards showing start /
 * end values and absolute / percentage change.
 */

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
  Cell,
} from 'recharts';
import { CHART_COLORS, colorFor } from '@/pages/analytics/chartColors';
import {
  asArray,
  asNumber,
  asString,
  fmtDate,
  fmtMoney,
  isObj,
  KpiTile,
  Pill,
  SectionHeader,
  shortInr,
  toneFor,
  type Tone,
} from './shared';

const TRAILING_RANGES = ['1M', '3M', '6M', '9M', '1Y', '2Y', '3Y', '5Y', '7Y', '10Y'];

interface TrailingRow {
  range: string;
  [benchmark: string]: number | string;
}

interface BenchmarkTrailing {
  code: string;
  name: string;
  asOf: string | null;
  ranges: Record<string, { return: number | null; absoluteReturn: number | null }>;
}

function readTrailing(data: unknown): BenchmarkTrailing[] {
  if (!isObj(data)) return [];
  return Object.entries(data).map(([key, raw]) => {
    const obj = isObj(raw) ? raw : {};
    const ranges: BenchmarkTrailing['ranges'] = {};
    const r = isObj(obj['ranges']) ? obj['ranges'] : {};
    for (const [rangeKey, val] of Object.entries(r)) {
      if (!isObj(val)) continue;
      ranges[rangeKey] = {
        return: asNumber(val['return']),
        absoluteReturn: asNumber(val['absoluteReturn']),
      };
    }
    return {
      code: asString(obj['benchmarkCode']) ?? key,
      name: asString(obj['benchmarkName']) ?? key,
      asOf: asString(obj['asOf']),
      ranges,
    };
  });
}

interface BenchmarkP2P {
  code: string;
  name: string;
  point1: { date: string | null; value: number | null };
  point2: { date: string | null; value: number | null };
  absoluteChange: number | null;
  percentageChange: number | null;
  days: number | null;
}

function readP2P(data: unknown): BenchmarkP2P[] {
  if (!isObj(data)) return [];
  return Object.entries(data).map(([key, raw]) => {
    const obj = isObj(raw) ? raw : {};
    const p1 = isObj(obj['point_1']) ? obj['point_1'] : {};
    const p2 = isObj(obj['point_2']) ? obj['point_2'] : {};
    return {
      code: asString(obj['benchmarkCode']) ?? key,
      name: asString(obj['benchmarkName']) ?? key,
      point1: { date: asString(p1['date']), value: asNumber(p1['value']) },
      point2: { date: asString(p2['date']), value: asNumber(p2['value']) },
      absoluteChange: asNumber(obj['absoluteChange']),
      percentageChange: asNumber(obj['percentageChange']),
      days: asNumber(obj['days']),
    };
  });
}

export function BenchmarkTrailingView({ data }: { data: unknown }) {
  if (!isObj(data)) return null;
  const status = isObj(data['status']) ? data['status'] : null;
  const inner = data['data'] ?? data;
  const benchmarks = readTrailing(inner);
  if (benchmarks.length === 0) {
    return (
      <div className="rounded-md border border-border/70 bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground">
        No benchmark rows returned. Check the request body — sandbox accepts codes like{' '}
        <code className="font-mono">OB163</code> (NIFTY 50 TRI) or{' '}
        <code className="font-mono">OB48</code> (NIFTY Midcap 150 TRI).
      </div>
    );
  }

  // Build wide table: rows are ranges, columns are benchmarks (return %).
  const presentRanges = TRAILING_RANGES.filter((r) =>
    benchmarks.some((b) => b.ranges[r] !== undefined),
  );

  // Chart data — one row per range, one numeric key per benchmark.
  const chartRows: TrailingRow[] = presentRanges.map((range) => {
    const row: TrailingRow = { range };
    for (const b of benchmarks) {
      const v = b.ranges[range];
      if (v?.return != null) row[b.code] = v.return;
    }
    return row;
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <SectionHeader
          title="Trailing benchmark returns"
          subtitle={`${benchmarks.length} benchmark${benchmarks.length === 1 ? '' : 's'} · returns are cumulative % over each range`}
        />
        {status && (
          <Pill tone={asNumber(status['code']) === 200 ? 'positive' : 'warn'}>
            {asString(status['message']) ?? `HTTP ${asString(status['code']) ?? ''}`}
          </Pill>
        )}
      </div>

      <div className="rounded-xl border border-border/70 bg-card/40 p-4">
        <div className="h-[320px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartRows} margin={{ top: 8, right: 16, bottom: 4, left: 8 }}>
              <CartesianGrid strokeDasharray="2 4" stroke="hsl(var(--border))" />
              <XAxis dataKey="range" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis
                tick={{ fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v: number) => `${v}%`}
              />
              <Tooltip
                formatter={(v: number, name: string) => [
                  `${v.toFixed(2)}%`,
                  benchmarks.find((b) => b.code === name)?.name ?? name,
                ]}
              />
              <Legend
                wrapperStyle={{ fontSize: 11 }}
                formatter={(value) =>
                  benchmarks.find((b) => b.code === value)?.name ?? value
                }
              />
              {benchmarks.map((b, i) => (
                <Bar key={b.code} dataKey={b.code} fill={colorFor(i)} radius={[3, 3, 0, 0]} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="rounded-xl border border-border/70 overflow-hidden bg-card/40">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/30 text-[10.5px] uppercase tracking-kerned text-muted-foreground">
                <th className="px-3 py-2 text-left font-medium">Benchmark</th>
                {presentRanges.map((r) => (
                  <th key={r} className="px-3 py-2 text-right font-medium">
                    {r}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {benchmarks.map((b, i) => (
                <tr key={b.code} className="border-b last:border-0 hover:bg-muted/20">
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ background: colorFor(i) }}
                        aria-hidden="true"
                      />
                      <div className="min-w-0">
                        <div className="font-medium text-sm">{b.name}</div>
                        <div className="text-[10.5px] font-mono text-muted-foreground">
                          {b.code}
                          {b.asOf ? ` · as of ${fmtDate(b.asOf)}` : ''}
                        </div>
                      </div>
                    </div>
                  </td>
                  {presentRanges.map((r) => {
                    const v = b.ranges[r];
                    const ret = v?.return ?? null;
                    const abs = v?.absoluteReturn ?? null;
                    const tone: Tone = toneFor(ret);
                    return (
                      <td key={r} className="px-3 py-2.5 text-right">
                        <div
                          className={`text-sm font-medium tabular-nums ${
                            tone === 'positive'
                              ? 'text-positive'
                              : tone === 'negative'
                              ? 'text-negative'
                              : 'text-muted-foreground'
                          }`}
                        >
                          {ret != null ? `${ret.toFixed(2)}%` : '—'}
                        </div>
                        {abs != null && (
                          <div className="text-[10.5px] text-muted-foreground tabular-nums">
                            {shortInr(abs)}
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="text-[11px] text-muted-foreground">
        Bar height = cumulative return % over the range. Absolute returns shown beneath each cell
        assume a notional ₹1L investment.
      </div>
    </div>
  );
}

export function BenchmarkP2PView({ data }: { data: unknown }) {
  if (!isObj(data)) return null;
  const status = isObj(data['status']) ? data['status'] : null;
  const inner = data['data'] ?? data;
  const items = readP2P(inner);
  if (items.length === 0) {
    return (
      <div className="rounded-md border border-border/70 bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground">
        No benchmark data for those dates. Try wider points or a different benchmark code.
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <SectionHeader
          title="Point-to-point comparison"
          subtitle={`${items.length} benchmark${items.length === 1 ? '' : 's'}`}
        />
        {status && (
          <Pill tone={asNumber(status['code']) === 200 ? 'positive' : 'warn'}>
            {asString(status['message']) ?? `HTTP ${asString(status['code']) ?? ''}`}
          </Pill>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {items.map((item, i) => {
          const tone: Tone = toneFor(item.percentageChange);
          return (
            <div
              key={item.code}
              className="rounded-xl border border-border/70 bg-card/40 p-4 space-y-3"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-semibold text-sm">{item.name}</div>
                  <div className="text-[10.5px] font-mono text-muted-foreground">
                    {item.code}
                  </div>
                </div>
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ background: CHART_COLORS[i % CHART_COLORS.length] }}
                  aria-hidden="true"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <KpiTile
                  label="Start value"
                  value={
                    <span className="text-base font-medium tabular-nums">
                      {item.point1.value != null
                        ? item.point1.value.toLocaleString('en-IN', {
                            maximumFractionDigits: 2,
                          })
                        : '—'}
                    </span>
                  }
                  hint={fmtDate(item.point1.date)}
                />
                <KpiTile
                  label="End value"
                  value={
                    <span className="text-base font-medium tabular-nums">
                      {item.point2.value != null
                        ? item.point2.value.toLocaleString('en-IN', {
                            maximumFractionDigits: 2,
                          })
                        : '—'}
                    </span>
                  }
                  hint={fmtDate(item.point2.date)}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <KpiTile
                  label="Absolute change"
                  value={fmtMoney(item.absoluteChange)}
                  tone={tone}
                />
                <KpiTile
                  label="% change"
                  value={
                    item.percentageChange != null
                      ? `${item.percentageChange.toFixed(2)}%`
                      : '—'
                  }
                  tone={tone}
                  hint={item.days != null ? `over ${item.days} days` : undefined}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
