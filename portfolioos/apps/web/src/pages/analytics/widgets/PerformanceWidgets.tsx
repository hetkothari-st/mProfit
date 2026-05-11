import {
  AreaChart, Area, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from 'recharts';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { formatINR, toDecimal } from '@portfolioos/shared';
import type { ValuationPoint, CostValueDriftPoint, BenchmarkPoint } from '@/api/analytics.api';
import { shortInr } from '../chartColors';

const TOOLTIP_STYLE = {
  background: 'hsl(var(--popover))',
  border: '1px solid hsl(var(--border))',
  borderRadius: '8px',
  fontSize: 12,
  padding: '10px 12px',
  boxShadow: '0 12px 28px -16px hsl(var(--shadow-color) / 0.35)',
};

interface ValueLineProps {
  points: ValuationPoint[];
}

export function PortfolioValueLine({ points }: ValueLineProps) {
  const data = points.map((p) => ({
    label: new Date(p.date).toLocaleDateString('en-IN', { month: 'short', year: '2-digit' }),
    invested: toDecimal(p.cost).toNumber(),
    value: toDecimal(p.value).toNumber(),
  }));
  return (
    <Card className="lg:col-span-2">
      <CardHeader className="pb-2">
        <p className="text-[10px] uppercase tracking-kerned text-accent-ink/80 mb-1">Trajectory</p>
        <CardTitle>Portfolio value over time</CardTitle>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <div className="h-64 grid place-items-center text-sm text-muted-foreground border border-dashed rounded-md">
            No history yet
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="anaValueGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--foreground))" stopOpacity={0.22} />
                  <stop offset="55%" stopColor="hsl(var(--foreground))" stopOpacity={0.06} />
                  <stop offset="100%" stopColor="hsl(var(--foreground))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="2 4" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} minTickGap={48} />
              <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} width={72} tickFormatter={shortInr} />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                formatter={(v: number, name: string) => [formatINR(v.toFixed(4)), name === 'value' ? 'Market value' : 'Invested']}
              />
              <Area type="monotone" dataKey="invested" stroke="hsl(var(--muted-foreground))" strokeWidth={1.25} strokeDasharray="4 4" fill="transparent" dot={false} />
              <Area type="monotone" dataKey="value" stroke="hsl(var(--foreground))" strokeWidth={2} fill="url(#anaValueGrad)" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

interface DriftProps {
  points: CostValueDriftPoint[];
}

export function CostVsValueDrift({ points }: DriftProps) {
  const data = points.map((p) => ({
    label: new Date(p.date).toLocaleDateString('en-IN', { month: 'short', year: '2-digit' }),
    drift: p.driftPct,
  }));
  return (
    <Card>
      <CardHeader className="pb-2">
        <p className="text-[10px] uppercase tracking-kerned text-accent-ink/80 mb-1">Drift</p>
        <CardTitle>Return on invested capital</CardTitle>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <div className="h-56 grid place-items-center text-sm text-muted-foreground border border-dashed rounded-md">
            No history yet
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="2 4" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} minTickGap={48} />
              <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} width={56} tickFormatter={(v: number) => `${v.toFixed(0)}%`} />
              <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => [`${v.toFixed(2)}%`, 'Drift over cost']} />
              <Line type="monotone" dataKey="drift" stroke="hsl(213 53% 22%)" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

interface BenchmarkProps {
  portfolio: ValuationPoint[];
  benchmark: BenchmarkPoint[];
}

export function BenchmarkOverlay({ portfolio, benchmark }: BenchmarkProps) {
  // Rebase portfolio to 100 at first observation; align with benchmark by month.
  if (portfolio.length === 0 || benchmark.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <p className="text-[10px] uppercase tracking-kerned text-accent-ink/80 mb-1">Benchmark</p>
          <CardTitle>Portfolio vs NIFTY 50 / Sensex</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-56 grid place-items-center text-sm text-muted-foreground border border-dashed rounded-md">
            Benchmark data unavailable for this period
          </div>
        </CardContent>
      </Card>
    );
  }
  const pBase = toDecimal(portfolio[0]!.value).toNumber();
  const portMap = new Map(
    portfolio.map((p) => [
      p.date.slice(0, 7),
      pBase > 0 ? (toDecimal(p.value).toNumber() / pBase) * 100 : null,
    ]),
  );
  // Pick a benchmark point per month-end and merge.
  const benchByMonth = new Map<string, BenchmarkPoint>();
  for (const b of benchmark) {
    const m = b.date.slice(0, 7);
    const prev = benchByMonth.get(m);
    if (!prev || b.date > prev.date) benchByMonth.set(m, b);
  }
  const months = Array.from(new Set([...portMap.keys(), ...benchByMonth.keys()])).sort();
  const data = months.map((m) => {
    const b = benchByMonth.get(m);
    return {
      label: m,
      portfolio: portMap.get(m) ?? null,
      nifty: b?.niftyIdx ?? null,
      sensex: b?.sensexIdx ?? null,
    };
  });
  return (
    <Card className="lg:col-span-2">
      <CardHeader className="pb-2">
        <p className="text-[10px] uppercase tracking-kerned text-accent-ink/80 mb-1">Benchmark</p>
        <CardTitle>Portfolio vs NIFTY 50 / Sensex (rebased to 100)</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="2 4" stroke="hsl(var(--border))" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} minTickGap={48} />
            <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} width={56} domain={['auto', 'auto']} tickFormatter={(v: number) => v.toFixed(0)} />
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              formatter={(v: number | string, name: string) => [
                v == null ? '—' : (typeof v === 'number' ? v : Number.parseFloat(v)).toFixed(1),
                name === 'portfolio' ? 'Your portfolio' : name === 'nifty' ? 'NIFTY 50' : 'Sensex',
              ]}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} formatter={(name: string) =>
              name === 'portfolio' ? 'Your portfolio' : name === 'nifty' ? 'NIFTY 50' : 'Sensex'
            } />
            <Line type="monotone" dataKey="portfolio" stroke="hsl(213 53% 22%)" strokeWidth={2.2} dot={false} connectNulls />
            <Line type="monotone" dataKey="nifty" stroke="hsl(36 60% 48%)" strokeWidth={1.5} strokeDasharray="3 3" dot={false} connectNulls />
            <Line type="monotone" dataKey="sensex" stroke="hsl(260 28% 42%)" strokeWidth={1.5} strokeDasharray="6 3" dot={false} connectNulls />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
