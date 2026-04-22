/**
 * Reusable minimum-viable asset-class page (§10 Phase 5-E).
 *
 * Shows all HoldingProjection rows for the given asset class(es) across
 * every portfolio, with a summary strip and an "Add transaction" button
 * that opens TransactionFormDialog pre-set to the defaultAssetClass.
 */
import { useState } from 'react';
import { useQueries, useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { formatINR, Decimal, type HoldingRow } from '@portfolioos/shared';
import type { AssetClass } from '@portfolioos/shared';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/common/EmptyState';
import { portfoliosApi } from '@/api/portfolios.api';
import { TransactionFormDialog } from '@/pages/transactions/TransactionFormDialog';

interface Props {
  title: string;
  description: string;
  icon: LucideIcon;
  /** Which asset classes to include in the holdings table */
  assetClasses: AssetClass[];
  /** Pre-selected asset class when opening the add-transaction dialog */
  defaultAssetClass: AssetClass;
}

const ASSET_CLASS_LABELS: Partial<Record<AssetClass, string>> = {
  EQUITY: 'Equity', MUTUAL_FUND: 'Mutual Fund', ETF: 'ETF',
  BOND: 'Bond', GOVT_BOND: 'Govt Bond', CORPORATE_BOND: 'Corp Bond',
  FIXED_DEPOSIT: 'Fixed Deposit',
  NPS: 'NPS', PPF: 'PPF', EPF: 'EPF',
  PHYSICAL_GOLD: 'Physical Gold', GOLD_BOND: 'Gold Bond', GOLD_ETF: 'Gold ETF',
  PHYSICAL_SILVER: 'Silver',
  CRYPTOCURRENCY: 'Crypto', REIT: 'REIT', INVIT: 'InvIT',
  PMS: 'PMS', AIF: 'AIF', ULIP: 'ULIP',
  REAL_ESTATE: 'Real Estate', ART_COLLECTIBLES: 'Art', CASH: 'Cash', OTHER: 'Other',
};

export function SimpleAssetPage({
  title,
  description,
  icon: Icon,
  assetClasses,
  defaultAssetClass,
}: Props) {
  const [txnOpen, setTxnOpen] = useState(false);

  const { data: portfolios } = useQuery({
    queryKey: ['portfolios'],
    queryFn: () => portfoliosApi.list(),
  });

  const holdingsQueries = useQueries({
    queries: (portfolios ?? []).map((p) => ({
      queryKey: ['portfolio-holdings', p.id],
      queryFn: () => portfoliosApi.holdings(p.id),
    })),
  });

  const isLoading = !portfolios || holdingsQueries.some((q) => q.isLoading);

  // Flatten + filter by asset class
  const classSet = new Set<string>(assetClasses);
  const allHoldings: Array<HoldingRow & { portfolioName: string }> = [];
  (portfolios ?? []).forEach((p, i) => {
    const rows: HoldingRow[] = holdingsQueries[i]?.data ?? [];
    rows
      .filter((h) => classSet.has(h.assetClass))
      .forEach((h) => allHoldings.push({ ...h, portfolioName: p.name }));
  });

  // Summary
  const totalInvested = allHoldings.reduce(
    (s, h) => s.plus(new Decimal(h.totalCost)),
    new Decimal(0),
  );
  const totalValue = allHoldings.reduce(
    (s, h) => (h.currentValue ? s.plus(new Decimal(h.currentValue)) : s),
    new Decimal(0),
  );
  const totalPnL = totalValue.minus(totalInvested);
  const pnlPct = totalInvested.isZero()
    ? null
    : totalPnL.div(totalInvested).times(100).toNumber();

  return (
    <div>
      <PageHeader
        title={title}
        description={description}
        actions={
          <Button onClick={() => setTxnOpen(true)}>
            <Plus className="h-4 w-4" /> Add
          </Button>
        }
      />

      {/* Summary strip */}
      {!isLoading && allHoldings.length > 0 && (
        <div className="grid grid-cols-3 gap-3 mb-6">
          {[
            { label: 'Invested', value: formatINR(totalInvested.toString()) },
            {
              label: 'Current value',
              value: formatINR(totalValue.toString()),
            },
            {
              label: 'Unrealised P&L',
              value: `${totalPnL.gte(0) ? '+' : ''}${formatINR(totalPnL.toString())}${pnlPct != null ? ` (${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(1)}%)` : ''}`,
              className: totalPnL.gte(0) ? 'text-positive' : 'text-negative',
            },
          ].map((m) => (
            <Card key={m.label}>
              <CardContent className="px-4 py-3">
                <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">
                  {m.label}
                </p>
                <p className={`text-xl font-semibold tabular-nums mt-1 ${m.className ?? ''}`}>
                  {m.value}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {isLoading && (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} className="h-14 animate-pulse bg-muted/60" />
          ))}
        </div>
      )}

      {!isLoading && allHoldings.length === 0 && (
        <EmptyState
          icon={Icon}
          title={`No ${title.toLowerCase()} yet`}
          description="Add a transaction to start tracking this asset class."
          action={
            <Button onClick={() => setTxnOpen(true)}>
              <Plus className="h-4 w-4" /> Add first entry
            </Button>
          }
        />
      )}

      {!isLoading && allHoldings.length > 0 && (
        <div className="rounded-md border overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40">
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Name</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground hidden sm:table-cell">Type</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground hidden md:table-cell">Portfolio</th>
                <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Qty / Units</th>
                <th className="text-right px-4 py-2.5 font-medium text-muted-foreground hidden sm:table-cell">Avg cost</th>
                <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Invested</th>
                <th className="text-right px-4 py-2.5 font-medium text-muted-foreground hidden lg:table-cell">Current</th>
                <th className="text-right px-4 py-2.5 font-medium text-muted-foreground hidden lg:table-cell">P&L</th>
              </tr>
            </thead>
            <tbody>
              {allHoldings.map((h) => {
                const pnl = h.currentValue && h.totalCost
                  ? new Decimal(h.currentValue).minus(new Decimal(h.totalCost))
                  : null;
                return (
                  <tr key={h.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-medium truncate max-w-[180px]">{h.assetName}</p>
                      {h.isin && <p className="text-xs text-muted-foreground">{h.isin}</p>}
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell text-muted-foreground text-xs">
                      {ASSET_CLASS_LABELS[h.assetClass as AssetClass] ?? h.assetClass}
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell text-muted-foreground text-xs">
                      {h.portfolioName}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {new Decimal(h.quantity).toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums hidden sm:table-cell">
                      {formatINR(h.avgCostPrice)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-medium">
                      {formatINR(h.totalCost)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums hidden lg:table-cell">
                      {h.currentValue ? formatINR(h.currentValue) : '—'}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums hidden lg:table-cell">
                      {pnl ? (
                        <span className={pnl.gte(0) ? 'text-positive' : 'text-negative'}>
                          {pnl.gte(0) ? '+' : ''}{formatINR(pnl.toString())}
                        </span>
                      ) : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <TransactionFormDialog
        open={txnOpen}
        onOpenChange={setTxnOpen}
        initial={null}
        defaultPortfolioId={portfolios?.[0]?.id}
      />
    </div>
  );
}
