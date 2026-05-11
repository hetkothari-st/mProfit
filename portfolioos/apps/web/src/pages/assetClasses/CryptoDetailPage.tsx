import { useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft, Calendar, Pencil, TrendingUp, TrendingDown, Sparkles, ExternalLink, Wallet, Network,
} from 'lucide-react';
import { Decimal, formatINR, type HoldingRow, type TransactionDTO } from '@portfolioos/shared';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { transactionsApi } from '@/api/transactions.api';
import { assetsApi, type LiveCryptoCoin } from '@/api/assets.api';
import { CryptoFormDialog } from './CryptoFormDialog';
import { CoinAvatar } from './CryptoPage';
import { formatUSD, parseCryptoNarration } from './cryptoUtils';

const TXN_LABEL: Record<string, string> = {
  BUY: 'Buy',
  SELL: 'Sell',
  INTEREST_RECEIVED: 'Staking Reward',
  DEPOSIT: 'Transfer In',
  WITHDRAWAL: 'Transfer Out',
};

function Stat({ label, value, sub, highlight }: { label: string; value: string; sub?: string; highlight?: 'positive' | 'negative' }) {
  return (
    <div className="rounded-xl border bg-card px-4 py-3">
      <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">{label}</p>
      <p className={`text-xl font-bold tabular-nums mt-0.5
        ${highlight === 'positive' ? 'text-emerald-600 dark:text-emerald-400' : highlight === 'negative' ? 'text-rose-600 dark:text-rose-400' : ''}`}>
        {value}
      </p>
      {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

export function CryptoDetailPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { holdingId } = useParams<{ holdingId: string }>();
  const [editTxn, setEditTxn] = useState<TransactionDTO | null>(null);
  const [editOpen, setEditOpen] = useState(false);

  const holding = location.state?.holding as (HoldingRow & { portfolioName: string; live?: LiveCryptoCoin }) | undefined;

  useEffect(() => {
    if (!holding) navigate('/crypto', { replace: true });
  }, [holding, navigate]);

  const { data: live } = useQuery({
    queryKey: ['crypto-live'],
    queryFn: () => assetsApi.cryptoLive(),
    refetchInterval: 15_000,
    refetchIntervalInBackground: false,
    staleTime: 0,
  });

  const { data: txnData, isLoading: txnLoading } = useQuery({
    queryKey: ['transactions', 'CRYPTOCURRENCY', holding?.isin, holding?.assetName],
    queryFn: () => transactionsApi.list({ assetClass: 'CRYPTOCURRENCY', pageSize: 200 }),
    enabled: !!holding,
  });

  if (!holding) return null;

  const coinGeckoId = holding.isin ?? '';
  const liveCoin = coinGeckoId ? live?.coins.find((c) => c.coinGeckoId === coinGeckoId) ?? holding.live : holding.live;

  // Filter txns to this holding (match by isin if present, otherwise assetName)
  const transactions = (txnData?.items ?? [])
    .filter((t) =>
      coinGeckoId
        ? t.isin === coinGeckoId
        : (t.assetName ?? '') === (holding.assetName ?? ''),
    )
    .sort((a, b) => b.tradeDate.localeCompare(a.tradeDate));

  const qty = new Decimal(holding.quantity);
  const invested = new Decimal(holding.totalCost);
  const livePriceInr = liveCoin?.priceInr ? new Decimal(liveCoin.priceInr) : null;
  const livePriceUsd = liveCoin?.priceUsd ? new Decimal(liveCoin.priceUsd) : null;
  const currentInr = livePriceInr
    ? qty.times(livePriceInr)
    : (holding.currentValue ? new Decimal(holding.currentValue) : null);
  const currentUsd = livePriceUsd ? qty.times(livePriceUsd) : null;
  const pnl = currentInr ? currentInr.minus(invested) : null;
  const pnlPct = pnl && !invested.isZero() ? pnl.div(invested).times(100).toNumber() : null;
  const isGain = pnl ? pnl.gte(0) : null;
  const change24h = liveCoin?.change24h ?? null;

  const symbol = liveCoin?.symbol ?? (coinGeckoId || holding.assetName || '??').slice(0, 4).toUpperCase();
  const displayName = liveCoin?.name ?? holding.assetName ?? symbol;

  // Aggregate meta from latest transaction's narration
  const latestTxn = transactions[0];
  const meta = parseCryptoNarration(latestTxn?.narration);

  return (
    <div className="min-h-screen bg-background">
      {/* Sticky nav */}
      <div className="sticky top-0 z-10 bg-background/80 backdrop-blur border-b px-4 sm:px-6 py-3 flex items-center gap-3">
        <Button variant="ghost" size="sm" className="gap-1.5 -ml-2" onClick={() => navigate('/crypto')}>
          <ArrowLeft className="h-4 w-4" />
          Cryptocurrency
        </Button>
        <div className="h-4 w-px bg-border" />
        <p className="font-medium text-sm truncate">{displayName}</p>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
        {/* ── Hero ── */}
        <div className="grid lg:grid-cols-[auto_1fr] gap-6 mb-8 items-start">
          {/* Coin badge */}
          <div className="flex flex-col items-center gap-3 lg:items-start">
            <div className="relative">
              <CoinAvatar symbol={symbol} size="lg" />
              {coinGeckoId && (
                <span className="absolute -bottom-1 -right-1 h-4 w-4 rounded-full bg-emerald-500 border-2 border-background flex items-center justify-center">
                  <Sparkles className="h-2 w-2 text-white" />
                </span>
              )}
            </div>
          </div>

          {/* Info */}
          <div className="flex flex-col gap-4">
            <div>
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <Badge variant="outline" className="font-mono text-xs">
                  {symbol}
                </Badge>
                <Badge variant="outline" className="text-muted-foreground text-xs">
                  {holding.portfolioName}
                </Badge>
                {coinGeckoId && (
                  <a
                    href={`https://www.coingecko.com/en/coins/${coinGeckoId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                  >
                    CoinGecko <ExternalLink className="h-2.5 w-2.5" />
                  </a>
                )}
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold">{displayName}</h1>
            </div>

            {/* Current value card */}
            <div className="rounded-2xl p-5 bg-gradient-to-br from-amber-50 via-background to-violet-50 dark:from-amber-950/30 dark:via-background dark:to-violet-950/20 border">
              <div className="flex items-center gap-2 mb-1">
                <p className="text-sm text-muted-foreground font-medium uppercase tracking-wide">Current Value</p>
                {liveCoin && (
                  <span className="flex items-center gap-1 text-[10px] text-emerald-600 font-medium">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    live
                  </span>
                )}
              </div>
              <p className="text-4xl font-bold tabular-nums">
                {currentInr ? formatINR(currentInr.toString()) : '—'}
              </p>
              <div className="flex items-baseline gap-4 mt-1.5">
                {currentUsd && (
                  <p className="text-sm text-muted-foreground tabular-nums">
                    {formatUSD(currentUsd)}
                  </p>
                )}
                {livePriceInr && (
                  <p className="text-xs text-muted-foreground tabular-nums">
                    {formatINR(livePriceInr.toString())} / coin
                  </p>
                )}
                {change24h != null && (
                  <span className={`text-xs font-semibold tabular-nums flex items-center gap-0.5 ${change24h >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                    {change24h >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                    {change24h >= 0 ? '+' : ''}{change24h.toFixed(2)}% (24h)
                  </span>
                )}
              </div>
            </div>

            {/* P&L */}
            {pnl && (
              <div className={`flex items-center gap-3 rounded-xl px-4 py-3 border ${
                isGain
                  ? 'bg-emerald-50 border-emerald-200 dark:bg-emerald-950/20 dark:border-emerald-800'
                  : 'bg-rose-50 border-rose-200 dark:bg-rose-950/20 dark:border-rose-800'
              }`}>
                {isGain
                  ? <TrendingUp className="h-5 w-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  : <TrendingDown className="h-5 w-5 text-rose-600 dark:text-rose-400 shrink-0" />}
                <div>
                  <p className="text-xs text-muted-foreground">Unrealised P&L</p>
                  <p className={`text-lg font-bold tabular-nums ${isGain ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400'}`}>
                    {isGain ? '+' : ''}{formatINR(pnl.toString())}
                    {pnlPct != null && (
                      <span className="text-sm font-normal ml-2 opacity-80">
                        ({pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(2)}%)
                      </span>
                    )}
                  </p>
                </div>
              </div>
            )}

            {/* Stats grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <Stat label="Invested" value={formatINR(holding.totalCost)} />
              <Stat label="Quantity" value={qty.toFixed(qty.lt(1) ? 8 : 4)} sub="coins" />
              <Stat label="Avg cost" value={formatINR(holding.avgCostPrice)} sub="per coin" />
              {holding.xirr != null && (
                <Stat
                  label="XIRR"
                  value={`${holding.xirr >= 0 ? '+' : ''}${(holding.xirr * 100).toFixed(2)}%`}
                  highlight={holding.xirr >= 0 ? 'positive' : 'negative'}
                />
              )}
              {holding.holdingPeriodDays != null && (
                <Stat
                  label="Held for"
                  value={`${Math.floor(holding.holdingPeriodDays / 365)}y ${Math.floor((holding.holdingPeriodDays % 365) / 30)}m`}
                />
              )}
            </div>

            {/* Source meta */}
            {(meta.exchange || meta.network || meta.walletAddress) && (
              <div className="rounded-xl border bg-muted/20 p-4 space-y-2">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Source</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-sm">
                  {meta.exchange && (
                    <div className="flex items-center gap-2">
                      <Wallet className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-muted-foreground text-xs">Exchange:</span>
                      <span className="font-medium">{meta.exchange}</span>
                    </div>
                  )}
                  {meta.network && (
                    <div className="flex items-center gap-2">
                      <Network className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-muted-foreground text-xs">Network:</span>
                      <span className="font-medium">{meta.network}</span>
                    </div>
                  )}
                  {meta.walletAddress && (
                    <div className="flex items-center gap-2 col-span-full">
                      <span className="text-muted-foreground text-xs">Wallet:</span>
                      <span className="font-mono text-xs truncate">{meta.walletAddress}</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Transactions ── */}
        <div>
          <h2 className="text-lg font-semibold mb-4">Transactions</h2>
          {txnLoading ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Loading…</p>
          ) : transactions.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">No transactions found.</p>
          ) : (
            <div className="rounded-xl border divide-y overflow-hidden">
              {transactions.map((t) => {
                const amount = new Decimal(t.quantity).times(new Decimal(t.price));
                const isCredit = ['BUY', 'INTEREST_RECEIVED', 'DEPOSIT'].includes(t.transactionType);
                return (
                  <div key={t.id} className="flex items-center gap-4 px-5 py-4 hover:bg-muted/20 transition-colors">
                    <CoinAvatar symbol={symbol} size="sm" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium
                          ${isCredit
                            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                            : 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400'}`}>
                          {TXN_LABEL[t.transactionType] ?? t.transactionType}
                        </span>
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Calendar className="h-3 w-3" />{t.tradeDate}
                        </span>
                      </div>
                      <p className="text-sm mt-0.5 tabular-nums text-muted-foreground">
                        {new Decimal(t.quantity).toFixed(6)} @ {formatINR(t.price)}
                      </p>
                    </div>
                    <div className="text-right shrink-0 flex items-center gap-2">
                      <p className="font-semibold tabular-nums">{formatINR(amount.toString())}</p>
                      <Button
                        variant="ghost" size="sm" className="h-8 w-8 p-0 text-muted-foreground"
                        onClick={() => { setEditTxn(t); setEditOpen(true); }}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <CryptoFormDialog
        open={editOpen}
        onOpenChange={(o) => { setEditOpen(o); if (!o) setEditTxn(null); }}
        initial={editTxn}
      />
    </div>
  );
}
