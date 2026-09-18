import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend, ReferenceLine } from 'recharts';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { formatINR, toDecimal, ASSET_CLASS_LABELS } from '@everypaisa/shared';
import type { CgByFyRow, IncomeMonthRow, TaxHarvestSummary } from '@/api/analytics.api';
import { CHART_COLORS, shortInr } from '../chartColors';
import { AnalyticsInfo } from '../AnalyticsInfo';

const TOOLTIP_STYLE = {
  background: 'hsl(var(--popover))',
  border: '1px solid hsl(var(--border))',
  borderRadius: '8px',
  fontSize: 12,
  padding: '10px 12px',
  boxShadow: '0 12px 28px -16px hsl(var(--shadow-color) / 0.35)',
};

/**
 * Realised gains per financial year, split by tax bucket.
 *
 * Grouped bars, not stacked. The three buckets are signed and independent — a
 * year with LTCG +₹5L and STCG −₹2L stacked into a shape whose height meant
 * nothing and whose total could not be read off the axis. Side by side, each
 * bucket is readable and a loss simply sits below the zero line.
 */
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
        <CardTitle className="flex items-center gap-1.5">Capital gains by FY<AnalyticsInfo k="cgByFy" /></CardTitle>
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
              <ReferenceLine y={0} stroke="hsl(var(--border))" />
              <Bar dataKey="Intraday" fill={CHART_COLORS[3]!} radius={[2, 2, 0, 0]} />
              <Bar dataKey="STCG" fill={CHART_COLORS[1]!} radius={[2, 2, 0, 0]} />
              <Bar dataKey="LTCG" fill={CHART_COLORS[0]!} radius={[2, 2, 0, 0]} />
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
        <CardTitle className="flex items-center gap-1.5">Income by month<AnalyticsInfo k="incomeByMonth" /></CardTitle>
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

/**
 * Tax-loss harvesting.
 *
 * Leads with one sentence and a rupee figure, because that is the only part
 * most readers need: what selling your losers before 31 March would save. The
 * four offset tiles below are the working, kept for anyone checking the sum
 * rather than shown first and left to be decoded.
 */
export function TaxHarvestTable({ data }: { data: TaxHarvestSummary }) {
  const taxSaved = toDecimal(data.savings?.taxSaved ?? '0');
  // Gains actually booked this year. A harvest can be worth nothing for two
  // different reasons — no gains at all, or gains that are already untaxed
  // (long-term within the exemption) — and saying the wrong one contradicts
  // the "Taxable gains (FY)" tile directly below.
  const bookedGains = toDecimal(data.realisedStcgInFy).plus(data.realisedLtcgInFy);
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-1.5">Cut your tax bill<AnalyticsInfo k="taxHarvest" /></CardTitle>
      </CardHeader>
      <CardContent>
        <p className="mb-4 text-sm text-foreground">
          {taxSaved.gt(0) ? (
            <>
              Selling the holdings below at a loss before 31 March could reduce this year&apos;s tax by about{' '}
              <span className="font-semibold text-positive">{formatINR(data.savings.taxSaved)}</span>.
            </>
          ) : data.candidates.length > 0 && bookedGains.gt(0) ? (
            <>
              You hold {data.candidates.length}{' '}
              {data.candidates.length === 1 ? 'investment' : 'investments'} worth less than you paid, but
              booking those losses would not reduce this year&apos;s tax — the gains you have booked so far are
              already untaxed.
            </>
          ) : data.candidates.length > 0 ? (
            <>
              You hold {data.candidates.length}{' '}
              {data.candidates.length === 1 ? 'investment' : 'investments'} worth less than you paid. Selling
              them would book those losses, but you have no gains this year for them to cancel out.
            </>
          ) : (
            <>Nothing to harvest — none of your holdings is currently worth less than you paid.</>
          )}
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          <div className="rounded-lg bg-muted/50 p-3">
            <p className="flex items-center gap-1 text-xs text-muted-foreground">Unrealised loss pool<AnalyticsInfo k="harvestLossPool" /></p>
            <p className="text-base font-semibold mt-0.5 text-red-600 dark:text-red-400">{formatINR(data.unrealisedLoss)}</p>
          </div>
          <div className="rounded-lg bg-muted/50 p-3">
            <p className="flex items-center gap-1 text-xs text-muted-foreground">STCG offset available<AnalyticsInfo k="harvestStcgOffset" /></p>
            <p className="text-base font-semibold mt-0.5">{formatINR(data.stcgLossAvailable)}</p>
          </div>
          <div className="rounded-lg bg-muted/50 p-3">
            <p className="flex items-center gap-1 text-xs text-muted-foreground">LTCG offset available<AnalyticsInfo k="harvestLtcgOffset" /></p>
            <p className="text-base font-semibold mt-0.5">{formatINR(data.ltcgLossAvailable)}</p>
          </div>
          <div className="rounded-lg bg-muted/50 p-3">
            <p className="flex items-center gap-1 text-xs text-muted-foreground">Taxable gains (FY)<AnalyticsInfo k="harvestRealisedFy" /></p>
            <p className="text-base font-semibold mt-0.5">
              STCG {formatINR(data.realisedStcgInFy)} · LTCG {formatINR(data.realisedLtcgInFy)}
            </p>
          </div>
        </div>
        {taxSaved.gt(0) && (
          <div className="rounded-lg border bg-muted/40 p-3 mb-4">
            <p className="text-[11px] text-muted-foreground tabular-nums">
              Tax before {formatINR(data.savings.taxBefore)} → after {formatINR(data.savings.taxAfter)}
              {' · '}STCG {data.savings.stcgRatePct}% · LTCG {data.savings.ltcgRatePct}% over {formatINR(data.savings.ltcgExemption)}
            </p>
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              An estimate under current set-off rules — not advice. Set-off and timing have conditions; consult a tax professional.
            </p>
          </div>
        )}
        {data.candidates.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2 text-center">No loss-making holdings to harvest.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm rtable">
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
                    <td data-label="Asset" className="py-2 pr-3 truncate max-w-[200px] font-medium">{c.assetName}</td>
                    <td data-label="Portfolio" className="py-2 pr-3 hidden sm:table-cell text-xs text-muted-foreground">{c.portfolioName}</td>
                    <td data-label="Class" className="py-2 pr-3 hidden md:table-cell text-xs">{ASSET_CLASS_LABELS[c.assetClass as keyof typeof ASSET_CLASS_LABELS] ?? c.assetClass}</td>
                    <td data-label="Bucket" className="py-2 pr-3 text-xs">
                      <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5">
                        {c.classification.replace('_', ' ')}
                      </span>
                    </td>
                    <td data-label="Unrealised loss" className="py-2 text-right tabular-nums text-red-600 dark:text-red-400 font-medium">
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

