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

function MaturityBadge({ date }: { date: string }) {
  const d = daysUntil(date);
  if (d < 0) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium bg-muted text-muted-foreground">
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
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>
      <Clock className="h-3 w-3" /> {d}d left
    </span>
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

  return (
    <div
      onClick={onClick}
      className="group relative rounded-xl border border-border bg-card hover:border-accent/40 hover:shadow-sm transition-all cursor-pointer overflow-hidden"
    >
      <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-accent rounded-l-xl" />

      <div className="pl-5 pr-4 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="inline-flex items-center justify-center h-9 w-9 shrink-0 rounded-md bg-accent/10 dark:bg-accent/15 ring-1 ring-accent/30 dark:ring-accent/40 text-accent">
              <PiggyBank className="h-4 w-4" strokeWidth={1.8} />
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-semibold text-sm truncate max-w-[240px]">{holding.assetName ?? '—'}</p>
                <span className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-accent/10 dark:bg-accent/15 text-accent ring-1 ring-inset ring-accent/25 dark:ring-accent/35">
                  FD
                </span>
              </div>
              {holding.isin && (
                <p className="text-xs text-muted-foreground mt-0.5 font-mono">{holding.isin}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 mt-0.5">
            {rate && (
              <span className="rounded-full border border-accent/35 dark:border-accent/45 bg-accent/10 dark:bg-accent/15 px-2.5 py-0.5 text-xs font-semibold text-accent">
                {rate}% p.a.
              </span>
            )}
            <Pencil className="h-3.5 w-3.5 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors" />
          </div>
        </div>

        <div className="mt-2 flex items-center flex-wrap gap-x-2.5 gap-y-1 text-xs text-muted-foreground">
          {freq && <span>{FREQ_LABELS[freq] ?? freq} payout</span>}
          {openDate && (
            <>
              <span className="text-muted-foreground/30">·</span>
              <span>Since {openDate}</span>
            </>
          )}
          {holding.portfolioName && (
            <>
              <span className="text-muted-foreground/30">·</span>
              <span>{holding.portfolioName}</span>
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

        <div className="mt-3 border-t border-border" />

        <div className="mt-3 grid grid-cols-3 gap-4">
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
      className="group relative rounded-xl border border-border bg-card hover:border-accent/40 hover:shadow-sm transition-all cursor-pointer overflow-hidden"
    >
      <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-accent/60 dark:bg-accent/50 rounded-l-xl" />

      <div className="pl-5 pr-4 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="inline-flex items-center justify-center h-9 w-9 shrink-0 rounded-md bg-accent/10 dark:bg-accent/15 ring-1 ring-accent/30 dark:ring-accent/40 text-accent">
              <CalendarClock className="h-4 w-4" strokeWidth={1.8} />
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-semibold text-sm truncate max-w-[240px]">{holding.assetName ?? '—'}</p>
                <span className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-muted text-foreground/65 ring-1 ring-inset ring-border dark:text-foreground/55">
                  RD
                </span>
              </div>
              {holding.isin && (
                <p className="text-xs text-muted-foreground mt-0.5 font-mono">{holding.isin}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 mt-0.5">
            {rate && (
              <span className="rounded-full border border-accent/35 dark:border-accent/45 bg-accent/10 dark:bg-accent/15 px-2.5 py-0.5 text-xs font-semibold text-accent">
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

  function depositTxnsFor(h: FDHolding): TransactionDTO[] {
    return allTxns
      .filter(
        (t) =>
          t.portfolioId === h.portfolioId &&
          t.assetName === h.assetName &&
          t.transactionType === 'DEPOSIT',
      )
      .sort((a, b) => a.tradeDate.localeCompare(b.tradeDate));
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
              const deposits = depositTxnsFor(h);
              return (
                <FDCard
                  key={h.id}
                  holding={h}
                  primaryTxn={deposits[0] ?? null}
                  onClick={() => {
                    const t = deposits[0];
                    if (t) openEdit(t);
                    else openAdd('FIXED_DEPOSIT');
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
              const deposits = depositTxnsFor(h);
              return (
                <RDCard
                  key={h.id}
                  holding={h}
                  primaryTxn={deposits[0] ?? null}
                  allDepositTxns={deposits}
                  onClick={() => {
                    const t = deposits[0];
                    if (t) openEdit(t);
                    else openAdd('RECURRING_DEPOSIT');
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
