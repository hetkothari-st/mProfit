import { useMemo, useState } from 'react';
import { useQuery, useQueries, useMutation } from '@tanstack/react-query';
import { FlaskConical, Loader2 } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { formatINR, formatPercent, toDecimal } from '@everypaisa/shared';
import type { HoldingRow } from '@everypaisa/shared';
import { portfoliosApi } from '@/api/portfolios.api';
import { analyticsApi } from '@/api/analytics.api';
import { apiErrorMessage } from '@/api/client';
import { AnalyticsInfo } from '../AnalyticsInfo';

/**
 * 3c — What-if sale simulator. Pick a holding, enter a hypothetical sell
 * quantity (+ optional price), and see the computed realised gain, tax term,
 * estimated tax, cash freed, and concentration shift. Informational only.
 */
export function WhatIfSimulator() {
  const { data: portfolios } = useQuery({ queryKey: ['portfolios'], queryFn: () => portfoliosApi.list() });
  const holdingsQueries = useQueries({
    queries: (portfolios ?? []).map((p) => ({
      queryKey: ['portfolio-holdings', p.id],
      queryFn: () => portfoliosApi.holdings(p.id),
    })),
  });
  const holdings = useMemo(
    () => holdingsQueries.flatMap((q) => (q.data ?? []) as HoldingRow[]).filter((h) => Number(h.quantity) > 0),
    [holdingsQueries],
  );

  const [holdingId, setHoldingId] = useState('');
  const [qty, setQty] = useState('');
  const [price, setPrice] = useState('');
  const selected = holdings.find((h) => h.id === holdingId);

  const sim = useMutation({
    mutationFn: () =>
      analyticsApi.whatIf({ holdingId, sellQty: qty, sellPrice: price.trim() === '' ? null : price }),
  });

  const canRun = holdingId && Number(qty) > 0;

  return (
    <Card>
      <CardHeader className="pb-2">
        <p className="text-[10px] uppercase tracking-kerned text-accent-ink/80 mb-1">Scenario</p>
        <CardTitle className="flex items-center gap-2"><FlaskConical className="h-4 w-4" /> What-if: simulate a sale<AnalyticsInfo k="whatIf" /></CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 items-end">
          <label className="sm:col-span-2 text-xs text-muted-foreground">
            Holding
            <select
              value={holdingId}
              onChange={(e) => { setHoldingId(e.target.value); sim.reset(); }}
              className="mt-1 w-full rounded-md border bg-background px-2 py-1.5 text-sm text-foreground"
            >
              <option value="">Select a holding…</option>
              {holdings.map((h) => (
                <option key={h.id} value={h.id}>
                  {(h.symbol ?? h.assetName ?? 'Asset')} · {h.quantity} held
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-muted-foreground">
            Sell qty
            <input
              type="number" value={qty} onChange={(e) => setQty(e.target.value)}
              placeholder={selected ? String(selected.quantity) : '0'}
              className="mt-1 w-full rounded-md border bg-background px-2 py-1.5 text-sm tabular-nums"
            />
          </label>
          <label className="text-xs text-muted-foreground">
            Sell price (opt.)
            <input
              type="number" value={price} onChange={(e) => setPrice(e.target.value)}
              placeholder={selected?.currentPrice != null ? String(selected.currentPrice) : 'current'}
              className="mt-1 w-full rounded-md border bg-background px-2 py-1.5 text-sm tabular-nums"
            />
          </label>
        </div>
        <Button className="mt-3" disabled={!canRun || sim.isPending} onClick={() => sim.mutate()}>
          {sim.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <FlaskConical className="h-4 w-4" />}
          <span className="ml-1.5">Simulate</span>
        </Button>

        {sim.isError && <p className="mt-3 text-sm text-negative">{apiErrorMessage(sim.error)}</p>}

        {sim.data && (() => {
          const sale = sim.data.sale;
          // Part of this gain is taxed at the investor's slab rate rather than
          // a capital-gains rate. It used to be reported as ₹0 tax; now it is
          // priced, and the assumption behind the rate is named on screen.
          const slabTaxed = toDecimal(sale.slabTaxableGain).greaterThan(0);
          const termLabel =
            sale.term === 'MIXED'
              ? 'Realised gain (mixed)'
              : sale.term === 'LONG'
                ? 'Realised LTCG'
                : 'Realised STCG';
          return (
          <div className="mt-4 space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Stat label="Proceeds" value={formatINR(sim.data.deltas.proceeds)} />
              <Stat
                label={termLabel}
                value={formatINR(sale.realisedPnL, { showSign: true })}
                tone={sale.isLoss ? 'neg' : 'pos'}
              />
              <Stat
                label={`Est. tax${sale.taxRatePct != null ? ` (${sale.taxRatePct}%)` : ''}`}
                value={formatINR(sim.data.deltas.estTax)}
              />
              <Stat label="Net cash after tax" value={formatINR(sim.data.deltas.netCashAfterTax)} />
            </div>

            {sale.term === 'MIXED' && (
              <div className="rounded-lg border bg-muted/40 px-3 py-2 text-[12.5px] text-muted-foreground">
                These units straddle the long-term threshold, so the two halves are taxed differently.{' '}
                <span className="text-foreground">
                  Long-term: {sale.longTerm.quantity} units, {formatINR(sale.longTerm.realisedPnL, { showSign: true })}
                  {sale.longTerm.taxRatePct != null ? ` at ${sale.longTerm.taxRatePct}%` : ''}
                </span>
                {' · '}
                <span className="text-foreground">
                  Short-term: {sale.shortTerm.quantity} units, {formatINR(sale.shortTerm.realisedPnL, { showSign: true })}
                  {sale.shortTerm.taxRatePct != null ? ` at ${sale.shortTerm.taxRatePct}%` : ' at your slab rate'}
                </span>.
              </div>
            )}

            {slabTaxed && (
              <p className="text-[12px] text-amber-600 dark:text-amber-400">
                {formatINR(sale.slabTaxableGain)} of this gain is short-term on a non-equity asset, so it is taxed
                at your income-tax slab rate
                {sale.slabRatePct != null ? `, taken here as ${sale.slabRatePct}%` : ''}.
                {sale.slabRateIsEstimate && ' Record your slab in your risk profile for a figure based on your own rate.'}
              </p>
            )}

            {sale.lotsMatched > 0 && (
              <p className="text-[11px] text-muted-foreground">
                Matched {sale.lotsMatched} purchase {sale.lotsMatched === 1 ? 'lot' : 'lots'} oldest-first (FIFO)
                {sale.oldestMatchedBuyDate ? `, from ${sale.oldestMatchedBuyDate}` : ''} · cost basis{' '}
                {formatINR(sale.costBasis)}
              </p>
            )}

            <div className="text-sm text-muted-foreground">
              This holding: {formatPercent(sim.data.deltas.concentrationBeforePct, 1)} →{' '}
              <span className="text-foreground font-medium">{formatPercent(sim.data.deltas.concentrationAfterPct, 1)}</span> of portfolio
              {' · '}{sim.data.deltas.remainingQty} units left ({formatINR(sim.data.deltas.remainingValue)})
            </div>
            {sale.isLoss && (
              <p className="text-[12px] text-amber-600 dark:text-amber-400">
                This sale realises a loss — it may be set off against capital gains (see the tax-harvest card).
              </p>
            )}
            <p className="text-[11px] text-muted-foreground">{sim.data.disclaimer}</p>
          </div>
          );
        })()}
      </CardContent>
    </Card>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'pos' | 'neg' }) {
  return (
    <div className="rounded-lg bg-muted/50 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-base font-semibold mt-0.5 tabular-nums ${tone === 'pos' ? 'text-positive' : tone === 'neg' ? 'text-negative' : ''}`}>{value}</p>
    </div>
  );
}
