/**
 * Grandfathering LTCG view — mirrors the legacy desktop "GrandFathering
 * Report" layout: family + member + FY band, then a script-grouped
 * table with Opening/Purchase, FMV-on-31-Jan-2018, Sale, Gain/Loss
 * columns. Total row at the bottom matches the green-banded "Grand
 * Total" from the screenshot.
 */

import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { reportsApi, type GrandfatheringRow } from '@/api/reports.api';
import { Decimal, toDecimal } from '@portfolioos/shared';

function fmt(v: string | null | undefined, decimals = 2): string {
  if (v == null || v === '') return '—';
  try {
    const d = toDecimal(v);
    if (!d.isFinite()) return '—';
    const fixed = d.toFixed(decimals, Decimal.ROUND_HALF_EVEN);
    const [intPart, frac] = fixed.split('.');
    const negative = intPart!.startsWith('-');
    const digits = negative ? intPart!.slice(1) : intPart!;
    let grouped: string;
    if (digits.length <= 3) grouped = digits;
    else {
      const last3 = digits.slice(-3);
      const rest = digits.slice(0, -3);
      grouped = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + last3;
    }
    const signed = negative ? `(${grouped}${frac ? '.' + frac : ''})` : `${grouped}${frac ? '.' + frac : ''}`;
    return signed;
  } catch {
    return '—';
  }
}

function fmtDate(s: string | null | undefined): string {
  if (!s) return '—';
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

interface Group {
  scriptName: string;
  rows: GrandfatheringRow[];
  buyQty: string;
  buyAmount: string;
  sellQty: string;
  sellAmount: string;
  gain: string;
  loss: string;
}

function groupRows(rows: GrandfatheringRow[]): Group[] {
  const map = new Map<string, Group>();
  for (const r of rows) {
    const g = map.get(r.scriptName) ?? {
      scriptName: r.scriptName,
      rows: [],
      buyQty: '0',
      buyAmount: '0',
      sellQty: '0',
      sellAmount: '0',
      gain: '0',
      loss: '0',
    };
    g.rows.push(r);
    g.buyQty = toDecimal(g.buyQty).plus(r.buyQty).toString();
    g.buyAmount = toDecimal(g.buyAmount).plus(r.buyAmount).toString();
    g.sellQty = toDecimal(g.sellQty).plus(r.sellQty).toString();
    g.sellAmount = toDecimal(g.sellAmount).plus(r.sellAmount).toString();
    g.gain = toDecimal(g.gain).plus(r.gain).toString();
    g.loss = toDecimal(g.loss).plus(r.loss).toString();
    map.set(r.scriptName, g);
  }
  return Array.from(map.values()).sort((a, b) => a.scriptName.localeCompare(b.scriptName));
}

export function GrandfatheringView({ fy }: { fy?: string }) {
  const q = useQuery({
    queryKey: ['report-grandfathering', fy ?? 'all'],
    queryFn: () => reportsApi.grandfathering(fy),
  });

  if (q.isLoading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground p-8 text-sm">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading…
      </div>
    );
  }
  if (!q.data) return null;
  const groups = groupRows(q.data.rows);
  const t = q.data.totals;

  return (
    <div className="space-y-3">
      {/* Header band — replicates the pink banded title row */}
      <div className="rounded-md border border-border bg-rose-50 dark:bg-rose-950/30 px-4 py-2 text-xs flex flex-wrap gap-x-6 gap-y-1">
        <span><span className="font-semibold uppercase tracking-kerned">Family:</span> All portfolios</span>
        <span>
          <span className="font-semibold uppercase tracking-kerned">Financial Year:</span>{' '}
          {q.data.scope.financialYear ?? 'All FYs'}
        </span>
        <span>
          <span className="font-semibold uppercase tracking-kerned">Title:</span> Grandfathering report (Sec 112A)
        </span>
      </div>

      <div className="rounded-lg border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-rose-100/70 dark:bg-rose-950/50">
                <th rowSpan={2} className="px-2 py-2 border border-border text-left w-[200px] sticky left-0 bg-rose-100/70 dark:bg-rose-950/50">
                  Script Name
                </th>
                <th colSpan={4} className="px-2 py-1 border border-border text-center font-medium">
                  Opening / Purchase
                </th>
                <th rowSpan={2} className="px-2 py-2 border border-border text-center w-[110px] bg-amber-50 dark:bg-amber-950/30">
                  31st Jan 2018 FMV
                </th>
                <th colSpan={4} className="px-2 py-1 border border-border text-center font-medium">
                  Sale
                </th>
                <th rowSpan={2} className="px-2 py-2 border border-border text-right w-[110px]">Gain / Loss</th>
                <th rowSpan={2} className="px-2 py-2 border border-border text-right w-[100px]">Gain</th>
                <th rowSpan={2} className="px-2 py-2 border border-border text-right w-[100px]">Loss</th>
              </tr>
              <tr className="bg-rose-100/70 dark:bg-rose-950/50">
                <th className="px-2 py-2 border border-border text-left w-[80px]">Date</th>
                <th className="px-2 py-2 border border-border text-right w-[80px]">Qty</th>
                <th className="px-2 py-2 border border-border text-right w-[80px]">Rate</th>
                <th className="px-2 py-2 border border-border text-right w-[100px]">Amount</th>
                <th className="px-2 py-2 border border-border text-left w-[80px]">Date</th>
                <th className="px-2 py-2 border border-border text-right w-[80px]">Qty</th>
                <th className="px-2 py-2 border border-border text-right w-[80px]">Rate</th>
                <th className="px-2 py-2 border border-border text-right w-[100px]">Amount</th>
              </tr>
            </thead>
            <tbody>
              {groups.length === 0 && (
                <tr>
                  <td colSpan={13} className="px-2 py-8 text-center text-muted-foreground border border-border">
                    No pre-31-Jan-2018 LTCG transactions in this FY.
                  </td>
                </tr>
              )}
              {groups.map((g) => (
                <>
                  <tr key={`${g.scriptName}-header`} className="bg-muted/30">
                    <td colSpan={13} className="px-2 py-1.5 border border-border font-medium text-sm">
                      {g.scriptName}
                    </td>
                  </tr>
                  {g.rows.map((r, i) => (
                    <tr key={`${g.scriptName}-${i}`}>
                      <td className="px-2 py-1.5 border border-border">
                        <div className="text-[11px] text-muted-foreground italic pl-3">
                          SHARE INVESTMENT (EQUITY) A/C
                        </div>
                      </td>
                      <td className="px-2 py-1.5 border border-border tabular-nums">{fmtDate(r.buyDate)}</td>
                      <td className="px-2 py-1.5 border border-border tabular-nums text-right">{fmt(r.buyQty, 0)}</td>
                      <td className="px-2 py-1.5 border border-border tabular-nums text-right">{fmt(r.buyRate, 4)}</td>
                      <td className="px-2 py-1.5 border border-border tabular-nums text-right">{fmt(r.buyAmount)}</td>
                      <td className="px-2 py-1.5 border border-border tabular-nums text-right bg-amber-50/40 dark:bg-amber-950/20">
                        {r.fmvOn31Jan2018 ? fmt(r.fmvOn31Jan2018, 2) : '—'}
                      </td>
                      <td className="px-2 py-1.5 border border-border tabular-nums">{fmtDate(r.sellDate)}</td>
                      <td className="px-2 py-1.5 border border-border tabular-nums text-right">{fmt(r.sellQty, 0)}</td>
                      <td className="px-2 py-1.5 border border-border tabular-nums text-right">{fmt(r.sellRate, 4)}</td>
                      <td className="px-2 py-1.5 border border-border tabular-nums text-right">{fmt(r.sellAmount)}</td>
                      <td className={`px-2 py-1.5 border border-border tabular-nums text-right font-medium ${toDecimal(r.gainLoss).gte(0) ? 'text-positive' : 'text-negative'}`}>
                        {fmt(r.gainLoss)}
                      </td>
                      <td className="px-2 py-1.5 border border-border tabular-nums text-right text-positive">
                        {toDecimal(r.gain).gt(0) ? fmt(r.gain) : '—'}
                      </td>
                      <td className="px-2 py-1.5 border border-border tabular-nums text-right text-negative">
                        {toDecimal(r.loss).gt(0) ? fmt(r.loss) : '—'}
                      </td>
                    </tr>
                  ))}
                  <tr key={`${g.scriptName}-total`} className="bg-yellow-50/60 dark:bg-yellow-950/20 font-medium">
                    <td className="px-2 py-1.5 border border-border">Total For {g.scriptName}</td>
                    <td className="px-2 py-1.5 border border-border" />
                    <td className="px-2 py-1.5 border border-border tabular-nums text-right">{fmt(g.buyQty, 0)}</td>
                    <td className="px-2 py-1.5 border border-border" />
                    <td className="px-2 py-1.5 border border-border tabular-nums text-right">{fmt(g.buyAmount)}</td>
                    <td className="px-2 py-1.5 border border-border" />
                    <td className="px-2 py-1.5 border border-border" />
                    <td className="px-2 py-1.5 border border-border tabular-nums text-right">{fmt(g.sellQty, 0)}</td>
                    <td className="px-2 py-1.5 border border-border" />
                    <td className="px-2 py-1.5 border border-border tabular-nums text-right">{fmt(g.sellAmount)}</td>
                    <td className={`px-2 py-1.5 border border-border tabular-nums text-right ${toDecimal(g.gain).minus(g.loss).gte(0) ? 'text-positive' : 'text-negative'}`}>
                      {fmt(toDecimal(g.gain).minus(g.loss).toString())}
                    </td>
                    <td className="px-2 py-1.5 border border-border tabular-nums text-right text-positive">{toDecimal(g.gain).gt(0) ? fmt(g.gain) : '—'}</td>
                    <td className="px-2 py-1.5 border border-border tabular-nums text-right text-negative">{toDecimal(g.loss).gt(0) ? fmt(g.loss) : '—'}</td>
                  </tr>
                </>
              ))}
            </tbody>
            {groups.length > 0 && (
              <tfoot>
                <tr className="bg-emerald-100 dark:bg-emerald-950/40 font-semibold">
                  <td className="px-2 py-2 border border-border">Grand Total</td>
                  <td className="px-2 py-2 border border-border" />
                  <td className="px-2 py-2 border border-border tabular-nums text-right">{fmt(t.buyQty, 0)}</td>
                  <td className="px-2 py-2 border border-border" />
                  <td className="px-2 py-2 border border-border tabular-nums text-right">{fmt(t.buyAmount)}</td>
                  <td className="px-2 py-2 border border-border" />
                  <td className="px-2 py-2 border border-border" />
                  <td className="px-2 py-2 border border-border tabular-nums text-right">{fmt(t.sellQty, 0)}</td>
                  <td className="px-2 py-2 border border-border" />
                  <td className="px-2 py-2 border border-border tabular-nums text-right">{fmt(t.sellAmount)}</td>
                  <td className={`px-2 py-2 border border-border tabular-nums text-right ${toDecimal(t.net).gte(0) ? 'text-positive' : 'text-negative'}`}>
                    {fmt(t.net)}
                  </td>
                  <td className="px-2 py-2 border border-border tabular-nums text-right text-positive">{fmt(t.gain)}</td>
                  <td className="px-2 py-2 border border-border tabular-nums text-right text-negative">{fmt(t.loss)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      <p className="text-[11px] text-muted-foreground italic">
        Sec 112A grandfathering: pre-31 Jan 2018 equity / equity-MF buys. Cost basis = max(actual cost, FMV on
        31-Jan-2018). FMV column is auto-filled from saved bhav copy where available; otherwise actual cost is
        used and the FMV cell shows "—".
      </p>
    </div>
  );
}
