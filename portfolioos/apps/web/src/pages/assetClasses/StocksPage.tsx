import { useMemo, useState } from 'react';
import { useQueries, useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  TrendingUp,
  RefreshCw,
  Plus,
  Loader2,
  Pencil,
  ChevronRight,
  ChevronDown,
  ArrowUpRight,
  ArrowDownRight,
  Trash2,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { PageHeader } from '@/components/layout/PageHeader';
import { DownloadReportButton } from '@/components/reports/DownloadReportButton';
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
  BUY: 'Buy',
  SELL: 'Sell',
  DIVIDEND: 'Dividend',
  BONUS: 'Bonus',
  SPLIT: 'Split',
  MERGER: 'Merger',
};

interface AggregatedHolding extends HoldingRow {
  portfolioIds: string[];
  portfolioNames: string[];
}

/* ─────────────────────────── Visual glyph ───────────────────────────────
   Tiny candlestick triplet — telegraphs "this is equity / market data"
   without leaning on a generic line-chart cliche. */

function StocksGlyph({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 26 18" fill="none" aria-hidden>
      <line x1="5" y1="2" x2="5" y2="16" className="stroke-emerald-600/70 dark:stroke-emerald-400/70" strokeWidth="0.7" />
      <rect x="3" y="6" width="4" height="6" rx="0.4" className="fill-emerald-600/80 dark:fill-emerald-400/80" />
      <line x1="13" y1="3" x2="13" y2="15" className="stroke-rose-600/70 dark:stroke-rose-400/70" strokeWidth="0.7" />
      <rect x="11" y="5" width="4" height="8" rx="0.4" className="fill-rose-600/80 dark:fill-rose-400/80" />
      <line x1="21" y1="4" x2="21" y2="16" className="stroke-emerald-600/70 dark:stroke-emerald-400/70" strokeWidth="0.7" />
      <rect x="19" y="7" width="4" height="7" rx="0.4" className="fill-emerald-600/85 dark:fill-emerald-400/85" />
    </svg>
  );
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
            <DownloadReportButton type="holdings" assetClasses={['EQUITY']} />
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
                cls: totalPnLD.greaterThan(0)
                  ? 'text-emerald-700 dark:text-emerald-400'
                  : totalPnLD.isNegative()
                    ? 'text-rose-700 dark:text-rose-400'
                    : '',
              },
              {
                label: 'Return',
                value: formatPercent(totalPnLPct),
                cls: totalPnLD.greaterThan(0)
                  ? 'text-emerald-700 dark:text-emerald-400'
                  : totalPnLD.isNegative()
                    ? 'text-rose-700 dark:text-rose-400'
                    : '',
              },
            ].map((m) => (
              <Card
                key={m.label}
                className="overflow-hidden border-t-2 border-t-accent/70 dark:border-t-accent/60"
              >
                <CardContent className="p-4">
                  <div className="text-[10px] text-muted-foreground uppercase tracking-[0.16em] font-semibold">
                    {m.label}
                  </div>
                  <div className={`text-xl font-semibold mt-1 tabular-nums ${m.cls ?? ''}`}>
                    {m.value}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Holdings — themed equity ledger with expandable rows */}
          <Card className="mb-8 overflow-hidden border-border">
            <div className="relative border-b border-border">
              {/* Subtle vertical-bar backdrop hints at the price-bar nature of equities */}
              <div
                className="absolute inset-0 opacity-[0.05] dark:opacity-[0.10] pointer-events-none text-foreground"
                style={{
                  backgroundImage:
                    'repeating-linear-gradient(90deg, currentColor 0 1px, transparent 1px 22px)',
                }}
              />
              <div className="relative flex flex-wrap items-center justify-between gap-3 px-4 py-3 bg-gradient-to-r from-muted/40 via-card to-muted/40 dark:from-muted/30 dark:via-card dark:to-muted/30">
                <div className="flex items-center gap-3">
                  <span className="inline-flex items-center justify-center h-9 w-10 rounded-md bg-accent/10 dark:bg-accent/15 ring-1 ring-accent/30 dark:ring-accent/40">
                    <StocksGlyph className="h-5 w-7" />
                  </span>
                  <div>
                    <div className="text-[11px] uppercase tracking-[0.2em] text-accent font-semibold">
                      Equity Holdings
                    </div>
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      {aggregated.length}{' '}
                      {aggregated.length === 1 ? 'instrument' : 'instruments'} · click a row to
                      drill into transactions
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs">
                  <Stat label="Invested" value={formatINR(totalCostD.toFixed(4))} />
                  <Stat
                    label="Value"
                    value={formatINR(totalValueD.toFixed(4))}
                    bold
                  />
                  <Stat
                    label="P&L"
                    value={formatINR(totalPnLD.toFixed(4))}
                    accent={
                      totalPnLD.greaterThan(0)
                        ? 'text-emerald-700 dark:text-emerald-400'
                        : totalPnLD.isNegative()
                          ? 'text-rose-700 dark:text-rose-400'
                          : ''
                    }
                    bold
                  />
                </div>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 dark:bg-muted/20 border-b border-border">
                  <tr className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                    <th className="py-2 pl-3 pr-2 w-8 font-semibold"></th>
                    <th className="py-2 pr-4 font-semibold">Symbol</th>
                    <th className="py-2 pr-4 font-semibold">Name</th>
                    <th className="py-2 pr-4 text-right font-semibold">Qty</th>
                    <th className="py-2 pr-4 text-right font-semibold">Avg cost</th>
                    <th className="py-2 pr-4 text-right font-semibold">LTP</th>
                    <th className="py-2 pr-4 text-right font-semibold">Value</th>
                    <th className="py-2 pr-4 text-right font-semibold">P&L</th>
                    <th className="py-2 pr-4 text-right font-semibold">%</th>
                    <th className="py-2 pr-4 font-semibold">Portfolios</th>
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
            </div>
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

function Stat({
  label,
  value,
  accent,
  bold,
}: {
  label: string;
  value: string;
  accent?: string;
  bold?: boolean;
}) {
  return (
    <div className="flex flex-col items-end leading-tight">
      <span className="text-[9px] uppercase tracking-[0.16em] text-muted-foreground font-semibold">
        {label}
      </span>
      <span
        className={`tabular-nums ${bold ? 'font-semibold text-sm' : 'font-medium'} ${accent ?? ''}`}
      >
        {value}
      </span>
    </div>
  );
}

function pnlClassFor(v: string | null | undefined): string {
  if (!v) return '';
  return toDecimal(v).isPositive()
    ? 'text-emerald-700 dark:text-emerald-400'
    : toDecimal(v).isNegative()
      ? 'text-rose-700 dark:text-rose-400'
      : '';
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
  const pnlVal = h.unrealisedPnL ?? '';
  const pnlD = pnlVal ? toDecimal(pnlVal) : null;
  const pnlCls = pnlClassFor(pnlVal);
  const pnlPct = h.unrealisedPnLPct ?? null;
  const pnlPctCls =
    pnlPct == null
      ? ''
      : pnlPct > 0
        ? 'text-emerald-700 dark:text-emerald-400'
        : pnlPct < 0
          ? 'text-rose-700 dark:text-rose-400'
          : '';
  // Subtle directional cue — left edge bar reflects P&L direction
  const edgeCls =
    pnlD?.isPositive()
      ? 'bg-emerald-500/80 dark:bg-emerald-400/75'
      : pnlD?.isNegative()
        ? 'bg-rose-500/80 dark:bg-rose-400/75'
        : 'bg-border';
  return (
    <>
      <tr
        className={`border-t border-border/70 hover:bg-muted/40 dark:hover:bg-muted/20 cursor-pointer transition-colors ${
          isOpen ? 'bg-muted/30 dark:bg-muted/15' : ''
        }`}
        onClick={onToggle}
      >
        <td className="relative py-2.5 pl-3 pr-2 text-muted-foreground">
          <span className={`absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r-sm ${edgeCls}`} />
          {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </td>
        <td className="py-2.5 pr-4">
          <span className="inline-flex items-center gap-1.5">
            <span className="font-mono font-semibold tracking-wide text-foreground">
              {h.symbol ?? '—'}
            </span>
            {h.assetClass === 'ETF' && (
              <span className="text-[9px] uppercase tracking-wider px-1 py-0.5 rounded bg-muted text-muted-foreground ring-1 ring-border">
                ETF
              </span>
            )}
          </span>
        </td>
        <td className="py-2.5 pr-4 truncate max-w-xs text-muted-foreground">{h.assetName}</td>
        <td className="py-2.5 pr-4 text-right tabular-nums">{h.quantity}</td>
        <td className="py-2.5 pr-4 text-right tabular-nums">{formatINR(h.avgCostPrice)}</td>
        <td className="py-2.5 pr-4 text-right tabular-nums font-medium">
          {h.currentPrice != null ? formatINR(h.currentPrice) : (
            <span className="text-muted-foreground italic text-xs">—</span>
          )}
        </td>
        <td className="py-2.5 pr-4 text-right tabular-nums">
          {h.currentValue != null ? formatINR(h.currentValue) : '—'}
        </td>
        <td className={`py-2.5 pr-4 text-right tabular-nums font-medium ${pnlCls}`}>
          {h.unrealisedPnL != null ? formatINR(h.unrealisedPnL) : '—'}
        </td>
        <td className={`py-2.5 pr-4 text-right tabular-nums ${pnlPctCls}`}>
          {pnlPct != null ? formatPercent(pnlPct) : '—'}
        </td>
        <td className="py-2.5 pr-4 text-xs text-muted-foreground truncate max-w-[180px]">
          {h.portfolioNames.join(', ')}
        </td>
      </tr>
      {isOpen && (
        <tr>
          <td colSpan={10} className="bg-muted/20 dark:bg-muted/10 p-0 border-t border-border">
            <div className="px-4 py-4 space-y-4">
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
      <div className="text-[10px] uppercase tracking-[0.16em] font-semibold text-muted-foreground mb-2">
        Per-portfolio breakdown
      </div>
      <div className="overflow-x-auto rounded border border-border bg-card">
        <table className="w-full text-xs">
          <thead className="bg-muted/40 dark:bg-muted/20">
            <tr className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
              <th className="text-left pl-3 pr-2 py-1.5 font-semibold">Portfolio</th>
              <th className="text-right px-2 py-1.5 font-semibold">Qty</th>
              <th className="text-right px-2 py-1.5 font-semibold">Avg cost</th>
              <th className="text-right px-2 py-1.5 font-semibold">Total cost</th>
              <th className="text-right px-2 py-1.5 font-semibold">Current value</th>
              <th className="text-right px-2 py-1.5 font-semibold">P&L</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={`${r.portfolioId}:${r.id}`}
                className="border-t border-border/70 hover:bg-muted/40 dark:hover:bg-muted/20 transition-colors"
              >
                <td className="pl-3 pr-2 py-1.5 font-medium">{r.portfolioName}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{r.quantity}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{formatINR(r.avgCostPrice)}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{formatINR(r.totalCost)}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">
                  {r.currentValue != null ? formatINR(r.currentValue) : '—'}
                </td>
                <td className={`px-2 py-1.5 text-right tabular-nums ${pnlClassFor(r.unrealisedPnL)}`}>
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

function TxnTypePill({ type }: { type: string }) {
  const isBuy = type === 'BUY';
  const isSell = type === 'SELL';
  if (isBuy) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded ring-1 bg-emerald-100 text-emerald-700 ring-emerald-200/60 dark:bg-emerald-900/40 dark:text-emerald-300 dark:ring-emerald-700/40">
        <ArrowUpRight className="h-2.5 w-2.5" /> {TXN_TYPE_LABELS[type] ?? type}
      </span>
    );
  }
  if (isSell) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded ring-1 bg-rose-100 text-rose-700 ring-rose-200/60 dark:bg-rose-900/40 dark:text-rose-300 dark:ring-rose-700/40">
        <ArrowDownRight className="h-2.5 w-2.5" /> {TXN_TYPE_LABELS[type] ?? type}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded ring-1 bg-muted text-foreground/80 ring-border">
      {TXN_TYPE_LABELS[type] ?? type}
    </span>
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
        <div className="text-[10px] uppercase tracking-[0.16em] font-semibold text-muted-foreground mb-2">
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
      <div className="text-[10px] uppercase tracking-[0.16em] font-semibold text-muted-foreground mb-2">
        Transactions ({txns.length})
      </div>
      <div className="overflow-x-auto rounded border border-border bg-card">
        <table className="w-full text-xs">
          <thead className="bg-muted/40 dark:bg-muted/20">
            <tr className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
              <th className="text-left pl-3 pr-2 py-1.5 font-semibold">Date</th>
              <th className="text-left px-2 py-1.5 font-semibold">Type</th>
              <th className="text-right px-2 py-1.5 font-semibold">Qty</th>
              <th className="text-right px-2 py-1.5 font-semibold">Price</th>
              <th className="text-right px-2 py-1.5 font-semibold">Amount</th>
              <th className="px-2 py-1.5"></th>
            </tr>
          </thead>
          <tbody>
            {txns.map((txn) => {
              const amount = new Decimal(txn.quantity).times(new Decimal(txn.price));
              const isConfirmDelete = confirmDeleteId === txn.id;
              const isDeleting = deleteMutation.isPending && confirmDeleteId === txn.id;
              return (
                <tr
                  key={txn.id}
                  className="border-t border-border/70 hover:bg-muted/40 dark:hover:bg-muted/20 transition-colors"
                >
                  <td className="pl-3 pr-2 py-1.5 whitespace-nowrap tabular-nums text-muted-foreground">
                    <span className="text-accent/60 mr-1.5">▸</span>
                    {txn.tradeDate}
                  </td>
                  <td className="px-2 py-1.5">
                    <TxnTypePill type={txn.transactionType} />
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums">
                    {new Decimal(txn.quantity).toFixed(3)}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{formatINR(txn.price)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums font-semibold">
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
                          <Trash2 className="h-3 w-3" />
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
