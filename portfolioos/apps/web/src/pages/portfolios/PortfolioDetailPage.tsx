import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { ArrowLeft, Wallet, TrendingUp, Percent, LineChart as LineChartIcon, RefreshCw, Plus, Loader2 } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { MetricCard } from '@/components/portfolio/MetricCard';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/common/EmptyState';
import { portfoliosApi } from '@/api/portfolios.api';
import { assetsApi } from '@/api/assets.api';
import { apiErrorMessage } from '@/api/client';
import { TransactionFormDialog } from '@/pages/transactions/TransactionFormDialog';
import {
  formatINR,
  formatPercent,
  formatQuantity,
  ASSET_CLASS_LABELS,
  toDecimal,
} from '@portfolioos/shared';

// Money arrives as a branded string (§3.2); `> 0` / `< 0` would lex-compare.
// Route through Decimal so the sign is evaluated on the actual number.
function signClass(m: string | null | undefined): 'up' | 'down' | 'flat' {
  if (m == null || m === '') return 'flat';
  try {
    const d = toDecimal(m);
    return d.greaterThan(0) ? 'up' : d.isNegative() ? 'down' : 'flat';
  } catch {
    return 'flat';
  }
}

export function PortfolioDetailPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [txOpen, setTxOpen] = useState(false);

  const portfolioQuery = useQuery({
    queryKey: ['portfolio', id],
    queryFn: () => portfoliosApi.get(id!),
    enabled: Boolean(id),
  });
  const summaryQuery = useQuery({
    queryKey: ['portfolio', id, 'summary'],
    queryFn: () => portfoliosApi.summary(id!),
    enabled: Boolean(id),
  });
  const holdingsQuery = useQuery({
    queryKey: ['portfolio-holdings', id],
    queryFn: () => portfoliosApi.holdings(id!),
    enabled: Boolean(id),
  });

  const refreshMutation = useMutation({
    mutationFn: () => assetsApi.refreshPortfolio(id!),
    onSuccess: (r) => {
      toast.success(`${r.updated} holdings refreshed`);
      queryClient.invalidateQueries({ queryKey: ['portfolio', id] });
      queryClient.invalidateQueries({ queryKey: ['portfolio-holdings', id] });
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Refresh failed')),
  });

  const portfolio = portfolioQuery.data;
  const summary = summaryQuery.data;
  const holdings = holdingsQuery.data ?? [];

  return (
    <div>
      <Button asChild variant="ghost" size="sm" className="mb-4 -ml-2">
        <Link to="/portfolios">
          <ArrowLeft className="h-4 w-4" /> Back to portfolios
        </Link>
      </Button>

      <PageHeader
        title={portfolio?.name ?? 'Portfolio'}
        description={portfolio?.description ?? undefined}
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
            <Button onClick={() => setTxOpen(true)}>
              <Plus className="h-4 w-4" /> Add transaction
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <MetricCard
          label="Current value"
          value={formatINR(summary?.currentValue ?? 0)}
          icon={Wallet}
        />
        <MetricCard
          label="Invested"
          value={formatINR(summary?.totalInvestment ?? 0)}
          icon={TrendingUp}
        />
        <MetricCard
          label="Unrealised P&L"
          value={formatINR(summary?.unrealisedPnL ?? 0, { showSign: true })}
          icon={LineChartIcon}
          trend={{
            direction: signClass(summary?.unrealisedPnL),
            value: formatPercent(summary?.unrealisedPnLPct ?? 0, 2, true),
          }}
        />
        <MetricCard
          label="Today's change"
          value={formatINR(summary?.todaysChange ?? 0, { showSign: true })}
          icon={Percent}
          trend={{
            direction: signClass(summary?.todaysChange),
            value: formatPercent(summary?.todaysChangePct ?? 0, 2, true),
          }}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Holdings</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {holdingsQuery.isLoading ? (
            <div className="p-6 text-sm text-muted-foreground">Loading holdings…</div>
          ) : holdings.length === 0 ? (
            <div className="p-6">
              <EmptyState
                title="No holdings yet"
                description="Import a contract note or add a manual transaction to see holdings here."
                action={
                  <Button onClick={() => setTxOpen(true)}>
                    <Plus className="h-4 w-4" /> Add transaction
                  </Button>
                }
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="text-left font-medium px-4 py-2">Asset</th>
                    <th className="text-left font-medium px-4 py-2">Class</th>
                    <th className="text-right font-medium px-4 py-2">Qty</th>
                    <th className="text-right font-medium px-4 py-2">Avg cost</th>
                    <th className="text-right font-medium px-4 py-2">Invested</th>
                    <th className="text-right font-medium px-4 py-2">CMP</th>
                    <th className="text-right font-medium px-4 py-2">Value</th>
                    <th className="text-right font-medium px-4 py-2">P&L</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {holdings.map((h) => (
                    <tr key={h.id} className="hover:bg-muted/30">
                      <td className="px-4 py-2">
                        <div className="font-medium">{h.assetName}</div>
                        {h.symbol && (
                          <div className="text-xs text-muted-foreground">{h.symbol}</div>
                        )}
                      </td>
                      <td className="px-4 py-2 text-muted-foreground">
                        {ASSET_CLASS_LABELS[h.assetClass] ?? h.assetClass}
                      </td>
                      <td className="px-4 py-2 text-right numeric">
                        {formatQuantity(h.quantity)}
                      </td>
                      <td className="px-4 py-2 text-right numeric">
                        {formatINR(h.avgCostPrice)}
                      </td>
                      <td className="px-4 py-2 text-right numeric">{formatINR(h.totalCost)}</td>
                      <td className="px-4 py-2 text-right numeric">
                        {formatINR(h.currentPrice)}
                      </td>
                      <td className="px-4 py-2 text-right numeric">
                        {formatINR(h.currentValue)}
                      </td>
                      <td
                        className={`px-4 py-2 text-right numeric ${
                          h.unrealisedPnL && toDecimal(h.unrealisedPnL).greaterThan(0)
                            ? 'text-positive'
                            : h.unrealisedPnL && toDecimal(h.unrealisedPnL).isNegative()
                              ? 'text-negative'
                              : ''
                        }`}
                      >
                        {formatINR(h.unrealisedPnL, { showSign: true })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <TransactionFormDialog open={txOpen} onOpenChange={setTxOpen} defaultPortfolioId={id} />
    </div>
  );
}
