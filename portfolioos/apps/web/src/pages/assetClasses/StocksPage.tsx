import { useState } from 'react';
import { useQueries, useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { TrendingUp, RefreshCw, Plus, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/common/EmptyState';
import { portfoliosApi } from '@/api/portfolios.api';
import { assetsApi } from '@/api/assets.api';
import { apiErrorMessage } from '@/api/client';
import { TransactionFormDialog } from '@/pages/transactions/TransactionFormDialog';
import { formatINR, formatPercent } from '@portfolioos/shared';
import type { HoldingRow } from '@portfolioos/shared';

interface AggregatedHolding extends HoldingRow {
  portfolioIds: string[];
  portfolioNames: string[];
}

export function StocksPage() {
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

  const refreshMutation = useMutation({
    mutationFn: () => assetsApi.refreshAll(),
    onSuccess: (r) => {
      toast.success(`Refreshed ${r.stocks.updated} stock prices`);
      queryClient.invalidateQueries({ queryKey: ['portfolio-holdings'] });
      queryClient.invalidateQueries({ queryKey: ['portfolio-summary'] });
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Refresh failed')),
  });

  const allHoldings: Array<HoldingRow & { portfolioId: string; portfolioName: string }> =
    holdingsQueries.flatMap((q, idx) =>
      (q.data ?? []).map((h) => ({
        ...h,
        portfolioId: portfolios?.[idx]?.id ?? '',
        portfolioName: portfolios?.[idx]?.name ?? '',
      })),
    );

  const stocks = allHoldings.filter((h) => h.assetClass === 'EQUITY' || h.assetClass === 'ETF');

  const aggregated = Object.values(
    stocks.reduce<Record<string, AggregatedHolding>>((acc, h) => {
      const key = `${h.symbol ?? h.assetName}`;
      if (!acc[key]) {
        acc[key] = { ...h, portfolioIds: [h.portfolioId], portfolioNames: [h.portfolioName] };
      } else {
        const existing = acc[key];
        const newQty = existing.quantity + h.quantity;
        const newCost = existing.totalCost + h.totalCost;
        existing.quantity = newQty;
        existing.totalCost = newCost;
        existing.avgCostPrice = newQty > 0 ? newCost / newQty : 0;
        existing.currentValue =
          existing.currentValue != null && h.currentValue != null
            ? existing.currentValue + h.currentValue
            : existing.currentValue ?? h.currentValue;
        existing.unrealisedPnL =
          existing.unrealisedPnL != null && h.unrealisedPnL != null
            ? existing.unrealisedPnL + h.unrealisedPnL
            : existing.unrealisedPnL ?? h.unrealisedPnL;
        if (!existing.portfolioIds.includes(h.portfolioId)) {
          existing.portfolioIds.push(h.portfolioId);
          existing.portfolioNames.push(h.portfolioName);
        }
      }
      return acc;
    }, {}),
  );

  const totalValue = aggregated.reduce((s, h) => s + (h.currentValue ?? 0), 0);
  const totalCost = aggregated.reduce((s, h) => s + h.totalCost, 0);
  const totalPnL = totalValue - totalCost;
  const totalPnLPct = totalCost > 0 ? (totalPnL / totalCost) * 100 : 0;

  return (
    <div>
      <PageHeader
        title="Stocks"
        description="Equity holdings aggregated across all portfolios"
        actions={
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => refreshMutation.mutate()}
              disabled={refreshMutation.isPending}
            >
              {refreshMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Refresh prices
            </Button>
            <Button onClick={() => setOpen(true)}>
              <Plus className="h-4 w-4" /> Add transaction
            </Button>
          </div>
        }
      />

      {aggregated.length === 0 ? (
        <EmptyState
          icon={TrendingUp}
          title="No equity holdings"
          description="Add a BUY transaction on a stock to get started."
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
                    totalPnL > 0 ? 'text-positive' : totalPnL < 0 ? 'text-negative' : ''
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
                    totalPnL > 0 ? 'text-positive' : totalPnL < 0 ? 'text-negative' : ''
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
                    <th className="py-2 pr-4">Symbol</th>
                    <th className="py-2 pr-4">Name</th>
                    <th className="py-2 pr-4 text-right">Qty</th>
                    <th className="py-2 pr-4 text-right">Avg cost</th>
                    <th className="py-2 pr-4 text-right">LTP</th>
                    <th className="py-2 pr-4 text-right">Value</th>
                    <th className="py-2 pr-4 text-right">P&L</th>
                    <th className="py-2 pr-4 text-right">%</th>
                    <th className="py-2 pr-4">Portfolios</th>
                  </tr>
                </thead>
                <tbody>
                  {aggregated.map((h) => (
                    <tr key={`${h.symbol ?? h.assetName}`} className="border-b last:border-0 hover:bg-accent/20">
                      <td className="py-2 pr-4 font-medium">{h.symbol ?? '—'}</td>
                      <td className="py-2 pr-4 truncate max-w-xs">{h.assetName}</td>
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
                          (h.unrealisedPnL ?? 0) > 0 ? 'text-positive' : (h.unrealisedPnL ?? 0) < 0 ? 'text-negative' : ''
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
                      <td className="py-2 pr-4 text-xs text-muted-foreground truncate max-w-[180px]">
                        {h.portfolioNames.join(', ')}
                      </td>
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
