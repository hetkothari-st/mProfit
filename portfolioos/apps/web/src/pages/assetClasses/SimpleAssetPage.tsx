/**
 * Reusable minimum-viable asset-class page (§10 Phase 5-E).
 *
 * Shows HoldingProjection rows (aggregate) + individual transaction history
 * with edit and delete actions per row.
 */
import { useState } from 'react';
import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMutation } from '@tanstack/react-query';
import { Plus, Pencil, Loader2 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import toast from 'react-hot-toast';
import { formatINR, Decimal, type HoldingRow } from '@portfolioos/shared';
import type { AssetClass, TransactionDTO } from '@portfolioos/shared';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/common/EmptyState';
import { portfoliosApi } from '@/api/portfolios.api';
import { transactionsApi } from '@/api/transactions.api';
import { apiErrorMessage } from '@/api/client';
import { TransactionFormDialog } from '@/pages/transactions/TransactionFormDialog';
import type { FormDialogProps } from './FDFormDialog';

interface Props {
  title: string;
  description: string;
  icon: LucideIcon;
  assetClasses: AssetClass[];
  defaultAssetClass: AssetClass;
  FormComponent?: React.ComponentType<FormDialogProps>;
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

const TXN_TYPE_LABELS: Record<string, string> = {
  BUY: 'Buy', SELL: 'Sell',
  DEPOSIT: 'Deposit', WITHDRAWAL: 'Withdrawal',
  INTEREST_RECEIVED: 'Interest', MATURITY: 'Maturity',
  OPENING_BALANCE: 'Opening Bal', REDEMPTION: 'Redemption',
  DIVIDEND: 'Dividend',
};

export function SimpleAssetPage({
  title,
  description,
  icon: Icon,
  assetClasses,
  defaultAssetClass,
  FormComponent,
}: Props) {
  const queryClient = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [editTxn, setEditTxn] = useState<TransactionDTO | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const ActiveForm = FormComponent ?? TransactionFormDialog;

  const { data: portfolios } = useQuery({
    queryKey: ['portfolios'],
    queryFn: () => portfoliosApi.list(),
  });

  // Holdings (aggregate projections)
  const holdingsQueries = useQueries({
    queries: (portfolios ?? []).map((p) => ({
      queryKey: ['portfolio-holdings', p.id],
      queryFn: () => portfoliosApi.holdings(p.id),
    })),
  });

  // Transactions — one query per asset class
  const txnQueries = useQueries({
    queries: assetClasses.map((ac) => ({
      queryKey: ['transactions', ac],
      queryFn: () => transactionsApi.list({ assetClass: ac, pageSize: 200 }),
    })),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => transactionsApi.remove(id),
    onSuccess: () => {
      toast.success('Transaction deleted');
      setConfirmDeleteId(null);
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['portfolio-holdings'] });
      queryClient.invalidateQueries({ queryKey: ['portfolios'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Failed to delete')),
  });

  const isLoading =
    !portfolios ||
    holdingsQueries.some((q) => q.isLoading) ||
    txnQueries.some((q) => q.isLoading);

  // Flatten + filter holdings by asset class
  const classSet = new Set<string>(assetClasses);
  const allHoldings: Array<HoldingRow & { portfolioName: string }> = [];
  (portfolios ?? []).forEach((p, i) => {
    const rows: HoldingRow[] = holdingsQueries[i]?.data ?? [];
    rows
      .filter((h) => classSet.has(h.assetClass))
      .forEach((h) => allHoldings.push({ ...h, portfolioName: p.name }));
  });

  // Merge + sort transactions newest-first
  const allTransactions: TransactionDTO[] = txnQueries
    .flatMap((q) => q.data?.items ?? [])
    .sort((a, b) => b.tradeDate.localeCompare(a.tradeDate));

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

  function openAdd() {
    setEditTxn(null);
    setFormOpen(true);
  }

  function openEdit(txn: TransactionDTO) {
    setEditTxn(txn);
    setFormOpen(true);
  }

  function handleFormClose(open: boolean) {
    setFormOpen(open);
    if (!open) setEditTxn(null);
  }

  return (
    <div>
      <PageHeader
        title={title}
        description={description}
        actions={
          <Button onClick={openAdd}>
            <Plus className="h-4 w-4" /> Add
          </Button>
        }
      />

      {/* Summary strip */}
      {!isLoading && allHoldings.length > 0 && (
        <div className="grid grid-cols-3 gap-3 mb-6">
          {[
            { label: 'Invested', value: formatINR(totalInvested.toString()) },
            { label: 'Current value', value: formatINR(totalValue.toString()) },
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

      {!isLoading && allHoldings.length === 0 && allTransactions.length === 0 && (
        <EmptyState
          icon={Icon}
          title={`No ${title.toLowerCase()} yet`}
          description="Add a transaction to start tracking this asset class."
          action={
            <Button onClick={openAdd}>
              <Plus className="h-4 w-4" /> Add first entry
            </Button>
          }
        />
      )}

      {/* Holdings table */}
      {!isLoading && allHoldings.length > 0 && (
        <div className="rounded-md border overflow-x-auto mb-8">
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
                const pnl =
                  h.currentValue && h.totalCost
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
                          {pnl.gte(0) ? '+' : ''}
                          {formatINR(pnl.toString())}
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

      {/* Transactions section */}
      {!isLoading && allTransactions.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            Transactions
          </h3>
          <div className="rounded-md border overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40">
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Date</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Name</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground hidden sm:table-cell">Type</th>
                  <th className="text-right px-4 py-2.5 font-medium text-muted-foreground hidden sm:table-cell">Qty</th>
                  <th className="text-right px-4 py-2.5 font-medium text-muted-foreground hidden md:table-cell">Price</th>
                  <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Amount</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {allTransactions.map((txn) => {
                  const amount = new Decimal(txn.quantity).times(new Decimal(txn.price));
                  const isConfirmDelete = confirmDeleteId === txn.id;
                  const isDeleting = deleteMutation.isPending && confirmDeleteId === txn.id;
                  return (
                    <tr key={txn.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                        {txn.tradeDate}
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium truncate max-w-[160px]">
                          {txn.assetName ?? txn.symbol ?? '—'}
                        </p>
                        {txn.isin && (
                          <p className="text-xs text-muted-foreground">{txn.isin}</p>
                        )}
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium
                          ${['BUY','DEPOSIT','INTEREST_RECEIVED','OPENING_BALANCE','MATURITY'].includes(txn.transactionType)
                            ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                            : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'}`}>
                          {TXN_TYPE_LABELS[txn.transactionType] ?? txn.transactionType}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums hidden sm:table-cell text-muted-foreground">
                        {new Decimal(txn.quantity).toFixed(3)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums hidden md:table-cell text-muted-foreground">
                        {formatINR(txn.price)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums font-medium">
                        {formatINR(amount.toString())}
                      </td>
                      <td className="px-4 py-3">
                        {isConfirmDelete ? (
                          <div className="flex items-center gap-1 justify-end">
                            <span className="text-xs text-muted-foreground whitespace-nowrap">Sure?</span>
                            <Button
                              type="button"
                              variant="destructive"
                              size="sm"
                              className="h-7 px-2 text-xs"
                              disabled={isDeleting}
                              onClick={() => deleteMutation.mutate(txn.id)}
                            >
                              {isDeleting ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Yes'}
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-xs"
                              onClick={() => setConfirmDeleteId(null)}
                            >
                              No
                            </Button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1 justify-end">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0"
                              onClick={() => openEdit(txn)}
                              title="Edit"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                              onClick={() => setConfirmDeleteId(txn.id)}
                              title="Delete"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                            </Button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <ActiveForm
        open={formOpen}
        onOpenChange={handleFormClose}
        initial={editTxn}
        defaultPortfolioId={portfolios?.[0]?.id}
      />
    </div>
  );
}
