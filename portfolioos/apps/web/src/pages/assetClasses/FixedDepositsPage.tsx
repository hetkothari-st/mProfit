import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useQueries, useQuery } from '@tanstack/react-query';
import { CalendarClock, ChevronDown, Clock, Pencil, PiggyBank, Plus } from 'lucide-react';
import { Decimal, formatINR } from '@portfolioos/shared';
import type { AssetClass, HoldingRow, TransactionDTO } from '@portfolioos/shared';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/common/EmptyState';
import { portfoliosApi } from '@/api/portfolios.api';
import { transactionsApi } from '@/api/transactions.api';
import { FDFormDialog } from './FDFormDialog';

type FDHolding = HoldingRow & { portfolioName: string; portfolioId: string };

const FREQ_LABELS: Record<string, string> = {
  MONTHLY: 'Monthly',
  QUARTERLY: 'Quarterly',
  HALF_YEARLY: 'Half-yearly',
  ANNUAL: 'Annual',
  AT_MATURITY: 'At maturity',
};

function daysUntil(iso: string): number {
  return Math.round((new Date(iso).getTime() - Date.now()) / 86_400_000);
}

function monthsBetween(from: string, to: string): number {
  const a = new Date(`${from}T00:00:00Z`);
  const b = new Date(`${to}T00:00:00Z`);
  return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
}

function normalizeText(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function MaturityBadge({ date }: { date: string }) {
  const d = daysUntil(date);
  if (d < 0) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide bg-muted text-muted-foreground">
        <Clock className="h-3 w-3" /> Matured
      </span>
    );
  }
  const cls =
    d <= 30
      ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
      : d <= 90
        ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
        : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400';
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${cls}`}>
      <Clock className="h-3 w-3" /> {d}d left
    </span>
  );
}

function WaxSeal({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 64 64" fill="none" aria-hidden>
      <defs>
        <radialGradient id="waxFill" cx="0.35" cy="0.32" r="0.75">
          <stop offset="0%" stopColor="hsl(var(--accent))" stopOpacity="0.95" />
          <stop offset="55%" stopColor="hsl(var(--accent))" stopOpacity="0.78" />
          <stop offset="100%" stopColor="hsl(var(--accent))" stopOpacity="0.55" />
        </radialGradient>
      </defs>
      {/* Scalloped outer ring (wax drip silhouette) */}
      <path
        d="M32 4 L37 8 L42 6 L44 12 L50 13 L50 19 L55 22 L52 28 L57 33 L52 37 L55 43 L50 45 L50 51 L44 52 L42 58 L37 56 L32 60 L27 56 L22 58 L20 52 L14 51 L14 45 L9 43 L12 37 L7 33 L12 28 L9 22 L14 19 L14 13 L20 12 L22 6 L27 8 Z"
        fill="url(#waxFill)"
        stroke="hsl(var(--accent))"
        strokeWidth="0.6"
        strokeOpacity="0.65"
      />
      {/* Inner ring */}
      <circle cx="32" cy="32" r="17" fill="none" stroke="hsl(var(--accent-foreground))" strokeOpacity="0.55" strokeWidth="0.8" strokeDasharray="2 2" />
      {/* Monogram star */}
      <path
        d="M32 19 L34 28 L43 28 L36 33 L39 42 L32 36.5 L25 42 L28 33 L21 28 L30 28 Z"
        fill="hsl(var(--accent-foreground))"
        fillOpacity="0.75"
      />
      {/* Highlight crescent */}
      <path
        d="M22 18 Q26 14 32 14"
        stroke="hsl(0 0% 100%)"
        strokeOpacity="0.35"
        strokeWidth="1.5"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}

function CornerOrnament({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M2 2 L10 2 M2 2 L2 10" stroke="currentColor" strokeWidth="0.8" strokeLinecap="round" />
      <path d="M5 2 L5 5 L2 5" stroke="currentColor" strokeWidth="0.6" strokeOpacity="0.6" />
      <circle cx="2" cy="2" r="0.8" fill="currentColor" />
    </svg>
  );
}

function DiamondMark({
  className = '',
  style,
}: {
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <span
      className={`inline-block rotate-45 bg-accent ${className}`}
      style={style}
      aria-hidden
    />
  );
}

function PnLDisplay({ holding }: { holding: FDHolding }) {
  if (!holding.currentValue) return <span className="text-muted-foreground">—</span>;
  const pnl = new Decimal(holding.currentValue).minus(holding.totalCost);
  const pct = new Decimal(holding.totalCost).isZero()
    ? null
    : pnl.div(holding.totalCost).times(100).toNumber();
  const pos = pnl.gte(0);
  return (
    <span className={pos ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}>
      {pos ? '+' : ''}{formatINR(pnl.toString())}
      {pct != null && (
        <span className="ml-1 text-xs opacity-80">
          ({pos ? '+' : ''}{pct.toFixed(2)}%)
        </span>
      )}
    </span>
  );
}

function FDCard({
  holding,
  primaryTxn,
  onClick,
}: {
  holding: FDHolding;
  primaryTxn: TransactionDTO | null;
  onClick: () => void;
}) {
  const rate = primaryTxn?.interestRate;
  const freq = primaryTxn?.interestFrequency;
  const maturity = primaryTxn?.maturityDate;
  const openDate = primaryTxn?.tradeDate;

  const tenureMonths = openDate && maturity ? monthsBetween(openDate, maturity) : null;
  const elapsedPct = openDate && maturity
    ? (() => {
        const start = new Date(`${openDate}T00:00:00Z`).getTime();
        const end = new Date(`${maturity}T00:00:00Z`).getTime();
        const now = Date.now();
        return Math.min(100, Math.max(0, ((now - start) / (end - start)) * 100));
      })()
    : null;

  const certNo = holding.id.slice(-6).toUpperCase();
  const isMatured = maturity ? daysUntil(maturity) < 0 : false;

  return (
    <div
      onClick={onClick}
      className="group relative paper rounded-lg border border-border hover:border-accent/40 shadow-elev hover:shadow-elev-lg transition-all cursor-pointer overflow-hidden"
    >
      {/* Top double-rule brass band */}
      <div className="h-[3px] w-full bg-gradient-to-r from-accent/40 via-accent/85 to-accent/40" />
      <div className="h-px w-full bg-accent/30" />

      {/* Subtle radial wash from seal */}
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_88%_22%,hsl(var(--accent)/0.10),transparent_55%)]" />

      {/* Corner filigree */}
      <CornerOrnament className="pointer-events-none absolute top-[10px] left-[10px] h-4 w-4 text-accent/45" />
      <CornerOrnament className="pointer-events-none absolute top-[10px] right-[10px] h-4 w-4 text-accent/45 -scale-x-100" />
      <CornerOrnament className="pointer-events-none absolute bottom-[10px] left-[10px] h-4 w-4 text-accent/45 -scale-y-100" />
      <CornerOrnament className="pointer-events-none absolute bottom-[10px] right-[10px] h-4 w-4 text-accent/45 -scale-100" />

      <div className="relative px-6 pt-5 pb-5">
        {/* Eyebrow rule */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-2 min-w-0">
            <DiamondMark className="h-1.5 w-1.5 shrink-0 opacity-80" />
            <span className="font-mono text-[10px] uppercase tracking-[0.28em] text-accent leading-none">
              Fixed Deposit
            </span>
            <span className="text-accent/30 select-none">·</span>
            <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground leading-none">
              Certificate № <span className="text-foreground/80">{certNo}</span>
            </span>
          </div>
          <Pencil className="h-3.5 w-3.5 shrink-0 text-muted-foreground/30 group-hover:text-muted-foreground transition-colors" />
        </div>

        {/* Headline + rate */}
        <div className="mt-3 flex items-end justify-between gap-4">
          <div className="min-w-0">
            <h3 className="font-display text-[26px] leading-[1.1] text-foreground truncate">
              {holding.assetName ?? '—'}
            </h3>
            <p className="mt-1 text-xs text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-0.5">
              {tenureMonths ? <span>{tenureMonths}-month deposit</span> : <span>Term deposit</span>}
              {freq && (
                <>
                  <span className="text-muted-foreground/40">·</span>
                  <span>{FREQ_LABELS[freq] ?? freq} payout</span>
                </>
              )}
              {holding.portfolioName && (
                <>
                  <span className="text-muted-foreground/40">·</span>
                  <span>{holding.portfolioName}</span>
                </>
              )}
            </p>
          </div>
          {rate != null && (
            <div className="shrink-0 text-right">
              <p className="font-display text-3xl text-accent leading-none tabular-nums">
                {rate}
                <span className="text-xl align-top">%</span>
              </p>
              <p className="mt-0.5 font-mono text-[9px] uppercase tracking-[0.28em] text-muted-foreground">
                per annum
              </p>
            </div>
          )}
        </div>

        {/* Body: seal + timeline */}
        <div className="mt-5 grid grid-cols-[1fr_auto] gap-5 items-center">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.22em] text-muted-foreground">
              <span>{isMatured ? 'Matured' : 'Principal locked'}</span>
              {maturity && <MaturityBadge date={maturity} />}
            </div>
            {elapsedPct !== null && openDate && maturity && (
              <div className="mt-2.5">
                <div className="relative h-[6px] rounded-sm bg-muted/70 overflow-visible">
                  {/* Brass fill */}
                  <div
                    className="absolute inset-y-0 left-0 rounded-sm bg-gradient-to-r from-accent/70 via-accent to-accent/80 shadow-[0_0_0_0.5px_hsl(var(--accent)/0.4)]"
                    style={{ width: `${elapsedPct}%` }}
                  />
                  {/* Marker diamond */}
                  <DiamondMark
                    className="absolute top-1/2 -translate-y-1/2 h-2.5 w-2.5 ring-2 ring-card"
                    style={{ left: `calc(${elapsedPct}% - 5px)` }}
                  />
                </div>
                <div className="mt-1.5 flex items-center justify-between font-mono text-[10px] tabular-nums text-muted-foreground">
                  <span>{openDate}</span>
                  <span className="text-foreground/70">
                    {Math.round(elapsedPct)}% of term
                  </span>
                  <span>{maturity}</span>
                </div>
              </div>
            )}
            {!elapsedPct && maturity && (
              <p className="mt-2 text-xs text-muted-foreground">Matures {maturity}</p>
            )}
            {holding.isin && (
              <p className="mt-2 font-mono text-[10px] text-muted-foreground/70 tracking-wide">
                {holding.isin}
              </p>
            )}
          </div>
          <WaxSeal className="h-16 w-16 shrink-0 drop-shadow-[0_2px_4px_hsl(var(--accent)/0.35)]" />
        </div>

        {/* Decorative rule */}
        <div className="mt-5 rule-ornament"><span /></div>

        {/* Stat trio */}
        <div className="mt-5 grid grid-cols-3 gap-4">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground mb-1">
              Principal
            </p>
            <p className="numeric-display text-base text-foreground">
              {formatINR(holding.totalCost)}
            </p>
          </div>
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground mb-1">
              Current Value
            </p>
            <p className="numeric-display text-base text-foreground">
              {holding.currentValue ? formatINR(holding.currentValue) : '—'}
            </p>
          </div>
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground mb-1">
              Earned
            </p>
            <p className="numeric-display text-base">
              <PnLDisplay holding={holding} />
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function RDCard({
  holding,
  primaryTxn,
  allDepositTxns,
  onClick,
}: {
  holding: FDHolding;
  primaryTxn: TransactionDTO | null;
  allDepositTxns: TransactionDTO[];
  onClick: () => void;
}) {
  const rate = primaryTxn?.interestRate;
  const freq = primaryTxn?.interestFrequency;
  const maturity = primaryTxn?.maturityDate;
  const openDate = primaryTxn?.tradeDate;
  const monthlyAmt = primaryTxn ? formatINR(primaryTxn.price) : null;

  const tenureMonths = openDate && maturity ? monthsBetween(openDate, maturity) : null;
  const installmentsDone = allDepositTxns.length;
  const totalStamps = tenureMonths && tenureMonths > 0 ? tenureMonths : Math.max(installmentsDone, 1);
  const stamps = Array.from({ length: totalStamps }, (_, i) => i < installmentsDone);
  const progressPct = tenureMonths && tenureMonths > 0
    ? Math.min(100, (installmentsDone / tenureMonths) * 100)
    : null;

  return (
    <div
      onClick={onClick}
      className="group relative rounded-lg border border-border bg-card hover:border-accent/40 shadow-elev hover:shadow-elev-lg transition-all cursor-pointer overflow-hidden"
    >
      {/* Ruled passbook lines */}
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.06] dark:opacity-[0.08]"
        style={{
          backgroundImage:
            'repeating-linear-gradient(to bottom, transparent 0, transparent 31px, hsl(var(--accent)) 31px, hsl(var(--accent)) 32px)',
        }}
      />
      {/* Red top fold line */}
      <div className="absolute inset-x-0 top-0 h-px bg-[hsl(var(--destructive)/0.45)]" />
      <div className="absolute inset-x-0 top-[3px] h-px bg-[hsl(var(--destructive)/0.25)]" />

      {/* Book binding (left spine) */}
      <div className="absolute inset-y-0 left-0 w-[10px] bg-gradient-to-r from-accent/20 via-accent/10 to-transparent" />
      <div className="absolute inset-y-0 left-[10px] w-px bg-accent/30" />
      {/* Stitch holes */}
      <div className="absolute inset-y-0 left-[3px] flex flex-col justify-evenly py-4 pointer-events-none">
        {[0, 1, 2, 3, 4].map((i) => (
          <span
            key={i}
            className="h-[5px] w-[5px] rounded-full bg-accent/60 ring-2 ring-card shadow-[inset_0_0_0_0.5px_hsl(var(--accent)/0.6)]"
          />
        ))}
      </div>

      <div className="relative pl-7 pr-6 py-5">
        {/* Eyebrow */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-2 min-w-0">
            <DiamondMark className="h-1.5 w-1.5 shrink-0 opacity-80" />
            <span className="font-mono text-[10px] uppercase tracking-[0.28em] text-accent leading-none">
              Recurring Deposit
            </span>
            <span className="text-accent/30 select-none">·</span>
            <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground leading-none">
              Passbook
            </span>
          </div>
          <Pencil className="h-3.5 w-3.5 shrink-0 text-muted-foreground/30 group-hover:text-muted-foreground transition-colors" />
        </div>

        {/* Headline + rate */}
        <div className="mt-3 flex items-end justify-between gap-4">
          <div className="min-w-0">
            <h3 className="font-display text-[26px] leading-[1.1] text-foreground truncate">
              {holding.assetName ?? '—'}
            </h3>
            <p className="mt-1 text-xs text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-0.5">
              {monthlyAmt && <span className="text-foreground/85 font-medium">{monthlyAmt} / month</span>}
              {tenureMonths && (
                <>
                  <span className="text-muted-foreground/40">·</span>
                  <span>{tenureMonths}-month tenure</span>
                </>
              )}
              {freq && (
                <>
                  <span className="text-muted-foreground/40">·</span>
                  <span>{FREQ_LABELS[freq] ?? freq} compounding</span>
                </>
              )}
              {holding.portfolioName && (
                <>
                  <span className="text-muted-foreground/40">·</span>
                  <span>{holding.portfolioName}</span>
                </>
              )}
            </p>
          </div>
          {rate != null && (
            <div className="shrink-0 text-right">
              <p className="font-display text-3xl text-accent leading-none tabular-nums">
                {rate}
                <span className="text-xl align-top">%</span>
              </p>
              <p className="mt-0.5 font-mono text-[9px] uppercase tracking-[0.28em] text-muted-foreground">
                per annum
              </p>
            </div>
          )}
        </div>

        {/* Stamp grid — passbook installment marks */}
        <div className="mt-5">
          <div className="flex items-center justify-between mb-2">
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
              Installments stamped
            </p>
            <p className="font-mono text-[10px] tabular-nums text-foreground/80">
              <span className="text-accent font-semibold">{installmentsDone}</span>
              <span className="text-muted-foreground/60"> / {tenureMonths ?? '—'}</span>
              {progressPct !== null && (
                <span className="ml-2 text-muted-foreground">({Math.round(progressPct)}%)</span>
              )}
            </p>
          </div>
          <div className="flex flex-wrap gap-[3px]">
            {stamps.map((paid, i) => (
              <span
                key={i}
                title={`Month ${i + 1}${paid ? ' — paid' : ' — pending'}`}
                className={
                  paid
                    ? 'h-[14px] w-[14px] rounded-[2px] bg-accent/85 ring-1 ring-inset ring-accent/50 shadow-[inset_0_-1px_0_hsl(var(--accent)/0.6),inset_0_0_0_2px_hsl(var(--card))]'
                    : 'h-[14px] w-[14px] rounded-[2px] border border-dashed border-border bg-muted/30'
                }
              />
            ))}
          </div>
        </div>

        {/* Maturity meta */}
        {maturity && (
          <div className="mt-4 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
            <span>Matures {maturity}</span>
            <MaturityBadge date={maturity} />
            {openDate && (
              <>
                <span className="text-muted-foreground/30">·</span>
                <span>Opened {openDate}</span>
              </>
            )}
          </div>
        )}

        {holding.isin && (
          <p className="mt-1 font-mono text-[10px] text-muted-foreground/70 tracking-wide">
            {holding.isin}
          </p>
        )}

        {/* Decorative rule */}
        <div className="mt-5 rule-ornament"><span /></div>

        {/* Stat trio */}
        <div className="mt-5 grid grid-cols-3 gap-4">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground mb-1">
              Deposited
            </p>
            <p className="numeric-display text-base text-foreground">
              {formatINR(holding.totalCost)}
            </p>
          </div>
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground mb-1">
              Current Value
            </p>
            <p className="numeric-display text-base text-foreground">
              {holding.currentValue ? formatINR(holding.currentValue) : '—'}
            </p>
          </div>
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground mb-1">
              Earned
            </p>
            <p className="numeric-display text-base">
              <PnLDisplay holding={holding} />
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export function FixedDepositsPage() {
  const [formOpen, setFormOpen] = useState(false);
  const [editTxn, setEditTxn] = useState<TransactionDTO | null>(null);
  const [activeFormAssetClass, setActiveFormAssetClass] = useState<AssetClass>('FIXED_DEPOSIT');
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const addMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!addMenuOpen) return;
    function handler(e: MouseEvent) {
      if (addMenuRef.current && !addMenuRef.current.contains(e.target as Node)) {
        setAddMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [addMenuOpen]);

  const { data: portfolios } = useQuery({
    queryKey: ['portfolios'],
    queryFn: portfoliosApi.list,
  });

  const holdingsQueries = useQueries({
    queries: (portfolios ?? []).map((p) => ({
      queryKey: ['portfolio-holdings', p.id],
      queryFn: () => portfoliosApi.holdings(p.id),
    })),
  });

  const txnQueries = useQueries({
    queries: (['FIXED_DEPOSIT', 'RECURRING_DEPOSIT'] as const).map((ac) => ({
      queryKey: ['transactions', ac],
      queryFn: () => transactionsApi.list({ assetClass: ac, pageSize: 500 }),
    })),
  });

  const isLoading =
    !portfolios ||
    holdingsQueries.some((q) => q.isLoading) ||
    txnQueries.some((q) => q.isLoading);

  // Flatten holdings
  const allHoldings: FDHolding[] = [];
  (portfolios ?? []).forEach((p, i) => {
    const rows: HoldingRow[] = holdingsQueries[i]?.data ?? [];
    rows
      .filter((h) => h.assetClass === 'FIXED_DEPOSIT' || h.assetClass === 'RECURRING_DEPOSIT')
      .forEach((h) => allHoldings.push({ ...h, portfolioName: p.name, portfolioId: p.id }));
  });

  const fdHoldings = allHoldings.filter((h) => h.assetClass === 'FIXED_DEPOSIT');
  const rdHoldings = allHoldings.filter((h) => h.assetClass === 'RECURRING_DEPOSIT');

  const allTxns: TransactionDTO[] = txnQueries.flatMap((q) => q.data?.items ?? []);

  // All transactions for this holding (any type) — used for primary/edit
  function txnsFor(h: FDHolding): TransactionDTO[] {
    const base = allTxns.filter(
      (t) => t.portfolioId === h.portfolioId && t.assetClass === h.assetClass,
    );
    const holdingIsin = normalizeText(h.isin);
    const holdingName = normalizeText(h.assetName);

    const isinMatched = holdingIsin
      ? base.filter((t) => normalizeText(t.isin) === holdingIsin)
      : [];
    if (isinMatched.length > 0) {
      return isinMatched.sort((a, b) => a.tradeDate.localeCompare(b.tradeDate));
    }

    const nameMatched = holdingName
      ? base.filter((t) => normalizeText(t.assetName) === holdingName)
      : [];
    if (nameMatched.length > 0) {
      return nameMatched.sort((a, b) => a.tradeDate.localeCompare(b.tradeDate));
    }

    // If there is exactly one candidate for this portfolio + asset class,
    // treat it as the backing entry for click-through/edit.
    if (base.length === 1) {
      return [...base].sort((a, b) => a.tradeDate.localeCompare(b.tradeDate));
    }

    return [];
  }

  // DEPOSIT-type only — used for RD installment count
  function depositTxnsFor(h: FDHolding): TransactionDTO[] {
    return txnsFor(h).filter((t) => t.transactionType === 'DEPOSIT');
  }

  function primaryTxnFor(h: FDHolding): TransactionDTO | null {
    const all = txnsFor(h);
    return all.find((t) => t.transactionType === 'DEPOSIT') ?? all[0] ?? null;
  }

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

  function openAdd(ac: AssetClass) {
    setActiveFormAssetClass(ac);
    setEditTxn(null);
    setFormOpen(true);
    setAddMenuOpen(false);
  }

  function openEdit(txn: TransactionDTO) {
    setActiveFormAssetClass(txn.assetClass as AssetClass);
    setEditTxn(txn);
    setFormOpen(true);
  }

  return (
    <div>
      <PageHeader
        title="Fixed & Recurring Deposits"
        description="Track FDs and RDs across banks — one-time deposits or monthly installments."
        actions={
          <div className="relative" ref={addMenuRef}>
            <Button onClick={() => setAddMenuOpen((v) => !v)}>
              <Plus className="h-4 w-4" /> Add{' '}
              <ChevronDown className="h-3.5 w-3.5 ml-1 opacity-70" />
            </Button>
            {addMenuOpen && (
              <div className="absolute right-0 top-full mt-1 w-48 rounded-md border bg-popover text-popover-foreground shadow-md z-20 py-1">
                {[
                  { ac: 'FIXED_DEPOSIT' as AssetClass, label: 'Fixed Deposit' },
                  { ac: 'RECURRING_DEPOSIT' as AssetClass, label: 'Recurring Deposit' },
                ].map(({ ac, label }) => (
                  <button
                    key={ac}
                    type="button"
                    className="w-full text-left px-3 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground transition-colors"
                    onClick={() => openAdd(ac)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>
        }
      />

      {/* Summary strip */}
      {!isLoading && allHoldings.length > 0 && (
        <div className="grid grid-cols-3 gap-3 mb-6">
          {[
            { label: 'Total Invested', value: formatINR(totalInvested.toString()), className: '' },
            { label: 'Current Value', value: formatINR(totalValue.toString()), className: '' },
            {
              label: 'Total Earnings',
              value: `${totalPnL.gte(0) ? '+' : ''}${formatINR(totalPnL.toString())}${pnlPct != null ? ` (${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(1)}%)` : ''}`,
              className: totalPnL.gte(0) ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600',
            },
          ].map((m) => (
            <Card key={m.label} className="border-t-2 border-t-accent/70 dark:border-t-accent/60">
              <CardContent className="px-4 py-3">
                <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground font-medium">
                  {m.label}
                </p>
                <p className={`text-xl font-semibold tabular-nums mt-1 ${m.className}`}>
                  {m.value}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-32 rounded-xl border bg-muted/40 animate-pulse" />
          ))}
        </div>
      )}

      {!isLoading && allHoldings.length === 0 && (
        <EmptyState
          icon={PiggyBank}
          title="No deposits yet"
          description="Add a Fixed or Recurring Deposit to start tracking."
          action={
            <Button onClick={() => openAdd('FIXED_DEPOSIT')}>
              <Plus className="h-4 w-4" /> Add first deposit
            </Button>
          }
        />
      )}

      {/* Fixed Deposits */}
      {!isLoading && fdHoldings.length > 0 && (
        <section className="mb-8">
          <div className="flex items-center gap-2.5 mb-3 px-0.5">
            <span className="inline-flex items-center justify-center h-6 w-6 rounded bg-accent/10 dark:bg-accent/15 ring-1 ring-accent/25 dark:ring-accent/35 text-accent">
              <PiggyBank className="h-3.5 w-3.5" strokeWidth={1.8} />
            </span>
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-accent">
              Fixed Deposits
            </h3>
            <span className="text-xs text-muted-foreground">({fdHoldings.length})</span>
          </div>
          <div className="space-y-3">
            {fdHoldings.map((h) => {
              const primary = primaryTxnFor(h);
              return (
                <FDCard
                  key={h.id}
                  holding={h}
                  primaryTxn={primary}
                  onClick={() => {
                    if (primary) openEdit(primary);
                  }}
                />
              );
            })}
          </div>
        </section>
      )}

      {/* Recurring Deposits */}
      {!isLoading && rdHoldings.length > 0 && (
        <section className="mb-8">
          <div className="flex items-center gap-2.5 mb-3 px-0.5">
            <span className="inline-flex items-center justify-center h-6 w-6 rounded bg-accent/10 dark:bg-accent/15 ring-1 ring-accent/25 dark:ring-accent/35 text-accent">
              <CalendarClock className="h-3.5 w-3.5" strokeWidth={1.8} />
            </span>
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-accent">
              Recurring Deposits
            </h3>
            <span className="text-xs text-muted-foreground">({rdHoldings.length})</span>
          </div>
          <div className="space-y-3">
            {rdHoldings.map((h) => {
              const primary = primaryTxnFor(h);
              const depositOnly = depositTxnsFor(h);
              return (
                <RDCard
                  key={h.id}
                  holding={h}
                  primaryTxn={primary}
                  allDepositTxns={depositOnly}
                  onClick={() => {
                    if (primary) openEdit(primary);
                  }}
                />
              );
            })}
          </div>
        </section>
      )}

      <FDFormDialog
        open={formOpen}
        onOpenChange={(o) => {
          setFormOpen(o);
          if (!o) setEditTxn(null);
        }}
        initial={editTxn}
        defaultPortfolioId={portfolios?.[0]?.id}
        defaultAssetClass={activeFormAssetClass}
      />
    </div>
  );
}
