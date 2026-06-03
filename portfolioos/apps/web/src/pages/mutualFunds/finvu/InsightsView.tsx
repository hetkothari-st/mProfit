/**
 * MF insights renderer — KPI tiles + 4 distribution charts + holdings
 * table. Drives both /insights and /insights-no-pii (the no-PII variant
 * only differs in masked PAN/mobile, the layout is identical).
 */

import { useState } from 'react';
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from 'recharts';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { colorFor } from '@/pages/analytics/chartColors';
import {
  IntTile,
  KpiTile,
  MoneyTile,
  PctTile,
  Pill,
  SectionHeader,
  asArray,
  asNumber,
  asString,
  fmtDate,
  fmtMoney,
  fmtPct,
  isObj,
  pick,
  toneFor,
  shortInr,
} from './shared';

interface DistRow {
  label: string;
  totalCurrentValue: number;
  percentage: number;
  totalFunds?: number;
}

function readDist(arr: unknown, labelKey: string): DistRow[] {
  const out: DistRow[] = [];
  for (const r of asArray<Record<string, unknown>>(arr)) {
    const label = asString(r[labelKey]);
    const val = asNumber(r['totalCurrentValue']);
    const pct = asNumber(r['percentage']);
    const funds = asNumber(r['totalFunds']);
    if (!label || val == null) continue;
    const row: DistRow = { label, totalCurrentValue: val, percentage: pct ?? 0 };
    if (funds != null) row.totalFunds = funds;
    out.push(row);
  }
  return out;
}

function DistChartCard({
  title,
  rows,
  kind,
}: {
  title: string;
  rows: DistRow[];
  kind: 'pie' | 'bar';
}) {
  if (rows.length === 0) return null;
  return (
    <div className="rounded-xl border border-border/70 bg-card/40 p-4">
      <SectionHeader title={title} />
      <div className="h-[220px]">
        <ResponsiveContainer width="100%" height="100%">
          {kind === 'pie' ? (
            <PieChart>
              <Pie
                data={rows}
                dataKey="totalCurrentValue"
                nameKey="label"
                cx="50%"
                cy="50%"
                innerRadius={45}
                outerRadius={80}
                paddingAngle={2}
              >
                {rows.map((_, i) => (
                  <Cell key={i} fill={colorFor(i)} />
                ))}
              </Pie>
              <Tooltip
                formatter={(v: number, _name: string, p) => [
                  `${shortInr(v)} · ${(p.payload as DistRow).percentage.toFixed(1)}%`,
                  (p.payload as DistRow).label,
                ]}
              />
              <Legend
                verticalAlign="bottom"
                wrapperStyle={{ fontSize: 11 }}
                formatter={(value) => <span className="text-muted-foreground">{value}</span>}
              />
            </PieChart>
          ) : (
            <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 8, bottom: 4, left: 8 }}>
              <CartesianGrid strokeDasharray="2 4" stroke="hsl(var(--border))" />
              <XAxis
                type="number"
                tickFormatter={(v: number) => shortInr(v)}
                tick={{ fontSize: 10 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                type="category"
                dataKey="label"
                width={120}
                tick={{ fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                formatter={(v: number, _name: string, p) => [
                  `${shortInr(v)} · ${(p.payload as DistRow).percentage.toFixed(1)}%`,
                  (p.payload as DistRow).label,
                ]}
              />
              <Bar dataKey="totalCurrentValue" radius={[0, 4, 4, 0]}>
                {rows.map((_, i) => (
                  <Cell key={i} fill={colorFor(i)} />
                ))}
              </Bar>
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function HoldingRow({ holding }: { holding: Record<string, unknown> }) {
  const [open, setOpen] = useState(false);
  const folios = asArray<Record<string, unknown>>(holding['perFolioHoldingInsights']);
  const sip = asString(holding['sip']);
  const xirr = asNumber(holding['xirr']);
  const benchmark = asNumber(holding['benchmarkReturns']);
  return (
    <>
      <tr className="border-b last:border-0 hover:bg-muted/30">
        <td className="px-3 py-2.5">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="flex items-center gap-2 text-left"
          >
            {folios.length > 0 ? (
              open ? (
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
              )
            ) : (
              <span className="w-3.5" />
            )}
            <div className="min-w-0">
              <div className="font-medium text-sm text-foreground">
                {asString(holding['fundName']) ?? '—'}
              </div>
              <div className="text-[10.5px] text-muted-foreground font-mono">
                {asString(holding['isin']) ?? ''} · {asString(holding['amcName']) ?? ''}
              </div>
            </div>
          </button>
        </td>
        <td className="px-3 py-2.5">
          <div className="flex flex-col gap-1">
            <Pill tone="neutral" size="xs">
              {asString(holding['category']) ?? '—'}
            </Pill>
            {asString(holding['subcategory']) && (
              <span className="text-[10.5px] text-muted-foreground">
                {asString(holding['subcategory'])}
              </span>
            )}
          </div>
        </td>
        <td className="px-3 py-2.5 text-right tabular-nums text-sm">
          {fmtMoney(holding['investedValue'])}
        </td>
        <td className="px-3 py-2.5 text-right tabular-nums text-sm">
          {fmtMoney(holding['currentValue'])}
        </td>
        <td
          className={`px-3 py-2.5 text-right tabular-nums text-sm ${
            toneFor(holding['absoluteReturn']) === 'positive'
              ? 'text-positive'
              : toneFor(holding['absoluteReturn']) === 'negative'
              ? 'text-negative'
              : ''
          }`}
        >
          <div>{fmtMoney(holding['absoluteReturn'])}</div>
          <div className="text-[10.5px] opacity-80">
            {fmtPct(holding['absoluteReturnPercentage'])}
          </div>
        </td>
        <td className="px-3 py-2.5 text-right text-sm">
          <span
            className={
              xirr != null && xirr >= 0
                ? 'text-positive font-medium'
                : xirr != null
                ? 'text-negative font-medium'
                : ''
            }
          >
            {fmtPct(xirr)}
          </span>
          {benchmark != null && (
            <div className="text-[10.5px] text-muted-foreground">
              bm {fmtPct(benchmark)}
            </div>
          )}
        </td>
        <td className="px-3 py-2.5 text-center">
          {sip === 'ACTIVE' ? (
            <Pill tone="positive" size="xs">
              SIP
            </Pill>
          ) : sip === 'INACTIVE' ? (
            <Pill tone="neutral" size="xs">
              no SIP
            </Pill>
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </td>
      </tr>
      {open && folios.length > 0 && (
        <tr className="bg-muted/20 border-b">
          <td colSpan={7} className="px-6 py-3">
            <div className="text-[10.5px] uppercase tracking-kerned text-muted-foreground font-medium mb-2">
              Per-folio breakdown
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {folios.map((f, i) => (
                <div
                  key={i}
                  className="rounded-md border border-border/70 bg-background p-3 text-xs"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-mono text-[10.5px] text-muted-foreground">
                      Folio {asString(f['folio']) ?? '—'}
                    </span>
                    <span className="text-[10.5px] text-muted-foreground">
                      {asString(f['brokerName']) ?? asString(f['brokerCode']) ?? ''}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-[11px]">
                    <div>
                      <div className="text-muted-foreground">Invested</div>
                      <div className="font-medium tabular-nums">{fmtMoney(f['investedValue'])}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Current</div>
                      <div className="font-medium tabular-nums">{fmtMoney(f['currentValue'])}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">XIRR</div>
                      <div
                        className={`font-medium ${
                          toneFor(f['xirr']) === 'positive'
                            ? 'text-positive'
                            : toneFor(f['xirr']) === 'negative'
                            ? 'text-negative'
                            : ''
                        }`}
                      >
                        {fmtPct(f['xirr'])}
                      </div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Units</div>
                      <div className="tabular-nums">{asString(f['totalUnits']) ?? '—'}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Avg NAV</div>
                      <div className="tabular-nums">{fmtMoney(f['averageNav'])}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Demat</div>
                      <div>{asString(f['isDemat']) ?? '—'}</div>
                    </div>
                  </div>
                  <div className="mt-1.5 text-[10.5px] text-muted-foreground">
                    First txn: {fmtDate(f['firstTransactionDate'])}
                  </div>
                </div>
              ))}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export function InsightsView({ data, masked }: { data: unknown; masked?: boolean }) {
  if (!isObj(data)) return null;
  const overall = isObj(data['overallSummary']) ? (data['overallSummary'] as Record<string, unknown>) : null;
  const holdings = asArray<Record<string, unknown>>(data['holdings']);

  const categoryDist = overall ? readDist(overall['categoryDistribution'], 'category') : [];
  const subCategoryDist = overall ? readDist(overall['subCategoryDistribution'], 'subCategory') : [];
  const amcDist = overall ? readDist(overall['mutualFundsAmcDistribution'], 'amc') : [];
  const sectorDist = overall ? readDist(overall['mutualFundsSectorDistribution'], 'sector') : [];
  const marketCapDist = overall ? readDist(overall['mutualFundsMarketCapDistribution'], 'marketCap') : [];

  const soa = isObj(overall?.['soa']) ? (overall!['soa'] as Record<string, unknown>) : null;
  const demat = isObj(overall?.['demat']) ? (overall!['demat'] as Record<string, unknown>) : null;

  return (
    <div className="space-y-5">
      {/* Headline KPIs */}
      <div>
        <SectionHeader
          title="Overall summary"
          subtitle={
            overall
              ? `PAN ${asString(overall['pan']) ?? '—'} · Mobile ${asString(overall['mobile']) ?? '—'}${
                  masked ? ' (PII masked)' : ''
                }`
              : undefined
          }
        />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <MoneyTile label="Current value" value={overall?.['currentValue']} />
          <MoneyTile label="Invested" value={overall?.['investedValue']} />
          <MoneyTile
            label="Absolute return"
            value={overall?.['absoluteReturn']}
            tone={toneFor(overall?.['absoluteReturn'])}
            hint={overall ? fmtPct(overall['absoluteReturnPercentage']) : undefined}
          />
          <PctTile label="XIRR" value={overall?.['xirr']} />
          <MoneyTile
            label="Daily P&L"
            value={overall?.['dailyReturns']}
            tone={toneFor(overall?.['dailyReturns'])}
            hint={overall ? fmtPct(overall['dailyReturnsPercent']) : undefined}
          />
          <IntTile label="Holdings" value={overall?.['totalHoldings']} />
          <IntTile label="Folios" value={overall?.['foliosCount']} />
          <KpiTile
            label="As of"
            value={
              <span className="text-base font-medium">
                {fmtDate(soa?.['investmentDataAsOf'] ?? demat?.['investmentDataAsOf'])}
              </span>
            }
          />
        </div>
      </div>

      {/* SOA vs Demat split */}
      {(soa || demat) && (
        <div>
          <SectionHeader title="Holding mode split" subtitle="SOA (statement-of-account) vs Demat" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {[
              { name: 'SOA', src: soa, tone: 'accent' as const },
              { name: 'Demat', src: demat, tone: 'neutral' as const },
            ].map((b) =>
              b.src ? (
                <div
                  key={b.name}
                  className="rounded-xl border border-border/70 bg-card/40 p-4 space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <Pill tone={b.tone}>{b.name}</Pill>
                    <span className="text-[10.5px] text-muted-foreground">
                      {fmtInt(b.src['totalHoldings'])} holdings
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <div className="text-[10.5px] uppercase tracking-kerned text-muted-foreground">
                        Current
                      </div>
                      <div className="font-semibold tabular-nums">{fmtMoney(b.src['currentValue'])}</div>
                    </div>
                    <div>
                      <div className="text-[10.5px] uppercase tracking-kerned text-muted-foreground">
                        Invested
                      </div>
                      <div className="font-semibold tabular-nums">{fmtMoney(b.src['investedValue'])}</div>
                    </div>
                    <div>
                      <div className="text-[10.5px] uppercase tracking-kerned text-muted-foreground">
                        Abs return
                      </div>
                      <div
                        className={`font-medium tabular-nums ${
                          toneFor(b.src['absoluteReturn']) === 'positive'
                            ? 'text-positive'
                            : 'text-negative'
                        }`}
                      >
                        {fmtMoney(b.src['absoluteReturn'])}{' '}
                        <span className="text-[11px] opacity-80">
                          ({fmtPct(b.src['absoluteReturnPercentage'])})
                        </span>
                      </div>
                    </div>
                    <div>
                      <div className="text-[10.5px] uppercase tracking-kerned text-muted-foreground">
                        XIRR
                      </div>
                      <div
                        className={`font-medium ${
                          toneFor(b.src['xirr']) === 'positive' ? 'text-positive' : 'text-negative'
                        }`}
                      >
                        {fmtPct(b.src['xirr'])}
                      </div>
                    </div>
                  </div>
                </div>
              ) : null,
            )}
          </div>
        </div>
      )}

      {/* Distributions */}
      {(categoryDist.length > 0 ||
        subCategoryDist.length > 0 ||
        amcDist.length > 0 ||
        sectorDist.length > 0 ||
        marketCapDist.length > 0) && (
        <div>
          <SectionHeader title="Portfolio breakdown" />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <DistChartCard title="By asset category" rows={categoryDist} kind="pie" />
            <DistChartCard title="By market cap" rows={marketCapDist} kind="pie" />
            <DistChartCard title="By AMC" rows={amcDist} kind="bar" />
            <DistChartCard title="By sector" rows={sectorDist} kind="pie" />
            {subCategoryDist.length > 0 && (
              <DistChartCard title="By sub-category" rows={subCategoryDist} kind="bar" />
            )}
          </div>
        </div>
      )}

      {/* Holdings table */}
      {holdings.length > 0 && (
        <div>
          <SectionHeader
            title="Holdings"
            subtitle={`${holdings.length} scheme${holdings.length === 1 ? '' : 's'} — expand a row to see per-folio detail`}
          />
          <div className="rounded-xl border border-border/70 overflow-hidden bg-card/40">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30 text-[10.5px] uppercase tracking-kerned text-muted-foreground">
                    <th className="px-3 py-2 text-left font-medium">Scheme</th>
                    <th className="px-3 py-2 text-left font-medium">Category</th>
                    <th className="px-3 py-2 text-right font-medium">Invested</th>
                    <th className="px-3 py-2 text-right font-medium">Current</th>
                    <th className="px-3 py-2 text-right font-medium">Return</th>
                    <th className="px-3 py-2 text-right font-medium">XIRR</th>
                    <th className="px-3 py-2 text-center font-medium">SIP</th>
                  </tr>
                </thead>
                <tbody>
                  {holdings.map((h, i) => (
                    <HoldingRow key={asString(h['isin']) ?? i} holding={h} />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Local helpers — kept here to avoid pulling shared file imports twice.
function fmtInt(v: unknown): string {
  const n = pick({ x: v }, 'x') as unknown;
  const num = typeof n === 'number' ? n : typeof n === 'string' ? parseFloat(n) : NaN;
  if (!Number.isFinite(num)) return '—';
  return Math.trunc(num).toLocaleString('en-IN');
}
