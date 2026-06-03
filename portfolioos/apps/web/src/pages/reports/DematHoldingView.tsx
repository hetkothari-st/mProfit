/**
 * Demat / broker-account-wise holdings — matches the mProfit
 * "Physical/Demat Accountwise Stock Report" with the broker as a
 * coloured banner row, scheme rows beneath, and a final green grand
 * total. Two modes: rollup (balance only) + movements (dated in/out).
 */

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { reportsApi, type DematHoldingRow, type DematMovementRow } from '@/api/reports.api';
import { Decimal, toDecimal } from '@portfolioos/shared';

function fmtQty(v: string | null | undefined): string {
  if (v == null || v === '') return '—';
  try {
    const d = toDecimal(v);
    if (!d.isFinite()) return '—';
    const isNeg = d.isNegative();
    const fixed = d.abs().toFixed(0, Decimal.ROUND_HALF_EVEN);
    const grouped = fixed.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return isNeg ? `(${grouped})` : grouped;
  } catch {
    return '—';
  }
}

function fmtDate(s: string): string {
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function groupRollupByBroker(rows: DematHoldingRow[]): Array<{ broker: string; rows: DematHoldingRow[]; total: Decimal }> {
  const map = new Map<string, { broker: string; rows: DematHoldingRow[]; total: Decimal }>();
  for (const r of rows) {
    const g = map.get(r.brokerName) ?? { broker: r.brokerName, rows: [], total: new Decimal(0) };
    g.rows.push(r);
    g.total = g.total.plus(r.balanceQty);
    map.set(r.brokerName, g);
  }
  return Array.from(map.values()).sort((a, b) => a.broker.localeCompare(b.broker));
}

interface MovementsByBrokerScheme {
  broker: string;
  scripts: Array<{
    scriptName: string;
    isin: string | null;
    movements: DematMovementRow[];
    total: { in: Decimal; out: Decimal; balance: Decimal };
  }>;
}

function groupMovements(rows: DematMovementRow[]): MovementsByBrokerScheme[] {
  const map = new Map<string, Map<string, DematMovementRow[]>>();
  for (const r of rows) {
    const brokerMap = map.get(r.brokerName) ?? new Map<string, DematMovementRow[]>();
    const arr = brokerMap.get(r.scriptName) ?? [];
    arr.push(r);
    brokerMap.set(r.scriptName, arr);
    map.set(r.brokerName, brokerMap);
  }
  return Array.from(map.entries())
    .map(([broker, scripts]) => ({
      broker,
      scripts: Array.from(scripts.entries())
        .map(([scriptName, movements]) => {
          const sorted = [...movements].sort((a, b) => a.date.localeCompare(b.date));
          const sumIn = sorted.reduce((s, m) => s.plus(m.inQty), new Decimal(0));
          const sumOut = sorted.reduce((s, m) => s.plus(m.outQty), new Decimal(0));
          const balance = sumIn.minus(sumOut);
          return {
            scriptName,
            isin: sorted[0]?.isin ?? null,
            movements: sorted,
            total: { in: sumIn, out: sumOut, balance },
          };
        })
        .sort((a, b) => a.scriptName.localeCompare(b.scriptName)),
    }))
    .sort((a, b) => a.broker.localeCompare(b.broker));
}

export function DematHoldingView() {
  const [mode, setMode] = useState<'rollup' | 'movements'>('rollup');
  const q = useQuery({
    queryKey: ['report-demat-holdings'],
    queryFn: () => reportsApi.dematHoldings(),
  });

  const rollup = useMemo(() => (q.data ? groupRollupByBroker(q.data.rows) : []), [q.data]);
  const movements = useMemo(() => (q.data ? groupMovements(q.data.movements) : []), [q.data]);

  if (q.isLoading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground p-8 text-sm">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading…
      </div>
    );
  }
  if (!q.data) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="inline-flex rounded-md border border-border overflow-hidden">
          <button
            type="button"
            onClick={() => setMode('rollup')}
            className={`px-3 py-1.5 text-xs font-medium transition-colors ${
              mode === 'rollup' ? 'bg-accent/15 text-accent-ink' : 'hover:bg-muted/50'
            }`}
          >
            Balance rollup
          </button>
          <button
            type="button"
            onClick={() => setMode('movements')}
            className={`px-3 py-1.5 text-xs font-medium border-l border-border transition-colors ${
              mode === 'movements' ? 'bg-accent/15 text-accent-ink' : 'hover:bg-muted/50'
            }`}
          >
            Dated movements
          </button>
        </div>
        <span className="text-[11px] text-muted-foreground">
          As of {new Date().toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' })}
        </span>
      </div>

      {mode === 'rollup' ? (
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-rose-100/70 dark:bg-rose-950/50">
                <th className="px-3 py-2 border border-border text-left">Demat Account / Script Name</th>
                <th className="px-3 py-2 border border-border text-right w-[140px]">Balance Qty.</th>
              </tr>
            </thead>
            <tbody>
              {rollup.length === 0 && (
                <tr>
                  <td colSpan={2} className="px-3 py-8 text-center text-muted-foreground border border-border">
                    No open positions.
                  </td>
                </tr>
              )}
              {rollup.map((g) => (
                <>
                  <tr key={`${g.broker}-hdr`} className="bg-sky-100/70 dark:bg-sky-950/40">
                    <td className="px-3 py-1.5 border border-border font-semibold">{g.broker}</td>
                    <td className="px-3 py-1.5 border border-border" />
                  </tr>
                  {g.rows.map((r, i) => (
                    <tr key={`${g.broker}-${i}`} className="hover:bg-muted/20">
                      <td className="px-3 py-1.5 border border-border pl-6">{r.scriptName}</td>
                      <td className={`px-3 py-1.5 border border-border tabular-nums text-right ${toDecimal(r.balanceQty).isNegative() ? 'text-negative' : ''}`}>
                        {fmtQty(r.balanceQty)}
                      </td>
                    </tr>
                  ))}
                </>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-emerald-100 dark:bg-emerald-950/40 font-semibold">
                <td className="px-3 py-2 border border-border">Grand Total</td>
                <td className="px-3 py-2 border border-border tabular-nums text-right">
                  {fmtQty(q.data.grandTotal)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-rose-100/70 dark:bg-rose-950/50">
                <th className="px-3 py-2 border border-border text-left w-[100px]">Date</th>
                <th className="px-3 py-2 border border-border text-left">Demat Account / Script Name</th>
                <th className="px-3 py-2 border border-border text-right w-[110px]">In Qty.</th>
                <th className="px-3 py-2 border border-border text-right w-[110px]">Out Qty.</th>
                <th className="px-3 py-2 border border-border text-right w-[110px]">Balance Qty.</th>
              </tr>
            </thead>
            <tbody>
              {movements.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-8 text-center text-muted-foreground border border-border">
                    No movements found.
                  </td>
                </tr>
              )}
              {movements.map((g) => (
                <>
                  <tr key={`${g.broker}-hdr`} className="bg-sky-100/70 dark:bg-sky-950/40">
                    <td className="px-3 py-1.5 border border-border" />
                    <td className="px-3 py-1.5 border border-border font-semibold">{g.broker}</td>
                    <td colSpan={3} className="px-3 py-1.5 border border-border" />
                  </tr>
                  {g.scripts.map((sc) => (
                    <>
                      <tr key={`${g.broker}-${sc.scriptName}-hdr`} className="bg-sky-50 dark:bg-sky-950/20">
                        <td className="px-3 py-1.5 border border-border" />
                        <td className="px-3 py-1.5 border border-border font-medium pl-6">{sc.scriptName}</td>
                        <td colSpan={3} className="px-3 py-1.5 border border-border" />
                      </tr>
                      {sc.movements.map((m, i) => (
                        <tr
                          key={`${g.broker}-${sc.scriptName}-${i}`}
                          className={m.kind === 'OPENING' ? 'bg-rose-50/60 dark:bg-rose-950/20' : 'hover:bg-muted/20'}
                        >
                          <td className="px-3 py-1.5 border border-border tabular-nums">{m.kind === 'OPENING' ? '' : fmtDate(m.date)}</td>
                          <td className="px-3 py-1.5 border border-border pl-6 text-muted-foreground">{m.reason}</td>
                          <td className="px-3 py-1.5 border border-border tabular-nums text-right">{toDecimal(m.inQty).gt(0) ? fmtQty(m.inQty) : '0'}</td>
                          <td className="px-3 py-1.5 border border-border tabular-nums text-right">{toDecimal(m.outQty).gt(0) ? fmtQty(m.outQty) : '0'}</td>
                          <td className={`px-3 py-1.5 border border-border tabular-nums text-right ${toDecimal(m.balanceQty).isNegative() ? 'text-negative' : ''}`}>
                            {fmtQty(m.balanceQty)}
                          </td>
                        </tr>
                      ))}
                      <tr key={`${g.broker}-${sc.scriptName}-total`} className="bg-yellow-50/60 dark:bg-yellow-950/20 font-medium">
                        <td className="px-3 py-1.5 border border-border" />
                        <td className="px-3 py-1.5 border border-border">Script Total</td>
                        <td className="px-3 py-1.5 border border-border tabular-nums text-right">{fmtQty(sc.total.in.toString())}</td>
                        <td className="px-3 py-1.5 border border-border tabular-nums text-right">{fmtQty(sc.total.out.toString())}</td>
                        <td className={`px-3 py-1.5 border border-border tabular-nums text-right ${sc.total.balance.isNegative() ? 'text-negative' : ''}`}>
                          {fmtQty(sc.total.balance.toString())}
                        </td>
                      </tr>
                    </>
                  ))}
                </>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
