import { useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, ChevronLeft, ChevronRight, Calendar, Pencil, ImageIcon, TrendingUp, TrendingDown } from 'lucide-react';
import { Decimal, formatINR, type HoldingRow, type AssetClass } from '@portfolioos/shared';
import type { TransactionDTO } from '@portfolioos/shared';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { transactionsApi } from '@/api/transactions.api';
import { assetsApi } from '@/api/assets.api';
import { api } from '@/api/client';
import { GoldFormDialog } from './GoldFormDialog';

const ASSET_CLASS_LABELS: Partial<Record<AssetClass, string>> = {
  PHYSICAL_GOLD: 'Physical Gold',
  GOLD_BOND: 'Sovereign Gold Bond',
  GOLD_ETF: 'Gold ETF',
  PHYSICAL_SILVER: 'Physical Silver',
};

const TXN_LABELS: Record<string, string> = {
  BUY: 'Buy', SELL: 'Sell', INTEREST_RECEIVED: 'Interest', MATURITY: 'Maturity',
};

function detectCarat(name: string): number {
  const m = name.match(/\b(\d+)\s*[kK]\b/);
  if (m) { const k = parseInt(m[1]!); if (k >= 6 && k <= 24) return k; }
  return 24;
}
function detectSilverPurityMultiplier(name: string): string {
  const m = name.match(/^(999|925|800)\b/);
  if (m) return ({ '999': '1', '925': '0.925', '800': '0.8' } as Record<string, string>)[m[1]!] ?? '1';
  return '1';
}

// ── Photo carousel ───────────────────────────────────────────────
interface PhotoEntry { id: string; txnId: string; fileName: string }

function PhotoCarousel({ photos }: { photos: PhotoEntry[] }) {
  const [idx, setIdx] = useState(0);
  const [srcs, setSrcs] = useState<Record<string, string>>({});

  useEffect(() => {
    const loaded: Record<string, string> = {};
    Promise.all(
      photos.map(async (p) => {
        try {
          const { data } = await api.get(`/api/transactions/${p.txnId}/photos/${p.id}`, { responseType: 'blob' });
          loaded[p.id] = URL.createObjectURL(data);
        } catch {}
      }),
    ).then(() => setSrcs({ ...loaded }));
    return () => Object.values(loaded).forEach(URL.revokeObjectURL);
  }, [photos]);

  const current = photos[idx];
  const src = current ? srcs[current.id] : null;

  return (
    <div className="relative w-full aspect-square bg-muted/20 rounded-2xl overflow-hidden select-none">
      {src
        ? <img src={src} alt={current?.fileName} className="w-full h-full object-contain" />
        : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-3 text-muted-foreground">
            <ImageIcon className="h-12 w-12 opacity-30" />
            <span className="text-sm">Loading…</span>
          </div>
        )
      }

      {photos.length > 1 && (
        <>
          <button
            onClick={() => setIdx((i) => (i - 1 + photos.length) % photos.length)}
            className="absolute left-3 top-1/2 -translate-y-1/2 h-9 w-9 rounded-full bg-black/40 hover:bg-black/60 flex items-center justify-center text-white transition-colors"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            onClick={() => setIdx((i) => (i + 1) % photos.length)}
            className="absolute right-3 top-1/2 -translate-y-1/2 h-9 w-9 rounded-full bg-black/40 hover:bg-black/60 flex items-center justify-center text-white transition-colors"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
            {photos.map((_, i) => (
              <button
                key={i}
                onClick={() => setIdx(i)}
                className={`h-1.5 rounded-full transition-all ${i === idx ? 'w-4 bg-white' : 'w-1.5 bg-white/50'}`}
              />
            ))}
          </div>
          <div className="absolute top-3 right-3 bg-black/40 text-white text-xs px-2 py-0.5 rounded-full">
            {idx + 1} / {photos.length}
          </div>
        </>
      )}
    </div>
  );
}

// ── NoPhotoPlaceholder ───────────────────────────────────────────
function NoPhotoPlaceholder({ assetClass }: { assetClass: string }) {
  const isGold = assetClass !== 'PHYSICAL_SILVER';
  return (
    <div className={`w-full aspect-square rounded-2xl flex flex-col items-center justify-center gap-4
      ${isGold
        ? 'bg-gradient-to-br from-amber-50 to-yellow-100 dark:from-amber-950/40 dark:to-yellow-900/20'
        : 'bg-gradient-to-br from-slate-50 to-gray-100 dark:from-slate-900/40 dark:to-gray-800/20'
      }`}>
      <span className="text-7xl">{isGold ? '🪙' : '🥈'}</span>
      <p className="text-sm text-muted-foreground">No photo added yet</p>
    </div>
  );
}

// ── Stat card ────────────────────────────────────────────────────
function Stat({ label, value, sub, highlight }: { label: string; value: string; sub?: string; highlight?: 'positive' | 'negative' }) {
  return (
    <div className="rounded-xl border bg-card px-4 py-3">
      <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">{label}</p>
      <p className={`text-xl font-bold tabular-nums mt-0.5
        ${highlight === 'positive' ? 'text-green-600 dark:text-green-400' : highlight === 'negative' ? 'text-red-600 dark:text-red-400' : ''}`}>
        {value}
      </p>
      {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────
export function GoldAssetDetailPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { holdingId } = useParams<{ holdingId: string }>();
  const [editTxn, setEditTxn] = useState<TransactionDTO | null>(null);
  const [editOpen, setEditOpen] = useState(false);

  // Holding passed via navigation state
  const holding = location.state?.holding as (HoldingRow & { portfolioName: string; currentValue?: string | null }) | undefined;

  // Redirect if state missing (e.g. direct URL / refresh)
  useEffect(() => {
    if (!holding) navigate('/gold', { replace: true });
  }, [holding, navigate]);

  const { data: live } = useQuery({
    queryKey: ['commodities-live'],
    queryFn: () => assetsApi.commoditiesLive(),
    refetchInterval: 30_000,
    staleTime: 0,
  });

  const { data: txnData, isLoading: txnLoading } = useQuery({
    queryKey: ['transactions', holding?.assetClass, holding?.assetName],
    queryFn: () => transactionsApi.list({ assetClass: holding!.assetClass, pageSize: 200 }),
    enabled: !!holding,
  });

  if (!holding) return null;

  const assetName = holding.assetName ?? '';
  const transactions = (txnData?.items ?? []).filter((t) => (t.assetName ?? '') === assetName);
  const allPhotos: PhotoEntry[] = transactions.flatMap((t) =>
    (t.photos ?? []).map((p) => ({ id: p.id, txnId: t.id, fileName: p.fileName })),
  );

  // Live value computation
  const GOLD_CLASSES = new Set(['PHYSICAL_GOLD', 'GOLD_BOND', 'GOLD_ETF']);
  let liveValue: Decimal | null = null;
  let livePricePerUnit: Decimal | null = null;
  if (GOLD_CLASSES.has(holding.assetClass) && live?.GOLD) {
    const carat = detectCarat(assetName);
    livePricePerUnit = new Decimal(live.GOLD).times(carat).div(24);
    liveValue = livePricePerUnit.times(new Decimal(holding.quantity));
  } else if (holding.assetClass === 'PHYSICAL_SILVER' && live?.SILVER) {
    const mult = detectSilverPurityMultiplier(assetName);
    livePricePerUnit = new Decimal(live.SILVER).times(mult);
    liveValue = livePricePerUnit.times(new Decimal(holding.quantity));
  }

  const invested = new Decimal(holding.totalCost);
  const currentVal = liveValue ?? (holding.currentValue ? new Decimal(holding.currentValue) : null);
  const pnl = currentVal ? currentVal.minus(invested) : null;
  const pnlPct = pnl && !invested.isZero() ? pnl.div(invested).times(100).toNumber() : null;
  const isGain = pnl ? pnl.gte(0) : null;

  // Parse display name and purity tag
  const goldCaratMatch = assetName.match(/^(\d{2}[kK])\s*/);
  const silverPurityMatch = assetName.match(/^(999|925|800)\s*/);
  const purityTag = goldCaratMatch?.[1]?.toUpperCase() ?? silverPurityMatch?.[1] ?? null;
  const displayName = purityTag ? assetName.replace(/^[\d]+[kK]?\s*/, '').trim() || assetName : assetName;

  const isPhysical = ['PHYSICAL_GOLD', 'PHYSICAL_SILVER'].includes(holding.assetClass);
  const unitLabel = isPhysical ? 'g' : 'unit';

  return (
    <div className="min-h-screen bg-background">
      {/* Top nav */}
      <div className="sticky top-0 z-10 bg-background/80 backdrop-blur border-b px-4 sm:px-6 py-3 flex items-center gap-3">
        <Button variant="ghost" size="sm" className="gap-1.5 -ml-2" onClick={() => navigate('/gold')}>
          <ArrowLeft className="h-4 w-4" />
          Gold & Silver
        </Button>
        <div className="h-4 w-px bg-border" />
        <p className="font-medium text-sm truncate">{displayName || assetName}</p>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">

        {/* ── Hero section ── */}
        <div className={`grid gap-6 mb-8 ${allPhotos.length > 0 ? 'lg:grid-cols-[1fr_1.2fr]' : 'lg:grid-cols-1'}`}>

          {/* Photo */}
          <div className="w-full max-w-sm mx-auto lg:mx-0">
            {allPhotos.length > 0
              ? <PhotoCarousel photos={allPhotos} />
              : <NoPhotoPlaceholder assetClass={holding.assetClass} />
            }
          </div>

          {/* Info panel */}
          <div className="flex flex-col gap-4">
            {/* Title */}
            <div>
              <div className="flex items-center gap-2 flex-wrap mb-1">
                {purityTag && (
                  <Badge variant="outline" className="text-amber-700 border-amber-400 dark:text-amber-300 dark:border-amber-600 font-semibold">
                    {purityTag}
                  </Badge>
                )}
                <Badge variant="outline" className="text-muted-foreground text-xs">
                  {ASSET_CLASS_LABELS[holding.assetClass as AssetClass] ?? holding.assetClass}
                </Badge>
                <span className="text-xs text-muted-foreground">{holding.portfolioName}</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold">{displayName || assetName}</h1>
              {holding.isin && <p className="text-xs text-muted-foreground font-mono mt-1">{holding.isin}</p>}
            </div>

            {/* Current value + live indicator */}
            <div className={`rounded-2xl p-5 ${
              holding.assetClass === 'PHYSICAL_SILVER'
                ? 'bg-slate-50 dark:bg-slate-900/40'
                : 'bg-amber-50 dark:bg-amber-950/30'
            }`}>
              <div className="flex items-center gap-2 mb-1">
                <p className="text-sm text-muted-foreground font-medium uppercase tracking-wide">Current Value</p>
                {live?.GOLD || live?.SILVER ? (
                  <span className="flex items-center gap-1 text-[10px] text-green-600 font-medium">
                    <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
                    live
                  </span>
                ) : null}
              </div>
              <p className={`text-4xl font-bold tabular-nums ${holding.assetClass === 'PHYSICAL_SILVER' ? 'text-slate-700 dark:text-slate-200' : 'text-amber-700 dark:text-amber-300'}`}>
                {currentVal ? formatINR(currentVal.toString()) : '—'}
              </p>
              {livePricePerUnit && (
                <p className="text-sm text-muted-foreground mt-1">
                  {formatINR(livePricePerUnit.toString())} / {unitLabel}
                  {purityTag ? ` · ${purityTag}` : ''}
                </p>
              )}
            </div>

            {/* P&L */}
            {pnl && (
              <div className={`flex items-center gap-3 rounded-xl px-4 py-3 border ${
                isGain
                  ? 'bg-green-50 border-green-200 dark:bg-green-950/20 dark:border-green-800'
                  : 'bg-red-50 border-red-200 dark:bg-red-950/20 dark:border-red-800'
              }`}>
                {isGain
                  ? <TrendingUp className="h-5 w-5 text-green-600 dark:text-green-400 shrink-0" />
                  : <TrendingDown className="h-5 w-5 text-red-600 dark:text-red-400 shrink-0" />
                }
                <div>
                  <p className="text-xs text-muted-foreground">Unrealised P&L</p>
                  <p className={`text-lg font-bold tabular-nums ${isGain ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'}`}>
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
            <div className="grid grid-cols-2 gap-3">
              <Stat label="Invested" value={formatINR(holding.totalCost)} />
              <Stat
                label={`Weight${isPhysical ? ' (grams)' : ' (units)'}`}
                value={new Decimal(holding.quantity).toFixed(isPhysical ? 3 : 2)}
              />
              <Stat label="Avg cost" value={`${formatINR(holding.avgCostPrice)} / ${unitLabel}`} />
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
          </div>
        </div>

        {/* ── Transactions ── */}
        <div>
          <h2 className="text-lg font-semibold mb-4">Transactions</h2>
          {txnLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground text-sm py-6 justify-center">
              Loading…
            </div>
          ) : transactions.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">No transactions found.</p>
          ) : (
            <div className="rounded-xl border divide-y overflow-hidden">
              {transactions.map((t) => {
                const amount = new Decimal(t.quantity).times(new Decimal(t.price));
                const isBuy = ['BUY', 'INTEREST_RECEIVED', 'MATURITY', 'OPENING_BALANCE'].includes(t.transactionType);
                const txnPhotos = (t.photos ?? []);
                return (
                  <div key={t.id} className="flex items-center gap-4 px-5 py-4 hover:bg-muted/20 transition-colors">
                    {/* Thumbnail */}
                    {txnPhotos.length > 0 ? (
                      <TxnThumb txnId={t.id} photoId={txnPhotos[0]!.id} />
                    ) : (
                      <div className="h-11 w-11 rounded-lg bg-muted/40 flex items-center justify-center shrink-0">
                        <span className="text-xl">{holding.assetClass === 'PHYSICAL_SILVER' ? '🥈' : '🪙'}</span>
                      </div>
                    )}

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium
                          ${isBuy
                            ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                            : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                          }`}>
                          {TXN_LABELS[t.transactionType] ?? t.transactionType}
                        </span>
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Calendar className="h-3 w-3" />{t.tradeDate}
                        </span>
                      </div>
                      <p className="text-sm mt-0.5 tabular-nums text-muted-foreground">
                        {new Decimal(t.quantity).toFixed(3)} {unitLabel} · {formatINR(t.price)} / {unitLabel}
                      </p>
                      {t.narration && <p className="text-xs text-muted-foreground/60 truncate">{t.narration}</p>}
                    </div>

                    {/* Amount + edit */}
                    <div className="text-right shrink-0 flex items-center gap-2">
                      <div>
                        <p className="font-semibold tabular-nums">{formatINR(amount.toString())}</p>
                        {txnPhotos.length > 1 && (
                          <p className="text-xs text-muted-foreground">{txnPhotos.length} photos</p>
                        )}
                      </div>
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

      <GoldFormDialog
        open={editOpen}
        onOpenChange={(o) => { setEditOpen(o); if (!o) setEditTxn(null); }}
        initial={editTxn}
      />
    </div>
  );
}

function TxnThumb({ txnId, photoId }: { txnId: string; photoId: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let url: string | null = null;
    api.get(`/api/transactions/${txnId}/photos/${photoId}`, { responseType: 'blob' })
      .then(({ data }) => { url = URL.createObjectURL(data); setSrc(url); })
      .catch(() => {});
    return () => { if (url) URL.revokeObjectURL(url); };
  }, [txnId, photoId]);
  return (
    <div className="h-11 w-11 rounded-lg border overflow-hidden bg-muted/30 shrink-0">
      {src
        ? <img src={src} alt="" className="h-full w-full object-contain" />
        : <div className="h-full w-full flex items-center justify-center"><ImageIcon className="h-4 w-4 text-muted-foreground" /></div>
      }
    </div>
  );
}
