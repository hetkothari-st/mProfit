import { useEffect, useRef, useState } from 'react';
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

function FDGlyph({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 18" fill="none" aria-hidden>
      {/* Certificate / bond document */}
      <rect x="1.5" y="1" width="21" height="16" rx="1.5" className="stroke-foreground/35 dark:stroke-foreground/40" strokeWidth="0.7" />
      {/* Header rule */}
      <rect x="1.5" y="1" width="21" height="5" rx="1.5" className="fill-accent/30 dark:fill-accent/35" />
      {/* Text lines */}
      <line x1="4.5" y1="9.5" x2="14" y2="9.5" className="stroke-foreground/30" strokeWidth="0.7" />
      <line x1="4.5" y1="12" x2="11" y2="12" className="stroke-foreground/20" strokeWidth="0.7" />
      {/* Seal circle */}
      <circle cx="18.5" cy="12" r="3" className="stroke-accent/60 dark:stroke-accent/70" strokeWidth="0.8" />
      <circle cx="18.5" cy="12" r="1.2" className="fill-accent/40 dark:fill-accent/50" />
    </svg>
  );
}

function RDGlyph({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 18" fill="none" aria-hidden>
      {/* Calendar outline */}
      <rect x="2" y="3" width="20" height="14" rx="1.5" className="stroke-foreground/35 dark:stroke-foreground/40" strokeWidth="0.7" />
      {/* Calendar header */}
      <rect x="2" y="3" width="20" height="4.5" rx="1.5" className="fill-accent/25 dark:fill-accent/30" />
      {/* Installment dots row 1: 4 filled = paid */}
      <circle cx="6" cy="11" r="1.3" className="fill-accent/70 dark:fill-accent/75" />
      <circle cx="10" cy="11" r="1.3" className="fill-accent/70 dark:fill-accent/75" />
      <circle cx="14" cy="11" r="1.3" className="fill-accent/70 dark:fill-accent/75" />
      {/* Dot row 2: remaining */}
      <circle cx="18" cy="11" r="1.3" className="fill-foreground/15 dark:fill-foreground/20" />
      <circle cx="6" cy="14.5" r="1.3" className="fill-foreground/15 dark:fill-foreground/20" />
      <circle cx="10" cy="14.5" r="1.3" className="fill-foreground/15 dark:fill-foreground/20" />
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

  const elapsedPct = openDate && maturity
    ? (() => {
        const start = new Date(`${openDate}T00:00:00Z`).getTime();
        const end = new Date(`${maturity}T00:00:00Z`).getTime();
        const now = Date.now();
        return Math.min(100, Math.max(0, ((now - start) / (end - start)) * 100));
      })()
    : null;

  return (
    <div
      onClick={onClick}
      className="group relative rounded-2xl border border-amber-200/60 dark:border-amber-900/40 bg-card/95 dark:bg-card/90 hover:border-amber-300/80 dark:hover:border-amber-700/60 hover:shadow-lg hover:shadow-amber-500/10 dark:hover:shadow-amber-900/20 transition-all cursor-pointer overflow-hidden"
    >
      <div className="h-1.5 w-full bg-gradient-to-r from-amber-400/80 via-amber-500/70 to-amber-300/70 dark:from-amber-700/80 dark:via-amber-600/70 dark:to-amber-500/70" />
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_20%_0%,rgba(245,158,11,0.12),transparent_45%),radial-gradient(circle_at_90%_10%,rgba(251,191,36,0.08),transparent_35%)] dark:bg-[radial-gradient(circle_at_20%_0%,rgba(180,83,9,0.28),transparent_45%),radial-gradient(circle_at_90%_10%,rgba(146,64,14,0.2),transparent_35%)]" />
      {/* Editorial card header */}
      <div className="relative border-b border-border/70 dark:border-border/60">
        <div
          className="absolute inset-0 opacity-[0.05] dark:opacity-[0.08] pointer-events-none text-foreground"
          style={{
            backgroundImage:
              'radial-gradient(circle, currentColor 0.6px, transparent 1px)',
            backgroundSize: '14px 14px',
          }}
        />
        <div className="relative flex items-center justify-between gap-3 px-4 py-3 bg-gradient-to-r from-amber-50/70 via-card to-amber-50/60 dark:from-amber-950/20 dark:via-card dark:to-amber-900/15">
          <div className="flex items-center gap-3 min-w-0">
            <span className="inline-flex items-center justify-center h-9 w-10 shrink-0 rounded-md bg-amber-100/70 dark:bg-amber-900/30 ring-1 ring-amber-300/70 dark:ring-amber-700/60 text-amber-700 dark:text-amber-300">
              <FDGlyph className="h-5 w-6" />
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-semibold text-sm leading-tight truncate max-w-[220px]">
                  {holding.assetName ?? '—'}
                </p>
                <span className="shrink-0 text-[10px] font-bold uppercase tracking-[0.2em] text-amber-700 dark:text-amber-300 bg-amber-100/70 dark:bg-amber-900/35 ring-1 ring-inset ring-amber-300/70 dark:ring-amber-700/60 px-1.5 py-0.5 rounded">
                  FD
                </span>
                <span className="shrink-0 hidden sm:inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-200 bg-amber-100/60 dark:bg-amber-900/25 border border-amber-200/80 dark:border-amber-800/60">
                  One-time deposit
                </span>
              </div>
              <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                {holding.portfolioName && <span>{holding.portfolioName}</span>}
                {holding.isin && (
                  <>
                    {holding.portfolioName && <span className="text-muted-foreground/30">·</span>}
                    <span className="font-mono">{holding.isin}</span>
                  </>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {rate && (
              <div className="text-right">
                <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground leading-none mb-0.5">
                  Rate
                </p>
                <p className="text-lg font-bold text-amber-700 dark:text-amber-300 tabular-nums leading-none">
                  {rate}%
                </p>
                <p className="text-[10px] text-muted-foreground leading-none mt-0.5">p.a.</p>
              </div>
            )}
            <Pencil className="h-3.5 w-3.5 text-muted-foreground/30 group-hover:text-muted-foreground transition-colors" />
          </div>
        </div>
      </div>

      {/* Card body */}
      <div className="px-4 py-3">
        {/* Meta line */}
        <div className="flex items-center flex-wrap gap-x-2.5 gap-y-1 text-xs text-muted-foreground">
          {freq && <span>{FREQ_LABELS[freq] ?? freq} payout</span>}
          {openDate && (
            <>
              {freq && <span className="text-muted-foreground/30">·</span>}
              <span>Opened {openDate}</span>
            </>
          )}
          {maturity && (
            <>
              <span className="text-muted-foreground/30">·</span>
              <span>Matures {maturity}</span>
              <MaturityBadge date={maturity} />
            </>
          )}
        </div>

        {/* Maturity timeline */}
        {elapsedPct !== null && (
          <div className="mt-2.5 flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground/60 shrink-0 tabular-nums w-[72px] truncate">
              {openDate}
            </span>
            <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-accent/70 dark:bg-accent/60 transition-all"
                style={{ width: `${elapsedPct}%` }}
              />
            </div>
            <span className="text-[10px] text-muted-foreground/60 shrink-0 tabular-nums w-[72px] truncate text-right">
              {maturity}
            </span>
          </div>
        )}

        {/* Stats */}
        <div className="mt-3 grid grid-cols-3 gap-4 pt-3 border-t border-border">
          <div>
            <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground font-medium mb-1">
              Principal
            </p>
            <p className="tabular-nums font-semibold text-sm">{formatINR(holding.totalCost)}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground font-medium mb-1">
              Current Value
            </p>
            <p className="tabular-nums font-semibold text-sm">
              {holding.currentValue ? formatINR(holding.currentValue) : '—'}
            </p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground font-medium mb-1">
              Interest Earned
            </p>
            <p className="tabular-nums font-semibold text-sm">
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
  const progressPct = tenureMonths && tenureMonths > 0
    ? Math.min(100, (installmentsDone / tenureMonths) * 100)
    : null;

  return (
    <div
      onClick={onClick}
      className="group relative rounded-2xl border border-cyan-200/60 dark:border-cyan-900/40 bg-card/95 dark:bg-card/90 hover:border-cyan-300/80 dark:hover:border-cyan-700/60 hover:shadow-lg hover:shadow-cyan-500/10 dark:hover:shadow-cyan-900/20 transition-all cursor-pointer overflow-hidden"
    >
      <div className="h-1.5 w-full bg-gradient-to-r from-cyan-400/80 via-sky-500/70 to-indigo-400/70 dark:from-cyan-700/80 dark:via-sky-700/70 dark:to-indigo-700/70" />
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_85%_0%,rgba(14,165,233,0.12),transparent_38%),radial-gradient(circle_at_10%_0%,rgba(34,211,238,0.1),transparent_35%)] dark:bg-[radial-gradient(circle_at_85%_0%,rgba(3,105,161,0.25),transparent_38%),radial-gradient(circle_at_10%_0%,rgba(8,145,178,0.2),transparent_35%)]" />
      <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-cyan-400/70 dark:bg-cyan-700/60 rounded-l-2xl" />

      <div className="pl-5 pr-4 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="inline-flex items-center justify-center h-9 w-9 shrink-0 rounded-md bg-cyan-100/70 dark:bg-cyan-900/30 ring-1 ring-cyan-300/70 dark:ring-cyan-700/60 text-cyan-700 dark:text-cyan-300">
              <CalendarClock className="h-4 w-4" strokeWidth={1.8} />
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-semibold text-sm truncate max-w-[240px]">{holding.assetName ?? '—'}</p>
                <span className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-cyan-700 dark:text-cyan-300 bg-cyan-100/70 dark:bg-cyan-900/35 ring-1 ring-inset ring-cyan-300/70 dark:ring-cyan-700/60">
                  RD
                </span>
                <span className="shrink-0 hidden sm:inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium text-cyan-700 dark:text-cyan-200 bg-cyan-100/60 dark:bg-cyan-900/25 border border-cyan-200/80 dark:border-cyan-800/60">
                  Monthly installments
                </span>
              </div>
              {holding.isin && (
                <p className="text-xs text-muted-foreground mt-0.5 font-mono">{holding.isin}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 mt-0.5">
            {rate && (
              <span className="rounded-full border border-cyan-300/70 dark:border-cyan-700/60 bg-cyan-100/70 dark:bg-cyan-900/30 px-2.5 py-0.5 text-xs font-semibold text-cyan-700 dark:text-cyan-300">
                {rate}% p.a.
              </span>
            )}
            <Pencil className="h-3.5 w-3.5 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors" />
          </div>
        </div>

        <div className="mt-2 flex items-center flex-wrap gap-x-2.5 gap-y-1 text-xs text-muted-foreground">
          {monthlyAmt && <span>{monthlyAmt}/month</span>}
          {tenureMonths && (
            <>
              <span className="text-muted-foreground/30">·</span>
              <span>{tenureMonths} months tenure</span>
            </>
          )}
          {freq && (
            <>
              <span className="text-muted-foreground/30">·</span>
              <span>{FREQ_LABELS[freq] ?? freq} compounding</span>
            </>
          )}
          {holding.portfolioName && (
            <>
              <span className="text-muted-foreground/30">·</span>
              <span>{holding.portfolioName}</span>
            </>
          )}
          {openDate && (
            <>
              <span className="text-muted-foreground/30">·</span>
              <span>Since {openDate}</span>
            </>
          )}
        </div>

        {progressPct !== null && (
          <div className="mt-2.5 flex items-center gap-2.5">
            <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-accent/70 dark:bg-accent/60 transition-all"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <span className="text-[10px] tabular-nums text-muted-foreground shrink-0">
              {installmentsDone}/{tenureMonths} installments
            </span>
          </div>
        )}

        {maturity && (
          <div className="mt-1.5 flex items-center gap-2 text-xs text-muted-foreground">
            <span>Matures {maturity}</span>
            <MaturityBadge date={maturity} />
          </div>
        )}

        <div className="mt-3 border-t border-border" />

        <div className="mt-3 grid grid-cols-3 gap-4">
          <div>
            <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground font-medium mb-1">
              Total Deposited
            </p>
            <p className="tabular-nums font-semibold text-sm">{formatINR(holding.totalCost)}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground font-medium mb-1">
              Current Value
            </p>
            <p className="tabular-nums font-semibold text-sm">
              {holding.currentValue ? formatINR(holding.currentValue) : '—'}
            </p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground font-medium mb-1">
              Interest Earned
            </p>
            <p className="tabular-nums font-semibold text-sm">
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
