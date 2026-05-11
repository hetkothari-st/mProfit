import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueries, useQuery } from '@tanstack/react-query';
import {
  ArrowUpRight,
  CalendarClock,
  ChevronDown,
  Clock,
  Landmark,
  Pencil,
  PiggyBank,
  Plus,
  ShieldCheck,
} from 'lucide-react';
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

const FD_ACCENT = 'hsl(var(--positive))';
const RD_ACCENT = 'hsl(var(--accent))';

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
    default: return 0;
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
      <span className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider bg-muted text-muted-foreground">
        <Clock className="h-3 w-3" /> Matured
      </span>
    );
  }
  const cls =
    d <= 30
      ? 'bg-negative/10 text-negative'
      : d <= 90
        ? 'bg-warning/15 text-warning'
        : 'bg-positive/10 text-positive';
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${cls}`}>
      <Clock className="h-3 w-3" /> in {d}d
    </span>
  );
}

function ProgressRing({
  pct,
  color,
  topLabel,
  bottomLabel,
}: {
  pct: number;
  color: string;
  topLabel: string;
  bottomLabel: string;
}) {
  const size = 96;
  const stroke = 6;
  const radius = (size - stroke) / 2;
  const circ = 2 * Math.PI * radius;
  const safe = Math.min(100, Math.max(0, pct));
  const dash = (safe / 100) * circ;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="hsl(var(--border))"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeDasharray={`${dash} ${circ}`}
          strokeLinecap="round"
          style={{ transition: 'stroke-dasharray 600ms cubic-bezier(0.22, 0.61, 0.36, 1)' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span
          className="font-display text-2xl leading-none tracking-tight"
          style={{ color }}
        >
          {topLabel}
        </span>
        <span className="text-[9px] uppercase tracking-[0.18em] text-muted-foreground mt-0.5 font-mono">
          {bottomLabel}
        </span>
      </div>
    </div>
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
    <span className={pos ? 'text-positive' : 'text-negative'}>
      {pos ? '+' : ''}{formatINR(pnl.toString())}
      {pct != null && (
        <span className="ml-1 text-[11px] opacity-80">
          ({pos ? '+' : ''}{pct.toFixed(2)}%)
        </span>
      )}
    </span>
  );
}

function StatBlock({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: React.ReactNode;
  accent?: boolean;
}) {
  return (
    <div>
      <p className="text-[9px] uppercase tracking-[0.22em] text-muted-foreground font-mono mb-0.5">
        {label}
      </p>
      <p
        className={`numeric-display text-[15px] truncate ${
          accent ? 'text-positive' : 'text-foreground'
        }`}
      >
        {value}
      </p>
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

  const certNo = holding.id.replace(/[^A-Z0-9]/gi, '').slice(-8).toUpperCase();
  const matValue = fdMaturityValue(holding.totalCost, rate, tenureMonths, freq);
  const isMatured = maturity ? daysUntil(maturity) < 0 : false;

  const stop = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  return (
    <div
      onClick={onClick}
      className={`block group cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:ring-offset-2 rounded-lg ${isMatured ? 'opacity-70' : ''}`}
    >
      <Card
        className="overflow-hidden p-0 paper relative transition-all duration-300 group-hover:shadow-elev-lg group-hover:-translate-y-0.5"
        style={{ borderTop: `3px solid ${FD_ACCENT}` }}
      >
        {/* Engraved certificate header */}
        <div className="relative px-5 pt-3 pb-2 border-b border-border/70">
          <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.22em] font-medium">
            <span className="flex items-center gap-1.5" style={{ color: FD_ACCENT }}>
              <ShieldCheck className="h-3 w-3" strokeWidth={1.8} />
              Term Deposit
            </span>
            <span className="font-mono normal-case tracking-normal text-muted-foreground">
              № {certNo}
            </span>
          </div>
          <div className="mt-2 flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <h3 className="font-display text-[28px] leading-[1.1] tracking-[-0.01em] text-foreground truncate">
                {holding.assetName ?? '—'}
              </h3>
              <div className="flex items-center gap-1.5 mt-1.5 text-xs text-muted-foreground flex-wrap">
                <span className="tabular-nums">
                  {tenureMonths ? `${tenureMonths}-month term` : 'Term —'}
                </span>
                {freq && (
                  <>
                    <span className="text-accent/40">·</span>
                    <span>{FREQ_LABELS[freq] ?? freq} payout</span>
                  </>
                )}
                {holding.portfolioName && (
                  <>
                    <span className="text-accent/40">·</span>
                    <span className="font-display-italic truncate">{holding.portfolioName}</span>
                  </>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={(e) => { stop(e); onEdit(e); }}
              aria-label="Edit deposit"
              className="shrink-0 p-1 rounded text-muted-foreground/60 hover:text-foreground hover:bg-muted/60 transition-colors opacity-0 group-hover:opacity-100"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Body — ring + ledger grid */}
        <CardContent className="p-5 relative">
          <div className="grid grid-cols-[auto_1fr] gap-5 items-center">
            <ProgressRing
              pct={elapsedPct}
              color={FD_ACCENT}
              topLabel={rate != null && rate !== '' ? `${rate}%` : '—'}
              bottomLabel="p.a."
            />
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground font-medium">
                Principal
              </p>
              <p className="numeric-display-lg money-digits text-2xl mt-0.5">
                {formatINR(holding.totalCost)}
              </p>
              <div className="mt-2.5 grid grid-cols-3 gap-x-3">
                <StatBlock
                  label="Current"
                  value={holding.currentValue ? formatINR(holding.currentValue) : '—'}
                />
                <StatBlock
                  label="Maturity"
                  value={matValue ? formatINR(matValue.toString()) : '—'}
                  accent
                />
                <StatBlock
                  label="Earned"
                  value={<PnLDisplay holding={holding} />}
                />
              </div>
            </div>
          </div>

          {/* Timeline */}
          {tenureMonths != null && (
            <div className="mt-4">
              <div className="relative h-[3px] rounded-full bg-border/70 overflow-hidden">
                <div
                  className="absolute inset-y-0 left-0 rounded-full transition-all"
                  style={{ width: `${elapsedPct}%`, background: FD_ACCENT }}
                />
              </div>
              <div className="mt-1.5 flex items-center justify-between text-[10px] uppercase tracking-[0.18em] font-mono text-muted-foreground">
                <span>{formatShortDate(openDate)}</span>
                <span className="text-foreground/70 tabular-nums">
                  {Math.round(elapsedPct)}% elapsed
                </span>
                <span>{formatShortDate(maturity)}</span>
              </div>
            </div>
          )}

          {/* Footer */}
          <div className="mt-4 pt-3 border-t border-dashed border-border/70 flex items-center justify-between text-xs">
            {maturity ? (
              <>
                <span className="text-muted-foreground flex items-center gap-1.5">
                  <CalendarClock className="h-3 w-3" />
                  <span className="font-display-italic">Matures</span>
                  <span className="tabular-nums text-foreground">{formatShortDate(maturity)}</span>
                </span>
                <MaturityBadge date={maturity} />
              </>
            ) : (
              <span className="text-muted-foreground font-display-italic">Maturity date not set</span>
            )}
            <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground/60 group-hover:text-accent transition-colors ml-auto" />
          </div>

          {/* Matured stamp */}
          {isMatured && (
            <div className="absolute top-3 right-3 -rotate-6 border-2 border-muted-foreground/50 px-2 py-0.5 rounded-sm font-display text-xs tracking-[0.18em] text-muted-foreground/70 pointer-events-none">
              MATURED
            </div>
          )}
        </CardContent>
      </Card>
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
  const maturity = primaryTxn?.maturityDate ?? null;
  const openDate = primaryTxn?.tradeDate ?? null;
  const monthlyRaw = primaryTxn?.price ?? null;
  const monthlyAmt = monthlyRaw ? formatINR(monthlyRaw) : '—';

  const tenureMonths = openDate && maturity ? monthsBetween(openDate, maturity) : null;
  const installmentsDone = allDepositTxns.length;
  const progressPct = tenureMonths && tenureMonths > 0
    ? Math.min(100, (installmentsDone / tenureMonths) * 100)
    : 0;

  const matValue = rdMaturityValue(monthlyRaw, rate, tenureMonths);
  const certNo = holding.id.replace(/[^A-Z0-9]/gi, '').slice(-8).toUpperCase();
  const isMatured = maturity ? daysUntil(maturity) < 0 : false;

  // Compact installment row — up to 24 dots, summarised if longer
  const dotCount = tenureMonths ?? Math.max(installmentsDone, 12);
  const showDots = Math.min(dotCount, 24);
  const overflow = dotCount > 24;

  const stop = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  return (
    <div
      onClick={onClick}
      className={`block group cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:ring-offset-2 rounded-lg ${isMatured ? 'opacity-70' : ''}`}
    >
      <Card
        className="overflow-hidden p-0 paper relative transition-all duration-300 group-hover:shadow-elev-lg group-hover:-translate-y-0.5"
        style={{ borderTop: `3px solid ${RD_ACCENT}` }}
      >
        {/* Passbook header */}
        <div className="relative px-5 pt-3 pb-2 border-b border-border/70">
          <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.22em] font-medium">
            <span className="flex items-center gap-1.5" style={{ color: RD_ACCENT }}>
              <CalendarClock className="h-3 w-3" strokeWidth={1.8} />
              Recurring Deposit
            </span>
            <span className="font-mono normal-case tracking-normal text-muted-foreground">
              № {certNo}
            </span>
          </div>
          <div className="mt-2 flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <h3 className="font-display text-[28px] leading-[1.1] tracking-[-0.01em] text-foreground truncate">
                {holding.assetName ?? '—'}
              </h3>
              <div className="flex items-center gap-1.5 mt-1.5 text-xs text-muted-foreground flex-wrap">
                <span className="text-foreground/80 font-medium tabular-nums">{monthlyAmt}</span>
                <span className="text-muted-foreground/60">/month</span>
                {tenureMonths && (
                  <>
                    <span className="text-accent/40">·</span>
                    <span className="tabular-nums">{tenureMonths}-month tenure</span>
                  </>
                )}
                {holding.portfolioName && (
                  <>
                    <span className="text-accent/40">·</span>
                    <span className="font-display-italic truncate">{holding.portfolioName}</span>
                  </>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={(e) => { stop(e); onEdit(e); }}
              aria-label="Edit deposit"
              className="shrink-0 p-1 rounded text-muted-foreground/60 hover:text-foreground hover:bg-muted/60 transition-colors opacity-0 group-hover:opacity-100"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        <CardContent className="p-5 relative">
          <div className="grid grid-cols-[auto_1fr] gap-5 items-center">
            <ProgressRing
              pct={progressPct}
              color={RD_ACCENT}
              topLabel={rate != null && rate !== '' ? `${rate}%` : '—'}
              bottomLabel="p.a."
            />
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground font-medium">
                Deposited
              </p>
              <p className="numeric-display-lg money-digits text-2xl mt-0.5">
                {formatINR(holding.totalCost)}
              </p>
              <div className="mt-2.5 grid grid-cols-3 gap-x-3">
                <StatBlock
                  label="Current"
                  value={holding.currentValue ? formatINR(holding.currentValue) : '—'}
                />
                <StatBlock
                  label="Maturity"
                  value={matValue ? formatINR(matValue.toString()) : '—'}
                  accent
                />
                <StatBlock
                  label="Earned"
                  value={<PnLDisplay holding={holding} />}
                />
              </div>
            </div>
          </div>

          {/* Installment stamps */}
          <div className="mt-4">
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-[9px] uppercase tracking-[0.22em] text-muted-foreground font-mono">
                Installments stamped
              </p>
              <p className="font-mono text-[10px] tabular-nums">
                <span className="font-semibold" style={{ color: RD_ACCENT }}>{installmentsDone}</span>
                <span className="text-muted-foreground/60"> / {tenureMonths ?? '—'}</span>
                <span className="ml-1.5 text-muted-foreground">({Math.round(progressPct)}%)</span>
              </p>
            </div>
            <div className="flex flex-wrap gap-[3px] items-center">
              {Array.from({ length: showDots }, (_, i) => i < installmentsDone).map((paid, i) => (
                <span
                  key={i}
                  title={`Month ${i + 1}${paid ? ' — paid' : ' — pending'}`}
                  className={
                    paid
                      ? 'h-[10px] w-[10px] rounded-[2px] ring-1 ring-inset shadow-[inset_0_0_0_2px_hsl(var(--card))]'
                      : 'h-[10px] w-[10px] rounded-[2px] border border-dashed border-border bg-muted/30'
                  }
                  style={
                    paid
                      ? { background: RD_ACCENT, boxShadow: `inset 0 0 0 2px hsl(var(--card))`, '--tw-ring-color': RD_ACCENT } as React.CSSProperties
                      : undefined
                  }
                />
              ))}
              {overflow && (
                <span className="ml-1 font-mono text-[10px] text-muted-foreground tabular-nums">
                  +{dotCount - 24}
                </span>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="mt-4 pt-3 border-t border-dashed border-border/70 flex items-center justify-between text-xs">
            {maturity ? (
              <>
                <span className="text-muted-foreground flex items-center gap-1.5">
                  <CalendarClock className="h-3 w-3" />
                  <span className="font-display-italic">Matures</span>
                  <span className="tabular-nums text-foreground">{formatShortDate(maturity)}</span>
                </span>
                <MaturityBadge date={maturity} />
              </>
            ) : (
              <span className="text-muted-foreground font-display-italic">Maturity date not set</span>
            )}
            <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground/60 group-hover:text-accent transition-colors ml-auto" />
          </div>

          {isMatured && (
            <div className="absolute top-3 right-3 -rotate-6 border-2 border-muted-foreground/50 px-2 py-0.5 rounded-sm font-display text-xs tracking-[0.18em] text-muted-foreground/70 pointer-events-none">
              MATURED
            </div>
          )}
        </CardContent>
      </Card>
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

    if (base.length === 1) {
      return [...base].sort((a, b) => a.tradeDate.localeCompare(b.tradeDate));
    }

    return [];
  }

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
          {([
            { label: 'Total Invested', value: formatINR(totalInvested.toString()), sub: `${allHoldings.length} deposit${allHoldings.length === 1 ? '' : 's'}`, valueClass: '' },
            { label: 'Current Value', value: formatINR(totalValue.toString()), sub: 'live valuation', valueClass: '' },
            {
              label: 'Total Earnings',
              value: `${totalPnL.gte(0) ? '+' : ''}${formatINR(totalPnL.toString())}${pnlPct != null ? ` (${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(1)}%)` : ''}`,
              sub: 'realised + unrealised',
              valueClass: totalPnL.gte(0) ? 'text-positive' : 'text-negative',
            },
          ] as { label: string; value: string; sub: string; valueClass: string }[]).map((m) => (
            <Card key={m.label}>
              <CardContent className="px-4 py-3">
                <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">
                  {m.label}
                </p>
                <p className={`text-xl font-semibold tabular-nums mt-1 ${m.valueClass}`}>
                  {m.value}
                </p>
                <p className="text-xs text-muted-foreground">{m.sub}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} className="h-44 animate-pulse bg-muted/60" />
          ))}
        </div>
      )}

      {!isLoading && allHoldings.length === 0 && (
        <EmptyState
          icon={Landmark}
          title="No deposits yet"
          description="Add a Fixed or Recurring Deposit to start tracking."
          action={
            <Button onClick={() => openAdd('FIXED_DEPOSIT')}>
              <Plus className="h-4 w-4" /> Add first deposit
            </Button>
          }
        />
      )}

      {!isLoading && fdHoldings.length > 0 && (
        <section className="mb-8">
          <div className="flex items-center gap-2 mb-3 px-0.5">
            <PiggyBank className="h-3.5 w-3.5" style={{ color: FD_ACCENT }} strokeWidth={1.8} />
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.22em]" style={{ color: FD_ACCENT }}>
              Fixed Deposits
            </h3>
            <span className="text-xs text-muted-foreground">({fdHoldings.length})</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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

      {!isLoading && rdHoldings.length > 0 && (
        <section className="mb-8">
          <div className="flex items-center gap-2 mb-3 px-0.5">
            <CalendarClock className="h-3.5 w-3.5" style={{ color: RD_ACCENT }} strokeWidth={1.8} />
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.22em]" style={{ color: RD_ACCENT }}>
              Recurring Deposits
            </h3>
            <span className="text-xs text-muted-foreground">({rdHoldings.length})</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
