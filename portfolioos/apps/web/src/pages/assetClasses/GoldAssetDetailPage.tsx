import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Calendar,
  Pencil,
  ImageIcon,
  TrendingUp,
  TrendingDown,
  Hash,
  Coins,
  Scale,
  Activity,
} from 'lucide-react';
import { Decimal, formatINR, type HoldingRow, type AssetClass } from '@portfolioos/shared';
import type { TransactionDTO } from '@portfolioos/shared';
import { Button } from '@/components/ui/button';
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
  BUY: 'Acquired',
  SELL: 'Sold',
  INTEREST_RECEIVED: 'Interest',
  MATURITY: 'Maturity',
  OPENING_BALANCE: 'Opening',
};

function detectCarat(name: string): number {
  const m = name.match(/\b(\d+)\s*[kK]\b/);
  if (m) {
    const k = parseInt(m[1]!);
    if (k >= 6 && k <= 24) return k;
  }
  return 24;
}
function detectSilverPurityMultiplier(name: string): string {
  const m = name.match(/^(999|925|800)\b/);
  if (m) return ({ '999': '1', '925': '0.925', '800': '0.8' } as Record<string, string>)[m[1]!] ?? '1';
  return '1';
}

// ── Photo carousel (refined) ─────────────────────────────────────
interface PhotoEntry { id: string; txnId: string; fileName: string }

function PhotoCarousel({ photos, accent }: { photos: PhotoEntry[]; accent: 'gold' | 'silver' }) {
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

  const frameTone = accent === 'gold'
    ? 'from-amber-100/80 via-amber-50/40 to-yellow-50/30 dark:from-amber-900/30 dark:via-amber-950/20 dark:to-yellow-950/10'
    : 'from-slate-100/80 via-slate-50/40 to-zinc-50/30 dark:from-slate-800/40 dark:via-slate-900/20 dark:to-zinc-950/10';

  return (
    <div className="relative">
      {/* decorative outer frame */}
      <div className={`relative rounded-[28px] p-3 bg-gradient-to-br ${frameTone} shadow-[0_30px_60px_-25px_rgba(0,0,0,0.25)] ring-1 ring-black/5 dark:ring-white/5`}>
        <div className="relative aspect-square rounded-[20px] overflow-hidden bg-[hsl(var(--card))] select-none">
          {src ? (
            <img src={src} alt={current?.fileName} className="w-full h-full object-contain p-2 transition-transform duration-700 hover:scale-[1.03]" />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center gap-3 text-muted-foreground">
              <ImageIcon className="h-10 w-10 opacity-30" />
              <span className="text-xs tracking-widest uppercase">Loading</span>
            </div>
          )}

          {photos.length > 1 && (
            <>
              <button
                onClick={() => setIdx((i) => (i - 1 + photos.length) % photos.length)}
                className="absolute left-3 top-1/2 -translate-y-1/2 h-9 w-9 rounded-full bg-black/45 hover:bg-black/65 backdrop-blur flex items-center justify-center text-white transition"
                aria-label="Previous photo"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <button
                onClick={() => setIdx((i) => (i + 1) % photos.length)}
                className="absolute right-3 top-1/2 -translate-y-1/2 h-9 w-9 rounded-full bg-black/45 hover:bg-black/65 backdrop-blur flex items-center justify-center text-white transition"
                aria-label="Next photo"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
                {photos.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setIdx(i)}
                    className={`h-1.5 rounded-full transition-all ${i === idx ? 'w-5 bg-white' : 'w-1.5 bg-white/50'}`}
                  />
                ))}
              </div>
              <div className="absolute top-3 right-3 bg-black/50 backdrop-blur text-white text-[10px] tracking-[0.18em] uppercase px-2.5 py-1 rounded-full font-medium">
                {idx + 1} / {photos.length}
              </div>
            </>
          )}
        </div>
      </div>

      {/* serial caption */}
      <div className="mt-4 flex items-center justify-between text-[10px] tracking-[0.22em] uppercase text-muted-foreground/80 px-1">
        <span>Folio · {current?.fileName?.slice(0, 18) ?? 'Inventory'}</span>
        <span>{photos.length || 0} {photos.length === 1 ? 'image' : 'images'}</span>
      </div>
    </div>
  );
}

function NoPhotoPlaceholder({ assetClass }: { assetClass: string }) {
  const isGold = assetClass !== 'PHYSICAL_SILVER';
  return (
    <div className="relative">
      <div className={`relative rounded-[28px] p-3 bg-gradient-to-br ${
        isGold
          ? 'from-amber-100/80 via-amber-50/40 to-yellow-50/30 dark:from-amber-900/30 dark:via-amber-950/20 dark:to-yellow-950/10'
          : 'from-slate-100/80 via-slate-50/40 to-zinc-50/30 dark:from-slate-800/40 dark:via-slate-900/20 dark:to-zinc-950/10'
      } shadow-[0_30px_60px_-25px_rgba(0,0,0,0.25)] ring-1 ring-black/5 dark:ring-white/5`}>
        <div className={`aspect-square rounded-[20px] flex flex-col items-center justify-center gap-4 ${
          isGold
            ? 'bg-gradient-to-br from-amber-50 to-yellow-100 dark:from-amber-950/40 dark:to-yellow-900/20'
            : 'bg-gradient-to-br from-slate-50 to-gray-100 dark:from-slate-900/40 dark:to-gray-800/20'
        }`}>
          <span className="text-7xl drop-shadow-sm">{isGold ? '🪙' : '🥈'}</span>
          <p className="text-xs tracking-[0.18em] uppercase text-muted-foreground/80">No imagery added</p>
        </div>
      </div>
    </div>
  );
}

// ── Editorial stat (no card chrome — just typography) ───────────
function Ledger({
  label,
  value,
  hint,
  highlight,
}: {
  label: string;
  value: string;
  hint?: string;
  highlight?: 'positive' | 'negative' | 'accent';
}) {
  const colour =
    highlight === 'positive' ? 'text-[hsl(var(--positive))]' :
    highlight === 'negative' ? 'text-[hsl(var(--negative))]' :
    highlight === 'accent'   ? 'text-[hsl(var(--accent))]' :
    'text-foreground';
  return (
    <div className="px-4 py-4 min-w-0">
      <p className="text-[10px] tracking-[0.22em] uppercase text-muted-foreground/80 font-medium truncate">{label}</p>
      <p className={`mt-2 text-base sm:text-lg lg:text-xl font-semibold leading-tight tabular-nums whitespace-nowrap ${colour}`}>{value}</p>
      {hint && <p className="mt-1.5 text-[11px] text-muted-foreground/70 truncate">{hint}</p>}
    </div>
  );
}

// ── Cost vs Live comparison bar ─────────────────────────────────
function CostBar({ invested, current, accent }: { invested: Decimal; current: Decimal | null; accent: 'gold' | 'silver' }) {
  if (!current || invested.isZero()) return null;
  const max = Decimal.max(invested, current);
  const investedPct = invested.div(max).times(100).toNumber();
  const currentPct  = current.div(max).times(100).toNumber();
  const gain = current.gte(invested);

  const investedColor = accent === 'gold' ? 'bg-amber-200/70 dark:bg-amber-900/40' : 'bg-slate-300/70 dark:bg-slate-700/50';
  const currentColor  = gain
    ? 'bg-gradient-to-r from-emerald-500/85 to-emerald-600/85 dark:from-emerald-400/85 dark:to-emerald-500/85'
    : 'bg-gradient-to-r from-rose-500/85 to-rose-600/85 dark:from-rose-400/85 dark:to-rose-500/85';

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-[10px] tracking-[0.22em] uppercase text-muted-foreground/80">
        <span>Cost · Value</span>
        <span>{gain ? 'Appreciated' : 'Depreciated'}</span>
      </div>
      <div className="space-y-2.5">
        <div className="flex items-center gap-3">
          <span className="w-20 text-[10px] tracking-[0.18em] uppercase text-muted-foreground">Invested</span>
          <div className="relative flex-1 h-2 rounded-full bg-muted/40 overflow-hidden">
            <div className={`absolute inset-y-0 left-0 ${investedColor} rounded-full transition-all duration-700`} style={{ width: `${investedPct}%` }} />
          </div>
          <span className="font-semibold text-sm tabular-nums w-32 text-right">{formatINR(invested.toString())}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="w-20 text-[10px] tracking-[0.18em] uppercase text-muted-foreground">Today</span>
          <div className="relative flex-1 h-2 rounded-full bg-muted/40 overflow-hidden">
            <div className={`absolute inset-y-0 left-0 ${currentColor} rounded-full transition-all duration-700`} style={{ width: `${currentPct}%` }} />
          </div>
          <span className="font-semibold text-sm tabular-nums w-32 text-right">{formatINR(current.toString())}</span>
        </div>
      </div>
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────
export function GoldAssetDetailPage() {
  const navigate = useNavigate();
  const location = useLocation();
  useParams<{ holdingId: string }>();
  const [editTxn, setEditTxn] = useState<TransactionDTO | null>(null);
  const [editOpen, setEditOpen] = useState(false);

  const holding = location.state?.holding as (HoldingRow & { portfolioName: string; currentValue?: string | null }) | undefined;

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

  const assetName = holding?.assetName ?? '';
  const transactions = useMemo(
    () => (txnData?.items ?? [])
      .filter((t) => (t.assetName ?? '') === assetName)
      .sort((a, b) => b.tradeDate.localeCompare(a.tradeDate)),
    [txnData, assetName],
  );

  if (!holding) return null;

  const allPhotos: PhotoEntry[] = transactions.flatMap((t) =>
    (t.photos ?? []).map((p) => ({ id: p.id, txnId: t.id, fileName: p.fileName })),
  );

  // Live value computation per asset class
  const GOLD_ETF_PATTERN = /\b(GOLDBEES|GOLDIETF|AXISGOLD|HDFCGOLD|KOTAKGOLD|SETFGOLD|LICMFGOLD|QGOLDHALF)\b/;
  let liveValue: Decimal | null = null;
  let livePricePerUnit: Decimal | null = null;
  if (holding.assetClass === 'PHYSICAL_GOLD' && live?.GOLD) {
    const carat = detectCarat(assetName);
    livePricePerUnit = new Decimal(live.GOLD).times(carat).div(24);
    liveValue = livePricePerUnit.times(new Decimal(holding.quantity));
  } else if (holding.assetClass === 'GOLD_BOND' && live?.GOLD) {
    livePricePerUnit = new Decimal(live.GOLD);
    liveValue = livePricePerUnit.times(new Decimal(holding.quantity));
  } else if (holding.assetClass === 'GOLD_ETF') {
    const ticker = (assetName.toUpperCase().match(GOLD_ETF_PATTERN) ?? [])[1]
      ?? (holding.symbol?.toUpperCase().match(GOLD_ETF_PATTERN) ?? [])[1];
    const nav = ticker ? live?.etfNavs?.[ticker] : null;
    if (nav) {
      livePricePerUnit = new Decimal(nav);
      liveValue = livePricePerUnit.times(new Decimal(holding.quantity));
    }
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
  const avgCost = new Decimal(holding.avgCostPrice);
  const premiumPct = livePricePerUnit && !avgCost.isZero()
    ? livePricePerUnit.minus(avgCost).div(avgCost).times(100).toNumber()
    : null;

  // Transaction-derived stats
  const buyTxns  = transactions.filter((t) => ['BUY', 'OPENING_BALANCE'].includes(t.transactionType));
  const sellTxns = transactions.filter((t) => t.transactionType === 'SELL');
  const totalBought = buyTxns.reduce((acc, t) => acc.plus(new Decimal(t.quantity).times(new Decimal(t.price))), new Decimal(0));
  const totalSold   = sellTxns.reduce((acc, t) => acc.plus(new Decimal(t.quantity).times(new Decimal(t.price))), new Decimal(0));
  const firstTxnDate = transactions.length ? transactions[transactions.length - 1]!.tradeDate : null;
  const lastTxnDate  = transactions.length ? transactions[0]!.tradeDate : null;

  const isPhysical = ['PHYSICAL_GOLD', 'PHYSICAL_SILVER'].includes(holding.assetClass);
  const unitLabel = isPhysical ? 'g' : 'unit';
  const accent: 'gold' | 'silver' = holding.assetClass === 'PHYSICAL_SILVER' ? 'silver' : 'gold';

  // Display name + purity
  const goldCaratMatch = assetName.match(/^(\d{2}[kK])\s*/);
  const silverPurityMatch = assetName.match(/^(999|925|800)\s*/);
  const purityTag = goldCaratMatch?.[1]?.toUpperCase() ?? silverPurityMatch?.[1] ?? null;
  const displayName = purityTag ? assetName.replace(/^[\d]+[kK]?\s*/, '').trim() || assetName : assetName;

  // Holding period — fall back to (today - firstTxnDate) if backend hasn't populated it
  const holdDays = (() => {
    if (holding.holdingPeriodDays != null) return holding.holdingPeriodDays;
    if (!firstTxnDate) return null;
    const ms = Date.now() - new Date(firstTxnDate).getTime();
    return Math.max(0, Math.floor(ms / 86_400_000));
  })();
  const holdHuman = (() => {
    if (holdDays == null) return null;
    const y = Math.floor(holdDays / 365);
    const m = Math.floor((holdDays % 365) / 30);
    if (y === 0 && m === 0) return `${holdDays} ${holdDays === 1 ? 'day' : 'days'}`;
    if (y === 0) return `${m}mo`;
    return `${y}y ${m}mo`;
  })();

  return (
    <div className="min-h-screen bg-background relative">
      {/* subtle paper-grain backdrop */}
      <div
        className="pointer-events-none fixed inset-0 opacity-[0.035] dark:opacity-[0.06] mix-blend-multiply dark:mix-blend-screen"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%25' height='100%25' filter='url(%23n)' opacity='0.5'/></svg>\")",
        }}
      />

      {/* Top crumb */}
      <div className="sticky top-0 z-20 bg-background/85 backdrop-blur border-b border-border/70 px-4 sm:px-8 py-3 flex items-center gap-3">
        <Button variant="ghost" size="sm" className="gap-1.5 -ml-2 hover:bg-muted/40" onClick={() => navigate('/gold')}>
          <ArrowLeft className="h-4 w-4" />
          Gold &amp; Silver
        </Button>
        <span className="h-4 w-px bg-border" />
        <p className="font-medium text-sm truncate">{displayName || assetName}</p>
      </div>

      <div className="relative max-w-7xl mx-auto px-4 sm:px-8 py-10 sm:py-14">

        {/* ────────────── HERO ────────────── */}
        <div className={`grid gap-10 lg:gap-16 mb-12 sm:mb-16 ${allPhotos.length > 0 ? 'lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]' : 'lg:grid-cols-1'}`}>

          {/* Left — imagery */}
          <div className="w-full max-w-md mx-auto lg:mx-0">
            {allPhotos.length > 0
              ? <PhotoCarousel photos={allPhotos} accent={accent} />
              : <NoPhotoPlaceholder assetClass={holding.assetClass} />
            }
          </div>

          {/* Right — editorial info column */}
          <div className="flex flex-col">

            {/* Eyebrow line */}
            <div className="flex items-center gap-3 text-[10px] tracking-[0.28em] uppercase text-muted-foreground/80">
              <span>{ASSET_CLASS_LABELS[holding.assetClass as AssetClass] ?? holding.assetClass}</span>
              <span className="h-px w-8 bg-border" />
              <span className="text-[hsl(var(--accent))] font-medium">{holding.portfolioName}</span>
            </div>

            {/* Purity badge + name */}
            <div className="mt-4 flex items-start gap-4 sm:gap-5">
              {purityTag && (
                <div className={`shrink-0 mt-2 h-14 w-14 rounded-full flex items-center justify-center text-[11px] font-bold tracking-wider ring-1 shadow-inner
                  ${accent === 'gold'
                    ? 'bg-gradient-to-br from-amber-100 to-amber-50 text-amber-800 ring-amber-300 dark:from-amber-900/40 dark:to-amber-950/30 dark:text-amber-200 dark:ring-amber-700/60'
                    : 'bg-gradient-to-br from-slate-100 to-slate-50 text-slate-700 ring-slate-300 dark:from-slate-800/60 dark:to-slate-900/40 dark:text-slate-200 dark:ring-slate-600'}
                `}>
                  {purityTag}
                </div>
              )}
              <div className="min-w-0">
                <h1 className="text-[2.4rem] sm:text-[3.2rem] font-bold leading-[1.05] tracking-tight">
                  {displayName || assetName}
                </h1>
                {holding.isin && (
                  <p className="mt-2 text-[11px] tracking-[0.22em] uppercase text-muted-foreground/70 font-mono flex items-center gap-1.5">
                    <Hash className="h-3 w-3" />{holding.isin}
                  </p>
                )}
              </div>
            </div>

            {/* Hairline */}
            <div className="my-7 flex items-center gap-3">
              <span className="h-px flex-1 bg-gradient-to-r from-transparent via-border to-transparent" />
              <span className={`h-1.5 w-1.5 rounded-full ${accent === 'gold' ? 'bg-amber-400 dark:bg-amber-500' : 'bg-slate-400 dark:bg-slate-500'}`} />
              <span className="h-px flex-1 bg-gradient-to-r from-transparent via-border to-transparent" />
            </div>

            {/* Marquee value */}
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <p className="text-[10px] tracking-[0.28em] uppercase text-muted-foreground/80 font-medium">Current Valuation</p>
                {(live?.GOLD || live?.SILVER) && (
                  <span className="flex items-center gap-1 text-[10px] tracking-widest uppercase text-emerald-600 dark:text-emerald-400 font-semibold">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.7)]" />
                    Live
                  </span>
                )}
              </div>
              <p className={`text-[3.6rem] sm:text-[4.6rem] font-bold leading-none tabular-nums tracking-tight ${
                accent === 'gold' ? 'text-amber-700 dark:text-amber-300' : 'text-slate-700 dark:text-slate-200'
              }`}>
                {currentVal ? formatINR(currentVal.toString()) : '—'}
              </p>
              {livePricePerUnit && (
                <p className="mt-2 text-sm text-muted-foreground tabular-nums">
                  <span className="font-semibold text-base text-foreground">{formatINR(livePricePerUnit.toString())}</span>
                  <span className="mx-1 text-muted-foreground/60">/</span>
                  <span>{unitLabel}</span>
                  {purityTag && <span className="ml-2 text-muted-foreground/70">· {purityTag}</span>}
                  {premiumPct != null && (
                    <span className={`ml-3 text-[11px] tracking-wider uppercase ${premiumPct >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                      {premiumPct >= 0 ? '+' : ''}{premiumPct.toFixed(2)}% vs avg cost
                    </span>
                  )}
                </p>
              )}
            </div>

            {/* P&L pill — refined */}
            {pnl && (
              <div className={`mt-6 inline-flex items-center gap-3 rounded-full pl-1 pr-5 py-1 self-start border
                ${isGain
                  ? 'bg-emerald-50/60 border-emerald-200/80 dark:bg-emerald-950/20 dark:border-emerald-800/60'
                  : 'bg-rose-50/60 border-rose-200/80 dark:bg-rose-950/20 dark:border-rose-800/60'
                }`}>
                <span className={`h-7 w-7 rounded-full flex items-center justify-center
                  ${isGain ? 'bg-emerald-100 dark:bg-emerald-900/50' : 'bg-rose-100 dark:bg-rose-900/50'}`}>
                  {isGain
                    ? <TrendingUp className="h-3.5 w-3.5 text-emerald-700 dark:text-emerald-300" />
                    : <TrendingDown className="h-3.5 w-3.5 text-rose-700 dark:text-rose-300" />}
                </span>
                <span className="text-[10px] tracking-[0.22em] uppercase text-muted-foreground font-medium">Unrealised</span>
                <span className={`text-lg font-semibold tabular-nums ${isGain ? 'text-emerald-700 dark:text-emerald-300' : 'text-rose-700 dark:text-rose-300'}`}>
                  {isGain ? '+' : ''}{formatINR(pnl.toString())}
                </span>
                {pnlPct != null && (
                  <span className={`text-xs font-medium tabular-nums ${isGain ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                    {pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(2)}%
                  </span>
                )}
              </div>
            )}

            {/* Cost vs Live bar */}
            {currentVal && (
              <div className="mt-8">
                <CostBar invested={invested} current={currentVal} accent={accent} />
              </div>
            )}
          </div>
        </div>

        {/* ────────────── LEDGER STRIP ────────────── */}
        <section className="rounded-2xl border bg-[hsl(var(--card))]/70 backdrop-blur-sm overflow-hidden mb-10">
          <header className="flex items-center justify-between px-6 py-3.5 border-b bg-gradient-to-r from-[hsl(var(--card))] to-transparent">
            <div className="flex items-center gap-2.5">
              <Coins className={`h-4 w-4 ${accent === 'gold' ? 'text-[hsl(var(--accent))]' : 'text-slate-500'}`} />
              <h3 className="text-[10px] tracking-[0.28em] uppercase font-semibold text-muted-foreground">The Ledger</h3>
            </div>
            <span className="text-[10px] tracking-[0.22em] uppercase text-muted-foreground/60">Live snapshot</span>
          </header>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 divide-y sm:divide-y-0 sm:divide-x divide-border/60">
            <Ledger
              label="Invested"
              value={formatINR(holding.totalCost)}
              hint={`across ${buyTxns.length} ${buyTxns.length === 1 ? 'lot' : 'lots'}`}
            />
            <Ledger
              label={isPhysical ? 'Weight' : 'Units'}
              value={`${new Decimal(holding.quantity).toFixed(isPhysical ? 3 : 2)}${isPhysical ? ' g' : ''}`}
              hint={isPhysical ? 'fine weight' : 'held quantity'}
            />
            <Ledger
              label="Avg Cost"
              value={formatINR(holding.avgCostPrice)}
              hint={`per ${unitLabel}`}
            />
            <Ledger
              label="Live Price"
              value={livePricePerUnit ? formatINR(livePricePerUnit.toString()) : '—'}
              hint={livePricePerUnit ? `per ${unitLabel}${purityTag ? ` · ${purityTag}` : ''}` : 'awaiting feed'}
              highlight={livePricePerUnit ? 'accent' : undefined}
            />
            <Ledger
              label="Held For"
              value={holdHuman ?? '—'}
              hint={firstTxnDate ? `since ${firstTxnDate}` : undefined}
            />
            {holding.xirr != null ? (
              <Ledger
                label="XIRR"
                value={`${holding.xirr >= 0 ? '+' : ''}${(holding.xirr * 100).toFixed(2)}%`}
                hint="annualised"
                highlight={holding.xirr >= 0 ? 'positive' : 'negative'}
              />
            ) : (
              <Ledger
                label="Activity"
                value={`${buyTxns.length} / ${sellTxns.length}`}
                hint={`${buyTxns.length === 1 ? 'buy' : 'buys'} · ${sellTxns.length === 1 ? 'sale' : 'sales'}`}
              />
            )}
          </div>
        </section>

        {/* ────────────── PROVENANCE ────────────── */}
        <section className="grid sm:grid-cols-3 gap-3 mb-12">
          <div className="rounded-xl border bg-[hsl(var(--card))]/60 p-5">
            <div className="flex items-center gap-2 text-[10px] tracking-[0.22em] uppercase text-muted-foreground/80">
              <Calendar className="h-3 w-3" /> First Acquired
            </div>
            <p className="mt-2 text-xl font-semibold tabular-nums">{firstTxnDate ?? '—'}</p>
          </div>
          <div className="rounded-xl border bg-[hsl(var(--card))]/60 p-5">
            <div className="flex items-center gap-2 text-[10px] tracking-[0.22em] uppercase text-muted-foreground/80">
              <Activity className="h-3 w-3" /> Last Activity
            </div>
            <p className="mt-2 text-xl font-semibold tabular-nums">{lastTxnDate ?? '—'}</p>
          </div>
          <div className="rounded-xl border bg-[hsl(var(--card))]/60 p-5">
            <div className="flex items-center gap-2 text-[10px] tracking-[0.22em] uppercase text-muted-foreground/80">
              <Scale className="h-3 w-3" /> Net Position
            </div>
            <p className="mt-2 text-xl font-semibold tabular-nums">
              {formatINR(totalBought.minus(totalSold).toString())}
            </p>
            <p className="text-[11px] text-muted-foreground/70 mt-0.5 tabular-nums">
              bought {formatINR(totalBought.toString())} · sold {formatINR(totalSold.toString())}
            </p>
          </div>
        </section>

        {/* ────────────── TRANSACTIONS ────────────── */}
        <section>
          <header className="flex items-baseline justify-between mb-5">
            <div>
              <p className="text-[10px] tracking-[0.28em] uppercase text-muted-foreground/80 font-medium">Provenance Log</p>
              <h2 className="text-2xl font-bold mt-1">Transactions</h2>
            </div>
            <p className="text-xs text-muted-foreground tabular-nums">
              {transactions.length} {transactions.length === 1 ? 'entry' : 'entries'}
            </p>
          </header>

          {txnLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground text-sm py-12 justify-center">
              Loading…
            </div>
          ) : transactions.length === 0 ? (
            <p className="text-sm text-muted-foreground py-12 text-center">No transactions found.</p>
          ) : (
            <ol className="relative">
              {/* timeline rail */}
              <span className="absolute left-[15px] sm:left-[19px] top-2 bottom-2 w-px bg-border/70" aria-hidden />
              {transactions.map((t) => {
                const amount = new Decimal(t.quantity).times(new Decimal(t.price));
                const isBuy = ['BUY', 'INTEREST_RECEIVED', 'MATURITY', 'OPENING_BALANCE'].includes(t.transactionType);
                const txnPhotos = (t.photos ?? []);
                return (
                  <li key={t.id} className="relative pl-10 sm:pl-12 py-3">
                    {/* timeline dot */}
                    <span className={`absolute left-2 sm:left-3 top-6 h-3 w-3 rounded-full ring-4 ring-background
                      ${isBuy ? 'bg-emerald-500' : 'bg-rose-500'}`} />

                    <div className="group rounded-xl border bg-[hsl(var(--card))]/60 hover:bg-[hsl(var(--card))] transition-colors px-4 sm:px-5 py-4 flex items-center gap-4">
                      {/* Thumb */}
                      {txnPhotos.length > 0 ? (
                        <TxnThumb txnId={t.id} photoId={txnPhotos[0]!.id} />
                      ) : (
                        <div className={`h-12 w-12 rounded-lg flex items-center justify-center shrink-0 text-xl
                          ${accent === 'gold'
                            ? 'bg-gradient-to-br from-amber-100 to-amber-50 dark:from-amber-900/40 dark:to-amber-950/30'
                            : 'bg-gradient-to-br from-slate-100 to-slate-50 dark:from-slate-800/40 dark:to-slate-900/30'}`}>
                          {accent === 'silver' ? '🥈' : '🪙'}
                        </div>
                      )}

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-semibold tracking-wider uppercase
                            ${isBuy
                              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                              : 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300'}`}>
                            {TXN_LABELS[t.transactionType] ?? t.transactionType}
                          </span>
                          <span className="text-xs text-muted-foreground tabular-nums">{t.tradeDate}</span>
                          {t.broker && (
                            <span className="text-[10px] tracking-wider uppercase text-muted-foreground/70 hidden sm:inline">
                              · {t.broker}
                            </span>
                          )}
                        </div>
                        <p className="text-sm mt-1 tabular-nums text-muted-foreground">
                          <span className="text-foreground font-medium">{new Decimal(t.quantity).toFixed(3)} {unitLabel}</span>
                          <span className="mx-1.5 opacity-50">@</span>
                          {formatINR(t.price)} / {unitLabel}
                        </p>
                        {t.narration && (
                          <p className="text-[11px] text-muted-foreground/70 truncate mt-0.5 italic">{t.narration}</p>
                        )}
                      </div>

                      {/* Amount + edit */}
                      <div className="text-right shrink-0 flex items-center gap-2">
                        <div>
                          <p className="text-lg font-semibold tabular-nums leading-tight">{formatINR(amount.toString())}</p>
                          {txnPhotos.length > 1 && (
                            <p className="text-[10px] tracking-wider uppercase text-muted-foreground/60 mt-0.5">{txnPhotos.length} photos</p>
                          )}
                        </div>
                        <Button
                          variant="ghost" size="sm"
                          className="h-8 w-8 p-0 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={() => { setEditTxn(t); setEditOpen(true); }}
                          aria-label="Edit transaction"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </section>
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
    <div className="h-12 w-12 rounded-lg border overflow-hidden bg-muted/30 shrink-0 ring-1 ring-black/5 dark:ring-white/5">
      {src
        ? <img src={src} alt="" className="h-full w-full object-cover" />
        : <div className="h-full w-full flex items-center justify-center"><ImageIcon className="h-4 w-4 text-muted-foreground" /></div>
      }
    </div>
  );
}
