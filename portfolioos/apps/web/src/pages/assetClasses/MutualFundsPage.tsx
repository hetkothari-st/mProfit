import { useState } from 'react';
import { useQueries, useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { LineChart, RefreshCw, Plus, Loader2, Pencil } from 'lucide-react';
import toast from 'react-hot-toast';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/common/EmptyState';
import { portfoliosApi } from '@/api/portfolios.api';
import { assetsApi } from '@/api/assets.api';
import { transactionsApi } from '@/api/transactions.api';
import { apiErrorMessage } from '@/api/client';
import { TransactionFormDialog } from '@/pages/transactions/TransactionFormDialog';
import { formatINR, formatPercent, Decimal, toDecimal } from '@portfolioos/shared';
import type { HoldingRow, TransactionDTO } from '@portfolioos/shared';

const TXN_TYPE_LABELS: Record<string, string> = {
  BUY: 'Buy', SELL: 'Sell / Redeem', DIVIDEND: 'Dividend',
  DEPOSIT: 'SIP/Deposit', WITHDRAWAL: 'Withdrawal',
};

export function MutualFundsPage() {
  const [formOpen, setFormOpen] = useState(false);
  const [editTxn, setEditTxn] = useState<TransactionDTO | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
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

  const txnQuery = useQuery({
    queryKey: ['transactions', 'MUTUAL_FUND'],
    queryFn: () => transactionsApi.list({ assetClass: 'MUTUAL_FUND', pageSize: 200 }),
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

  const all = holdingsQueries.flatMap((q, idx) =>
    (q.data ?? []).map((h) => ({
      ...h,
      portfolioId: portfolios?.[idx]?.id ?? '',
      portfolioName: portfolios?.[idx]?.name ?? '',
    })),
  );
  const mfs = all.filter((h) => h.assetClass === 'MUTUAL_FUND');

  const allTransactions: TransactionDTO[] = (txnQuery.data?.items ?? [])
    .slice()
    .sort((a, b) => b.tradeDate.localeCompare(a.tradeDate));

  const totalValueD = mfs.reduce(
    (s, h) => (h.currentValue !== null ? s.plus(toDecimal(h.currentValue)) : s),
    new Decimal(0),
  );
  const totalCostD = mfs.reduce((s, h) => s.plus(toDecimal(h.totalCost)), new Decimal(0));
  const totalPnLD = totalValueD.minus(totalCostD);
  const totalPnLPct = totalCostD.greaterThan(0)
    ? totalPnLD.dividedBy(totalCostD).times(100).toNumber()
    : 0;

  function openEdit(txn: TransactionDTO) { setEditTxn(txn); setFormOpen(true); }
  function openAdd() { setEditTxn(null); setFormOpen(true); }

  return (
    <div>
      <PageHeader
        title="Mutual Funds"
        description="MF holdings across all portfolios, priced from AMFI NAV"
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => syncMutation.mutate()} disabled={syncMutation.isPending}>
              {syncMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Sync AMFI NAV
            </Button>
            <Button onClick={openAdd}><Plus className="h-4 w-4" /> Add transaction</Button>
          </div>
        }
      />

      {mfs.length === 0 ? (
        <EmptyState
          icon={LineChart}
          title="No mutual fund holdings"
          description="Sync AMFI NAV first, then add a BUY or SIP transaction on a scheme."
          action={<Button onClick={openAdd}><Plus className="h-4 w-4" /> Add transaction</Button>}
        />
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            {[
              { label: 'Current value', value: formatINR(totalValueD.toFixed(4)) },
              { label: 'Invested', value: formatINR(totalCostD.toFixed(4)) },
              {
                label: 'Unrealised P&L',
                value: formatINR(totalPnLD.toFixed(4)),
                cls: totalPnLD.greaterThan(0) ? 'text-positive' : totalPnLD.isNegative() ? 'text-negative' : '',
              },
              {
                label: 'Return',
                value: formatPercent(totalPnLPct),
                cls: totalPnLD.greaterThan(0) ? 'text-positive' : totalPnLD.isNegative() ? 'text-negative' : '',
              },
            ].map((m) => (
              <Card key={m.label}>
                <CardContent className="p-4">
                  <div className="text-xs text-muted-foreground">{m.label}</div>
                  <div className={`text-xl font-semibold mt-1 tabular-nums ${m.cls ?? ''}`}>{m.value}</div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Holdings */}
          <Card className="mb-8">
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
                      <td className="py-2 pr-4 text-right tabular-nums">{h.currentPrice != null ? formatINR(h.currentPrice) : '—'}</td>
                      <td className="py-2 pr-4 text-right tabular-nums">{h.currentValue != null ? formatINR(h.currentValue) : '—'}</td>
                      <td className={`py-2 pr-4 text-right tabular-nums ${h.unrealisedPnL && toDecimal(h.unrealisedPnL).greaterThan(0) ? 'text-positive' : h.unrealisedPnL && toDecimal(h.unrealisedPnL).isNegative() ? 'text-negative' : ''}`}>
                        {h.unrealisedPnL != null ? formatINR(h.unrealisedPnL) : '—'}
                      </td>
                      <td className={`py-2 pr-4 text-right tabular-nums ${(h.unrealisedPnLPct ?? 0) > 0 ? 'text-positive' : (h.unrealisedPnLPct ?? 0) < 0 ? 'text-negative' : ''}`}>
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

      {/* Transactions */}
      {allTransactions.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Transactions</h3>
          <div className="rounded-md border overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40">
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Date</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Scheme</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground hidden sm:table-cell">Type</th>
                  <th className="text-right px-4 py-2.5 font-medium text-muted-foreground hidden sm:table-cell">Units</th>
                  <th className="text-right px-4 py-2.5 font-medium text-muted-foreground hidden md:table-cell">NAV</th>
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
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{txn.tradeDate}</td>
                      <td className="px-4 py-3">
                        <p className="font-medium truncate max-w-[180px]">{txn.assetName ?? '—'}</p>
                        {txn.isin && <p className="text-xs text-muted-foreground">{txn.isin}</p>}
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${['BUY','DEPOSIT','DIVIDEND_PAYOUT','DIVIDEND_REINVEST','SIP','BONUS'].includes(txn.transactionType) ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'}`}>
                          {TXN_TYPE_LABELS[txn.transactionType] ?? txn.transactionType}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums hidden sm:table-cell text-muted-foreground">{new Decimal(txn.quantity).toFixed(3)}</td>
                      <td className="px-4 py-3 text-right tabular-nums hidden md:table-cell text-muted-foreground">{formatINR(txn.price)}</td>
                      <td className="px-4 py-3 text-right tabular-nums font-medium">{formatINR(amount.toString())}</td>
                      <td className="px-4 py-3">
                        {isConfirmDelete ? (
                          <div className="flex items-center gap-1 justify-end">
                            <span className="text-xs text-muted-foreground whitespace-nowrap">Sure?</span>
                            <Button type="button" variant="destructive" size="sm" className="h-7 px-2 text-xs" disabled={isDeleting} onClick={() => deleteMutation.mutate(txn.id)}>
                              {isDeleting ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Yes'}
                            </Button>
                            <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setConfirmDeleteId(null)}>No</Button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1 justify-end">
                            <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openEdit(txn)} title="Edit">
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive" onClick={() => setConfirmDeleteId(txn.id)} title="Delete">
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

      <TransactionFormDialog
        open={formOpen}
        onOpenChange={(open) => { setFormOpen(open); if (!open) setEditTxn(null); }}
        initial={editTxn}
      />
    </div>
  );
}
