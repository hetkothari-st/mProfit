import { useState } from 'react';
import { useQueries, useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { LineChart, RefreshCw, Plus, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/common/EmptyState';
import { portfoliosApi } from '@/api/portfolios.api';
import { assetsApi } from '@/api/assets.api';
import { apiErrorMessage } from '@/api/client';
import { TransactionFormDialog } from '@/pages/transactions/TransactionFormDialog';
import { formatINR, formatPercent, Decimal, toDecimal } from '@portfolioos/shared';
import type { HoldingRow } from '@portfolioos/shared';

export function MutualFundsPage() {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data: portfolios } = useQuery({
    queryKey: ['portfolios'],
    queryFn: () => portfoliosApi.list(),
  });

  const holdingsQueries = useQueries({
    queries:
      portfolios?.map((p) => ({
        queryKey: ['portfolio-holdings', p.id],
        queryFn: () => portfoliosApi.holdings(p.id),
      })) ?? [],
  });

  const syncMutation = useMutation({
    mutationFn: () => assetsApi.amfiSync(),
    onSuccess: (r) => {
      toast.success(`AMFI sync: ${r.navsUpserted} NAVs upserted, ${r.mastersCreated} new schemes`);
      queryClient.invalidateQueries({ queryKey: ['portfolio-holdings'] });
      queryClient.invalidateQueries({ queryKey: ['portfolio-summary'] });
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'AMFI sync failed')),
  });

  const all = holdingsQueries.flatMap((q, idx) =>
    (q.data ?? []).map((h) => ({
      ...h,
      portfolioId: portfolios?.[idx]?.id ?? '',
      portfolioName: portfolios?.[idx]?.name ?? '',
    })),
  );
  const mfs = all.filter((h) => h.assetClass === 'MUTUAL_FUND');

  // Sum money in Decimal — the API delivers Money strings per §3.2 and direct
  // `+` would coerce through IEEE-754.
  const totalValueD = mfs.reduce(
    (s, h) => (h.currentValue !== null ? s.plus(toDecimal(h.currentValue)) : s),
    new Decimal(0),
  );
  const totalCostD = mfs.reduce((s, h) => s.plus(toDecimal(h.totalCost)), new Decimal(0));
  const totalPnLD = totalValueD.minus(totalCostD);
  const totalValue = totalValueD.toFixed(4);
  const totalCost = totalCostD.toFixed(4);
  const totalPnL = totalPnLD.toFixed(4);
  const totalPnLPct = totalCostD.greaterThan(0)
    ? totalPnLD.dividedBy(totalCostD).times(100).toNumber()
    : 0;

  return (
    <div>
      <PageHeader
        title="Mutual Funds"
        description="MF holdings across all portfolios, priced from AMFI NAV"
        actions={
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => syncMutation.mutate()}
              disabled={syncMutation.isPending}
            >
              {syncMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Sync AMFI NAV
            </Button>
            <Button onClick={() => setOpen(true)}>
              <Plus className="h-4 w-4" /> Add transaction
            </Button>
          </div>
        }
      />

      {mfs.length === 0 ? (
        <EmptyState
          icon={LineChart}
          title="No mutual fund holdings"
          description="Sync AMFI NAV first, then add a BUY or SIP transaction on a scheme."
          action={
            <Button onClick={() => setOpen(true)}>
              <Plus className="h-4 w-4" /> Add transaction
            </Button>
          }
        />
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <Card>
              <CardContent className="p-4">
                <div className="text-xs text-muted-foreground">Current value</div>
                <div className="text-xl font-semibold mt-1 tabular-nums">{formatINR(totalValue)}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="text-xs text-muted-foreground">Invested</div>
                <div className="text-xl font-semibold mt-1 tabular-nums">{formatINR(totalCost)}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="text-xs text-muted-foreground">Unrealised P&L</div>
                <div
                  className={`text-xl font-semibold mt-1 tabular-nums ${
                    totalPnLD.greaterThan(0)
                      ? 'text-positive'
                      : totalPnLD.isNegative()
                        ? 'text-negative'
                        : ''
                  }`}
                >
                  {formatINR(totalPnL)}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="text-xs text-muted-foreground">Return</div>
                <div
                  className={`text-xl font-semibold mt-1 tabular-nums ${
                    totalPnLD.greaterThan(0)
                      ? 'text-positive'
                      : totalPnLD.isNegative()
                        ? 'text-negative'
                        : ''
                  }`}
                >
                  {formatPercent(totalPnLPct)}
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardContent className="p-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground uppercase tracking-wide border-b">
                    <th className="py-2 pr-4">Scheme</th>
                    <th className="py-2 pr-4 text-right">Units</th>
                    <th className="py-2 pr-4 text-right">Avg cost</th>
                    <th className="py-2 pr-4 text-right">NAV</th>
                    <th className="py-2 pr-4 text-right">Value</th>
                    <th className="py-2 pr-4 text-right">P&L</th>
                    <th className="py-2 pr-4 text-right">%</th>
                    <th className="py-2 pr-4">Portfolio</th>
                  </tr>
                </thead>
                <tbody>
                  {mfs.map((h: HoldingRow & { portfolioName: string; portfolioId: string }) => (
                    <tr key={h.id} className="border-b last:border-0 hover:bg-accent/20">
                      <td className="py-2 pr-4">
                        <div className="font-medium truncate max-w-sm">{h.assetName}</div>
                        <div className="text-xs text-muted-foreground">{h.symbol ?? h.isin ?? ''}</div>
                      </td>
                      <td className="py-2 pr-4 text-right tabular-nums">{h.quantity}</td>
                      <td className="py-2 pr-4 text-right tabular-nums">{formatINR(h.avgCostPrice)}</td>
                      <td className="py-2 pr-4 text-right tabular-nums">
                        {h.currentPrice != null ? formatINR(h.currentPrice) : '—'}
                      </td>
                      <td className="py-2 pr-4 text-right tabular-nums">
                        {h.currentValue != null ? formatINR(h.currentValue) : '—'}
                      </td>
                      <td
                        className={`py-2 pr-4 text-right tabular-nums ${
                          h.unrealisedPnL && toDecimal(h.unrealisedPnL).greaterThan(0)
                            ? 'text-positive'
                            : h.unrealisedPnL && toDecimal(h.unrealisedPnL).isNegative()
                              ? 'text-negative'
                              : ''
                        }`}
                      >
                        {h.unrealisedPnL != null ? formatINR(h.unrealisedPnL) : '—'}
                      </td>
                      <td
                        className={`py-2 pr-4 text-right tabular-nums ${
                          (h.unrealisedPnLPct ?? 0) > 0 ? 'text-positive' : (h.unrealisedPnLPct ?? 0) < 0 ? 'text-negative' : ''
                        }`}
                      >
                        {h.unrealisedPnLPct != null ? formatPercent(h.unrealisedPnLPct) : '—'}
                      </td>
                      <td className="py-2 pr-4 text-xs text-muted-foreground">{h.portfolioName}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </>
      )}

      <TransactionFormDialog open={open} onOpenChange={setOpen} />
    </div>
  );
}
