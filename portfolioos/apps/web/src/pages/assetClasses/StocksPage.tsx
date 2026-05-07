import { useMemo, useState } from 'react';
import { useQueries, useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { TrendingUp, RefreshCw, Plus, Loader2, Pencil, ChevronRight, ChevronDown } from 'lucide-react';
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
import {
  formatINR,
  formatPercent,
  Decimal,
  toDecimal,
  serializeMoney,
  serializeQuantity,
} from '@portfolioos/shared';
import type { HoldingRow, Money, Quantity, TransactionDTO } from '@portfolioos/shared';

const TXN_TYPE_LABELS: Record<string, string> = {
  BUY: 'Buy', SELL: 'Sell', DIVIDEND: 'Dividend',
  BONUS: 'Bonus', SPLIT: 'Split', MERGER: 'Merger',
};

interface AggregatedHolding extends HoldingRow {
  portfolioIds: string[];
  portfolioNames: string[];
}

export function StocksPage() {
  const [formOpen, setFormOpen] = useState(false);
  const [editTxn, setEditTxn] = useState<TransactionDTO | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
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

  const txnQueries = useQueries({
    queries: ['EQUITY', 'ETF'].map((ac) => ({
      queryKey: ['transactions', ac],
      queryFn: () => transactionsApi.list({ assetClass: ac, pageSize: 200 }),
    })),
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
        const newQtyD = toDecimal(existing.quantity).plus(toDecimal(h.quantity));
        const newCostD = toDecimal(existing.totalCost).plus(toDecimal(h.totalCost));
        existing.quantity = serializeQuantity(newQtyD) as Quantity;
        existing.totalCost = serializeMoney(newCostD) as Money;
        existing.avgCostPrice = serializeMoney(
          newQtyD.greaterThan(0) ? newCostD.dividedBy(newQtyD) : new Decimal(0),
        ) as Money;
        existing.currentValue =
          existing.currentValue != null && h.currentValue != null
            ? (serializeMoney(toDecimal(existing.currentValue).plus(toDecimal(h.currentValue))) as Money)
            : existing.currentValue ?? h.currentValue;
        existing.unrealisedPnL =
          existing.unrealisedPnL != null && h.unrealisedPnL != null
            ? (serializeMoney(toDecimal(existing.unrealisedPnL).plus(toDecimal(h.unrealisedPnL))) as Money)
            : existing.unrealisedPnL ?? h.unrealisedPnL;
        if (!existing.portfolioIds.includes(h.portfolioId)) {
          existing.portfolioIds.push(h.portfolioId);
          existing.portfolioNames.push(h.portfolioName);
        }
      }
      return acc;
    }, {}),
  );

  const allTransactions: TransactionDTO[] = txnQueries
    .flatMap((q) => q.data?.items ?? [])
    .sort((a, b) => b.tradeDate.localeCompare(a.tradeDate));

  const txnsByKey = useMemo(() => {
    const m = new Map<string, TransactionDTO[]>();
    for (const t of allTransactions) {
      const key = `${t.symbol ?? t.assetName ?? ''}`;
      const arr = m.get(key);
      if (arr) arr.push(t);
      else m.set(key, [t]);
    }
    return m;
  }, [allTransactions]);

  // Per-stock per-portfolio holding breakdown so the expanded row can show
  // "RELIANCE — 30 in Long-term, 20 in Trading" without the aggregator
  // collapsing them.
  const perPortfolioByKey = useMemo(() => {
    const m = new Map<string, Array<HoldingRow & { portfolioId: string; portfolioName: string }>>();
    for (const h of stocks) {
      const key = `${h.symbol ?? h.assetName}`;
      const arr = m.get(key);
      if (arr) arr.push(h);
      else m.set(key, [h]);
    }
    return m;
  }, [stocks]);

  function toggleExpand(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const totalValueD = aggregated.reduce(
    (s, h) => (h.currentValue != null ? s.plus(toDecimal(h.currentValue)) : s),
    new Decimal(0),
  );
  const totalCostD = aggregated.reduce((s, h) => s.plus(toDecimal(h.totalCost)), new Decimal(0));
  const totalPnLD = totalValueD.minus(totalCostD);
  const totalPnLPct = totalCostD.greaterThan(0)
    ? totalPnLD.dividedBy(totalCostD).times(100).toNumber()
    : 0;

  function openEdit(txn: TransactionDTO) {
    setEditTxn(txn);
    setFormOpen(true);
  }

  function openAdd() {
    setEditTxn(null);
    setFormOpen(true);
  }

  return (
    <div>
      <PageHeader
        title="Stocks"
        description="Equity holdings aggregated across all portfolios"
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => refreshMutation.mutate()} disabled={refreshMutation.isPending}>
              {refreshMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Refresh prices
            </Button>
            <Button onClick={openAdd}>
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

          {/* Holdings — each row expands to show transactions + per-portfolio split */}
          <Card className="mb-8">
            <CardContent className="p-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground uppercase tracking-wide border-b">
                    <th className="py-2 pr-2 w-8"></th>
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
                  {aggregated.map((h) => {
                    const key = `${h.symbol ?? h.assetName}`;
                    const isOpen = expanded.has(key);
                    const stockTxns = txnsByKey.get(key) ?? [];
                    const breakdown = perPortfolioByKey.get(key) ?? [];
                    return (
                      <StockRow
                        key={key}
                        h={h}
                        stockKey={key}
                        isOpen={isOpen}
                        onToggle={() => toggleExpand(key)}
                        txns={stockTxns}
                        portfolioBreakdown={breakdown}
                        confirmDeleteId={confirmDeleteId}
                        setConfirmDeleteId={setConfirmDeleteId}
                        deleteMutation={deleteMutation}
                        openEdit={openEdit}
                      />
                    );
                  })}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </>
      )}

      <TransactionFormDialog
        open={formOpen}
        onOpenChange={(open) => { setFormOpen(open); if (!open) setEditTxn(null); }}
        initial={editTxn}
      />
    </div>
  );
}

interface StockRowProps {
  h: AggregatedHolding;
  stockKey: string;
  isOpen: boolean;
  onToggle: () => void;
  txns: TransactionDTO[];
  portfolioBreakdown: Array<HoldingRow & { portfolioId: string; portfolioName: string }>;
  confirmDeleteId: string | null;
  setConfirmDeleteId: (id: string | null) => void;
  deleteMutation: { isPending: boolean; mutate: (id: string) => void };
  openEdit: (txn: TransactionDTO) => void;
}

function StockRow({
  h,
  isOpen,
  onToggle,
  txns,
  portfolioBreakdown,
  confirmDeleteId,
  setConfirmDeleteId,
  deleteMutation,
  openEdit,
}: StockRowProps) {
  const pnlClass =
    h.unrealisedPnL && toDecimal(h.unrealisedPnL).greaterThan(0)
      ? 'text-positive'
      : h.unrealisedPnL && toDecimal(h.unrealisedPnL).isNegative()
        ? 'text-negative'
        : '';
  const pnlPctClass =
    (h.unrealisedPnLPct ?? 0) > 0
      ? 'text-positive'
      : (h.unrealisedPnLPct ?? 0) < 0
        ? 'text-negative'
        : '';
  return (
    <>
      <tr
        className={`border-b last:border-0 hover:bg-accent/20 cursor-pointer ${isOpen ? 'bg-accent/10' : ''}`}
        onClick={onToggle}
      >
        <td className="py-2 pr-2 text-muted-foreground">
          {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </td>
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
        <td className={`py-2 pr-4 text-right tabular-nums ${pnlClass}`}>
          {h.unrealisedPnL != null ? formatINR(h.unrealisedPnL) : '—'}
        </td>
        <td className={`py-2 pr-4 text-right tabular-nums ${pnlPctClass}`}>
          {h.unrealisedPnLPct != null ? formatPercent(h.unrealisedPnLPct) : '—'}
        </td>
        <td className="py-2 pr-4 text-xs text-muted-foreground truncate max-w-[180px]">
          {h.portfolioNames.join(', ')}
        </td>
      </tr>
      {isOpen && (
        <tr>
          <td colSpan={10} className="bg-muted/10 p-0">
            <div className="border-l-2 border-primary/40 ml-4 mr-2 my-2 pl-3 pr-1 py-2 space-y-4">
              {portfolioBreakdown.length > 1 && (
                <PortfolioBreakdown rows={portfolioBreakdown} />
              )}
              <StockTransactions
                txns={txns}
                confirmDeleteId={confirmDeleteId}
                setConfirmDeleteId={setConfirmDeleteId}
                deleteMutation={deleteMutation}
                openEdit={openEdit}
              />
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function PortfolioBreakdown({
  rows,
}: {
  rows: Array<HoldingRow & { portfolioId: string; portfolioName: string }>;
}) {
  return (
    <div>
      <div className="text-xs font-semibold uppercase text-muted-foreground mb-1.5">
        Per-portfolio breakdown
      </div>
      <div className="overflow-x-auto rounded border bg-background">
        <table className="w-full text-xs">
          <thead className="bg-muted/40">
            <tr className="text-[10px] uppercase text-muted-foreground">
              <th className="text-left px-2 py-1.5">Portfolio</th>
              <th className="text-right px-2 py-1.5">Qty</th>
              <th className="text-right px-2 py-1.5">Avg cost</th>
              <th className="text-right px-2 py-1.5">Total cost</th>
              <th className="text-right px-2 py-1.5">Current value</th>
              <th className="text-right px-2 py-1.5">P&L</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={`${r.portfolioId}:${r.id}`} className="border-t">
                <td className="px-2 py-1.5">{r.portfolioName}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{r.quantity}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{formatINR(r.avgCostPrice)}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{formatINR(r.totalCost)}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">
                  {r.currentValue != null ? formatINR(r.currentValue) : '—'}
                </td>
                <td
                  className={`px-2 py-1.5 text-right tabular-nums ${
                    r.unrealisedPnL && toDecimal(r.unrealisedPnL).greaterThan(0)
                      ? 'text-positive'
                      : r.unrealisedPnL && toDecimal(r.unrealisedPnL).isNegative()
                        ? 'text-negative'
                        : ''
                  }`}
                >
                  {r.unrealisedPnL != null ? formatINR(r.unrealisedPnL) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StockTransactions({
  txns,
  confirmDeleteId,
  setConfirmDeleteId,
  deleteMutation,
  openEdit,
}: {
  txns: TransactionDTO[];
  confirmDeleteId: string | null;
  setConfirmDeleteId: (id: string | null) => void;
  deleteMutation: { isPending: boolean; mutate: (id: string) => void };
  openEdit: (txn: TransactionDTO) => void;
}) {
  if (txns.length === 0) {
    return (
      <div>
        <div className="text-xs font-semibold uppercase text-muted-foreground mb-1.5">
          Transactions
        </div>
        <div className="text-xs text-muted-foreground italic">
          No transactions on file for this stock.
        </div>
      </div>
    );
  }
  return (
    <div>
      <div className="text-xs font-semibold uppercase text-muted-foreground mb-1.5">
        Transactions ({txns.length})
      </div>
      <div className="overflow-x-auto rounded border bg-background">
        <table className="w-full text-xs">
          <thead className="bg-muted/40">
            <tr className="text-[10px] uppercase text-muted-foreground">
              <th className="text-left px-2 py-1.5">Date</th>
              <th className="text-left px-2 py-1.5">Type</th>
              <th className="text-right px-2 py-1.5">Qty</th>
              <th className="text-right px-2 py-1.5">Price</th>
              <th className="text-right px-2 py-1.5">Amount</th>
              <th className="px-2 py-1.5"></th>
            </tr>
          </thead>
          <tbody>
            {txns.map((txn) => {
              const amount = new Decimal(txn.quantity).times(new Decimal(txn.price));
              const isConfirmDelete = confirmDeleteId === txn.id;
              const isDeleting = deleteMutation.isPending && confirmDeleteId === txn.id;
              return (
                <tr key={txn.id} className="border-t">
                  <td className="px-2 py-1.5 whitespace-nowrap">{txn.tradeDate}</td>
                  <td className="px-2 py-1.5">
                    <span
                      className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                        txn.transactionType === 'BUY'
                          ? 'bg-green-100 text-green-700'
                          : 'bg-red-100 text-red-700'
                      }`}
                    >
                      {TXN_TYPE_LABELS[txn.transactionType] ?? txn.transactionType}
                    </span>
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums">
                    {new Decimal(txn.quantity).toFixed(3)}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{formatINR(txn.price)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums font-medium">
                    {formatINR(amount.toString())}
                  </td>
                  <td className="px-2 py-1.5" onClick={(e) => e.stopPropagation()}>
                    {isConfirmDelete ? (
                      <div className="flex items-center gap-1 justify-end">
                        <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                          Sure?
                        </span>
                        <Button
                          type="button"
                          variant="destructive"
                          size="sm"
                          className="h-6 px-2 text-[10px]"
                          disabled={isDeleting}
                          onClick={() => deleteMutation.mutate(txn.id)}
                        >
                          {isDeleting ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Yes'}
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2 text-[10px]"
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
                          className="h-6 w-6 p-0"
                          onClick={() => openEdit(txn)}
                          title="Edit"
                        >
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                          onClick={() => setConfirmDeleteId(txn.id)}
                          title="Delete"
                        >
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="12"
                            height="12"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <polyline points="3 6 5 6 21 6" />
                            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                            <path d="M10 11v6" />
                            <path d="M14 11v6" />
                            <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                          </svg>
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
  );
}
