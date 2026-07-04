import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  ArrowLeft, Pencil, Landmark, Calendar, TrendingUp, Sparkles, Hash,
  Plus, Check, Undo2, Trash2, Percent, Wallet,
} from 'lucide-react';
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip,
  CartesianGrid, ReferenceLine, PieChart, Pie, Cell, Legend,
} from 'recharts';
import { Decimal, formatINR, type HoldingRow, type TransactionDTO } from '@portfolioos/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { apiErrorMessage } from '@/api/client';
import { transactionsApi } from '@/api/transactions.api';
import {
  accruedValue, monthsBetween, addMonthsIso, shortMonth, formatDate, daysUntil,
  normalizeText, INR_COMPACT, TOOLTIP_STYLE, TOOLTIP_LABEL_STYLE,
} from '@/lib/depositMath';
import { SCHEMES, assetClassToScheme } from '@/lib/poSchemes';
import { PostOfficeFormDialog } from './PostOfficeFormDialog';

type POHolding = HoldingRow & { portfolioName: string; portfolioId?: string };

const CHART_GROWTH = 'hsl(var(--foreground))';
const CHART_GROWTH_DIM = 'hsl(var(--muted-foreground))';
const CHART_PRINCIPAL = 'hsl(var(--positive))';
const CHART_INTEREST = 'hsl(var(--negative))';

const TXN_LABEL: Record<string, string> = {
  BUY: 'Purchase',
  DEPOSIT: 'Deposit',
  WITHDRAWAL: 'Withdrawal',
  INTEREST_RECEIVED: 'Interest credited',
  MATURITY: 'Maturity payout',
  OPENING_BALANCE: 'Opening balance',
};

const TXN_COLORS: Record<string, string> = {
  BUY: 'text-foreground',
  DEPOSIT: 'text-foreground',
  INTEREST_RECEIVED: 'text-positive',
  MATURITY: 'text-positive',
  OPENING_BALANCE: 'text-muted-foreground',
  WITHDRAWAL: 'text-amber-600',
};

interface ChartPoint {
  date: string;
  label: string;
  principal: number;
  interest: number;
  value: number;
}

interface PayoutBar {
  label: string;
  interest: number;
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

function MaturityBadge({ date }: { date: string }) {
  const d = daysUntil(date);
  if (d < 0) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide bg-muted text-muted-foreground">
        Matured {Math.abs(d)}d ago
      </span>
    );
  }
  const cls =
    d <= 30 ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400'
    : d <= 90 ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
    : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400';
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${cls}`}>
      {d}d to maturity
    </span>
  );
}

// Unified log row — real txns plus synthetic interest accruals.
interface LogRow {
  key: string;
  date: string;
  type: string;
  amount: Decimal;
  notes: string | null;
  txn: TransactionDTO | null;
}

function TransactionLog({
  rows, onEdit, onDelete,
}: {
  rows: LogRow[];
  onEdit: (txn: TransactionDTO) => void;
  onDelete: (id: string) => void;
}) {
  const [confirmId, setConfirmId] = useState<string | null>(null);
  if (rows.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-lg">Transaction log</CardTitle></CardHeader>
        <CardContent><p className="text-sm text-muted-foreground py-3">No entries recorded yet.</p></CardContent>
      </Card>
    );
  }
  return (
    <Card>
      <CardHeader className="pb-3 flex flex-row items-baseline justify-between">
        <CardTitle className="text-lg flex items-baseline gap-2">
          Transaction log
          <span className="text-xs font-normal text-muted-foreground">{rows.length} records</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="max-h-[500px] overflow-y-auto overflow-x-auto rounded-md border">
          <table className="w-full text-xs rtable">
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
                    <td data-label="Date" className="py-2 px-3 tabular-nums">{formatDate(r.date)}</td>
                    <td data-label="Type" className={`py-2 px-3 font-medium ${TXN_COLORS[r.type] ?? ''}`}>
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
                    <td data-label="Amount" className="py-2 px-3 text-right tabular-nums font-medium"
                      style={isSynthetic ? { color: CHART_INTEREST } : undefined}>
                      {isSynthetic ? '+' : ''}{formatINR(r.amount.toString())}
                    </td>
                    <td data-label="Notes" className="py-2 px-3 text-muted-foreground hidden md:table-cell max-w-[200px] truncate">
                      {r.notes ?? (isSynthetic ? 'Computed from rate & frequency' : '—')}
                    </td>
                    <td data-fullrow className="py-2 px-3 text-right">
                      {isSynthetic ? (
                        <span className="text-[10px] text-muted-foreground/60">—</span>
                      ) : confirmId === t!.id ? (
                        <div className="flex gap-1 justify-end">
                          <Button size="sm" variant="destructive" className="h-6 px-2 text-xs"
                            onClick={() => { onDelete(t!.id); setConfirmId(null); }}>Yes</Button>
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

interface InstallmentRow {
  index: number;
  dueDate: string;
  expectedAmount: Decimal;
  cumulativePrincipal: Decimal;
  paidTxn: TransactionDTO | null;
  isOverdue: boolean;
}

function InstallmentSchedule({
  rows, cadenceLabel, onAdd, onUndo,
}: {
  rows: InstallmentRow[];
  cadenceLabel: string;
  onAdd: (dueDate: string) => void;
  onUndo: (paymentId: string) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const INITIAL = 12;
  const displayed = showAll ? rows : rows.slice(0, INITIAL);
  const paidCount = rows.filter((r) => r.paidTxn).length;
  return (
    <Card>
      <CardHeader className="pb-3 flex flex-row items-center justify-between gap-3">
        <CardTitle className="text-lg flex items-baseline gap-2">
          {cadenceLabel} schedule
          <span className="text-xs font-normal text-muted-foreground">{paidCount} / {rows.length} paid</span>
        </CardTitle>
        {rows.length > INITIAL && (
          <Button variant="ghost" size="sm" onClick={() => setShowAll((v) => !v)}>
            {showAll ? 'Show less' : `Show all ${rows.length}`}
          </Button>
        )}
      </CardHeader>
      <CardContent>
        <div className="max-h-[500px] overflow-y-auto overflow-x-auto rounded-md border">
          <table className="w-full text-xs rtable">
            <thead className="sticky top-0 bg-muted/50 backdrop-blur z-10">
              <tr className="border-b">
                <th className="text-left py-2 px-3 font-medium text-muted-foreground w-10">#</th>
                <th className="text-left py-2 px-3 font-medium text-muted-foreground">Due date</th>
                <th className="text-right py-2 px-3 font-medium text-muted-foreground">Installment</th>
                <th className="text-right py-2 px-3 font-medium text-muted-foreground hidden sm:table-cell">Cumulative</th>
                <th className="text-left py-2 px-3 font-medium text-muted-foreground">Status</th>
                <th className="text-right py-2 px-3 font-medium text-muted-foreground w-32">Action</th>
              </tr>
            </thead>
            <tbody>
              {displayed.map((r) => {
                const paid = r.paidTxn != null;
                const rowCls = paid ? 'bg-emerald-50/40 dark:bg-emerald-950/10' : r.isOverdue ? 'bg-rose-50/40 dark:bg-rose-950/10' : '';
                return (
                  <tr key={r.index} className={`border-b last:border-0 ${rowCls}`}>
                    <td data-label="" className="py-1.5 px-3 tabular-nums text-muted-foreground">{r.index}</td>
                    <td data-label="Due date" className="py-1.5 px-3 tabular-nums">{formatDate(r.dueDate)}</td>
                    <td data-label="Installment" className="py-1.5 px-3 text-right tabular-nums font-medium">{formatINR(r.expectedAmount.toString())}</td>
                    <td data-label="Cumulative" className="py-1.5 px-3 text-right tabular-nums text-muted-foreground hidden sm:table-cell">
                      {formatINR(r.cumulativePrincipal.toString())}
                    </td>
                    <td data-label="Status" className="py-1.5 px-3">
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
                    <td data-fullrow className="py-1.5 px-3 text-right">
                      {paid ? (
                        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-muted-foreground hover:text-destructive"
                          onClick={() => r.paidTxn && onUndo(r.paidTxn.id)}>
                          <Undo2 className="h-3 w-3 mr-1" /> Undo
                        </Button>
                      ) : (
                        <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => onAdd(r.dueDate)}>
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

export function PostOfficeDetailPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const { holdingId } = useParams<{ holdingId: string }>();
  const [editTxn, setEditTxn] = useState<TransactionDTO | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  void holdingId;

  const holding = location.state?.holding as POHolding | undefined;

  useEffect(() => {
    if (!holding) navigate('/post-office', { replace: true });
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

  const scheme = holding ? assetClassToScheme(holding.assetClass) : null;
  const cfg = scheme ? SCHEMES[scheme] : null;

  // Filter txns to this holding (progressive isin → name → fallback match).
  const allTxns = (txnData?.items ?? []).filter(
    (t) => (!holding?.portfolioId || t.portfolioId === holding.portfolioId) &&
           t.assetClass === holding?.assetClass,
  );
  const matched = useMemo(() => {
    if (!holding) return [] as TransactionDTO[];
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
    return allTxns;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [txnData, holding?.isin, holding?.assetName, holding?.portfolioId]);

  const sorted = [...matched].sort((a, b) => a.tradeDate.localeCompare(b.tradeDate));
  const deposits = sorted.filter((t) => t.transactionType === 'DEPOSIT' || t.transactionType === 'BUY');
  const primary = deposits[0] ?? sorted[0] ?? null;

  const family = cfg?.family ?? 'LUMPSUM';
  const periodsPerYear = cfg?.periodsPerYear ?? 1;
  const isRecurring = family === 'RECURRING';
  const isPayout = family === 'PAYOUT';
  const isSavings = family === 'SAVINGS';

  const rate = primary?.interestRate ? new Decimal(primary.interestRate) : null;
  const annualRate = rate ? rate.div(100) : null;
  const maturity = primary?.maturityDate ?? null;
  const openDate = primary?.tradeDate ?? null;
  const tenureMonths = openDate && maturity ? monthsBetween(openDate, maturity) : null;
  const todayIso = new Date().toISOString().slice(0, 10);

  const principal = new Decimal(holding?.totalCost ?? '0');
  const currentValue = holding?.currentValue ? new Decimal(holding.currentValue) : null;
  // Installment amount for recurring schemes (form stores amount in `price`).
  const installmentAmount = primary ? new Decimal(primary.price) : new Decimal(0);
  // Recurring deposit cadence: RD monthly, SSY annual.
  const cadenceMonths = scheme === 'POST_OFFICE_RD' ? 1 : 12;

  // Projected maturity value.
  const maturityValue = useMemo(() => {
    if (isSavings || !annualRate || !openDate || !maturity) return null;
    if (isPayout) {
      // Principal is returned at maturity; interest is paid out along the way.
      return principal;
    }
    if (!isRecurring) {
      return accruedValue({ principal, rate: annualRate, startIso: openDate, valuationIso: maturity, periodsPerYear });
    }
    if (tenureMonths == null || tenureMonths <= 0) return null;
    let total = new Decimal(0);
    for (let m = 0; m < tenureMonths; m += cadenceMonths) {
      const depDate = addMonthsIso(openDate, m);
      total = total.plus(accruedValue({ principal: installmentAmount, rate: annualRate, startIso: depDate, valuationIso: maturity, periodsPerYear }));
    }
    return total;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSavings, isPayout, isRecurring, annualRate, openDate, maturity, periodsPerYear, tenureMonths, cadenceMonths]);

  // Total principal contributed by maturity.
  const totalPrincipal = isRecurring && tenureMonths
    ? installmentAmount.times(Math.max(1, Math.floor(tenureMonths / cadenceMonths)))
    : principal;

  // Total interest over the full term.
  const totalInterest = useMemo(() => {
    if (isSavings || !annualRate) return null;
    if (isPayout) {
      if (tenureMonths == null || tenureMonths <= 0) return null;
      const years = new Decimal(tenureMonths).div(12);
      return principal.times(annualRate).times(years);
    }
    if (maturityValue == null) return null;
    return maturityValue.minus(totalPrincipal);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSavings, isPayout, annualRate, tenureMonths, maturityValue]);

  // Interest earned to date.
  const earned = useMemo(() => {
    if (isSavings) return currentValue ? currentValue.minus(principal) : null;
    if (isPayout) {
      // Sum real interest-received txns; else accrue since open.
      const real = sorted
        .filter((t) => t.transactionType === 'INTEREST_RECEIVED')
        .reduce((s, t) => s.plus(new Decimal(t.price).times(new Decimal(t.quantity))), new Decimal(0));
      if (!real.isZero()) return real;
      if (!annualRate || !openDate) return null;
      const months = Math.max(0, monthsBetween(openDate, todayIso));
      return principal.times(annualRate).times(new Decimal(months).div(12));
    }
    return currentValue ? currentValue.minus(principal) : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSavings, isPayout, currentValue, annualRate, openDate, sorted, todayIso]);
  const earnedPct = earned && !principal.isZero() ? earned.div(principal).times(100).toNumber() : null;

  // Growth series (open → maturity), family-aware.
  const chartData: ChartPoint[] = useMemo(() => {
    // SAVINGS: running balance from real transactions.
    if (isSavings) {
      if (sorted.length === 0) return [];
      let bal = new Decimal(0);
      let dep = new Decimal(0);
      return sorted.map((t) => {
        const amt = new Decimal(t.price).times(new Decimal(t.quantity));
        const outflow = t.transactionType === 'WITHDRAWAL';
        bal = outflow ? bal.minus(amt) : bal.plus(amt);
        if (t.transactionType === 'DEPOSIT' || t.transactionType === 'OPENING_BALANCE') dep = dep.plus(amt);
        else if (outflow) dep = dep.minus(amt);
        const principalPart = Decimal.max(new Decimal(0), dep);
        return {
          date: t.tradeDate,
          label: shortMonth(t.tradeDate),
          principal: Number(principalPart.toFixed(2)),
          interest: Number(Decimal.max(new Decimal(0), bal.minus(principalPart)).toFixed(2)),
          value: Number(bal.toFixed(2)),
        };
      });
    }
    if (!annualRate || !openDate || !maturity) return [];
    const months = monthsBetween(openDate, maturity);
    if (months <= 0) return [];
    const points: ChartPoint[] = [];
    for (let m = 0; m <= months; m++) {
      const iso = addMonthsIso(openDate, m);
      let cumPrincipal: Decimal;
      let value: Decimal;
      if (isPayout) {
        // Corpus stays flat at principal; interest is paid out, not retained.
        cumPrincipal = principal;
        value = principal;
      } else if (!isRecurring) {
        cumPrincipal = principal;
        value = accruedValue({ principal, rate: annualRate, startIso: openDate, valuationIso: iso, periodsPerYear });
      } else {
        cumPrincipal = new Decimal(0);
        value = new Decimal(0);
        for (let k = 0; k * cadenceMonths < m && k * cadenceMonths < (tenureMonths ?? months); k++) {
          const depDate = addMonthsIso(openDate, k * cadenceMonths);
          cumPrincipal = cumPrincipal.plus(installmentAmount);
          value = value.plus(accruedValue({ principal: installmentAmount, rate: annualRate, startIso: depDate, valuationIso: iso, periodsPerYear }));
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSavings, isPayout, isRecurring, annualRate, openDate, maturity, periodsPerYear, tenureMonths, cadenceMonths, sorted]);

  const todayChartLabel = useMemo(() => {
    const todayMs = new Date(`${todayIso}T00:00:00Z`).getTime();
    return chartData.find((p) => new Date(`${p.date}T00:00:00Z`).getTime() >= todayMs)?.label;
  }, [chartData, todayIso]);

  // Interest payout / accrual timeline (bars).
  const payoutBars: PayoutBar[] = useMemo(() => {
    if (!annualRate || !openDate) return [];
    // Payout schemes: one bar per payout period, principal × rate / periodsPerYear.
    if (isPayout) {
      if (!maturity) return [];
      const perPeriod = principal.times(annualRate).div(periodsPerYear);
      const stepMonths = Math.max(1, Math.round(12 / periodsPerYear));
      const bars: PayoutBar[] = [];
      const totalMonths = monthsBetween(openDate, maturity);
      for (let m = stepMonths; m <= totalMonths; m += stepMonths) {
        const iso = addMonthsIso(openDate, m);
        bars.push({ label: shortMonth(iso), interest: Number(perPeriod.toFixed(2)) });
      }
      return bars;
    }
    // Compounding schemes: interest accrued in each period (value delta).
    if (chartData.length < 2) return [];
    const bars: PayoutBar[] = [];
    for (let i = 1; i < chartData.length; i++) {
      const delta = chartData[i]!.interest - chartData[i - 1]!.interest;
      if (delta <= 0) continue;
      bars.push({ label: chartData[i]!.label, interest: Number(delta.toFixed(2)) });
    }
    return bars;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPayout, annualRate, openDate, maturity, periodsPerYear, chartData]);

  // Installment schedule (RECURRING only).
  const installments: InstallmentRow[] = useMemo(() => {
    if (!isRecurring || !openDate || tenureMonths == null || tenureMonths <= 0) return [];
    const rows: InstallmentRow[] = [];
    let cum = new Decimal(0);
    const count = Math.max(1, Math.floor(tenureMonths / cadenceMonths));
    for (let i = 1; i <= count; i++) {
      const dueDate = addMonthsIso(openDate, (i - 1) * cadenceMonths);
      cum = cum.plus(installmentAmount);
      const paidTxn = deposits.find((t) => monthsBetween(openDate, t.tradeDate) === (i - 1) * cadenceMonths) ?? null;
      rows.push({
        index: i,
        dueDate,
        expectedAmount: installmentAmount,
        cumulativePrincipal: cum,
        paidTxn,
        isOverdue: !paidTxn && dueDate < todayIso,
      });
    }
    return rows;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRecurring, openDate, tenureMonths, cadenceMonths, deposits, todayIso]);

  // Log rows: real txns + synthetic interest accruals (compounding schemes).
  const logRows: LogRow[] = useMemo(() => {
    const rows: LogRow[] = sorted.map((t) => ({
      key: `t:${t.id}`,
      date: t.tradeDate,
      type: t.transactionType,
      amount: new Decimal(t.quantity).times(new Decimal(t.price)),
      notes: t.narration ?? null,
      txn: t,
    }));
    if (isPayout && annualRate && openDate) {
      const perPeriod = principal.times(annualRate).div(periodsPerYear);
      const stepMonths = Math.max(1, Math.round(12 / periodsPerYear));
      const endIso = maturity && maturity < todayIso ? maturity : todayIso;
      for (let m = stepMonths; ; m += stepMonths) {
        const date = addMonthsIso(openDate, m);
        if (date > endIso) break;
        const hasReal = sorted.some((t) => t.transactionType === 'INTEREST_RECEIVED' && t.tradeDate === date);
        if (!hasReal) rows.push({ key: `syn:${date}`, date, type: 'INTEREST_RECEIVED', amount: perPeriod, notes: null, txn: null });
      }
    }
    rows.sort((a, b) => b.date.localeCompare(a.date));
    return rows;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sorted, isPayout, annualRate, openDate, periodsPerYear, maturity, todayIso]);

  // CAGR from projection (compounding schemes with a maturity value).
  const cagr = useMemo(() => {
    if (!maturityValue || totalPrincipal.isZero() || tenureMonths == null || tenureMonths <= 0) return null;
    if (isPayout || isSavings) return null;
    const years = new Decimal(tenureMonths).div(12);
    if (years.isZero()) return null;
    return maturityValue.div(totalPrincipal).pow(new Decimal(1).div(years)).minus(1).times(100).toNumber();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maturityValue, totalPrincipal, tenureMonths, isPayout, isSavings]);

  const elapsedPct = openDate && maturity
    ? Math.min(100, Math.max(0, (
        (Date.now() - new Date(`${openDate}T00:00:00Z`).getTime()) /
        (new Date(`${maturity}T00:00:00Z`).getTime() - new Date(`${openDate}T00:00:00Z`).getTime())
      ) * 100))
    : null;

  if (!holding || !cfg) return null;

  const certNo = holding.id.slice(-6).toUpperCase();
  const pieData = totalInterest && !isSavings
    ? [
        { name: 'Principal', value: Number(totalPrincipal.toFixed(2)) },
        { name: 'Interest', value: Number(totalInterest.toFixed(2)) },
      ]
    : null;
  const pieColors = [CHART_PRINCIPAL, CHART_INTEREST];

  function openEdit(txn: TransactionDTO) {
    setEditTxn(txn);
    setEditOpen(true);
  }

  function markInstallmentPaid(dueDate: string) {
    if (!primary || !holding?.portfolioId) return;
    const h = holding;
    addMutation.mutate({
      portfolioId: h.portfolioId!,
      assetClass: h.assetClass,
      transactionType: 'DEPOSIT',
      assetName: h.assetName,
      isin: h.isin ?? undefined,
      tradeDate: dueDate,
      quantity: 1,
      price: Number(primary.price),
      interestRate: primary.interestRate != null ? Number(primary.interestRate) : undefined,
      maturityDate: primary.maturityDate ?? undefined,
    });
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Sticky nav */}
      <div className="sticky top-0 z-10 bg-background/80 backdrop-blur border-b px-4 sm:px-6 py-3 flex items-center gap-3 flex-wrap">
        <Button variant="ghost" size="sm" className="gap-1.5 -ml-2" onClick={() => navigate('/post-office')}>
          <ArrowLeft className="h-4 w-4" /> Post Office
        </Button>
        <div className="h-4 w-px bg-border" />
        <p className="font-medium text-sm truncate flex-1">{holding.assetName}</p>
        <Button variant="outline" size="sm" className="gap-1.5"
          onClick={() => { setEditTxn(null); setEditOpen(true); }}>
          <Plus className="h-3.5 w-3.5" /> Add entry
        </Button>
        {primary && (
          <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => openEdit(primary)}>
            <Pencil className="h-3.5 w-3.5" /> Edit
          </Button>
        )}
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Hero */}
        <div className="relative paper rounded-2xl border border-accent/30 shadow-elev-lg overflow-hidden">
          <div className="h-[3px] w-full bg-gradient-to-r from-accent/40 via-accent/85 to-accent/40" />
          <div className="h-px w-full bg-accent/30" />
          <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_90%_15%,hsl(var(--accent)/0.10),transparent_55%)]" />
          <div className="relative px-6 sm:px-8 py-7">
            <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
              <div className="flex items-center gap-3">
                <span className="inline-flex items-center justify-center h-9 w-9 rounded-md bg-accent/10 ring-1 ring-accent/30 text-accent">
                  <Landmark className="h-5 w-5" strokeWidth={1.8} />
                </span>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[10px] uppercase tracking-[0.28em] text-accent leading-none">{cfg.label}</span>
                    <span className="text-accent/30">·</span>
                    <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground leading-none">№ {certNo}</span>
                  </div>
                  <h1 className="font-display text-3xl sm:text-4xl mt-1 leading-tight truncate">{holding.assetName}</h1>
                  <p className="text-xs text-muted-foreground mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <span>{cfg.fullName}</span>
                    {tenureMonths && <><span className="text-muted-foreground/40">·</span><span>{tenureMonths}-month term</span></>}
                    {holding.portfolioName && <><span className="text-muted-foreground/40">·</span><span>{holding.portfolioName}</span></>}
                  </p>
                </div>
              </div>
              {rate != null && (
                <div className="text-right shrink-0">
                  <p className="font-display text-4xl sm:text-5xl text-accent leading-none tabular-nums">
                    {rate.toString()}<span className="text-xl sm:text-2xl align-top">%</span>
                  </p>
                  <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.28em] text-muted-foreground">per annum</p>
                </div>
              )}
            </div>

            {!isSavings && elapsedPct !== null && openDate && maturity && (
              <div className="mt-5">
                <div className="flex items-center gap-3 mb-2">
                  <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">Term progress</p>
                  <MaturityBadge date={maturity} />
                </div>
                <div className="relative h-2 rounded-sm bg-muted/70 overflow-visible">
                  <div className="absolute inset-y-0 left-0 rounded-sm bg-gradient-to-r from-accent/70 via-accent to-accent/80" style={{ width: `${elapsedPct}%` }} />
                  <span className="absolute top-1/2 -translate-y-1/2 h-3 w-3 rotate-45 bg-accent ring-2 ring-card" style={{ left: `calc(${elapsedPct}% - 6px)` }} />
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

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Stat label={isRecurring ? 'Total Deposited' : isSavings ? 'Net Deposited' : 'Principal'} value={formatINR(principal.toString())} icon={Landmark} />
          <Stat label="Current Value" value={currentValue ? formatINR(currentValue.toString()) : '—'} highlight="accent" icon={TrendingUp} />
          <Stat
            label={isPayout ? 'Interest Paid' : 'Interest Earned'}
            value={earned ? `${earned.gte(0) ? '+' : ''}${formatINR(earned.toString())}` : '—'}
            sub={earnedPct != null ? `${earnedPct >= 0 ? '+' : ''}${earnedPct.toFixed(2)}%` : undefined}
            highlight={earned ? (earned.gte(0) ? 'positive' : 'negative') : undefined}
            icon={Sparkles}
          />
          <Stat
            label={isSavings ? 'Balance' : isPayout ? 'Principal at Maturity' : 'At Maturity'}
            value={isSavings ? (currentValue ? formatINR(currentValue.toString()) : '—') : (maturityValue ? formatINR(maturityValue.toString()) : '—')}
            sub={maturity ? `on ${maturity}` : undefined}
            icon={Hash}
          />
        </div>

        {/* Missing-data CTA */}
        {!isSavings && (!rate || !maturity) && (
          <div className="rounded-xl border border-dashed border-amber-300 dark:border-amber-700 bg-amber-50/50 dark:bg-amber-950/20 px-4 py-3 flex items-center gap-3">
            <Sparkles className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
            <p className="text-xs text-amber-700 dark:text-amber-300 flex-1">
              {!rate && !maturity
                ? 'Add an interest rate and maturity date to see growth charts and projections.'
                : !rate ? 'Add an interest rate to see growth charts and projections.'
                : 'Add a maturity date to see growth charts and projections.'}
            </p>
            {primary && (
              <Button size="sm" variant="outline" className="border-amber-400 dark:border-amber-700 text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/30"
                onClick={() => openEdit(primary)}>
                <Pencil className="h-3 w-3 mr-1" /> Edit details
              </Button>
            )}
          </div>
        )}

        {/* Charts */}
        {chartData.length > 1 && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            {/* Growth / balance */}
            <Card className="lg:col-span-2">
              <CardHeader className="pb-2 flex flex-row items-baseline justify-between gap-3">
                <CardTitle className="text-lg">{isSavings ? 'Running balance' : 'Projected growth'}</CardTitle>
                <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                  <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm" style={{ background: CHART_GROWTH }} /> Value</span>
                  <span className="flex items-center gap-1"><span className="h-0.5 w-3 bg-muted-foreground/50" /> Principal</span>
                </div>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={260}>
                  <AreaChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
                    <defs>
                      <linearGradient id="poGradValue" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={CHART_GROWTH} stopOpacity={0.22} />
                        <stop offset="55%" stopColor={CHART_GROWTH} stopOpacity={0.06} />
                        <stop offset="100%" stopColor={CHART_GROWTH} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis dataKey="label" fontSize={10} tickLine={false} axisLine={false} minTickGap={28} stroke="hsl(var(--muted-foreground))" />
                    <YAxis fontSize={10} tickLine={false} axisLine={false} width={55} stroke="hsl(var(--muted-foreground))" tickFormatter={INR_COMPACT} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={TOOLTIP_LABEL_STYLE}
                      formatter={(v: number, name: string) => [formatINR(String(v)), name === 'value' ? 'Total value' : 'Principal']} />
                    {todayChartLabel && (
                      <ReferenceLine x={todayChartLabel} stroke={CHART_GROWTH_DIM} strokeDasharray="2 4"
                        label={{ value: 'Today', fontSize: 10, fill: CHART_GROWTH, position: 'top' }} />
                    )}
                    <Area type="monotone" dataKey="principal" stroke="hsl(var(--muted-foreground))" strokeWidth={1} strokeDasharray="3 3" fill="transparent" />
                    <Area type="monotone" dataKey="value" stroke={CHART_GROWTH} strokeWidth={2} fill="url(#poGradValue)" dot={false}
                      activeDot={{ r: 4, fill: 'hsl(var(--foreground))', stroke: 'hsl(var(--card))', strokeWidth: 2 }} />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Composition donut */}
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-lg">{isSavings ? 'Balance split' : 'Maturity composition'}</CardTitle></CardHeader>
              <CardContent>
                {pieData ? (
                  <>
                    <div className="relative flex items-center justify-center">
                      <ResponsiveContainer width="100%" height={180}>
                        <PieChart>
                          <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={52} outerRadius={76} paddingAngle={2}
                            stroke="hsl(var(--card))" strokeWidth={2} isAnimationActive={false}>
                            {pieData.map((_, i) => <Cell key={i} fill={pieColors[i]} />)}
                          </Pie>
                          <Tooltip cursor={false} wrapperStyle={{ outline: 'none' }} position={{ y: -8 }}
                            content={({ active, payload }) => {
                              if (!active || !payload?.length) return null;
                              const p = payload[0]!;
                              const total = pieData.reduce((s, r) => s + r.value, 0);
                              const pct = total > 0 ? (Number(p.value) / total) * 100 : 0;
                              return (
                                <div className="rounded-md border bg-popover/95 backdrop-blur-sm shadow-md px-2.5 py-1.5 text-xs">
                                  <div className="flex items-center gap-2">
                                    <span className="h-2 w-2 rounded-full shrink-0" style={{ background: (p.payload as { fill?: string }).fill }} />
                                    <span className="font-medium">{p.name}</span>
                                    <span className="tabular-nums font-semibold ml-1">{formatINR(String(p.value))}</span>
                                    <span className="text-muted-foreground tabular-nums ml-1">· {pct.toFixed(1)}%</span>
                                  </div>
                                </div>
                              );
                            }} />
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                        <p className="text-[9px] uppercase tracking-[0.18em] text-muted-foreground">Total</p>
                        <p className="text-sm font-semibold tabular-nums leading-tight mt-0.5">
                          {formatINR((maturityValue ?? totalPrincipal).toString())}
                        </p>
                      </div>
                    </div>
                    <div className="space-y-1.5 text-xs mt-3 border-t pt-3">
                      <div className="flex justify-between">
                        <span className="flex items-center gap-1.5 text-muted-foreground"><span className="h-2 w-2 rounded-full" style={{ background: CHART_PRINCIPAL }} /> Principal</span>
                        <span className="font-medium tabular-nums" style={{ color: CHART_PRINCIPAL }}>{formatINR(totalPrincipal.toString())}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="flex items-center gap-1.5 text-muted-foreground"><span className="h-2 w-2 rounded-full" style={{ background: CHART_INTEREST }} /> Interest</span>
                        <span className="font-medium tabular-nums" style={{ color: CHART_INTEREST }}>{formatINR((totalInterest ?? new Decimal(0)).toString())}</span>
                      </div>
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground py-6 text-center">Add deposit details to see composition.</p>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* Returns + payout timeline */}
        {(rate != null || holding.xirr != null) && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-lg">Returns</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground font-medium flex items-center gap-1"><Percent className="h-3 w-3" /> XIRR (money-weighted)</p>
                  <p className={`text-2xl font-semibold tabular-nums mt-0.5 ${holding.xirr != null ? (holding.xirr >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400') : ''}`}>
                    {holding.xirr != null ? `${holding.xirr >= 0 ? '+' : ''}${(holding.xirr * 100).toFixed(2)}%` : '—'}
                  </p>
                </div>
                <div className="border-t pt-3">
                  <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground font-medium flex items-center gap-1"><TrendingUp className="h-3 w-3" /> CAGR (projected)</p>
                  <p className="text-2xl font-semibold tabular-nums mt-0.5">{cagr != null ? `${cagr.toFixed(2)}%` : (rate != null ? `${rate.toString()}%` : '—')}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">{cagr != null ? 'to maturity' : 'nominal rate'}</p>
                </div>
              </CardContent>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader className="pb-2"><CardTitle className="text-lg">{isPayout ? 'Interest payout timeline' : 'Interest accrual timeline'}</CardTitle></CardHeader>
              <CardContent>
                {payoutBars.length > 0 ? (
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={payoutBars} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                      <XAxis dataKey="label" fontSize={10} tickLine={false} axisLine={false} minTickGap={20} stroke="hsl(var(--muted-foreground))" />
                      <YAxis fontSize={10} tickLine={false} axisLine={false} width={55} stroke="hsl(var(--muted-foreground))" tickFormatter={INR_COMPACT} />
                      <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={TOOLTIP_LABEL_STYLE} cursor={{ fill: 'hsl(var(--muted)/0.3)' }}
                        formatter={(v: number) => [formatINR(String(v)), 'Interest']} />
                      <Bar dataKey="interest" fill={CHART_INTEREST} radius={[3, 3, 0, 0]} maxBarSize={26} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-sm text-muted-foreground py-10 text-center">Add rate & maturity to project interest payouts.</p>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* Installment schedule (recurring) */}
        {isRecurring && installments.length > 0 && (
          <InstallmentSchedule
            rows={installments}
            cadenceLabel={cadenceMonths === 1 ? 'Monthly installment' : 'Annual deposit'}
            onAdd={markInstallmentPaid}
            onUndo={(id) => deleteMutation.mutate(id)}
          />
        )}

        {/* Transaction log */}
        {txnLoading ? (
          <p className="text-sm text-muted-foreground py-6 text-center flex items-center justify-center gap-2"><Wallet className="h-4 w-4" /> Loading entries…</p>
        ) : (
          <TransactionLog rows={logRows} onEdit={openEdit} onDelete={(id) => deleteMutation.mutate(id)} />
        )}
      </div>

      <PostOfficeFormDialog
        open={editOpen}
        onOpenChange={(o) => { setEditOpen(o); if (!o) setEditTxn(null); }}
        initial={editTxn}
        defaultAssetClass={holding.assetClass}
        defaultPortfolioId={holding.portfolioId}
      />
    </div>
  );
}
