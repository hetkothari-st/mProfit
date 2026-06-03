/**
 * Mark-to-market report — equity + F&O. Mirrors the mProfit M2M
 * report layout: script + closing date + qty + avg purchase rate +
 * purchase value + bhav rate + valuation + unrealised P&L + days +
 * ROI % (actual / monthly / annual) + CAGR %. Two sub-tables (equity
 * and F&O) plus a grand-total band.
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { reportsApi, type M2MRow, type M2MReport } from '@/api/reports.api';
import { Decimal, toDecimal } from '@portfolioos/shared';

function fmt(v: string | number | null | undefined, decimals = 2): string {
  if (v == null || v === '') return '—';
  try {
    const d = toDecimal(v);
    if (!d.isFinite()) return '—';
    const isNeg = d.isNegative();
    const fixed = d.abs().toFixed(decimals, Decimal.ROUND_HALF_EVEN);
    const [intPart, frac] = fixed.split('.');
    const digits = intPart!;
    let grouped: string;
    if (digits.length <= 3) grouped = digits;
    else {
      const last3 = digits.slice(-3);
      const rest = digits.slice(0, -3);
      grouped = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + last3;
    }
    const text = frac ? `${grouped}.${frac}` : grouped;
    return isNeg ? `(${text})` : text;
  } catch {
    return '—';
  }
}

function fmtPct(v: number | null | undefined): string {
  if (v == null || !isFinite(v)) return '—';
  const isNeg = v < 0;
  const abs = Math.abs(v).toFixed(2);
  return isNeg ? `(${abs})` : abs;
}

function fmtDate(s: string): string {
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function groupByScript(rows: M2MRow[]) {
  const map = new Map<string, { scriptName: string; rows: M2MRow[] }>();
  for (const r of rows) {
    const g = map.get(r.scriptName) ?? { scriptName: r.scriptName, rows: [] };
    g.rows.push(r);
    map.set(r.scriptName, g);
  }
  return Array.from(map.values()).sort((a, b) => a.scriptName.localeCompare(b.scriptName));
}

function SegmentTable({
  title,
  rows,
  totals,
}: {
  title: string;
  rows: M2MRow[];
  totals: M2MReport['equityTotals'];
}) {
  const groups = groupByScript(rows);
  if (rows.length === 0) {
    return (
      <div className="rounded-md border border-border bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground">
        No {title} positions.
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <div className="bg-sky-100/70 dark:bg-sky-950/40 px-3 py-1.5 text-xs font-semibold border-b border-border">
        {title}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-rose-100/70 dark:bg-rose-950/50">
              <th rowSpan={2} className="px-2 py-2 border border-border text-left w-[200px]">Script Name</th>
              <th rowSpan={2} className="px-2 py-2 border border-border text-left w-[90px]">Closing Date</th>
              <th colSpan={3} className="px-2 py-1 border border-border text-center">Average</th>
              <th rowSpan={2} className="px-2 py-2 border border-border text-right w-[80px]">Bhav Rate</th>
              <th rowSpan={2} className="px-2 py-2 border border-border text-right w-[100px]">Valuation</th>
              <th rowSpan={2} className="px-2 py-2 border border-border text-right w-[100px]">Unrealised G/L</th>
              <th colSpan={5} className="px-2 py-1 border border-border text-center">UN-Realised ROI</th>
            </tr>
            <tr className="bg-rose-100/70 dark:bg-rose-950/50">
              <th className="px-2 py-2 border border-border text-right w-[70px]">Qty</th>
              <th className="px-2 py-2 border border-border text-right w-[80px]">Pur Rate</th>
              <th className="px-2 py-2 border border-border text-right w-[100px]">Pur Value</th>
              <th className="px-2 py-2 border border-border text-right w-[60px]">Days</th>
              <th className="px-2 py-2 border border-border text-right w-[80px]">Actual %</th>
              <th className="px-2 py-2 border border-border text-right w-[80px]">Monthly %</th>
              <th className="px-2 py-2 border border-border text-right w-[80px]">Annual %</th>
              <th className="px-2 py-2 border border-border text-right w-[80px]">CAGR %</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => {
              const gTotPur = g.rows.reduce((s, r) => s.plus(r.purValue), new Decimal(0));
              const gTotVal = g.rows.reduce((s, r) => s.plus(r.valuation ?? '0'), new Decimal(0));
              const gTotPnl = g.rows.reduce((s, r) => s.plus(r.unrealisedPnL ?? '0'), new Decimal(0));
              return (
                <>
                  {g.rows.map((r, i) => (
                    <tr key={`${g.scriptName}-${i}`} className="hover:bg-muted/20">
                      <td className="px-2 py-1.5 border border-border">{i === 0 ? r.scriptName : ''}</td>
                      <td className="px-2 py-1.5 border border-border tabular-nums">{fmtDate(r.closingDate)}</td>
                      <td className="px-2 py-1.5 border border-border tabular-nums text-right">{fmt(r.qty, 0)}</td>
                      <td className="px-2 py-1.5 border border-border tabular-nums text-right">{fmt(r.purRate, 4)}</td>
                      <td className="px-2 py-1.5 border border-border tabular-nums text-right">{fmt(r.purValue)}</td>
                      <td className="px-2 py-1.5 border border-border tabular-nums text-right">{fmt(r.bhavRate, 4)}</td>
                      <td className="px-2 py-1.5 border border-border tabular-nums text-right">{fmt(r.valuation)}</td>
                      <td className={`px-2 py-1.5 border border-border tabular-nums text-right font-medium ${r.unrealisedPnL && toDecimal(r.unrealisedPnL).gte(0) ? 'text-positive' : 'text-negative'}`}>
                        {fmt(r.unrealisedPnL)}
                      </td>
                      <td className="px-2 py-1.5 border border-border tabular-nums text-right">{r.noOfDays}</td>
                      <td className={`px-2 py-1.5 border border-border tabular-nums text-right ${r.actualRoiPct != null && r.actualRoiPct < 0 ? 'text-negative' : 'text-positive'}`}>
                        {fmtPct(r.actualRoiPct)}
                      </td>
                      <td className={`px-2 py-1.5 border border-border tabular-nums text-right ${r.monthlyRoiPct != null && r.monthlyRoiPct < 0 ? 'text-negative' : ''}`}>
                        {fmtPct(r.monthlyRoiPct)}
                      </td>
                      <td className={`px-2 py-1.5 border border-border tabular-nums text-right ${r.annualRoiPct != null && r.annualRoiPct < 0 ? 'text-negative' : ''}`}>
                        {fmtPct(r.annualRoiPct)}
                      </td>
                      <td className={`px-2 py-1.5 border border-border tabular-nums text-right ${r.cagrPct != null && r.cagrPct < 0 ? 'text-negative' : ''}`}>
                        {fmtPct(r.cagrPct)}
                      </td>
                    </tr>
                  ))}
                  <tr key={`${g.scriptName}-tot`} className="bg-yellow-50/60 dark:bg-yellow-950/20 font-medium">
                    <td className="px-2 py-1.5 border border-border">Total: {g.scriptName}</td>
                    <td className="px-2 py-1.5 border border-border" />
                    <td className="px-2 py-1.5 border border-border tabular-nums text-right">
                      {fmt(g.rows.reduce((s, r) => s.plus(r.qty), new Decimal(0)).toString(), 0)}
                    </td>
                    <td className="px-2 py-1.5 border border-border" />
                    <td className="px-2 py-1.5 border border-border tabular-nums text-right">{fmt(gTotPur.toString())}</td>
                    <td className="px-2 py-1.5 border border-border" />
                    <td className="px-2 py-1.5 border border-border tabular-nums text-right">{fmt(gTotVal.toString())}</td>
                    <td className={`px-2 py-1.5 border border-border tabular-nums text-right ${gTotPnl.gte(0) ? 'text-positive' : 'text-negative'}`}>
                      {fmt(gTotPnl.toString())}
                    </td>
                    <td colSpan={5} className="px-2 py-1.5 border border-border" />
                  </tr>
                </>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="bg-emerald-100 dark:bg-emerald-950/40 font-semibold">
              <td colSpan={4} className="px-2 py-2 border border-border">Total : {title}</td>
              <td className="px-2 py-2 border border-border tabular-nums text-right">{fmt(totals.purValue)}</td>
              <td className="px-2 py-2 border border-border" />
              <td className="px-2 py-2 border border-border tabular-nums text-right">{fmt(totals.valuation)}</td>
              <td className={`px-2 py-2 border border-border tabular-nums text-right ${toDecimal(totals.unrealisedPnL).gte(0) ? 'text-positive' : 'text-negative'}`}>
                {fmt(totals.unrealisedPnL)}
              </td>
              <td colSpan={5} className="px-2 py-2 border border-border" />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

export function M2MReportView() {
  const [asOf, setAsOf] = useState<string>('');
  const q = useQuery({
    queryKey: ['report-m2m', asOf],
    queryFn: () => reportsApi.m2m(asOf || undefined),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-end gap-3 flex-wrap">
        <div>
          <Label>As of date</Label>
          <Input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} className="mt-1 w-40" />
        </div>
        <div className="text-[11px] text-muted-foreground">
          Mark-to-market against last available bhav copy / NAV up to the chosen date.
        </div>
      </div>
      {q.isLoading && (
        <div className="flex items-center gap-2 text-muted-foreground p-8 text-sm">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      )}
      {q.data && (
        <>
          <SegmentTable title="Equity" rows={q.data.equityRows} totals={q.data.equityTotals} />
          <SegmentTable title="F & O" rows={q.data.fnoRows} totals={q.data.fnoTotals} />

          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-xs">
              <tbody>
                <tr className="bg-emerald-200 dark:bg-emerald-900/40 font-semibold">
                  <td className="px-2 py-2 border border-border w-[200px]">Grand Total</td>
                  <td className="px-2 py-2 border border-border w-[110px]" />
                  <td className="px-2 py-2 border border-border tabular-nums text-right w-[120px]">{fmt(q.data.grandTotal.purValue)}</td>
                  <td className="px-2 py-2 border border-border" />
                  <td className="px-2 py-2 border border-border tabular-nums text-right w-[120px]">{fmt(q.data.grandTotal.valuation)}</td>
                  <td className={`px-2 py-2 border border-border tabular-nums text-right w-[120px] ${toDecimal(q.data.grandTotal.unrealisedPnL).gte(0) ? 'text-positive' : 'text-negative'}`}>
                    {fmt(q.data.grandTotal.unrealisedPnL)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
