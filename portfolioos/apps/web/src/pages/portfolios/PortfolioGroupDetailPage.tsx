import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Wallet, TrendingUp, Percent, LineChart as LineChartIcon, Users } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { MetricCard } from '@/components/portfolio/MetricCard';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/common/EmptyState';
import { portfolioGroupsApi } from '@/api/portfolioGroups.api';
import {
  formatINR,
  formatPercent,
  formatQuantity,
  ASSET_CLASS_LABELS,
  toDecimal,
} from '@portfolioos/shared';

function signClass(m: string | null | undefined): 'up' | 'down' | 'flat' {
  if (m == null || m === '') return 'flat';
  try {
    const d = toDecimal(m);
    return d.greaterThan(0) ? 'up' : d.isNegative() ? 'down' : 'flat';
  } catch {
    return 'flat';
  }
}

export function PortfolioGroupDetailPage() {
  const { id } = useParams<{ id: string }>();

  const groupQuery = useQuery({
    queryKey: ['portfolio-group', id],
    queryFn: () => portfolioGroupsApi.get(id!),
    enabled: Boolean(id),
  });
  const listQuery = useQuery({
    queryKey: ['portfolio-groups'],
    queryFn: portfolioGroupsApi.list,
  });
  const summaryQuery = useQuery({
    queryKey: ['portfolio-group', id, 'summary'],
    queryFn: () => portfolioGroupsApi.summary(id!),
    enabled: Boolean(id),
  });
  const holdingsQuery = useQuery({
    queryKey: ['portfolio-group-holdings', id],
    queryFn: () => portfolioGroupsApi.holdings(id!),
    enabled: Boolean(id),
  });

  const group = groupQuery.data;
  // Pull member list from list-endpoint result (already includes member refs)
  const groupListEntry = listQuery.data?.find((g) => g.id === id);
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
        eyebrow="Group"
        title={group?.name ?? 'Portfolio group'}
        description={group?.description ?? undefined}
      />

      {groupListEntry && groupListEntry.members.length > 0 && (
        <div className="mb-6 flex flex-wrap items-center gap-2">
          <Users className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs text-muted-foreground mr-1">Members:</span>
          {groupListEntry.members.map((m) => (
            <Link
              key={m.id}
              to={`/portfolios/${m.id}`}
              className="inline-flex items-center rounded-full border border-border/70 bg-background/40 px-2.5 py-0.5 text-xs hover:bg-muted/60"
            >
              {m.name}
            </Link>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <MetricCard
          label="Combined value"
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
          <CardTitle>Combined holdings</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {holdingsQuery.isLoading ? (
            <div className="p-6 text-sm text-muted-foreground">Loading holdings…</div>
          ) : holdings.length === 0 ? (
            <div className="p-6">
              <EmptyState
                title="No holdings in this group"
                description="Add member portfolios with holdings to see combined positions here."
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
    </div>
  );
}
