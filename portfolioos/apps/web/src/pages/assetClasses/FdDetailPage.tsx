import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft, Pencil, PiggyBank, CalendarClock, Clock, Calendar,
  TrendingUp, Landmark, Hash, Sparkles,
} from 'lucide-react';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine,
} from 'recharts';
import { Decimal, formatINR, type HoldingRow, type TransactionDTO } from '@portfolioos/shared';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { transactionsApi } from '@/api/transactions.api';
import { FDFormDialog } from './FDFormDialog';

type FDHolding = HoldingRow & { portfolioName: string; portfolioId?: string };

const FREQ_LABELS: Record<string, string> = {
  MONTHLY: 'Monthly',
  QUARTERLY: 'Quarterly',
  HALF_YEARLY: 'Half-yearly',
  ANNUAL: 'Annual',
  AT_MATURITY: 'At maturity',
};

const FREQ_PERIODS_PER_YEAR: Record<string, number> = {
  MONTHLY: 12,
  QUARTERLY: 4,
  HALF_YEARLY: 2,
  ANNUAL: 1,
  AT_MATURITY: 1,
};

const TXN_LABEL: Record<string, string> = {
  DEPOSIT: 'Deposit',
  WITHDRAWAL: 'Withdrawal',
  INTEREST_RECEIVED: 'Interest credited',
  MATURITY: 'Maturity payout',
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

function addMonthsIso(iso: string, months: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}

/**
 * Compound accrual at an arbitrary valuation date for a single deposit.
 * Matches the backend FD accrual formula in holdingsProjection.ts.
 */
function accruedValue(opts: {
  principal: Decimal;
  rate: Decimal;      // annual, e.g. 0.0725
  startIso: string;
  valuationIso: string;
  periodsPerYear: number;
}): Decimal {
  const ms = new Date(`${opts.valuationIso}T00:00:00Z`).getTime() -
             new Date(`${opts.startIso}T00:00:00Z`).getTime();
  if (ms <= 0) return opts.principal;
  const years = new Decimal(ms / (365.25 * 24 * 60 * 60 * 1000));
  const periodRate = opts.rate.div(opts.periodsPerYear);
  const periods = years.times(opts.periodsPerYear);
  return opts.principal.times(new Decimal(1).plus(periodRate).pow(periods));
}

function MaturityBadge({ date }: { date: string }) {
  const d = daysUntil(date);
  if (d < 0) {
    return (
      <Badge variant="outline" className="gap-1 text-muted-foreground border-muted">
        <Clock className="h-3 w-3" /> Matured {Math.abs(d)}d ago
      </Badge>
    );
  }
  const cls =
    d <= 30 ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400'
    : d <= 90 ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
    : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400';
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${cls}`}>
      <Clock className="h-3 w-3" /> {d}d to maturity
    </span>
  );
}

function Stat({
  label, value, sub, highlight, icon: Icon,
}: {
  label: string;
  value: string;
  sub?: string;
  highlight?: 'positive' | 'negative' | 'accent';
  icon?: typeof TrendingUp;
}) {
  const valCls =
    highlight === 'positive' ? 'text-emerald-600 dark:text-emerald-400'
    : highlight === 'negative' ? 'text-rose-600 dark:text-rose-400'
    : highlight === 'accent' ? 'text-accent'
    : '';
  return (
    <Card className="border-t-2 border-t-accent/70 dark:border-t-accent/60">
      <CardContent className="px-4 py-3">
        <div className="flex items-center gap-1.5">
          {Icon && <Icon className="h-3.5 w-3.5 text-muted-foreground" />}
          <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground font-medium">
            {label}
          </p>
        </div>
        <p className={`text-xl font-semibold tabular-nums mt-1 ${valCls}`}>{value}</p>
        {sub && <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>}
      </CardContent>
    </Card>
  );
}

interface ChartPoint {
  date: string;
  label: string;
  principal: number;
  value: number;
  isToday?: boolean;
}

export function FdDetailPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { holdingId } = useParams<{ holdingId: string }>();
  const [editTxn, setEditTxn] = useState<TransactionDTO | null>(null);
  const [editOpen, setEditOpen] = useState(false);

  const holding = location.state?.holding as FDHolding | undefined;

  useEffect(() => {
    if (!holding) navigate('/fds', { replace: true });
  }, [holding, navigate]);

  const { data: txnData, isLoading: txnLoading } = useQuery({
    queryKey: ['transactions', holding?.assetClass],
    queryFn: () => transactionsApi.list({ assetClass: holding!.assetClass, pageSize: 500 }),
    enabled: !!holding,
  });

  if (!holding) return null;

  const isRD = holding.assetClass === 'RECURRING_DEPOSIT';
  const titleNoun = isRD ? 'Recurring Deposit' : 'Fixed Deposit';
  const Icon = isRD ? CalendarClock : PiggyBank;

  // Filter txns for this holding (same matching logic as the list page)
  const allTxns = (txnData?.items ?? []).filter(
    (t) => t.portfolioId === holding.portfolioId &&
           t.assetClass === holding.assetClass,
  );
  const matched = (() => {
    const isin = normalizeText(holding.isin);
    const name = normalizeText(holding.assetName);
    if (isin) {
      const r = allTxns.filter((t) => normalizeText(t.isin) === isin);
      if (r.length > 0) return r;
    }
    if (name) {
      const r = allTxns.filter((t) => normalizeText(t.assetName) === name);
      if (r.length > 0) return r;
    }
    return allTxns.length === 1 ? allTxns : [];
  })();
  const sorted = [...matched].sort((a, b) => a.tradeDate.localeCompare(b.tradeDate));
  const deposits = sorted.filter((t) => t.transactionType === 'DEPOSIT');
  const primary = deposits[0] ?? sorted[0] ?? null;

  const rate = primary?.interestRate ? new Decimal(primary.interestRate) : null;
  const annualRate = rate ? rate.div(100) : null;
  const freq = primary?.interestFrequency ?? 'QUARTERLY';
  const periodsPerYear = FREQ_PERIODS_PER_YEAR[freq] ?? 4;
  const maturity = primary?.maturityDate ?? null;
  const openDate = primary?.tradeDate ?? null;
  const tenureMonths = openDate && maturity ? monthsBetween(openDate, maturity) : null;
  const todayIso = new Date().toISOString().slice(0, 10);

  const principal = new Decimal(holding.totalCost);
  const currentValue = holding.currentValue ? new Decimal(holding.currentValue) : null;
  const earned = currentValue ? currentValue.minus(principal) : null;
  const earnedPct = earned && !principal.isZero() ? earned.div(principal).times(100).toNumber() : null;

  // Projected maturity value
  const maturityValue = useMemo(() => {
    if (!annualRate || !openDate || !maturity) return null;
    if (!isRD) {
      // FD: single principal compounds to maturity
      return accruedValue({
        principal,
        rate: annualRate,
        startIso: openDate,
        valuationIso: maturity,
        periodsPerYear,
      });
    }
    // RD: each deposit compounds independently to maturity
    return deposits.reduce((sum, t) => {
      const p = new Decimal(t.price).times(new Decimal(t.quantity));
      return sum.plus(accruedValue({
        principal: p,
        rate: annualRate,
        startIso: t.tradeDate,
        valuationIso: maturity,
        periodsPerYear,
      }));
    }, new Decimal(0));
  }, [annualRate, openDate, maturity, periodsPerYear, isRD, deposits, principal]);

  // Build chart series: monthly points from open → maturity
  const chartData: ChartPoint[] = useMemo(() => {
    if (!annualRate || !openDate || !maturity) return [];
    const months = monthsBetween(openDate, maturity);
    if (months <= 0) return [];
    const points: ChartPoint[] = [];
    const today = new Date(`${todayIso}T00:00:00Z`).getTime();
    for (let m = 0; m <= months; m++) {
      const iso = addMonthsIso(openDate, m);
      const pointMs = new Date(`${iso}T00:00:00Z`).getTime();
      let cumPrincipal: Decimal;
      let value: Decimal;
      if (!isRD) {
        cumPrincipal = principal;
        value = accruedValue({
          principal,
          rate: annualRate,
          startIso: openDate,
          valuationIso: iso,
          periodsPerYear,
        });
      } else {
        // RD: sum across deposits made on or before this point
        cumPrincipal = new Decimal(0);
        value = new Decimal(0);
        for (const t of deposits) {
          const depMs = new Date(`${t.tradeDate}T00:00:00Z`).getTime();
          if (depMs > pointMs) continue;
          const p = new Decimal(t.price).times(new Decimal(t.quantity));
          cumPrincipal = cumPrincipal.plus(p);
          value = value.plus(accruedValue({
            principal: p,
            rate: annualRate,
            startIso: t.tradeDate,
            valuationIso: iso,
            periodsPerYear,
          }));
        }
        // For future RD installments not yet deposited, project at monthly amount
        if (deposits.length > 0 && pointMs > today) {
          const monthly = new Decimal(primary?.price ?? deposits[0]!.price)
            .times(new Decimal(primary?.quantity ?? deposits[0]!.quantity));
          // Add scheduled installments from last deposit to this point
          const lastDeposit = deposits[deposits.length - 1]!;
          const startMs = new Date(`${lastDeposit.tradeDate}T00:00:00Z`).getTime();
          for (let k = 1; ; k++) {
            const futureIso = addMonthsIso(lastDeposit.tradeDate, k);
            const futureMs = new Date(`${futureIso}T00:00:00Z`).getTime();
            if (futureMs <= startMs) continue;
            if (futureMs > pointMs) break;
            const matIso = maturity;
            const matMs = new Date(`${matIso}T00:00:00Z`).getTime();
            if (futureMs > matMs) break;
            cumPrincipal = cumPrincipal.plus(monthly);
            value = value.plus(accruedValue({
              principal: monthly,
              rate: annualRate,
              startIso: futureIso,
              valuationIso: iso,
              periodsPerYear,
            }));
          }
        }
      }
      const labelDate = new Date(`${iso}T00:00:00Z`);
      const label = labelDate.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });
      points.push({
        date: iso,
        label,
        principal: Number(cumPrincipal.toFixed(2)),
        value: Number(value.toFixed(2)),
        isToday: Math.abs(pointMs - today) < 16 * 24 * 60 * 60 * 1000,
      });
    }
    return points;
  }, [annualRate, openDate, maturity, periodsPerYear, isRD, deposits, principal, primary, todayIso]);

  const todayChartLabel = chartData.find((p) => {
    const ms = new Date(`${p.date}T00:00:00Z`).getTime();
    const todayMs = new Date(`${todayIso}T00:00:00Z`).getTime();
    return ms >= todayMs;
  })?.label;

  const elapsedPct = openDate && maturity
    ? Math.min(100, Math.max(0, (
        (Date.now() - new Date(`${openDate}T00:00:00Z`).getTime()) /
        (new Date(`${maturity}T00:00:00Z`).getTime() - new Date(`${openDate}T00:00:00Z`).getTime())
      ) * 100))
    : null;

  function openEdit(txn: TransactionDTO) {
    setEditTxn(txn);
    setEditOpen(true);
  }

  const certNo = holding.id.slice(-6).toUpperCase();

  return (
    <div className="min-h-screen bg-background">
      {/* Sticky nav */}
      <div className="sticky top-0 z-10 bg-background/80 backdrop-blur border-b px-4 sm:px-6 py-3 flex items-center gap-3">
        <Button variant="ghost" size="sm" className="gap-1.5 -ml-2" onClick={() => navigate('/fds')}>
          <ArrowLeft className="h-4 w-4" />
          FDs & RDs
        </Button>
        <div className="h-4 w-px bg-border" />
        <p className="font-medium text-sm truncate flex-1">{holding.assetName}</p>
        {primary && (
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => openEdit(primary)}>
            <Pencil className="h-3.5 w-3.5" /> Edit
          </Button>
        )}
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* ── Hero card (certificate style) ── */}
        <div className="relative paper rounded-2xl border border-accent/30 shadow-elev-lg overflow-hidden">
          <div className="h-[3px] w-full bg-gradient-to-r from-accent/40 via-accent/85 to-accent/40" />
          <div className="h-px w-full bg-accent/30" />
          <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_90%_15%,hsl(var(--accent)/0.10),transparent_55%)]" />

          <div className="relative px-6 sm:px-8 py-7">
            <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
              <div className="flex items-center gap-3">
                <span className="inline-flex items-center justify-center h-9 w-9 rounded-md bg-accent/10 ring-1 ring-accent/30 text-accent">
                  <Icon className="h-5 w-5" strokeWidth={1.8} />
                </span>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[10px] uppercase tracking-[0.28em] text-accent leading-none">
                      {titleNoun}
                    </span>
                    <span className="text-accent/30">·</span>
                    <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground leading-none">
                      № {certNo}
                    </span>
                  </div>
                  <h1 className="font-display text-3xl sm:text-4xl mt-1 leading-tight truncate">
                    {holding.assetName}
                  </h1>
                  <p className="text-xs text-muted-foreground mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    {tenureMonths && <span>{tenureMonths}-month term</span>}
                    {freq && <><span className="text-muted-foreground/40">·</span><span>{FREQ_LABELS[freq] ?? freq}</span></>}
                    {holding.portfolioName && <><span className="text-muted-foreground/40">·</span><span>{holding.portfolioName}</span></>}
                  </p>
                </div>
              </div>
              {rate != null && (
                <div className="text-right shrink-0">
                  <p className="font-display text-5xl text-accent leading-none tabular-nums">
                    {rate.toString()}
                    <span className="text-2xl align-top">%</span>
                  </p>
                  <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.28em] text-muted-foreground">
                    per annum
                  </p>
                </div>
              )}
            </div>

            {/* Timeline */}
            {elapsedPct !== null && openDate && maturity && (
              <div className="mt-5">
                <div className="flex items-center gap-3 mb-2">
                  <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                    Term progress
                  </p>
                  <MaturityBadge date={maturity} />
                </div>
                <div className="relative h-2 rounded-sm bg-muted/70 overflow-visible">
                  <div
                    className="absolute inset-y-0 left-0 rounded-sm bg-gradient-to-r from-accent/70 via-accent to-accent/80"
                    style={{ width: `${elapsedPct}%` }}
                  />
                  <span
                    className="absolute top-1/2 -translate-y-1/2 h-3 w-3 rotate-45 bg-accent ring-2 ring-card"
                    style={{ left: `calc(${elapsedPct}% - 6px)` }}
                  />
                </div>
                <div className="mt-2 flex items-center justify-between font-mono text-[10px] tabular-nums text-muted-foreground">
                  <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{openDate}</span>
                  <span className="text-foreground/70 font-medium">{Math.round(elapsedPct)}% elapsed</span>
                  <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{maturity}</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Stats grid ── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Stat
            label={isRD ? 'Total Deposited' : 'Principal'}
            value={formatINR(principal.toString())}
            icon={Landmark}
          />
          <Stat
            label="Current Value"
            value={currentValue ? formatINR(currentValue.toString()) : '—'}
            highlight="accent"
            icon={TrendingUp}
          />
          <Stat
            label="Interest Earned"
            value={earned
              ? `${earned.gte(0) ? '+' : ''}${formatINR(earned.toString())}`
              : '—'}
            sub={earnedPct != null ? `${earnedPct >= 0 ? '+' : ''}${earnedPct.toFixed(2)}%` : undefined}
            highlight={earned ? (earned.gte(0) ? 'positive' : 'negative') : undefined}
            icon={Sparkles}
          />
          <Stat
            label="At Maturity"
            value={maturityValue ? formatINR(maturityValue.toString()) : '—'}
            sub={maturity ? `on ${maturity}` : undefined}
            icon={Hash}
          />
        </div>

        {/* ── Growth chart ── */}
        {chartData.length > 1 && (
          <div className="rounded-2xl border bg-card overflow-hidden">
            <div className="px-5 pt-4 pb-2 flex items-baseline justify-between gap-3 flex-wrap">
              <div>
                <h3 className="font-display text-lg">Projected growth</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {isRD ? 'Cumulative principal + compounded interest, installment by installment' : 'Principal compounding to maturity'}
                </p>
              </div>
              <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-sm bg-accent/70" />
                  Total value
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-0.5 w-3 bg-muted-foreground/50" />
                  Principal
                </span>
              </div>
            </div>
            <div className="px-2 pb-3">
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 4 }}>
                  <defs>
                    <linearGradient id="valueGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(var(--accent))" stopOpacity="0.5" />
                      <stop offset="100%" stopColor="hsl(var(--accent))" stopOpacity="0.02" />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="label"
                    stroke="hsl(var(--muted-foreground))"
                    fontSize={10}
                    tickLine={false}
                    axisLine={false}
                    minTickGap={28}
                  />
                  <YAxis
                    stroke="hsl(var(--muted-foreground))"
                    fontSize={10}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v) => {
                      if (v >= 10_000_000) return `${(v / 10_000_000).toFixed(1)}Cr`;
                      if (v >= 100_000) return `${(v / 100_000).toFixed(1)}L`;
                      if (v >= 1000) return `${(v / 1000).toFixed(0)}K`;
                      return String(v);
                    }}
                    width={55}
                  />
                  <Tooltip
                    contentStyle={{
                      background: 'hsl(var(--popover))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                    formatter={(v: number, name: string) => [formatINR(v.toString()), name === 'value' ? 'Total value' : 'Principal']}
                    labelStyle={{ color: 'hsl(var(--muted-foreground))', fontSize: 11 }}
                  />
                  {todayChartLabel && (
                    <ReferenceLine x={todayChartLabel} stroke="hsl(var(--accent))" strokeDasharray="2 4" label={{ value: 'Today', fontSize: 10, fill: 'hsl(var(--accent))', position: 'top' }} />
                  )}
                  <Area
                    type="monotone"
                    dataKey="principal"
                    stroke="hsl(var(--muted-foreground))"
                    strokeWidth={1}
                    strokeDasharray="3 3"
                    fill="transparent"
                  />
                  <Area
                    type="monotone"
                    dataKey="value"
                    stroke="hsl(var(--accent))"
                    strokeWidth={2.5}
                    fill="url(#valueGradient)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* ── Transactions ── */}
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-foreground/80 mb-3 px-0.5">
            Transactions
          </h3>
          {txnLoading ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Loading…</p>
          ) : sorted.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center border rounded-lg">
              No transactions for this deposit.
            </p>
          ) : (
            <div className="rounded-xl border divide-y overflow-hidden">
              {[...sorted].reverse().map((t) => {
                const amount = new Decimal(t.quantity).times(new Decimal(t.price));
                const isCredit = ['DEPOSIT', 'INTEREST_RECEIVED', 'MATURITY', 'OPENING_BALANCE'].includes(t.transactionType);
                return (
                  <div key={t.id} className="flex items-center gap-4 px-5 py-3.5 hover:bg-muted/20 transition-colors">
                    <div className={`h-9 w-9 rounded-md flex items-center justify-center shrink-0
                      ${isCredit ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400'
                                  : 'bg-rose-50 dark:bg-rose-950/30 text-rose-600 dark:text-rose-400'}`}>
                      {isCredit ? <TrendingUp className="h-4 w-4" /> : <Clock className="h-4 w-4" />}
                    </div>
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
                      {t.narration && (
                        <p className="text-xs text-muted-foreground/80 truncate mt-0.5">{t.narration}</p>
                      )}
                    </div>
                    <div className="text-right shrink-0 flex items-center gap-2">
                      <p className="font-semibold tabular-nums">{formatINR(amount.toString())}</p>
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-muted-foreground"
                        onClick={() => openEdit(t)}>
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

      <FDFormDialog
        open={editOpen}
        onOpenChange={(o) => { setEditOpen(o); if (!o) setEditTxn(null); }}
        initial={editTxn}
        defaultAssetClass={holding.assetClass}
      />
    </div>
  );
}
