import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  ArrowLeft, Pencil, PiggyBank, CalendarClock, Clock, Calendar,
  TrendingUp, Landmark, Hash, Sparkles, Plus, Check, Undo2, Trash2, Loader2,
} from 'lucide-react';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine,
  PieChart, Pie, Cell, Legend,
} from 'recharts';
import { Decimal, formatINR, type HoldingRow, type TransactionDTO } from '@portfolioos/shared';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { apiErrorMessage } from '@/api/client';
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
  OPENING_BALANCE: 'Opening balance',
};

const TXN_COLORS: Record<string, string> = {
  DEPOSIT: 'text-foreground',
  INTEREST_RECEIVED: 'text-positive',
  MATURITY: 'text-positive',
  OPENING_BALANCE: 'text-muted-foreground',
  WITHDRAWAL: 'text-amber-600',
};

const TOOLTIP_STYLE: React.CSSProperties = {
  background: 'hsl(var(--popover))',
  border: '1px solid hsl(var(--border))',
  borderRadius: 8,
  fontSize: 11,
};
const TOOLTIP_LABEL_STYLE: React.CSSProperties = {
  color: 'hsl(var(--muted-foreground))',
  fontSize: 11,
};

// Distinct chart palettes so the detail page isn't a wall of accent gold.
// Growth = sky/indigo (forward-looking), Composition donut = indigo+emerald,
// Accrual split = violet (principal) vs emerald (interest).
const CHART_GROWTH = '#3b82f6';        // blue-500
const CHART_GROWTH_DIM = '#93c5fd';    // blue-300
const CHART_PRINCIPAL = '#8b5cf6';     // violet-500
const CHART_INTEREST = '#10b981';      // emerald-500
const CHART_INTEREST_DIM = '#6ee7b7';  // emerald-300

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

function shortMonth(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });
}

function formatDate(iso: string | null | undefined) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

const INR_COMPACT = (v: number): string => {
  if (v >= 1e7) return `₹${(v / 1e7).toFixed(2)}Cr`;
  if (v >= 1e5) return `₹${(v / 1e5).toFixed(2)}L`;
  if (v >= 1e3) return `₹${(v / 1e3).toFixed(1)}K`;
  return `₹${v.toFixed(0)}`;
};

/**
 * Compound accrual at an arbitrary valuation date for a single deposit.
 * Matches the backend FD accrual formula in holdingsProjection.ts.
 */
function accruedValue(opts: {
  principal: Decimal;
  rate: Decimal;
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

// ── RD installment schedule ──────────────────────────────────────────
interface InstallmentRow {
  month: number;
  dueDate: string;
  expectedAmount: Decimal;
  cumulativePrincipal: Decimal;
  projectedValue: Decimal;
  paidTxn: TransactionDTO | null;
  isOverdue: boolean;
}

function InstallmentSchedule({
  rows,
  holding,
  monthlyAmount,
  rate,
  freq,
  onAdd,
  onUndoPayment,
}: {
  rows: InstallmentRow[];
  holding: FDHolding;
  monthlyAmount: Decimal;
  rate: Decimal;
  freq: string;
  onAdd: (dueDate: string) => void;
  onUndoPayment: (paymentId: string) => void;
  isAdding: boolean;
  pendingUndoId: string | null;
}) {
  const [showAll, setShowAll] = useState(false);
  const INITIAL_SHOW = 12;
  const displayed = showAll ? rows : rows.slice(0, INITIAL_SHOW);
  const paidCount = rows.filter((r) => r.paidTxn).length;
  void holding; void rate; void freq; void monthlyAmount;
  return (
    <Card>
      <CardHeader className="pb-3 flex flex-row items-center justify-between gap-3">
        <CardTitle className="text-lg flex items-baseline gap-2">
          Installment schedule
          <span className="text-xs font-normal text-muted-foreground">
            {paidCount} / {rows.length} paid
          </span>
        </CardTitle>
        {rows.length > INITIAL_SHOW && (
          <Button variant="ghost" size="sm" onClick={() => setShowAll((v) => !v)}>
            {showAll ? 'Show less' : `Show all ${rows.length}`}
          </Button>
        )}
      </CardHeader>
      <CardContent>
        <div className="max-h-[500px] overflow-y-auto overflow-x-auto rounded-md border">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-muted/50 backdrop-blur z-10">
              <tr className="border-b">
                <th className="text-left py-2 px-3 font-medium text-muted-foreground w-10">#</th>
                <th className="text-left py-2 px-3 font-medium text-muted-foreground">Due date</th>
                <th className="text-right py-2 px-3 font-medium text-muted-foreground">Installment</th>
                <th className="text-right py-2 px-3 font-medium text-muted-foreground hidden sm:table-cell">Cumulative principal</th>
                <th className="text-right py-2 px-3 font-medium text-muted-foreground hidden md:table-cell">Projected value</th>
                <th className="text-left py-2 px-3 font-medium text-muted-foreground">Status</th>
                <th className="text-right py-2 px-3 font-medium text-muted-foreground w-32">Action</th>
              </tr>
            </thead>
            <tbody>
              {displayed.map((r) => {
                const paid = r.paidTxn != null;
                const rowCls = paid ? 'bg-emerald-50/40 dark:bg-emerald-950/10' : r.isOverdue ? 'bg-rose-50/40 dark:bg-rose-950/10' : '';
                return (
                  <tr key={r.month} className={`border-b last:border-0 ${rowCls}`}>
                    <td className="py-1.5 px-3 tabular-nums text-muted-foreground">{r.month}</td>
                    <td className="py-1.5 px-3 tabular-nums">{formatDate(r.dueDate)}</td>
                    <td className="py-1.5 px-3 text-right tabular-nums font-medium">{formatINR(r.expectedAmount.toString())}</td>
                    <td className="py-1.5 px-3 text-right tabular-nums text-muted-foreground hidden sm:table-cell">
                      {formatINR(r.cumulativePrincipal.toString())}
                    </td>
                    <td className="py-1.5 px-3 text-right tabular-nums text-muted-foreground hidden md:table-cell">
                      {formatINR(r.projectedValue.toString())}
                    </td>
                    <td className="py-1.5 px-3">
                      {paid ? (
                        <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                          Paid {r.paidTxn?.tradeDate ? formatDate(r.paidTxn.tradeDate) : ''}
                        </span>
                      ) : r.isOverdue ? (
                        <span className="text-rose-600 dark:text-rose-400 font-medium">Overdue</span>
                      ) : (
                        <span className="text-muted-foreground">Upcoming</span>
                      )}
                    </td>
                    <td className="py-1.5 px-3 text-right">
                      {paid ? (
                        <Button
                          size="sm" variant="ghost"
                          className="h-7 px-2 text-xs text-muted-foreground hover:text-destructive"
                          onClick={() => r.paidTxn && onUndoPayment(r.paidTxn.id)}
                        >
                          <Undo2 className="h-3 w-3 mr-1" /> Undo
                        </Button>
                      ) : (
                        <Button
                          size="sm" variant="outline"
                          className="h-7 px-2 text-xs"
                          onClick={() => onAdd(r.dueDate)}
                        >
                          <Check className="h-3 w-3 mr-1" /> Mark paid
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

// Unified row type so the log can mix real Transaction rows with synthetic
// interest accruals computed from the deposit's rate/frequency.
interface LogRow {
  key: string;
  date: string;
  type: string;
  amount: Decimal;
  notes: string | null;
  txn: TransactionDTO | null; // null → synthetic (no edit/delete)
}

// ── Payment history (transaction log) ────────────────────────────────
function PaymentHistory({
  rows,
  onEdit,
  onDelete,
}: {
  rows: LogRow[];
  onEdit: (txn: TransactionDTO) => void;
  onDelete: (id: string) => void;
}) {
  const [confirmId, setConfirmId] = useState<string | null>(null);
  if (rows.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-lg">Payment log</CardTitle></CardHeader>
        <CardContent><p className="text-sm text-muted-foreground py-3">No payments recorded yet.</p></CardContent>
      </Card>
    );
  }
  return (
    <Card>
      <CardHeader className="pb-3 flex flex-row items-baseline justify-between">
        <CardTitle className="text-lg flex items-baseline gap-2">
          Payment log
          <span className="text-xs font-normal text-muted-foreground">{rows.length} records</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="max-h-[500px] overflow-y-auto overflow-x-auto rounded-md border">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-muted/50 backdrop-blur z-10">
              <tr className="border-b">
                <th className="text-left py-2 px-3 font-medium text-muted-foreground">Date</th>
                <th className="text-left py-2 px-3 font-medium text-muted-foreground">Type</th>
                <th className="text-right py-2 px-3 font-medium text-muted-foreground">Amount</th>
                <th className="text-left py-2 px-3 font-medium text-muted-foreground hidden md:table-cell">Notes</th>
                <th className="w-20 py-2 px-3 text-right font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const t = r.txn;
                const isSynthetic = !t;
                return (
                  <tr key={r.key} className={`border-b last:border-0 group hover:bg-muted/20 ${isSynthetic ? 'bg-emerald-50/30 dark:bg-emerald-950/10' : ''}`}>
                    <td className="py-2 px-3 tabular-nums">{formatDate(r.date)}</td>
                    <td className={`py-2 px-3 font-medium ${TXN_COLORS[r.type] ?? ''}`}>
                      <span className="inline-flex items-center gap-1.5">
                        {TXN_LABEL[r.type] ?? r.type}
                        {isSynthetic && (
                          <span className="px-1.5 py-0.5 rounded text-[9px] uppercase tracking-wider font-semibold"
                            style={{ background: `${CHART_INTEREST}22`, color: CHART_INTEREST }}>
                            accrued
                          </span>
                        )}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-right tabular-nums font-medium"
                      style={isSynthetic ? { color: CHART_INTEREST } : undefined}>
                      {isSynthetic ? '+' : ''}{formatINR(r.amount.toString())}
                    </td>
                    <td className="py-2 px-3 text-muted-foreground hidden md:table-cell max-w-[200px] truncate">
                      {r.notes ?? (isSynthetic ? 'Computed from rate & frequency' : '—')}
                    </td>
                    <td className="py-2 px-3 text-right">
                      {isSynthetic ? (
                        <span className="text-[10px] text-muted-foreground/60">—</span>
                      ) : confirmId === t!.id ? (
                        <div className="flex gap-1 justify-end">
                          <Button size="sm" variant="destructive" className="h-6 px-2 text-xs"
                            onClick={() => { onDelete(t!.id); setConfirmId(null); }}>
                            Yes
                          </Button>
                          <Button size="sm" variant="ghost" className="h-6 px-2 text-xs"
                            onClick={() => setConfirmId(null)}>No</Button>
                        </div>
                      ) : (
                        <div className="flex gap-0.5 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => onEdit(t!)} title="Edit">
                            <Pencil className="h-3 w-3" />
                          </Button>
                          <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                            onClick={() => setConfirmId(t!.id)} title="Delete">
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

interface ChartPoint {
  date: string;
  label: string;
  principal: number;
  interest: number;
  value: number;
}

export function FdDetailPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const { holdingId } = useParams<{ holdingId: string }>();
  const [editTxn, setEditTxn] = useState<TransactionDTO | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [pendingUndoId, setPendingUndoId] = useState<string | null>(null);
  void holdingId;

  const holding = location.state?.holding as FDHolding | undefined;

  useEffect(() => {
    if (!holding) navigate('/fds', { replace: true });
  }, [holding, navigate]);

  const { data: txnData, isLoading: txnLoading } = useQuery({
    queryKey: ['transactions', holding?.assetClass],
    queryFn: () => transactionsApi.list({ assetClass: holding!.assetClass, pageSize: 500 }),
    enabled: !!holding,
  });

  function invalidateAll() {
    queryClient.invalidateQueries({ queryKey: ['transactions'] });
    queryClient.invalidateQueries({ queryKey: ['portfolio-holdings'] });
    queryClient.invalidateQueries({ queryKey: ['portfolios'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  }

  const deleteMutation = useMutation({
    mutationFn: (id: string) => transactionsApi.remove(id),
    onSuccess: () => { toast.success('Entry removed'); invalidateAll(); },
    onError: (err) => toast.error(apiErrorMessage(err, 'Failed to delete')),
  });

  const addMutation = useMutation({
    mutationFn: (input: Parameters<typeof transactionsApi.create>[0]) => transactionsApi.create(input),
    onSuccess: () => { toast.success('Installment marked paid'); invalidateAll(); },
    onError: (err) => toast.error(apiErrorMessage(err, 'Failed to mark paid')),
  });

  if (!holding) return null;

  const isRD = holding.assetClass === 'RECURRING_DEPOSIT';
  const titleNoun = isRD ? 'Recurring Deposit' : 'Fixed Deposit';
  const Icon = isRD ? CalendarClock : PiggyBank;

  // Filter txns for this holding. We try progressively looser matches so a
  // tiny inconsistency in stored asset names (extra spaces, slightly different
  // case, partial bank-name typo) doesn't leave the detail page empty.
  const allTxns = (txnData?.items ?? []).filter(
    (t) => (!holding.portfolioId || t.portfolioId === holding.portfolioId) &&
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
      const exact = allTxns.filter((t) => normalizeText(t.assetName) === name);
      if (exact.length > 0) return exact;
      const partial = allTxns.filter((t) => {
        const tn = normalizeText(t.assetName);
        return tn && (tn.includes(name) || name.includes(tn));
      });
      if (partial.length > 0) return partial;
    }
    // Last resort: show every txn in this portfolio + class so the user at
    // least sees their entries, rather than an empty page.
    return allTxns;
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
  const monthlyAmount = primary
    ? new Decimal(primary.price).times(new Decimal(primary.quantity))
    : new Decimal(0);
  const todayIso = new Date().toISOString().slice(0, 10);

  const principal = new Decimal(holding.totalCost);
  const currentValue = holding.currentValue ? new Decimal(holding.currentValue) : null;
  const earned = currentValue ? currentValue.minus(principal) : null;
  const earnedPct = earned && !principal.isZero() ? earned.div(principal).times(100).toNumber() : null;

  // Projected maturity value
  const maturityValue = useMemo(() => {
    if (!annualRate || !openDate || !maturity) return null;
    if (!isRD) {
      return accruedValue({
        principal,
        rate: annualRate,
        startIso: openDate,
        valuationIso: maturity,
        periodsPerYear,
      });
    }
    // RD: future installments at the same monthly amount
    if (tenureMonths == null || tenureMonths <= 0) return null;
    let total = new Decimal(0);
    for (let m = 0; m < tenureMonths; m++) {
      const depDate = addMonthsIso(openDate, m);
      total = total.plus(accruedValue({
        principal: monthlyAmount,
        rate: annualRate,
        startIso: depDate,
        valuationIso: maturity,
        periodsPerYear,
      }));
    }
    return total;
  }, [annualRate, openDate, maturity, periodsPerYear, isRD, principal, tenureMonths, monthlyAmount]);

  const totalInterest = maturityValue && tenureMonths
    ? maturityValue.minus(isRD ? monthlyAmount.times(tenureMonths) : principal)
    : null;
  const totalPrincipalAtMaturity = isRD && tenureMonths ? monthlyAmount.times(tenureMonths) : principal;

  // Build chart series — value, principal, interest at each month from open → maturity
  const chartData: ChartPoint[] = useMemo(() => {
    if (!annualRate || !openDate || !maturity) return [];
    const months = monthsBetween(openDate, maturity);
    if (months <= 0) return [];
    const points: ChartPoint[] = [];
    for (let m = 0; m <= months; m++) {
      const iso = addMonthsIso(openDate, m);
      let cumPrincipal: Decimal;
      let value: Decimal;
      if (!isRD) {
        cumPrincipal = principal;
        value = accruedValue({
          principal, rate: annualRate, startIso: openDate, valuationIso: iso, periodsPerYear,
        });
      } else {
        cumPrincipal = new Decimal(0);
        value = new Decimal(0);
        for (let k = 0; k < m && k < (tenureMonths ?? months); k++) {
          const depDate = addMonthsIso(openDate, k);
          cumPrincipal = cumPrincipal.plus(monthlyAmount);
          value = value.plus(accruedValue({
            principal: monthlyAmount, rate: annualRate,
            startIso: depDate, valuationIso: iso, periodsPerYear,
          }));
        }
      }
      points.push({
        date: iso,
        label: shortMonth(iso),
        principal: Number(cumPrincipal.toFixed(2)),
        interest: Number(value.minus(cumPrincipal).toFixed(2)),
        value: Number(value.toFixed(2)),
      });
    }
    return points;
  }, [annualRate, openDate, maturity, periodsPerYear, isRD, principal, monthlyAmount, tenureMonths]);

  const todayChartLabel = useMemo(() => {
    const todayMs = new Date(`${todayIso}T00:00:00Z`).getTime();
    return chartData.find((p) => new Date(`${p.date}T00:00:00Z`).getTime() >= todayMs)?.label;
  }, [chartData, todayIso]);

  // Installment schedule (RD only)
  const installments: InstallmentRow[] = useMemo(() => {
    if (!isRD || !openDate || !annualRate || tenureMonths == null) return [];
    const rows: InstallmentRow[] = [];
    let cumPrincipal = new Decimal(0);
    for (let m = 1; m <= tenureMonths; m++) {
      const dueDate = addMonthsIso(openDate, m - 1);
      cumPrincipal = cumPrincipal.plus(monthlyAmount);
      const projectedValue = (() => {
        let v = new Decimal(0);
        for (let k = 0; k < m; k++) {
          const depDate = addMonthsIso(openDate, k);
          v = v.plus(accruedValue({
            principal: monthlyAmount, rate: annualRate,
            startIso: depDate, valuationIso: dueDate, periodsPerYear,
          }));
        }
        return v;
      })();
      // Match a DEPOSIT txn to this slot — by month index of tradeDate
      const paidTxn = deposits.find((t) => {
        const tm = monthsBetween(openDate, t.tradeDate);
        return tm === m - 1;
      }) ?? null;
      rows.push({
        month: m,
        dueDate,
        expectedAmount: monthlyAmount,
        cumulativePrincipal: cumPrincipal,
        projectedValue,
        paidTxn,
        isOverdue: !paidTxn && dueDate < todayIso,
      });
    }
    return rows;
  }, [isRD, openDate, annualRate, tenureMonths, monthlyAmount, periodsPerYear, deposits, todayIso]);

  // Build the unified payment log: real txns + synthetic interest credits
  // for every payout period from open date → today. RD doesn't accrue interim
  // payouts (it pays at maturity) so we only synthesize for FD here.
  const logRows: LogRow[] = useMemo(() => {
    const rows: LogRow[] = sorted.map((t) => ({
      key: `t:${t.id}`,
      date: t.tradeDate,
      type: t.transactionType,
      amount: new Decimal(t.quantity).times(new Decimal(t.price)),
      notes: t.narration ?? null,
      txn: t,
    }));

    if (!isRD && openDate && annualRate && freq && freq !== 'AT_MATURITY') {
      const periodMonths = 12 / periodsPerYear;
      // Per-period simple interest on running principal (matches how banks
      // credit payout FDs — they keep the principal flat and pay interest
      // out each period).
      const perPeriod = principal.times(annualRate).div(periodsPerYear);
      const endIso = maturity && maturity < todayIso ? maturity : todayIso;
      let m = periodMonths;
      while (true) {
        const date = addMonthsIso(openDate, m);
        if (date > endIso) break;
        const hasReal = sorted.some(
          (t) => t.transactionType === 'INTEREST_RECEIVED' && t.tradeDate === date,
        );
        if (!hasReal) {
          rows.push({
            key: `syn:int:${date}`,
            date,
            type: 'INTEREST_RECEIVED',
            amount: perPeriod,
            notes: null,
            txn: null,
          });
        }
        m += periodMonths;
      }
    }

    // Newest first.
    rows.sort((a, b) => b.date.localeCompare(a.date));
    return rows;
  }, [sorted, isRD, openDate, annualRate, freq, periodsPerYear, principal, maturity, todayIso]);

  function openEdit(txn: TransactionDTO) {
    setEditTxn(txn);
    setEditOpen(true);
  }

  function markInstallmentPaid(dueDate: string) {
    if (!primary || !holding?.portfolioId) return;
    const h = holding;
    addMutation.mutate({
      portfolioId: h.portfolioId!,
      assetClass: 'RECURRING_DEPOSIT' as const,
      transactionType: 'DEPOSIT',
      assetName: h.assetName,
      isin: h.isin ?? undefined,
      tradeDate: dueDate,
      quantity: Number(primary.quantity),
      price: Number(primary.price),
      interestRate: primary.interestRate != null ? Number(primary.interestRate) : undefined,
      interestFrequency: primary.interestFrequency ?? undefined,
      maturityDate: primary.maturityDate ?? undefined,
    });
  }

  function undoInstallmentPaid(txnId: string) {
    setPendingUndoId(txnId);
    deleteMutation.mutate(txnId, {
      onSettled: () => setPendingUndoId(null),
    });
  }

  // Composition pie data — distinct hues to break the gold monotony
  const pieData = totalInterest
    ? [
        { name: 'Principal', value: Number(totalPrincipalAtMaturity.toFixed(2)) },
        { name: 'Interest', value: Number(totalInterest.toFixed(2)) },
      ]
    : null;
  const pieColors = [CHART_PRINCIPAL, CHART_INTEREST];

  const elapsedPct = openDate && maturity
    ? Math.min(100, Math.max(0, (
        (Date.now() - new Date(`${openDate}T00:00:00Z`).getTime()) /
        (new Date(`${maturity}T00:00:00Z`).getTime() - new Date(`${openDate}T00:00:00Z`).getTime())
      ) * 100))
    : null;

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
        <Button variant="outline" size="sm" className="gap-1.5"
          onClick={() => { setEditTxn(null); setEditOpen(true); }}>
          <Plus className="h-3.5 w-3.5" /> Log payment
        </Button>
        {primary && (
          <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => openEdit(primary)}>
            <Pencil className="h-3.5 w-3.5" /> Edit
          </Button>
        )}
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* ── Hero ── */}
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

            {elapsedPct !== null && openDate && maturity && (
              <div className="mt-5">
                <div className="flex items-center gap-3 mb-2">
                  <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                    Term progress
                  </p>
                  <MaturityBadge date={maturity} />
                </div>
                <div className="relative h-2 rounded-sm bg-muted/70 overflow-visible">
                  <div className="absolute inset-y-0 left-0 rounded-sm bg-gradient-to-r from-accent/70 via-accent to-accent/80"
                    style={{ width: `${elapsedPct}%` }} />
                  <span className="absolute top-1/2 -translate-y-1/2 h-3 w-3 rotate-45 bg-accent ring-2 ring-card"
                    style={{ left: `calc(${elapsedPct}% - 6px)` }} />
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
          <Stat label={isRD ? 'Total Deposited' : 'Principal'} value={formatINR(principal.toString())} icon={Landmark} />
          <Stat label="Current Value" value={currentValue ? formatINR(currentValue.toString()) : '—'} highlight="accent" icon={TrendingUp} />
          <Stat
            label="Interest Earned"
            value={earned ? `${earned.gte(0) ? '+' : ''}${formatINR(earned.toString())}` : '—'}
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

        {/* Missing-data CTA */}
        {(!rate || !maturity) && (
          <div className="rounded-xl border border-dashed border-amber-300 dark:border-amber-700 bg-amber-50/50 dark:bg-amber-950/20 px-4 py-3 flex items-center gap-3">
            <Sparkles className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
            <p className="text-xs text-amber-700 dark:text-amber-300 flex-1">
              {!rate && !maturity
                ? 'Add interest rate and maturity date to see growth charts, maturity projection, and installment schedule.'
                : !rate
                  ? 'Add interest rate to see growth charts and maturity projection.'
                  : 'Add maturity date to see growth charts and installment schedule.'}
            </p>
            {primary && (
              <Button size="sm" variant="outline" className="border-amber-400 dark:border-amber-700 text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/30"
                onClick={() => openEdit(primary)}>
                <Pencil className="h-3 w-3 mr-1" /> Edit details
              </Button>
            )}
          </div>
        )}

        {/* ── Charts ── */}
        {chartData.length > 1 && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            {/* Growth area chart */}
            <Card className="lg:col-span-2">
              <CardHeader className="pb-2 flex flex-row items-baseline justify-between gap-3">
                <CardTitle className="text-lg">Projected growth</CardTitle>
                <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                  <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm" style={{ background: CHART_GROWTH }} /> Value</span>
                  <span className="flex items-center gap-1"><span className="h-0.5 w-3 bg-muted-foreground/50" /> Principal</span>
                </div>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={260}>
                  <AreaChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
                    <defs>
                      <linearGradient id="gradValue" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={CHART_GROWTH} stopOpacity={0.45} />
                        <stop offset="100%" stopColor={CHART_GROWTH} stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis dataKey="label" fontSize={10} tickLine={false} axisLine={false} minTickGap={28}
                      stroke="hsl(var(--muted-foreground))" />
                    <YAxis fontSize={10} tickLine={false} axisLine={false} width={55}
                      stroke="hsl(var(--muted-foreground))" tickFormatter={INR_COMPACT} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={TOOLTIP_LABEL_STYLE}
                      formatter={(v: number, name: string) => [formatINR(String(v)), name === 'value' ? 'Total value' : 'Principal']} />
                    {todayChartLabel && (
                      <ReferenceLine x={todayChartLabel} stroke={CHART_GROWTH_DIM} strokeDasharray="2 4"
                        label={{ value: 'Today', fontSize: 10, fill: CHART_GROWTH, position: 'top' }} />
                    )}
                    <Area type="monotone" dataKey="principal" stroke="hsl(var(--muted-foreground))"
                      strokeWidth={1} strokeDasharray="3 3" fill="transparent" />
                    <Area type="monotone" dataKey="value" stroke={CHART_GROWTH} strokeWidth={2.5}
                      fill="url(#gradValue)" />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Composition donut */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">Maturity composition</CardTitle>
              </CardHeader>
              <CardContent>
                {pieData ? (
                  <>
                    <ResponsiveContainer width="100%" height={180}>
                      <PieChart>
                        <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={42} outerRadius={72}
                          paddingAngle={2} stroke="hsl(var(--card))" strokeWidth={2}>
                          {pieData.map((_, i) => <Cell key={i} fill={pieColors[i]} />)}
                        </Pie>
                        <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={TOOLTIP_LABEL_STYLE}
                          formatter={(v: number, name: string) => [formatINR(String(v)), name]} />
                        <Legend wrapperStyle={{ fontSize: 10, paddingTop: 4 }} iconType="circle" iconSize={8} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="space-y-1.5 text-xs mt-2 border-t pt-3">
                      <div className="flex justify-between">
                        <span className="flex items-center gap-1.5 text-muted-foreground">
                          <span className="h-2 w-2 rounded-full" style={{ background: CHART_PRINCIPAL }} /> Principal
                        </span>
                        <span className="font-medium tabular-nums" style={{ color: CHART_PRINCIPAL }}>
                          {formatINR(totalPrincipalAtMaturity.toString())}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="flex items-center gap-1.5 text-muted-foreground">
                          <span className="h-2 w-2 rounded-full" style={{ background: CHART_INTEREST }} /> Interest
                        </span>
                        <span className="font-medium tabular-nums" style={{ color: CHART_INTEREST }}>
                          {formatINR((totalInterest ?? new Decimal(0)).toString())}
                        </span>
                      </div>
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground py-6 text-center">Add deposit details to see composition.</p>
                )}
              </CardContent>
            </Card>

            {/* Principal vs Interest accrual area */}
            <Card className="lg:col-span-3">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">Accrual split — principal vs interest</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={220}>
                  <AreaChart data={chartData} margin={{ top: 5, right: 12, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="gradStackedPrincipal" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={CHART_PRINCIPAL} stopOpacity={0.55} />
                        <stop offset="100%" stopColor={CHART_PRINCIPAL} stopOpacity={0.05} />
                      </linearGradient>
                      <linearGradient id="gradStackedInterest" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={CHART_INTEREST} stopOpacity={0.55} />
                        <stop offset="100%" stopColor={CHART_INTEREST} stopOpacity={0.05} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis dataKey="label" fontSize={10} tickLine={false} axisLine={false} minTickGap={28}
                      stroke="hsl(var(--muted-foreground))" />
                    <YAxis fontSize={10} tickLine={false} axisLine={false} width={55}
                      stroke="hsl(var(--muted-foreground))" tickFormatter={INR_COMPACT} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={TOOLTIP_LABEL_STYLE}
                      formatter={(v: number, name: string) => [formatINR(String(v)), name === 'principal' ? 'Principal' : 'Interest']} />
                    <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} iconType="circle" iconSize={8} />
                    <Area type="monotone" dataKey="principal" stackId="1" stroke={CHART_PRINCIPAL} strokeWidth={1.5}
                      fill="url(#gradStackedPrincipal)" name="Principal" />
                    <Area type="monotone" dataKey="interest" stackId="1" stroke={CHART_INTEREST} strokeWidth={1.5}
                      fill="url(#gradStackedInterest)" name="Interest" />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        )}

        {/* ── RD installment schedule ── */}
        {isRD && installments.length > 0 && (
          <InstallmentSchedule
            rows={installments}
            holding={holding}
            monthlyAmount={monthlyAmount}
            rate={annualRate ?? new Decimal(0)}
            freq={freq}
            onAdd={markInstallmentPaid}
            onUndoPayment={undoInstallmentPaid}
            isAdding={addMutation.isPending}
            pendingUndoId={pendingUndoId}
          />
        )}

        {/* ── Payment log ── */}
        {txnLoading ? (
          <p className="text-sm text-muted-foreground py-6 text-center">Loading payments…</p>
        ) : (
          <PaymentHistory
            rows={logRows}
            onEdit={openEdit}
            onDelete={(id) => deleteMutation.mutate(id)}
          />
        )}
      </div>

      <FDFormDialog
        open={editOpen}
        onOpenChange={(o) => { setEditOpen(o); if (!o) setEditTxn(null); }}
        initial={editTxn}
        defaultAssetClass={holding.assetClass}
        defaultPortfolioId={holding.portfolioId}
      />
    </div>
  );
}
