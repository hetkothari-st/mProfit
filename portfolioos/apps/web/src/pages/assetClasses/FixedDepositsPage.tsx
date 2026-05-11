import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueries, useQuery } from '@tanstack/react-query';
import { CalendarClock, ChevronDown, Clock, Lock, Pencil, PiggyBank, Plus, ShieldCheck } from 'lucide-react';
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

function ChipIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 40 30" fill="none" aria-hidden>
      <defs>
        <linearGradient id="chipGradFD" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#FDE68A" />
          <stop offset="45%" stopColor="#F59E0B" />
          <stop offset="100%" stopColor="#92400E" />
        </linearGradient>
      </defs>
      <rect
        x="0.5"
        y="0.5"
        width="39"
        height="29"
        rx="4"
        fill="url(#chipGradFD)"
        stroke="#78350F"
        strokeOpacity="0.6"
        strokeWidth="0.5"
      />
      <path
        d="M0 10 L15 10 M0 20 L15 20 M40 10 L25 10 M40 20 L25 20 M15 0 L15 10 M25 0 L25 10 M15 20 L15 30 M25 20 L25 30"
        stroke="#78350F"
        strokeOpacity="0.55"
        strokeWidth="0.6"
      />
      <rect
        x="14"
        y="9"
        width="12"
        height="12"
        rx="1.5"
        fill="none"
        stroke="#78350F"
        strokeOpacity="0.7"
        strokeWidth="0.8"
      />
      <rect
        x="16.5"
        y="11.5"
        width="7"
        height="7"
        rx="0.5"
        fill="#FCD34D"
        fillOpacity="0.55"
      />
    </svg>
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

function PnLOnDark({ holding }: { holding: FDHolding }) {
  if (!holding.currentValue) return <p className="text-white/40 text-sm font-semibold">—</p>;
  const pnl = new Decimal(holding.currentValue).minus(holding.totalCost);
  const pct = new Decimal(holding.totalCost).isZero()
    ? null
    : pnl.div(holding.totalCost).times(100).toNumber();
  const pos = pnl.gte(0);
  return (
    <p
      className={`tabular-nums font-semibold text-sm ${
        pos ? 'text-emerald-300' : 'text-rose-300'
      }`}
    >
      {pos ? '+' : ''}{formatINR(pnl.toString())}
      {pct != null && (
        <span className="ml-1 text-[10px] opacity-80">
          ({pos ? '+' : ''}{pct.toFixed(2)}%)
        </span>
      )}
    </p>
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

  return (
    <div
      onClick={onClick}
      className="group relative rounded-2xl overflow-hidden cursor-pointer
        bg-gradient-to-br from-[#042F2E] via-[#134E4A] to-[#0E7490]
        ring-1 ring-white/10 hover:ring-white/25
        shadow-[0_18px_45px_-20px_rgba(8,47,73,0.65),0_8px_18px_-10px_rgba(8,47,73,0.45)]
        hover:shadow-[0_28px_70px_-20px_rgba(8,47,73,0.85),0_10px_24px_-10px_rgba(8,47,73,0.55)]
        hover:-translate-y-0.5
        transition-all duration-300"
    >
      {/* Atmospheric glows */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(circle at 85% -10%, rgba(45,212,191,0.45), transparent 55%), radial-gradient(circle at -5% 105%, rgba(8,145,178,0.45), transparent 55%), radial-gradient(circle at 50% 50%, rgba(20,184,166,0.10), transparent 70%)',
        }}
      />

      {/* Diagonal sheen — animates on hover */}
      <div
        className="absolute inset-0 pointer-events-none -translate-x-[40%] group-hover:translate-x-[40%] transition-transform duration-[1400ms] ease-out"
        style={{
          background:
            'linear-gradient(115deg, transparent 30%, rgba(255,255,255,0.06) 45%, rgba(255,255,255,0.18) 50%, rgba(255,255,255,0.06) 55%, transparent 70%)',
        }}
      />

      {/* Faint guilloché lines (banknote vibe) */}
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none opacity-[0.07] mix-blend-overlay"
        viewBox="0 0 600 300"
        preserveAspectRatio="none"
        aria-hidden
      >
        <defs>
          <pattern id="guilloche-fd" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M0 20 Q10 0 20 20 T40 20" stroke="white" strokeWidth="0.6" fill="none" />
            <path d="M0 30 Q10 10 20 30 T40 30" stroke="white" strokeWidth="0.4" fill="none" />
          </pattern>
        </defs>
        <rect width="600" height="300" fill="url(#guilloche-fd)" />
      </svg>

      <div className="relative px-6 pt-5 pb-5 text-white">
        {/* Top row: chip + locked */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <ChipIcon className="h-7 w-9 drop-shadow-[0_2px_4px_rgba(0,0,0,0.4)]" />
            <div>
              <p className="font-mono text-[9px] uppercase tracking-[0.32em] text-white/65 leading-none">
                Fixed Deposit
              </p>
              <p className="font-mono text-[10px] text-white/40 mt-1 tabular-nums leading-none">
                Cert № {certNo}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full bg-white/10 backdrop-blur px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.22em] text-white ring-1 ring-white/25">
              <Lock className="h-2.5 w-2.5" strokeWidth={2.5} /> Locked
            </span>
            <button
              type="button"
              onClick={onEdit}
              aria-label="Edit deposit"
              className="p-1 -m-1 rounded text-white/45 hover:text-white hover:bg-white/10 transition-colors"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Bank name + rate */}
        <div className="mt-6 flex items-end justify-between gap-4">
          <div className="min-w-0">
            <h3 className="text-[28px] leading-[1.05] font-semibold tracking-tight text-white truncate drop-shadow-[0_2px_6px_rgba(0,0,0,0.35)]">
              {holding.assetName ?? '—'}
            </h3>
            <p className="mt-1.5 text-[11px] text-white/60 flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <span>{tenureMonths ? `${tenureMonths}-month` : 'Term'} deposit</span>
              {freq && (
                <>
                  <span className="text-white/30">·</span>
                  <span>{FREQ_LABELS[freq] ?? freq} payout</span>
                </>
              )}
              {holding.portfolioName && (
                <>
                  <span className="text-white/30">·</span>
                  <span>{holding.portfolioName}</span>
                </>
              )}
            </p>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-[42px] font-bold leading-none tabular-nums text-white drop-shadow-[0_2px_10px_rgba(110,231,183,0.45)]">
              {rate ?? '—'}
              <span className="text-2xl align-top opacity-85 ml-0.5">%</span>
            </p>
            <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.32em] text-white/50">
              per annum
            </p>
          </div>
        </div>

        {/* Timeline */}
        <div className="mt-5">
          <div className="flex items-center gap-3">
            <span className="text-[11px] tabular-nums text-white/85 shrink-0 w-[88px]">
              {formatShortDate(openDate)}
            </span>
            <div className="relative flex-1 h-[6px] rounded-full bg-white/12 overflow-visible">
              <div
                className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-teal-200 via-cyan-100 to-emerald-200 shadow-[0_0_12px_rgba(110,231,183,0.7)]"
                style={{ width: `${elapsedPct}%` }}
              />
              {tenureMonths !== null && (
                <span
                  className="absolute top-1/2 -translate-y-1/2 h-3 w-3 rounded-full bg-white ring-2 ring-cyan-200/70 shadow-[0_0_10px_rgba(255,255,255,0.85)]"
                  style={{ left: `calc(${Math.max(elapsedPct, 0)}% - 6px)` }}
                />
              )}
            </div>
            <span className="text-[11px] tabular-nums text-white/85 shrink-0 w-[88px] text-right">
              {formatShortDate(maturity)}
            </span>
          </div>
          <div className="mt-1.5 flex items-center justify-between font-mono text-[9px] uppercase tracking-[0.22em] text-white/45">
            <span>Opened</span>
            <span className="text-white/65 tabular-nums normal-case tracking-normal">
              {tenureMonths ? `${Math.round(elapsedPct)}% of ${tenureMonths}mo elapsed` : 'Tenure pending'}
            </span>
            <span className="flex items-center gap-1">
              Matures
              {maturity && (
                <span className="ml-2">
                  <MaturityBadge date={maturity} />
                </span>
              )}
            </span>
          </div>
        </div>

        {/* Glass stat row */}
        <div className="mt-5 grid grid-cols-4 gap-2.5">
          <div className="rounded-lg bg-white/8 backdrop-blur-md ring-1 ring-white/15 px-3 py-2.5">
            <p className="font-mono text-[9px] uppercase tracking-[0.22em] text-white/55 mb-1">
              Principal
            </p>
            <p className="tabular-nums font-semibold text-sm text-white">
              {formatINR(holding.totalCost)}
            </p>
          </div>
          <div className="rounded-lg bg-white/8 backdrop-blur-md ring-1 ring-white/15 px-3 py-2.5">
            <p className="font-mono text-[9px] uppercase tracking-[0.22em] text-white/55 mb-1">
              Current Value
            </p>
            <p className="tabular-nums font-semibold text-sm text-white">
              {holding.currentValue ? formatINR(holding.currentValue) : '—'}
            </p>
          </div>
          <div className="rounded-lg bg-amber-300/12 backdrop-blur-md ring-1 ring-amber-200/35 px-3 py-2.5 shadow-[0_0_18px_-6px_rgba(252,211,77,0.45)]">
            <p className="font-mono text-[9px] uppercase tracking-[0.22em] text-amber-100/85 mb-1 flex items-center gap-1">
              <ShieldCheck className="h-2.5 w-2.5" strokeWidth={2.5} />
              Maturity Value
            </p>
            <p className="tabular-nums font-semibold text-sm text-amber-100">
              {matValue ? formatINR(matValue.toString()) : '—'}
            </p>
          </div>
          <div className="rounded-lg bg-white/8 backdrop-blur-md ring-1 ring-white/15 px-3 py-2.5">
            <p className="font-mono text-[9px] uppercase tracking-[0.22em] text-white/55 mb-1">
              Earned
            </p>
            <PnLOnDark holding={holding} />
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
