import { ArrowLeftRight } from 'lucide-react';
import { useQueries, useQuery } from '@tanstack/react-query';
import { Decimal, type HoldingRow, formatINR } from '@portfolioos/shared';
import { SimpleAssetPage } from '@/pages/assetClasses/SimpleAssetPage';
import { Card, CardContent } from '@/components/ui/card';
import { forexApi } from '@/api/forex.api';
import { portfoliosApi } from '@/api/portfolios.api';

// FOREX_PAIR positions ride the standard HoldingProjection FIFO flow with the
// pair code (e.g. "USDINR", "EURUSD") stored in the `isin` field. Live value
// is `quantity × latest FX rate` of (isin → INR) or the cross pair encoded in
// assetKey, all of which `routePriceLookup`'s FOREX_PAIR case handles.
export function ForexPairsTab() {
  const tickerQ = useQuery({
    queryKey: ['forex', 'ticker'],
    queryFn: () => forexApi.ticker(),
    refetchInterval: 30_000,
    staleTime: 0,
  });

  const portfoliosQ = useQuery({
    queryKey: ['portfolios'],
    queryFn: () => portfoliosApi.list(),
  });

  function computeLiveValue(h: HoldingRow & { portfolioName: string }): string | null {
    try {
      const code = (h.isin ?? '').toUpperCase();
      if (code.length === 6) {
        // Cross pair like EURUSD — value in quote currency, displayed in INR
        // via the quote-to-INR conversion done below.
        const base = code.slice(0, 3);
        const quote = code.slice(3, 6);
        const baseInr = tickerQ.data?.find((r) => r.base === base && r.quote === 'INR');
        if (!baseInr) return null;
        return new Decimal(h.quantity).times(new Decimal(baseInr.rate)).toFixed(2);
      }
      if (code.length === 3) {
        // Simple base→INR (e.g. USD positions valued in INR).
        const row = tickerQ.data?.find((r) => r.base === code && r.quote === 'INR');
        if (!row) return null;
        return new Decimal(h.quantity).times(new Decimal(row.rate)).toFixed(2);
      }
      return null;
    } catch {
      return null;
    }
  }

  return (
    <div className="space-y-4">
      <SimpleAssetPage
        title="Forex pairs"
        description="Currency pair positions (USDINR, EURUSD, …). Speculative business income — bypasses CG FIFO."
        icon={ArrowLeftRight}
        assetClasses={['FOREX_PAIR']}
        defaultAssetClass="FOREX_PAIR"
        computeLiveValue={computeLiveValue}
      />
      {portfoliosQ.data && portfoliosQ.data.length > 0 && (
        <ForexPairPnlSection portfolioIds={portfoliosQ.data.map((p) => p.id)} />
      )}
    </div>
  );
}

function ForexPairPnlSection({ portfolioIds }: { portfolioIds: string[] }) {
  // One query per portfolio; useQueries lets us fan out without a service-side
  // aggregator. Backend computes realised pair P&L from BUY/SELL pairs (FIFO-
  // matched per-pair) and tags each row by FY for tax reporting.
  const pnlQueries = useQueries({
    queries: portfolioIds.map((id) => ({
      queryKey: ['forex', 'pair-pnl', id],
      queryFn: () => forexApi.pairPnl(id),
    })),
  });

  const allRows = pnlQueries.flatMap((q) => q.data ?? []);
  if (pnlQueries.some((q) => q.isLoading)) {
    return (
      <Card>
        <CardContent className="p-4 text-xs text-muted-foreground">Loading P&amp;L…</CardContent>
      </Card>
    );
  }
  if (allRows.length === 0) {
    return (
      <Card>
        <CardContent className="p-4">
          <p className="text-xs text-muted-foreground">
            No realised P&amp;L yet. Record matching BUY + SELL transactions on a pair to see speculative business income aggregated by FY.
          </p>
        </CardContent>
      </Card>
    );
  }

  const totalRealised = allRows.reduce((s, r) => s.plus(new Decimal(r.realisedPnl)), new Decimal(0));

  return (
    <Card>
      <CardContent className="p-0">
        <div className="border-b border-border bg-muted/30 p-3">
          <p className="text-xs font-medium text-foreground">Speculative business income (FOREX_PAIR P&amp;L)</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Net realised across all pairs: <span className="font-mono tabular-nums">{formatINR(totalRealised.toFixed(2))}</span>
          </p>
        </div>
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-muted/20 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Pair</th>
              <th className="px-3 py-2">FY</th>
              <th className="px-3 py-2 text-right">Buy qty</th>
              <th className="px-3 py-2 text-right">Sell qty</th>
              <th className="px-3 py-2 text-right">Realised P&amp;L</th>
              <th className="px-3 py-2 text-right">Open position</th>
            </tr>
          </thead>
          <tbody>
            {allRows.map((r, i) => {
              const pnl = new Decimal(r.realisedPnl);
              return (
                <tr key={`${r.portfolioId}-${r.pair}-${r.financialYear}-${i}`} className="border-b border-border/50 last:border-0">
                  <td className="px-3 py-2 font-medium">{r.pair}</td>
                  <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{r.financialYear}</td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums">{r.buyQty}</td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums">{r.sellQty}</td>
                  <td
                    className={`px-3 py-2 text-right font-mono tabular-nums ${
                      pnl.gt(0) ? 'text-green-600 dark:text-green-400' : pnl.lt(0) ? 'text-destructive' : ''
                    }`}
                  >
                    {formatINR(pnl.toFixed(2))}
                  </td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums text-muted-foreground">{r.unrealisedPosition}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
