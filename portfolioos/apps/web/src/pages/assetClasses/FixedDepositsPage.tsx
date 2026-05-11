import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueries, useQuery } from '@tanstack/react-query';
import { CalendarClock, ChevronDown, Clock, Lock, Pencil, PiggyBank, Plus } from 'lucide-react';
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

function freqCompoundN(freq: string | null | undefined): number {
  switch (freq) {
    case 'MONTHLY': return 12;
    case 'QUARTERLY': return 4;
    case 'HALF_YEARLY': return 2;
    case 'ANNUAL': return 1;
    default: return 0; // AT_MATURITY or unknown → simple interest
  }
}

function fdMaturityValue(
  principal: string,
  ratePct: string | null | undefined,
  months: number | null,
  freq: string | null | undefined,
): Decimal | null {
  if (!ratePct || !months || months <= 0) return null;
  try {
    const p = new Decimal(principal);
    const r = new Decimal(ratePct).div(100);
    const years = new Decimal(months).div(12);
    const n = freqCompoundN(freq);
    if (n === 0) {
      return p.times(new Decimal(1).plus(r.times(years)));
    }
    const base = new Decimal(1).plus(r.div(n));
    const exp = n * months / 12;
    return p.times(base.pow(exp));
  } catch {
    return null;
  }
}

function rdMaturityValue(
  monthly: string | null | undefined,
  ratePct: string | null | undefined,
  months: number | null,
): Decimal | null {
  if (!monthly || !ratePct || !months || months <= 0) return null;
  try {
    const m = new Decimal(monthly);
    const r = new Decimal(ratePct).div(100);
    const i = r.div(12);
    if (i.isZero()) return m.times(months);
    const factor = new Decimal(1).plus(i).pow(months).minus(1).div(i);
    return m.times(factor).times(new Decimal(1).plus(i));
  } catch {
    return null;
  }
}

function formatShortDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
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

function VaultGlyph({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="4" width="18" height="16" rx="1.5" />
      <circle cx="12" cy="12" r="4.5" />
      <circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none" />
      <path d="M12 7.5v1.2M12 15.3v1.2M7.5 12h1.2M15.3 12h1.2" />
      <path d="M6 4v-1M18 4v-1M6 21v-1M18 21v-1" />
    </svg>
  );
}

function VaultDial({
  rate,
  elapsedPct,
  className = '',
}: {
  rate: number | string | null | undefined;
  elapsedPct: number;
  className?: string;
}) {
  const r = 46;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, elapsedPct));
  const dash = (pct / 100) * c;
  return (
    <div className={`relative shrink-0 ${className}`}>
      <svg viewBox="0 0 120 120" className="absolute inset-0">
        <defs>
          <radialGradient id="dialFace" cx="0.5" cy="0.5" r="0.55">
            <stop offset="0%" stopColor="rgba(252,211,77,0.18)" />
            <stop offset="100%" stopColor="rgba(0,0,0,0.0)" />
          </radialGradient>
        </defs>
        <circle cx="60" cy="60" r="56" fill="url(#dialFace)" stroke="rgba(252,211,77,0.35)" strokeWidth="1" />
        <circle cx="60" cy="60" r={r} fill="none" stroke="rgba(255,255,255,0.10)" strokeWidth="6" />
        <circle
          cx="60" cy="60" r={r}
          fill="none"
          stroke="rgba(252,211,77,0.85)"
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${c - dash}`}
          transform="rotate(-90 60 60)"
        />
        {Array.from({ length: 12 }).map((_, i) => {
          const a = (i * 30 - 90) * (Math.PI / 180);
          const x1 = 60 + Math.cos(a) * 52;
          const y1 = 60 + Math.sin(a) * 52;
          const x2 = 60 + Math.cos(a) * (i % 3 === 0 ? 47 : 49);
          const y2 = 60 + Math.sin(a) * (i % 3 === 0 ? 47 : 49);
          return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="rgba(252,211,77,0.45)" strokeWidth={i % 3 === 0 ? 1.6 : 0.8} />;
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        {rate != null && rate !== '' ? (
          <>
            <p className="font-display text-3xl text-amber-300 leading-none tabular-nums drop-shadow-[0_2px_4px_rgba(0,0,0,0.55)]">
              {String(rate)}
              <span className="text-base align-top">%</span>
            </p>
            <p className="mt-1 font-mono text-[8px] uppercase tracking-[0.28em] text-amber-200/70">
              p.a.
            </p>
          </>
        ) : (
          <p className="font-mono text-[9px] uppercase tracking-[0.22em] text-amber-200/60">No rate</p>
        )}
        <p className="mt-1.5 font-mono text-[8px] tabular-nums text-white/45">
          {Math.round(pct)}% elapsed
        </p>
      </div>
    </div>
  );
}

function FDCard({
  holding,
  primaryTxn,
  onClick,
  onEdit,
}: {
  holding: FDHolding;
  primaryTxn: TransactionDTO | null;
  onClick: () => void;
  onEdit: (e: React.MouseEvent) => void;
}) {
  const rate = primaryTxn?.interestRate ?? null;
  const freq = primaryTxn?.interestFrequency ?? null;
  const maturity = primaryTxn?.maturityDate ?? null;
  const openDate = primaryTxn?.tradeDate ?? null;

  const tenureMonths = openDate && maturity ? monthsBetween(openDate, maturity) : null;
  const elapsedPct = openDate && maturity
    ? (() => {
        const start = new Date(`${openDate}T00:00:00Z`).getTime();
        const end = new Date(`${maturity}T00:00:00Z`).getTime();
        const now = Date.now();
        return Math.min(100, Math.max(0, ((now - start) / (end - start)) * 100));
      })()
    : 0;

  const certNo = holding.id.slice(-6).toUpperCase();
  const matValue = fdMaturityValue(holding.totalCost, rate, tenureMonths, freq);

  const daysLeft = maturity ? daysUntil(maturity) : null;

  return (
    <div
      onClick={onClick}
      className="group relative rounded-xl cursor-pointer
        bg-white dark:bg-slate-900
        border border-slate-200 dark:border-slate-800
        hover:border-slate-300 dark:hover:border-slate-700
        shadow-sm hover:shadow-md
        transition-all duration-200"
    >
      <div className="px-5 py-4">
        {/* Header */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0 text-slate-500 dark:text-slate-400">
            <Lock className="h-3 w-3 shrink-0" strokeWidth={2.2} />
            <span className="text-[11px] font-medium uppercase tracking-wider">Fixed Deposit</span>
            <span className="text-slate-300 dark:text-slate-600">·</span>
            <span className="text-[11px] font-mono tabular-nums">№{certNo}</span>
          </div>
          <button
            type="button"
            onClick={onEdit}
            aria-label="Edit deposit"
            className="p-1 -m-1 rounded text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Headline + rate */}
        <div className="mt-2 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h3 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-100 truncate">
              {holding.assetName ?? '—'}
            </h3>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
              <span>{tenureMonths ? `${tenureMonths}-month` : 'Term'} deposit</span>
              {freq && (
                <>
                  <span className="text-slate-300 dark:text-slate-600">·</span>
                  <span>{FREQ_LABELS[freq] ?? freq} payout</span>
                </>
              )}
              {holding.portfolioName && (
                <>
                  <span className="text-slate-300 dark:text-slate-600">·</span>
                  <span>{holding.portfolioName}</span>
                </>
              )}
            </p>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-2xl font-semibold tabular-nums leading-none text-indigo-600 dark:text-indigo-400">
              {rate ?? '—'}
              <span className="text-base font-medium opacity-80 ml-0.5">%</span>
            </p>
            <p className="mt-1 text-[10px] uppercase tracking-wider text-slate-400 dark:text-slate-500">
              per annum
            </p>
          </div>
        </div>

        {/* Timeline */}
        <div className="mt-4">
          <div className="relative h-1 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-indigo-500 dark:bg-indigo-400 transition-all"
              style={{ width: `${elapsedPct}%` }}
            />
          </div>
          <div className="mt-1.5 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
            <span>{formatShortDate(openDate)}</span>
            <span className="text-slate-600 dark:text-slate-300">
              {tenureMonths
                ? `${Math.round(elapsedPct)}%${
                    daysLeft !== null
                      ? ` · ${daysLeft < 0 ? 'matured' : `${daysLeft}d left`}`
                      : ''
                  }`
                : '—'}
            </span>
            <span>{formatShortDate(maturity)}</span>
          </div>
        </div>

        {/* Stats */}
        <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800 grid grid-cols-4 gap-4">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1">
              Principal
            </p>
            <p className="text-sm font-semibold tabular-nums text-slate-900 dark:text-slate-100">
              {formatINR(holding.totalCost)}
            </p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1">
              Current Value
            </p>
            <p className="text-sm font-semibold tabular-nums text-slate-900 dark:text-slate-100">
              {holding.currentValue ? formatINR(holding.currentValue) : '—'}
            </p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1">
              Maturity Value
            </p>
            <p className="text-sm font-semibold tabular-nums text-indigo-600 dark:text-indigo-400">
              {matValue ? formatINR(matValue.toString()) : '—'}
            </p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1">
              Earned
            </p>
            <p className="text-sm font-semibold tabular-nums">
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
  onEdit,
}: {
  holding: FDHolding;
  primaryTxn: TransactionDTO | null;
  allDepositTxns: TransactionDTO[];
  onClick: () => void;
  onEdit: (e: React.MouseEvent) => void;
}) {
  const rate = primaryTxn?.interestRate ?? null;
  const freq = primaryTxn?.interestFrequency ?? null;
  const maturity = primaryTxn?.maturityDate ?? null;
  const openDate = primaryTxn?.tradeDate ?? null;
  const monthlyRaw = primaryTxn?.price ?? null;
  const monthlyAmt = monthlyRaw ? formatINR(monthlyRaw) : '—';

  const tenureMonths = openDate && maturity ? monthsBetween(openDate, maturity) : null;
  const installmentsDone = allDepositTxns.length;
  const totalStamps = tenureMonths && tenureMonths > 0 ? tenureMonths : Math.max(installmentsDone, 12);
  const stamps = Array.from({ length: totalStamps }, (_, i) => i < installmentsDone);
  const progressPct = tenureMonths && tenureMonths > 0
    ? Math.min(100, (installmentsDone / tenureMonths) * 100)
    : 0;

  const matValue = rdMaturityValue(monthlyRaw, rate, tenureMonths);
  const certNo = holding.id.slice(-6).toUpperCase();

  return (
    <div
      onClick={onClick}
      className="group relative rounded-lg border border-border bg-card hover:border-accent/50 shadow-elev hover:shadow-elev-lg transition-all cursor-pointer overflow-hidden"
    >
      {/* Ruled passbook lines */}
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.07] dark:opacity-[0.10]"
        style={{
          backgroundImage:
            'repeating-linear-gradient(to bottom, transparent 0, transparent 25px, hsl(var(--accent)) 25px, hsl(var(--accent)) 26px)',
        }}
      />
      {/* Red top fold lines */}
      <div className="absolute inset-x-0 top-0 h-px bg-[hsl(var(--destructive)/0.5)]" />
      <div className="absolute inset-x-0 top-[3px] h-px bg-[hsl(var(--destructive)/0.3)]" />

      {/* Book binding (left spine) */}
      <div className="absolute inset-y-0 left-0 w-[10px] bg-gradient-to-r from-accent/25 via-accent/12 to-transparent" />
      <div className="absolute inset-y-0 left-[10px] w-px bg-accent/40" />
      <div className="absolute inset-y-0 left-[3px] flex flex-col justify-evenly py-3 pointer-events-none">
        {[0, 1, 2, 3, 4].map((i) => (
          <span
            key={i}
            className="h-[5px] w-[5px] rounded-full bg-accent/70 ring-2 ring-card"
          />
        ))}
      </div>

      <div className="relative pl-7 pr-5 pt-3.5 pb-4">
        {/* Eyebrow */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <DiamondMark className="h-1.5 w-1.5 shrink-0" />
            <span className="font-mono text-[10px] uppercase tracking-[0.28em] text-accent leading-none">
              Recurring Deposit
            </span>
            <span className="text-accent/30 select-none">·</span>
            <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground leading-none">
              Passbook № <span className="text-foreground/80">{certNo}</span>
            </span>
          </div>
          <button
            type="button"
            onClick={onEdit}
            aria-label="Edit deposit"
            className="shrink-0 p-1 -m-1 rounded text-muted-foreground/40 hover:text-foreground hover:bg-muted/60 transition-colors"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Headline + rate chip */}
        <div className="mt-2 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="font-display text-[22px] leading-[1.15] text-foreground truncate">
              {holding.assetName ?? '—'}
            </h3>
            <p className="mt-0.5 text-[11px] text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <span className="text-foreground/85 font-medium">{monthlyAmt} / month</span>
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
          <div className="shrink-0 rounded-md border border-accent/40 bg-accent/10 px-2.5 py-1 text-right">
            <p className="font-display text-xl text-accent leading-none tabular-nums">
              {rate ?? '—'}
              <span className="text-sm align-top">%</span>
            </p>
            <p className="mt-0.5 font-mono text-[8px] uppercase tracking-[0.22em] text-accent/80">
              per annum
            </p>
          </div>
        </div>

        {/* Stamp grid */}
        <div className="mt-3">
          <div className="flex items-center justify-between mb-1.5">
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              Installments stamped
            </p>
            <p className="font-mono text-[10px] tabular-nums text-foreground/80">
              <span className="text-accent font-semibold">{installmentsDone}</span>
              <span className="text-muted-foreground/60"> / {tenureMonths ?? '—'}</span>
              <span className="ml-1.5 text-muted-foreground">({Math.round(progressPct)}%)</span>
            </p>
          </div>
          <div className="flex flex-wrap gap-[3px]">
            {stamps.map((paid, i) => (
              <span
                key={i}
                title={`Month ${i + 1}${paid ? ' — paid' : ' — pending'}`}
                className={
                  paid
                    ? 'h-[12px] w-[12px] rounded-[2px] bg-accent ring-1 ring-inset ring-accent/60 shadow-[inset_0_0_0_2px_hsl(var(--card))]'
                    : 'h-[12px] w-[12px] rounded-[2px] border border-dashed border-border bg-muted/30'
                }
              />
            ))}
          </div>
        </div>

        {/* Maturity meta */}
        <div className="mt-3 flex items-center justify-between flex-wrap gap-2 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          <span>Opened {formatShortDate(openDate)}</span>
          <span>Matures {formatShortDate(maturity)}</span>
          {maturity && <MaturityBadge date={maturity} />}
        </div>

        {/* Decorative rule */}
        <div className="mt-3.5 rule-ornament"><span /></div>

        {/* Stat row: 4 cols */}
        <div className="mt-3.5 grid grid-cols-4 gap-3">
          <div>
            <p className="font-mono text-[9px] uppercase tracking-[0.22em] text-muted-foreground mb-0.5">
              Deposited
            </p>
            <p className="numeric-display text-[15px] text-foreground">
              {formatINR(holding.totalCost)}
            </p>
          </div>
          <div>
            <p className="font-mono text-[9px] uppercase tracking-[0.22em] text-muted-foreground mb-0.5">
              Current Value
            </p>
            <p className="numeric-display text-[15px] text-foreground">
              {holding.currentValue ? formatINR(holding.currentValue) : '—'}
            </p>
          </div>
          <div>
            <p className="font-mono text-[9px] uppercase tracking-[0.22em] text-accent/80 mb-0.5">
              Maturity Value
            </p>
            <p className="numeric-display text-[15px] text-accent">
              {matValue ? formatINR(matValue.toString()) : '—'}
            </p>
          </div>
          <div>
            <p className="font-mono text-[9px] uppercase tracking-[0.22em] text-muted-foreground mb-0.5">
              Earned
            </p>
            <p className="numeric-display text-[15px]">
              <PnLDisplay holding={holding} />
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export function FixedDepositsPage() {
  const navigate = useNavigate();
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
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
            {fdHoldings.map((h) => {
              const primary = primaryTxnFor(h);
              return (
                <FDCard
                  key={h.id}
                  holding={h}
                  primaryTxn={primary}
                  onClick={() => navigate(`/fds/${h.id}`, { state: { holding: h } })}
                  onEdit={(e) => {
                    e.stopPropagation();
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
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
            {rdHoldings.map((h) => {
              const primary = primaryTxnFor(h);
              const depositOnly = depositTxnsFor(h);
              return (
                <RDCard
                  key={h.id}
                  holding={h}
                  primaryTxn={primary}
                  allDepositTxns={depositOnly}
                  onClick={() => navigate(`/fds/${h.id}`, { state: { holding: h } })}
                  onEdit={(e) => {
                    e.stopPropagation();
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
