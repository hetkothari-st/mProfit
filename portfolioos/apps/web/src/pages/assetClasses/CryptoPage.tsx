import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  Bitcoin, Plus, Loader2, TrendingUp, TrendingDown, Sparkles, Pencil, ArrowUpRight,
} from 'lucide-react';
import { Decimal, formatINR, type HoldingRow, type TransactionDTO } from '@portfolioos/shared';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/common/EmptyState';
import { portfoliosApi } from '@/api/portfolios.api';
import { transactionsApi } from '@/api/transactions.api';
import { assetsApi, type LiveCryptoCoin } from '@/api/assets.api';
import { apiErrorMessage } from '@/api/client';
import { CryptoFormDialog } from './CryptoFormDialog';
import { formatUSD } from './cryptoUtils';

// ── Coin avatar (colored gradient w/ symbol) ─────────────────────
const SYMBOL_GRADIENTS: Record<string, string> = {
  BTC: 'from-orange-400 to-amber-500',
  ETH: 'from-indigo-400 to-violet-600',
  SOL: 'from-purple-500 to-fuchsia-500',
  ADA: 'from-sky-400 to-blue-600',
  XRP: 'from-slate-400 to-slate-600',
  DOGE: 'from-yellow-400 to-amber-500',
  DOT: 'from-pink-500 to-rose-500',
  MATIC: 'from-violet-500 to-purple-600',
  LINK: 'from-blue-500 to-cyan-500',
  AVAX: 'from-red-500 to-rose-600',
  BNB: 'from-yellow-400 to-amber-600',
  USDT: 'from-emerald-400 to-teal-500',
  USDC: 'from-blue-400 to-sky-500',
};

function CoinAvatar({ symbol, size = 'md' }: { symbol: string; size?: 'sm' | 'md' | 'lg' }) {
  const sym = (symbol || '??').toUpperCase().slice(0, 4);
  const gradient = SYMBOL_GRADIENTS[sym] ?? 'from-slate-400 to-slate-600';
  const dim = size === 'sm' ? 'h-8 w-8 text-[10px]' : size === 'lg' ? 'h-14 w-14 text-sm' : 'h-11 w-11 text-xs';
  return (
    <div className={`${dim} rounded-full bg-gradient-to-br ${gradient} flex items-center justify-center font-bold text-white shadow-sm shrink-0 tabular-nums`}>
      {sym}
    </div>
  );
}

// ── Live ticker (top of page) ────────────────────────────────────
function LiveTicker({ coins }: { coins: LiveCryptoCoin[] }) {
  const featured = coins
    .filter((c) => c.priceInr)
    .slice(0, 8);
  if (featured.length === 0) return null;
  return (
    <div className="mb-6 overflow-hidden rounded-xl border bg-gradient-to-r from-amber-50/40 via-background to-violet-50/40 dark:from-amber-950/10 dark:to-violet-950/10">
      <div className="flex gap-6 px-4 py-3 overflow-x-auto scrollbar-none">
        {featured.map((c) => {
          const up = (c.change24h ?? 0) >= 0;
          return (
            <div key={c.coinGeckoId} className="flex items-center gap-2.5 shrink-0">
              <CoinAvatar symbol={c.symbol} size="sm" />
              <div>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-xs font-medium">{c.symbol.toUpperCase()}</span>
                  {c.change24h != null && (
                    <span className={`text-[10px] tabular-nums ${up ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                      {up ? '+' : ''}{c.change24h.toFixed(2)}%
                    </span>
                  )}
                </div>
                <p className="text-xs font-semibold tabular-nums">
                  {formatINR(c.priceInr!)}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Personalized coin card (one per holding) ─────────────────────
interface EnrichedHolding extends HoldingRow {
  portfolioName: string;
  live?: LiveCryptoCoin;
}

function CoinHoldingCard({
  holding,
  onClick,
}: {
  holding: EnrichedHolding;
  onClick: () => void;
}) {
  const qty = new Decimal(holding.quantity);
  const invested = new Decimal(holding.totalCost);
  const livePriceInr = holding.live?.priceInr ? new Decimal(holding.live.priceInr) : null;
  const livePriceUsd = holding.live?.priceUsd ? new Decimal(holding.live.priceUsd) : null;
  const currentInr = livePriceInr
    ? qty.times(livePriceInr)
    : (holding.currentValue ? new Decimal(holding.currentValue) : null);
  const currentUsd = livePriceUsd ? qty.times(livePriceUsd) : null;
  const pnl = currentInr ? currentInr.minus(invested) : null;
  const pnlPct = pnl && !invested.isZero() ? pnl.div(invested).times(100).toNumber() : null;
  const isGain = pnl ? pnl.gte(0) : null;
  const change24h = holding.live?.change24h;
  const symbol = holding.live?.symbol ?? (holding.isin ?? holding.assetName ?? '??').slice(0, 4).toUpperCase();

  return (
    <button
      type="button"
      onClick={onClick}
      className="group text-left rounded-2xl border bg-card hover:shadow-md hover:border-foreground/15 transition-all p-4 flex flex-col gap-3"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <CoinAvatar symbol={symbol} size="md" />
          <div className="min-w-0">
            <p className="font-semibold truncate">{holding.assetName ?? symbol}</p>
            <p className="text-xs text-muted-foreground">
              {symbol} · {holding.portfolioName}
            </p>
          </div>
        </div>
        <ArrowUpRight className="h-4 w-4 text-muted-foreground/60 group-hover:text-foreground transition-colors shrink-0" />
      </div>

      {/* Current value */}
      <div>
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Current Value</p>
        <p className="text-2xl font-bold tabular-nums leading-tight">
          {currentInr ? formatINR(currentInr.toString()) : '—'}
        </p>
        {currentUsd && (
          <p className="text-xs text-muted-foreground tabular-nums">
            {formatUSD(currentUsd)}
          </p>
        )}
      </div>

      {/* Footer row: qty + P&L + 24h */}
      <div className="grid grid-cols-3 gap-2 pt-2 border-t">
        <div>
          <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Qty</p>
          <p className="text-xs font-medium tabular-nums">{qty.toFixed(qty.lt(1) ? 6 : 4)}</p>
        </div>
        <div>
          <p className="text-[9px] uppercase tracking-wider text-muted-foreground">P&L</p>
          {pnl ? (
            <p className={`text-xs font-semibold tabular-nums ${isGain ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
              {isGain ? '+' : ''}{pnlPct != null ? `${pnlPct.toFixed(1)}%` : formatINR(pnl.toString())}
            </p>
          ) : <p className="text-xs text-muted-foreground">—</p>}
        </div>
        <div>
          <p className="text-[9px] uppercase tracking-wider text-muted-foreground">24h</p>
          {change24h != null ? (
            <p className={`text-xs font-semibold tabular-nums flex items-center gap-0.5 ${change24h >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
              {change24h >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
              {change24h >= 0 ? '+' : ''}{change24h.toFixed(1)}%
            </p>
          ) : <p className="text-xs text-muted-foreground">—</p>}
        </div>
      </div>
    </button>
  );
}

// ── Main page ────────────────────────────────────────────────────
export function CryptoPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [editTxn, setEditTxn] = useState<TransactionDTO | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const { data: portfolios } = useQuery({ queryKey: ['portfolios'], queryFn: portfoliosApi.list });

  const holdingsQueries = useQueries({
    queries: (portfolios ?? []).map((p) => ({
      queryKey: ['portfolio-holdings', p.id],
      queryFn: () => portfoliosApi.holdings(p.id),
    })),
  });

  const txnQuery = useQuery({
    queryKey: ['transactions', 'CRYPTOCURRENCY'],
    queryFn: () => transactionsApi.list({ assetClass: 'CRYPTOCURRENCY', pageSize: 200 }),
  });

  const { data: live, isFetching: liveFetching } = useQuery({
    queryKey: ['crypto-live'],
    queryFn: () => assetsApi.cryptoLive(),
    refetchInterval: 60_000,
    staleTime: 30_000,
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
    txnQuery.isLoading;

  // Flatten holdings filtered to CRYPTOCURRENCY and enrich with live data
  const liveMap = new Map<string, LiveCryptoCoin>(
    (live?.coins ?? []).map((c) => [c.coinGeckoId, c]),
  );

  const holdings: EnrichedHolding[] = [];
  (portfolios ?? []).forEach((p, i) => {
    const rows: HoldingRow[] = holdingsQueries[i]?.data ?? [];
    rows
      .filter((h) => h.assetClass === 'CRYPTOCURRENCY')
      .forEach((h) => {
        const coinGeckoId = h.isin ?? '';
        const liveCoin = coinGeckoId ? liveMap.get(coinGeckoId) : undefined;
        holdings.push({ ...h, portfolioName: p.name, live: liveCoin });
      });
  });

  // Sort by current value desc
  function holdingValue(h: EnrichedHolding): Decimal {
    if (h.live?.priceInr) return new Decimal(h.live.priceInr).times(new Decimal(h.quantity));
    if (h.currentValue) return new Decimal(h.currentValue);
    return new Decimal(0);
  }
  holdings.sort((a, b) => holdingValue(b).comparedTo(holdingValue(a)));

  const transactions = (txnQuery.data?.items ?? []).sort(
    (a, b) => b.tradeDate.localeCompare(a.tradeDate),
  );

  // Summary
  const totalInvested = holdings.reduce((s, h) => s.plus(new Decimal(h.totalCost)), new Decimal(0));
  const totalValue = holdings.reduce((s, h) => {
    const live = h.live?.priceInr
      ? new Decimal(h.live.priceInr).times(new Decimal(h.quantity))
      : (h.currentValue ? new Decimal(h.currentValue) : null);
    return live ? s.plus(live) : s;
  }, new Decimal(0));
  const totalUsd = holdings.reduce((s, h) => {
    if (!h.live?.priceUsd) return s;
    return s.plus(new Decimal(h.live.priceUsd).times(new Decimal(h.quantity)));
  }, new Decimal(0));
  const totalPnL = totalValue.minus(totalInvested);
  const pnlPct = totalInvested.isZero() ? null : totalPnL.div(totalInvested).times(100).toNumber();

  function openAdd() {
    setEditTxn(null);
    setFormOpen(true);
  }

  function openEdit(txn: TransactionDTO) {
    setEditTxn(txn);
    setFormOpen(true);
  }

  function clickHolding(h: EnrichedHolding) {
    navigate(`/crypto/${h.id}`, { state: { holding: h } });
  }

  return (
    <div>
      <PageHeader
        title="Cryptocurrency"
        description="Track Bitcoin, Ethereum, and other digital assets with live prices"
        actions={
          <Button onClick={openAdd}>
            <Plus className="h-4 w-4" /> Add Crypto
          </Button>
        }
      />

      {/* Live ticker — featured coins */}
      {!isLoading && (live?.coins?.length ?? 0) > 0 && <LiveTicker coins={live!.coins} />}

      {/* Summary strip */}
      {!isLoading && holdings.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <Card>
            <CardContent className="px-4 py-3">
              <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Invested</p>
              <p className="text-xl font-semibold tabular-nums mt-1">{formatINR(totalInvested.toString())}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="px-4 py-3">
              <div className="flex items-center gap-1.5">
                <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Current value</p>
                <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                  {liveFetching
                    ? <Loader2 className="h-2.5 w-2.5 animate-spin" />
                    : <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />}
                  live
                </span>
              </div>
              <p className="text-xl font-semibold tabular-nums mt-1">{formatINR(totalValue.toString())}</p>
              {!totalUsd.isZero() && (
                <p className="text-[11px] text-muted-foreground tabular-nums mt-0.5">
                  {formatUSD(totalUsd)}
                </p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardContent className="px-4 py-3">
              <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Unrealised P&L</p>
              <p className={`text-xl font-semibold tabular-nums mt-1 ${totalPnL.gte(0) ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                {totalPnL.gte(0) ? '+' : ''}{formatINR(totalPnL.toString())}
              </p>
              {pnlPct != null && (
                <p className={`text-[11px] tabular-nums mt-0.5 ${totalPnL.gte(0) ? 'text-emerald-600/80 dark:text-emerald-400/80' : 'text-rose-600/80 dark:text-rose-400/80'}`}>
                  {pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(2)}%
                </p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardContent className="px-4 py-3">
              <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Coins held</p>
              <p className="text-xl font-semibold tabular-nums mt-1">{holdings.length}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {holdings.filter((h) => h.live).length} with live prices
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {isLoading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} className="h-44 animate-pulse bg-muted/40" />
          ))}
        </div>
      )}

      {!isLoading && holdings.length === 0 && transactions.length === 0 && (
        <EmptyState
          icon={Bitcoin}
          title="No crypto holdings yet"
          description="Track Bitcoin, Ethereum, Solana and more with live INR + USD prices."
          action={
            <Button onClick={openAdd}>
              <Plus className="h-4 w-4" /> Add your first coin
            </Button>
          }
        />
      )}

      {/* Personalized coin cards grid */}
      {!isLoading && holdings.length > 0 && (
        <div className="mb-8">
          <div className="flex items-baseline gap-2 mb-3 px-1">
            <h3 className="text-sm font-semibold text-foreground/90 uppercase tracking-wider">Your Coins</h3>
            <span className="text-xs text-muted-foreground">({holdings.length})</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {holdings.map((h) => (
              <CoinHoldingCard key={h.id} holding={h} onClick={() => clickHolding(h)} />
            ))}
          </div>
        </div>
      )}

      {/* Transactions */}
      {!isLoading && transactions.length > 0 && (
        <div>
          <div className="flex items-baseline gap-2 mb-3 px-1">
            <h3 className="text-sm font-semibold text-foreground/90 uppercase tracking-wider">Transactions</h3>
            <span className="text-xs text-muted-foreground">({transactions.length})</span>
          </div>
          <div className="rounded-md border overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40">
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Date</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Coin</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground hidden sm:table-cell">Type</th>
                  <th className="text-right px-4 py-2.5 font-medium text-muted-foreground hidden sm:table-cell">Qty</th>
                  <th className="text-right px-4 py-2.5 font-medium text-muted-foreground hidden md:table-cell">Price</th>
                  <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Amount</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {transactions.map((txn) => {
                  const amount = new Decimal(txn.quantity).times(new Decimal(txn.price));
                  const isCredit = ['BUY', 'INTEREST_RECEIVED', 'DEPOSIT'].includes(txn.transactionType);
                  const isDelete = confirmDeleteId === txn.id;
                  const isDeleting = deleteMutation.isPending && isDelete;
                  const sym = (txn.symbol ?? txn.isin ?? txn.assetName ?? '??').toString().toUpperCase().slice(0, 4);
                  return (
                    <tr key={txn.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{txn.tradeDate}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <CoinAvatar symbol={sym} size="sm" />
                          <div className="min-w-0">
                            <p className="font-medium truncate max-w-[160px]">{txn.assetName ?? '—'}</p>
                            {txn.isin && <p className="text-[10px] text-muted-foreground font-mono">{txn.isin}</p>}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium
                          ${isCredit
                            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                            : 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400'}`}>
                          {txn.transactionType === 'INTEREST_RECEIVED' ? (
                            <><Sparkles className="h-2.5 w-2.5 mr-1" /> Staking</>
                          ) : txn.transactionType === 'DEPOSIT' ? 'Transfer In'
                          : txn.transactionType === 'WITHDRAWAL' ? 'Transfer Out'
                          : txn.transactionType}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums hidden sm:table-cell text-muted-foreground">
                        {new Decimal(txn.quantity).toFixed(6)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums hidden md:table-cell text-muted-foreground">
                        {formatINR(txn.price)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums font-medium">
                        {formatINR(amount.toString())}
                      </td>
                      <td className="px-4 py-3">
                        {isDelete ? (
                          <div className="flex items-center gap-1 justify-end">
                            <span className="text-xs text-muted-foreground whitespace-nowrap">Sure?</span>
                            <Button type="button" variant="destructive" size="sm" className="h-7 px-2 text-xs"
                              disabled={isDeleting} onClick={() => deleteMutation.mutate(txn.id)}>
                              {isDeleting ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Yes'}
                            </Button>
                            <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs"
                              onClick={() => setConfirmDeleteId(null)}>No</Button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1 justify-end">
                            <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0"
                              onClick={() => openEdit(txn)} title="Edit">
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button type="button" variant="ghost" size="sm"
                              className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                              onClick={() => setConfirmDeleteId(txn.id)} title="Delete">
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
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

      <CryptoFormDialog
        open={formOpen}
        onOpenChange={(o) => { setFormOpen(o); if (!o) setEditTxn(null); }}
        initial={editTxn}
        defaultPortfolioId={portfolios?.[0]?.id}
      />
    </div>
  );
}

export { CoinAvatar };
