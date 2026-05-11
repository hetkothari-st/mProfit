import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { formatINR, toDecimal, ASSET_CLASS_LABELS } from '@portfolioos/shared';
import type {
  CgByFyRow,
  IncomeMonthRow,
  RealisedVsUnrealised,
  TaxHarvestSummary,
} from '@/api/analytics.api';
import { CHART_COLORS, shortInr } from '../chartColors';

const TOOLTIP_STYLE = {
  background: 'hsl(var(--popover))',
  border: '1px solid hsl(var(--border))',
  borderRadius: '8px',
  fontSize: 12,
  padding: '10px 12px',
  boxShadow: '0 12px 28px -16px hsl(var(--shadow-color) / 0.35)',
};

export function CgByFyBar({ rows }: { rows: CgByFyRow[] }) {
  const data = rows.slice(-6).map((r) => ({
    fy: r.fy,
    Intraday: toDecimal(r.intraday).toNumber(),
    STCG: toDecimal(r.stcg).toNumber(),
    LTCG: toDecimal(r.ltcg).toNumber(),
  }));
  return (
    <Card>
      <CardHeader className="pb-2">
        <p className="text-[10px] uppercase tracking-kerned text-accent-ink/80 mb-1">Realised</p>
        <CardTitle>Capital gains by FY</CardTitle>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <div className="h-56 grid place-items-center text-sm text-muted-foreground border border-dashed rounded-md">
            No realised gains
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="2 4" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="fy" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} width={72} tickFormatter={shortInr} />
              <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => formatINR(v.toFixed(4))} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="Intraday" stackId="cg" fill={CHART_COLORS[3]!} radius={[2, 2, 0, 0]} />
              <Bar dataKey="STCG" stackId="cg" fill={CHART_COLORS[1]!} radius={[2, 2, 0, 0]} />
              <Bar dataKey="LTCG" stackId="cg" fill={CHART_COLORS[0]!} radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

export function IncomeTrendBar({ rows }: { rows: IncomeMonthRow[] }) {
  const data = rows.slice(-12).map((r) => ({
    month: r.month,
    Dividend: toDecimal(r.dividend).toNumber(),
    Interest: toDecimal(r.interest).toNumber(),
    Maturity: toDecimal(r.maturity).toNumber(),
  }));
  return (
    <Card>
      <CardHeader className="pb-2">
        <p className="text-[10px] uppercase tracking-kerned text-accent-ink/80 mb-1">Cashflow</p>
        <CardTitle>Income by month</CardTitle>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <div className="h-56 grid place-items-center text-sm text-muted-foreground border border-dashed rounded-md">
            No income recorded
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="2 4" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} minTickGap={32} />
              <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} width={72} tickFormatter={shortInr} />
              <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => formatINR(v.toFixed(4))} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="Dividend" stackId="inc" fill={CHART_COLORS[2]!} radius={[2, 2, 0, 0]} />
              <Bar dataKey="Interest" stackId="inc" fill={CHART_COLORS[5]!} radius={[2, 2, 0, 0]} />
              <Bar dataKey="Maturity" stackId="inc" fill={CHART_COLORS[8]!} radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

export function RealisedVsUnrealisedCard({ data }: { data: RealisedVsUnrealised }) {
  const realised = toDecimal(data.realised);
  const unrealised = toDecimal(data.unrealised);
  const total = realised.plus(unrealised);
  const chart = [
    { label: 'P&L split', Realised: realised.toNumber(), Unrealised: unrealised.toNumber() },
  ];
  return (
    <Card>
      <CardHeader className="pb-2">
        <p className="text-[10px] uppercase tracking-kerned text-accent-ink/80 mb-1">P&L split</p>
        <CardTitle>Realised vs unrealised</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={120}>
          <BarChart data={chart} layout="vertical" margin={{ top: 4, right: 8, left: 4, bottom: 0 }}>
            <XAxis type="number" hide tickFormatter={shortInr} />
            <YAxis dataKey="label" type="category" hide />
            <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => formatINR(v.toFixed(4))} />
            <Bar dataKey="Realised" stackId="pnl" fill={CHART_COLORS[1]!} radius={[6, 0, 0, 6]} />
            <Bar dataKey="Unrealised" stackId="pnl" fill={CHART_COLORS[0]!} radius={[0, 6, 6, 0]} />
          </BarChart>
        </ResponsiveContainer>
        <div className="mt-2 flex justify-between text-xs">
          <div>
            <span className="inline-block h-2 w-2 rounded-full mr-1.5" style={{ background: CHART_COLORS[1] }} />
            Realised: <span className="font-medium tabular-nums">{formatINR(data.realised, { showSign: true })}</span>
          </div>
          <div>
            <span className="inline-block h-2 w-2 rounded-full mr-1.5" style={{ background: CHART_COLORS[0] }} />
            Unrealised: <span className="font-medium tabular-nums">{formatINR(data.unrealised, { showSign: true })}</span>
          </div>
        </div>
        <div className="mt-1.5 text-[11px] text-muted-foreground">
          Total {formatINR(total.toFixed(4), { showSign: true })}
        </div>
      </CardContent>
    </Card>
  );
}

export function TaxHarvestTable({ data }: { data: TaxHarvestSummary }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <p className="text-[10px] uppercase tracking-kerned text-accent-ink/80 mb-1">Tax-loss harvest</p>
        <CardTitle>Candidates to realise losses</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          <div className="rounded-lg bg-muted/50 p-3">
            <p className="text-xs text-muted-foreground">Unrealised loss pool</p>
            <p className="text-base font-semibold mt-0.5 text-red-600 dark:text-red-400">{formatINR(data.unrealisedLoss)}</p>
          </div>
          <div className="rounded-lg bg-muted/50 p-3">
            <p className="text-xs text-muted-foreground">STCG offset available</p>
            <p className="text-base font-semibold mt-0.5">{formatINR(data.stcgLossAvailable)}</p>
          </div>
          <div className="rounded-lg bg-muted/50 p-3">
            <p className="text-xs text-muted-foreground">LTCG offset available</p>
            <p className="text-base font-semibold mt-0.5">{formatINR(data.ltcgLossAvailable)}</p>
          </div>
          <div className="rounded-lg bg-muted/50 p-3">
            <p className="text-xs text-muted-foreground">Realised gains (FY)</p>
            <p className="text-base font-semibold mt-0.5">
              STCG {formatINR(data.realisedStcgInFy)} · LTCG {formatINR(data.realisedLtcgInFy)}
            </p>
          </div>
        </div>
        {data.candidates.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2 text-center">No loss-making holdings to harvest.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-muted-foreground text-xs">
                  <th className="text-left py-1.5 pr-3 font-medium">Asset</th>
                  <th className="text-left py-1.5 pr-3 font-medium hidden sm:table-cell">Portfolio</th>
                  <th className="text-left py-1.5 pr-3 font-medium hidden md:table-cell">Class</th>
                  <th className="text-left py-1.5 pr-3 font-medium">Bucket</th>
                  <th className="text-right py-1.5 font-medium">Unrealised loss</th>
                </tr>
              </thead>
              <tbody>
                {data.candidates.map((c, i) => (
                  <tr key={`${c.assetName}-${i}`} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                    <td className="py-2 pr-3 truncate max-w-[200px] font-medium">{c.assetName}</td>
                    <td className="py-2 pr-3 hidden sm:table-cell text-xs text-muted-foreground">{c.portfolioName}</td>
                    <td className="py-2 pr-3 hidden md:table-cell text-xs">{ASSET_CLASS_LABELS[c.assetClass as keyof typeof ASSET_CLASS_LABELS] ?? c.assetClass}</td>
                    <td className="py-2 pr-3 text-xs">
                      <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5">
                        {c.classification.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="py-2 text-right tabular-nums text-red-600 dark:text-red-400 font-medium">
                      {formatINR(c.unrealisedPnL)}
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

