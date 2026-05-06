import { useEffect, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  ArrowLeft,
  Plus,
  Trash2,
  ChevronDown,
  ChevronUp,
  Car,
  Building2,
  Landmark,
  Zap,
  Calculator,
  Loader2,
  Pencil,
  Check,
  Undo2,
} from 'lucide-react';
import { Decimal, formatINR } from '@portfolioos/shared';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  PieChart, Pie, Cell, Legend,
} from 'recharts';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { PortfolioSelect } from '@/components/common/PortfolioSelect';
import {
  loansApi,
  type LoanDTO,
  type LoanSummaryDTO,
  type AmortizationRowDTO,
  type AddPaymentInput,
  type CreateLoanInput,
} from '@/api/loans.api';

// ── Helpers ───────────────────────────────────────────────────────────

const LOAN_TYPE_LABELS: Record<string, string> = {
  HOME: 'Home', CAR: 'Car', PERSONAL: 'Personal', EDUCATION: 'Education',
  BUSINESS: 'Business', GOLD: 'Gold', LAS: 'LAS', OTHER: 'Other',
};

const PAYMENT_TYPE_LABELS: Record<string, string> = {
  EMI: 'EMI',
  PREPAYMENT: 'Prepayment',
  FORECLOSURE: 'Foreclosure',
  PROCESSING_FEE: 'Processing fee',
};

const PAYMENT_TYPE_COLORS: Record<string, string> = {
  EMI: 'text-foreground',
  PREPAYMENT: 'text-positive',
  FORECLOSURE: 'text-amber-600',
  PROCESSING_FEE: 'text-muted-foreground',
};

function formatDate(iso: string | null | undefined) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ── Summary metric card ───────────────────────────────────────────────

function MetricCard({ label, value, sub, className = '' }: { label: string; value: string; sub?: string; className?: string }) {
  return (
    <Card>
      <CardContent className="px-4 py-3">
        <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">{label}</p>
        <p className={`text-xl font-semibold tabular-nums mt-1 ${className}`}>{value}</p>
        {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
      </CardContent>
    </Card>
  );
}

// ── Payment dialog ────────────────────────────────────────────────────

function PaymentDialog({
  loanId,
  open,
  onOpenChange,
  onPrepaymentRecorded,
}: {
  loanId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onPrepaymentRecorded?: () => void;
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState<AddPaymentInput>({
    paymentType: 'EMI',
    paidOn: '',
    amount: '',
    forMonth: null,
    principalPart: null,
    interestPart: null,
    notes: null,
  });
  const [errors, setErrors] = useState<Partial<Record<string, string>>>({});

  const mutation = useMutation({
    mutationFn: (input: AddPaymentInput) => loansApi.addPayment(loanId, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['loan', loanId] });
      qc.invalidateQueries({ queryKey: ['loan-summary', loanId] });
      qc.invalidateQueries({ queryKey: ['loan-amortization', loanId] });
      toast.success('Payment recorded');
      if (form.paymentType === 'PREPAYMENT') onPrepaymentRecorded?.();
      onOpenChange(false);
      setForm({ paymentType: 'EMI', paidOn: '', amount: '', forMonth: null, principalPart: null, interestPart: null, notes: null });
    },
    onError: () => toast.error('Failed to record payment'),
  });

  function validate(): boolean {
    const errs: Record<string, string> = {};
    if (!form.paidOn) errs['paidOn'] = 'Required';
    if (!form.amount || isNaN(Number(form.amount))) errs['amount'] = 'Required';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function set<K extends keyof AddPaymentInput>(key: K, value: AddPaymentInput[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Record payment</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Payment type</Label>
            <select
              className="w-full mt-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={form.paymentType}
              onChange={(e) => set('paymentType', e.target.value)}
            >
              {Object.entries(PAYMENT_TYPE_LABELS).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </div>

          <div>
            <Label>Paid on *</Label>
            <Input type="date" value={form.paidOn}
              onChange={(e) => set('paidOn', e.target.value)}
              className={errors['paidOn'] ? 'border-negative' : ''} />
            {errors['paidOn'] && <p className="text-xs text-negative mt-1">{errors['paidOn']}</p>}
          </div>

          <div>
            <Label>Amount (₹) *</Label>
            <Input placeholder="9000" value={form.amount}
              onChange={(e) => set('amount', e.target.value)}
              className={errors['amount'] ? 'border-negative' : ''} />
            {errors['amount'] && <p className="text-xs text-negative mt-1">{errors['amount']}</p>}
          </div>

          {form.paymentType === 'EMI' && (
            <div>
              <Label>For month (YYYY-MM)</Label>
              <Input placeholder="2025-01" value={form.forMonth ?? ''}
                onChange={(e) => set('forMonth', e.target.value || null)} />
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Principal part (₹)</Label>
              <Input placeholder="Optional" value={form.principalPart ?? ''}
                onChange={(e) => set('principalPart', e.target.value || null)} />
            </div>
            <div>
              <Label>Interest part (₹)</Label>
              <Input placeholder="Optional" value={form.interestPart ?? ''}
                onChange={(e) => set('interestPart', e.target.value || null)} />
            </div>
          </div>

          <div>
            <Label>Notes</Label>
            <Input placeholder="Optional" value={form.notes ?? ''}
              onChange={(e) => set('notes', e.target.value || null)} />
          </div>

          {form.paymentType === 'PREPAYMENT' && (
            <div className="rounded-md bg-positive/10 px-3 py-2 text-xs text-positive flex items-center gap-1.5">
              <Zap className="h-3.5 w-3.5" />
              Prepayment savings will be shown after recording
            </div>
          )}
        </div>

        {mutation.isError && (
          <p className="text-sm text-negative">
            {mutation.error instanceof Error ? mutation.error.message : 'Failed to record payment'}
          </p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => { if (validate()) mutation.mutate(form); }} disabled={mutation.isPending}>
            {mutation.isPending ? 'Saving…' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Edit loan dialog (reuse from list page) ───────────────────────────

function calcEmi(principal: string, rate: string, tenure: string): string {
  try {
    const p = new Decimal(principal);
    const r = new Decimal(rate).div(12).div(100);
    const n = new Decimal(tenure);
    if (r.isZero()) return p.div(n).toFixed(2);
    const onePlusR = r.plus(1);
    const pow = onePlusR.pow(n.toNumber());
    const emi = p.mul(r).mul(pow).div(pow.minus(1));
    return emi.toFixed(2);
  } catch {
    return '';
  }
}

function EditLoanDialog({
  open,
  onOpenChange,
  loan,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  loan: LoanDTO;
}) {
  const qc = useQueryClient();

  const [form, setForm] = useState<CreateLoanInput>({
    lenderName: loan.lenderName,
    loanType: loan.loanType,
    borrowerName: loan.borrowerName,
    accountNumber: loan.accountNumber ?? '',
    principalAmount: loan.principalAmount,
    interestRate: loan.interestRate,
    tenureMonths: loan.tenureMonths,
    emiAmount: loan.emiAmount,
    emiDueDay: loan.emiDueDay,
    disbursementDate: loan.disbursementDate,
    firstEmiDate: loan.firstEmiDate,
    prepaymentOption: loan.prepaymentOption,
    taxBenefitSection: loan.taxBenefitSection ?? null,
    status: loan.status,
    portfolioId: loan.portfolioId ?? null,
  });

  const [errors, setErrors] = useState<Partial<Record<string, string>>>({});

  // Re-sync form when dialog reopens or the underlying loan changes
  useEffect(() => {
    if (open) {
      const toDateInput = (v: string | null | undefined) => (v ? v.slice(0, 10) : '');
      setForm({
        lenderName: loan.lenderName,
        loanType: loan.loanType,
        borrowerName: loan.borrowerName,
        accountNumber: loan.accountNumber ?? '',
        principalAmount: loan.principalAmount,
        interestRate: loan.interestRate,
        tenureMonths: loan.tenureMonths,
        emiAmount: loan.emiAmount,
        emiDueDay: loan.emiDueDay,
        disbursementDate: toDateInput(loan.disbursementDate),
        firstEmiDate: toDateInput(loan.firstEmiDate),
        prepaymentOption: loan.prepaymentOption,
        taxBenefitSection: loan.taxBenefitSection ?? null,
        status: loan.status,
        portfolioId: loan.portfolioId ?? null,
      });
      setErrors({});
    }
  }, [open, loan]);

  const mutation = useMutation({
    mutationFn: (input: CreateLoanInput) => loansApi.update(loan.id, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['loan', loan.id] });
      qc.invalidateQueries({ queryKey: ['loans'] });
      toast.success('Loan updated');
      onOpenChange(false);
    },
    onError: () => toast.error('Failed to update loan'),
  });

  function set<K extends keyof CreateLoanInput>(key: K, value: CreateLoanInput[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function validate(): boolean {
    const errs: Record<string, string> = {};
    if (!form.lenderName.trim()) errs['lenderName'] = 'Required';
    if (!form.borrowerName.trim()) errs['borrowerName'] = 'Required';
    if (!form.principalAmount || isNaN(Number(form.principalAmount))) errs['principalAmount'] = 'Required';
    if (!form.interestRate || isNaN(Number(form.interestRate))) errs['interestRate'] = 'Required';
    if (!form.tenureMonths || form.tenureMonths <= 0) errs['tenureMonths'] = 'Required';
    if (!form.emiAmount || isNaN(Number(form.emiAmount))) errs['emiAmount'] = 'Required';
    if (!form.disbursementDate) errs['disbursementDate'] = 'Required';
    if (!form.firstEmiDate) errs['firstEmiDate'] = 'Required';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit loan</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Lender name *</Label>
              <Input value={form.lenderName}
                onChange={(e) => set('lenderName', e.target.value)}
                className={errors['lenderName'] ? 'border-negative' : ''} />
              {errors['lenderName'] && <p className="text-xs text-negative mt-1">{errors['lenderName']}</p>}
            </div>
            <div>
              <Label>Loan type</Label>
              <select
                className="w-full mt-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={form.loanType}
                onChange={(e) => set('loanType', e.target.value)}
              >
                {Object.entries(LOAN_TYPE_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Principal (₹) *</Label>
              <Input value={form.principalAmount}
                onChange={(e) => set('principalAmount', e.target.value)}
                className={errors['principalAmount'] ? 'border-negative' : ''} />
              {errors['principalAmount'] && <p className="text-xs text-negative mt-1">{errors['principalAmount']}</p>}
            </div>
            <div>
              <Label>Interest rate (%) *</Label>
              <Input value={form.interestRate}
                onChange={(e) => set('interestRate', e.target.value)}
                className={errors['interestRate'] ? 'border-negative' : ''} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Tenure (months) *</Label>
              <Input type="number" value={form.tenureMonths}
                onChange={(e) => set('tenureMonths', Number(e.target.value))} />
            </div>
            <div>
              <Label>EMI amount (₹) *</Label>
              <div className="flex gap-1.5">
                <Input value={form.emiAmount}
                  onChange={(e) => set('emiAmount', e.target.value)}
                  className="flex-1" />
                <Button type="button" variant="outline" size="sm" className="shrink-0 px-2"
                  onClick={() => {
                    const emi = calcEmi(form.principalAmount, form.interestRate, String(form.tenureMonths));
                    if (emi) set('emiAmount', emi);
                  }}
                  title="Auto-calculate">
                  <Calculator className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Status</Label>
              <select
                className="w-full mt-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={form.status}
                onChange={(e) => set('status', e.target.value)}
              >
                {['ACTIVE', 'CLOSED', 'FORECLOSED', 'DEFAULT'].map((s) => (
                  <option key={s} value={s}>{s.charAt(0) + s.slice(1).toLowerCase()}</option>
                ))}
              </select>
            </div>
            <div>
              <Label>Tax benefit section</Label>
              <select
                className="w-full mt-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={form.taxBenefitSection ?? ''}
                onChange={(e) => set('taxBenefitSection', e.target.value || null)}
              >
                <option value="">None</option>
                <option value="80C+24B">80C + 24B (Home loan)</option>
                <option value="80E">80E (Education loan)</option>
              </select>
            </div>
          </div>

          <div>
            <Label>Portfolio</Label>
            <PortfolioSelect
              value={form.portfolioId ?? null}
              onChange={(v) => set('portfolioId', v)}
            />
            <p className="text-xs text-muted-foreground mt-1">
              Optional — re-assign this loan to a different portfolio.
            </p>
          </div>
        </div>
        {mutation.isError && (
          <p className="text-sm text-negative">
            {mutation.error instanceof Error ? mutation.error.message : 'Failed to update'}
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => { if (validate()) mutation.mutate(form); }} disabled={mutation.isPending}>
            {mutation.isPending ? 'Saving…' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Payment history table ─────────────────────────────────────────────

function PaymentHistoryTable({ loan }: { loan: LoanDTO }) {
  const qc = useQueryClient();

  const deleteMutation = useMutation({
    mutationFn: (paymentId: string) => loansApi.deletePayment(paymentId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['loan', loan.id] });
      qc.invalidateQueries({ queryKey: ['loan-summary', loan.id] });
      qc.invalidateQueries({ queryKey: ['loan-amortization', loan.id] });
      toast.success('Payment removed');
    },
    onError: () => toast.error('Failed to remove payment'),
  });

  const [confirmDeletePayId, setConfirmDeletePayId] = useState<string | null>(null);

  if (loan.payments.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-2xl">Payment history</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground">No payments recorded yet</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-2xl">
          Payment history
          <span className="ml-2 text-xs font-normal text-muted-foreground">
            {loan.payments.length} records
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="max-h-[400px] overflow-y-auto overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-card z-10">
              <tr className="border-b">
                <th className="text-left py-2 pr-4 text-muted-foreground font-medium bg-card">Date</th>
                <th className="text-left py-2 pr-4 text-muted-foreground font-medium bg-card">Type</th>
                <th className="text-right py-2 pr-4 text-muted-foreground font-medium bg-card">Amount</th>
                <th className="text-right py-2 pr-4 text-muted-foreground font-medium bg-card">Principal</th>
                <th className="text-right py-2 pr-4 text-muted-foreground font-medium bg-card">Interest</th>
                <th className="text-left py-2 pr-4 text-muted-foreground font-medium bg-card">Note</th>
                <th className="w-8 bg-card" />
              </tr>
            </thead>
            <tbody>
              {loan.payments.map((p) => (
                <tr key={p.id} className="border-b last:border-0 group">
                  <td className="py-2 pr-4 tabular-nums">{formatDate(p.paidOn)}</td>
                  <td className={`py-2 pr-4 font-medium ${PAYMENT_TYPE_COLORS[p.paymentType] ?? ''}`}>
                    {PAYMENT_TYPE_LABELS[p.paymentType] ?? p.paymentType}
                  </td>
                  <td className="py-2 pr-4 text-right tabular-nums font-medium">{formatINR(p.amount)}</td>
                  <td className="py-2 pr-4 text-right tabular-nums text-muted-foreground">
                    {p.principalPart ? formatINR(p.principalPart) : '—'}
                  </td>
                  <td className="py-2 pr-4 text-right tabular-nums text-muted-foreground">
                    {p.interestPart ? formatINR(p.interestPart) : '—'}
                  </td>
                  <td className="py-2 pr-4 text-muted-foreground">{p.notes ?? '—'}</td>
                  <td className="py-2">
                    {confirmDeletePayId === p.id ? (
                      <div className="flex gap-1">
                        <Button size="sm" variant="destructive" className="h-5 px-1.5 text-xs"
                          disabled={deleteMutation.isPending}
                          onClick={() => deleteMutation.mutate(p.id)}>
                          {deleteMutation.isPending ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : 'Del'}
                        </Button>
                        <Button size="sm" variant="ghost" className="h-5 px-1.5 text-xs"
                          onClick={() => setConfirmDeletePayId(null)}>No</Button>
                      </div>
                    ) : (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-negative"
                        onClick={() => setConfirmDeletePayId(p.id)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Amortization table ────────────────────────────────────────────────

function AmortizationTable({ loan, rows }: { loan: LoanDTO; rows: AmortizationRowDTO[] }) {
  const qc = useQueryClient();
  const [showAll, setShowAll] = useState(false);
  const [pendingMonth, setPendingMonth] = useState<number | null>(null);
  const INITIAL_SHOW = 12;
  const displayed = showAll ? rows : rows.slice(0, INITIAL_SHOW);
  const today = new Date().toISOString().slice(0, 10);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const paidCount = rows.filter((r) => r.isPaid).length;

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    const firstUnpaidIdx = displayed.findIndex((r) => !r.isPaid);
    if (firstUnpaidIdx <= 0) return;
    const targetRow = container.querySelector<HTMLTableRowElement>(
      `tr[data-month="${displayed[firstUnpaidIdx].month}"]`,
    );
    const headerEl = container.querySelector<HTMLElement>('thead');
    if (!targetRow) return;
    const headerH = headerEl?.offsetHeight ?? 0;
    container.scrollTo({
      top: targetRow.offsetTop - headerH,
      behavior: 'smooth',
    });
  }, [paidCount, showAll]); // eslint-disable-line react-hooks/exhaustive-deps

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['loan', loan.id] });
    qc.invalidateQueries({ queryKey: ['loan-summary', loan.id] });
    qc.invalidateQueries({ queryKey: ['loan-amortization', loan.id] });
  };

  const markPaid = useMutation({
    mutationFn: (input: AddPaymentInput) => loansApi.addPayment(loan.id, input),
    onSuccess: () => {
      invalidate();
      toast.success('Marked paid');
      setPendingMonth(null);
    },
    onError: () => {
      toast.error('Failed to mark paid');
      setPendingMonth(null);
    },
  });

  const undoPaid = useMutation({
    mutationFn: (paymentId: string) => loansApi.deletePayment(paymentId),
    onSuccess: () => {
      invalidate();
      toast.success('Payment undone');
      setPendingMonth(null);
    },
    onError: () => {
      toast.error('Failed to undo');
      setPendingMonth(null);
    },
  });

  function findEmiPaymentId(forMonth: string): string | null {
    const p = loan.payments.find(
      (x) => x.paymentType === 'EMI' && x.forMonth === forMonth,
    );
    return p?.id ?? null;
  }

  return (
    <Card>
      <CardHeader className="pb-3 flex flex-row items-center justify-between">
        <CardTitle className="text-2xl">
          Amortization schedule
          <span className="ml-2 text-xs font-normal text-muted-foreground">{rows.length} months</span>
        </CardTitle>
        {rows.length > INITIAL_SHOW && (
          <Button variant="ghost" size="sm" onClick={() => setShowAll((v) => !v)}>
            {showAll ? (
              <><ChevronUp className="h-3.5 w-3.5 mr-1" /> Show less</>
            ) : (
              <><ChevronDown className="h-3.5 w-3.5 mr-1" /> Show all {rows.length} months</>
            )}
          </Button>
        )}
      </CardHeader>
      <CardContent>
        <div ref={scrollRef} className="max-h-[600px] overflow-y-auto overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-card z-10">
              <tr className="border-b">
                <th className="text-left py-2 pr-3 text-muted-foreground font-medium w-12 bg-card">#</th>
                <th className="text-left py-2 pr-3 text-muted-foreground font-medium bg-card">Date</th>
                <th className="text-right py-2 pr-3 text-muted-foreground font-medium bg-card">Opening</th>
                <th className="text-right py-2 pr-3 text-muted-foreground font-medium bg-card">EMI</th>
                <th className="text-right py-2 pr-3 text-muted-foreground font-medium bg-card">Principal</th>
                <th className="text-right py-2 pr-3 text-muted-foreground font-medium bg-card">Interest</th>
                <th className="text-right py-2 pr-3 text-muted-foreground font-medium bg-card">Closing</th>
                <th className="text-left py-2 pr-3 text-muted-foreground font-medium bg-card">Status</th>
                <th className="text-right py-2 text-muted-foreground font-medium w-32 bg-card">Action</th>
              </tr>
            </thead>
            <tbody>
              {displayed.map((row) => {
                const isOverdue = !row.isPaid && row.date < today;
                const rowCls = row.isPaid
                  ? 'bg-positive/5'
                  : isOverdue
                  ? 'bg-negative/5'
                  : '';
                const forMonth = row.date.slice(0, 7);
                const isPending =
                  pendingMonth === row.month && (markPaid.isPending || undoPaid.isPending);
                return (
                  <tr key={row.month} data-month={row.month} className={`border-b last:border-0 ${rowCls}`}>
                    <td className="py-1.5 pr-3 tabular-nums text-muted-foreground">{row.month}</td>
                    <td className="py-1.5 pr-3 tabular-nums">{formatDate(row.date)}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">{formatINR(row.openingBalance)}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums font-medium">{formatINR(row.emiAmount)}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums text-positive">{formatINR(row.principalPart)}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums text-muted-foreground">{formatINR(row.interestPart)}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">{formatINR(row.closingBalance)}</td>
                    <td className="py-1.5 pr-3">
                      {row.isPaid ? (
                        <span className="text-positive font-medium">Paid {row.paidOn ? formatDate(row.paidOn) : ''}</span>
                      ) : isOverdue ? (
                        <span className="text-negative font-medium">Overdue</span>
                      ) : (
                        <span className="text-muted-foreground">Upcoming</span>
                      )}
                    </td>
                    <td className="py-1.5 text-right">
                      {row.isPaid ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 px-2 text-xs text-muted-foreground hover:text-negative"
                          disabled={isPending}
                          onClick={() => {
                            const paymentId = findEmiPaymentId(forMonth);
                            if (!paymentId) {
                              toast.error('Payment not found');
                              return;
                            }
                            setPendingMonth(row.month);
                            undoPaid.mutate(paymentId);
                          }}
                        >
                          {isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <><Undo2 className="h-3 w-3 mr-1" /> Undo</>}
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-6 px-2 text-xs"
                          disabled={isPending}
                          onClick={() => {
                            setPendingMonth(row.month);
                            markPaid.mutate({
                              paymentType: 'EMI',
                              paidOn: row.date,
                              amount: row.emiAmount,
                              forMonth,
                              principalPart: row.principalPart,
                              interestPart: row.interestPart,
                              notes: null,
                            });
                          }}
                        >
                          {isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <><Check className="h-3 w-3 mr-1" /> Mark paid</>}
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!showAll && rows.length > INITIAL_SHOW && (
          <p className="text-xs text-muted-foreground text-center mt-3">
            Showing {INITIAL_SHOW} of {rows.length} months
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// ── Charts ────────────────────────────────────────────────────────────

const INR_COMPACT = (v: number): string => {
  if (v >= 1e7) return `₹${(v / 1e7).toFixed(2)}Cr`;
  if (v >= 1e5) return `₹${(v / 1e5).toFixed(2)}L`;
  if (v >= 1e3) return `₹${(v / 1e3).toFixed(1)}K`;
  return `₹${v.toFixed(0)}`;
};

function shortMonthLabel(date: string): string {
  const d = new Date(date);
  return d.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });
}

const TOOLTIP_STYLE = {
  background: 'hsl(var(--popover))',
  border: '1px solid hsl(var(--border))',
  borderRadius: '8px',
  fontSize: 12,
  padding: '10px 12px',
  boxShadow: '0 12px 28px -16px hsl(var(--shadow-color) / 0.35)',
};

const TOOLTIP_LABEL_STYLE = {
  color: 'hsl(var(--muted-foreground))',
  marginBottom: 4,
  fontSize: 10,
  textTransform: 'uppercase' as const,
  letterSpacing: '0.1em',
};

function LoanCharts({ rows, summary }: { rows: AmortizationRowDTO[]; summary: LoanSummaryDTO | undefined }) {
  // Downsample for long tenures so axis stays readable.
  const stride = rows.length > 60 ? Math.ceil(rows.length / 60) : 1;
  const sampled = rows.filter((_, i) => i % stride === 0 || i === rows.length - 1);

  const balanceData = sampled.map((r) => ({
    label: shortMonthLabel(r.date),
    balance: Number(r.closingBalance),
  }));

  const splitData = sampled.map((r) => ({
    label: shortMonthLabel(r.date),
    principal: Number(r.principalPart),
    interest: Number(r.interestPart),
  }));

  const totalPrincipal = rows.reduce((s, r) => s + Number(r.principalPart), 0);
  const totalInterest = summary
    ? Number(summary.totalInterestPayable)
    : rows.reduce((s, r) => s + Number(r.interestPart), 0);
  const totalCost = totalPrincipal + totalInterest;
  const interestPct = totalCost > 0 ? (totalInterest / totalCost) * 100 : 0;

  const pieData = [
    { name: 'Principal', value: totalPrincipal },
    { name: 'Interest', value: totalInterest },
  ];
  const pieColors = ['hsl(var(--positive))', 'hsl(var(--negative))'];

  return (
    <div className="space-y-3 mb-4">
      {/* Outstanding balance trajectory */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-2xl">Outstanding balance over time</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={balanceData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="gradBalance" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--foreground))" stopOpacity={0.22} />
                  <stop offset="55%" stopColor="hsl(var(--foreground))" stopOpacity={0.06} />
                  <stop offset="100%" stopColor="hsl(var(--foreground))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="2 4" stroke="hsl(var(--border))" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))', fontFamily: 'JetBrains Mono' }}
                axisLine={false}
                tickLine={false}
                interval="preserveStartEnd"
                minTickGap={30}
              />
              <YAxis
                tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))', fontFamily: 'JetBrains Mono' }}
                axisLine={false}
                tickLine={false}
                tickFormatter={INR_COMPACT}
                width={60}
              />
              <Tooltip
                cursor={{ stroke: 'hsl(var(--foreground))', strokeWidth: 1, strokeDasharray: '3 3', strokeOpacity: 0.4 }}
                contentStyle={TOOLTIP_STYLE}
                labelStyle={TOOLTIP_LABEL_STYLE}
                formatter={(v: number) => [formatINR(v.toFixed(2)), 'Balance']}
              />
              <Area
                type="monotone"
                dataKey="balance"
                stroke="hsl(var(--foreground))"
                strokeWidth={2}
                fill="url(#gradBalance)"
                dot={false}
                activeDot={{ r: 4, fill: 'hsl(var(--foreground))', stroke: 'hsl(var(--card))', strokeWidth: 2 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* Principal vs Interest stacked area */}
        <Card className="md:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-2xl">EMI split — principal vs interest</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={splitData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }} stackOffset="none">
                <defs>
                  <linearGradient id="gradPrincipal" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--positive))" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="hsl(var(--positive))" stopOpacity={0.05} />
                  </linearGradient>
                  <linearGradient id="gradInterest" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--negative))" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="hsl(var(--negative))" stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="2 4" stroke="hsl(var(--border))" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))', fontFamily: 'JetBrains Mono' }}
                  axisLine={false}
                  tickLine={false}
                  interval="preserveStartEnd"
                  minTickGap={30}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))', fontFamily: 'JetBrains Mono' }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={INR_COMPACT}
                  width={60}
                />
                <Tooltip
                  cursor={{ stroke: 'hsl(var(--foreground))', strokeWidth: 1, strokeDasharray: '3 3', strokeOpacity: 0.4 }}
                  contentStyle={TOOLTIP_STYLE}
                  labelStyle={TOOLTIP_LABEL_STYLE}
                  formatter={(v: number, name: string) => [formatINR(v.toFixed(2)), name]}
                />
                <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                <Area
                  type="monotone"
                  dataKey="interest"
                  stackId="1"
                  stroke="hsl(var(--negative))"
                  strokeWidth={1.5}
                  fill="url(#gradInterest)"
                  name="Interest"
                />
                <Area
                  type="monotone"
                  dataKey="principal"
                  stackId="1"
                  stroke="hsl(var(--positive))"
                  strokeWidth={1.5}
                  fill="url(#gradPrincipal)"
                  name="Principal"
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Total cost donut */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-2xl">Total cost</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie
                  data={pieData}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={45}
                  outerRadius={75}
                  paddingAngle={2}
                  stroke="hsl(var(--card))"
                  strokeWidth={2}
                >
                  {pieData.map((_, i) => (
                    <Cell key={i} fill={pieColors[i]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  itemStyle={{ color: 'hsl(var(--popover-foreground))' }}
                  labelStyle={TOOLTIP_LABEL_STYLE}
                  formatter={(v: number, name: string) => [formatINR(v.toFixed(2)), name]}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="space-y-1.5 text-xs mt-2">
              <div className="flex justify-between items-center">
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <span className="h-2 w-2 rounded-full bg-positive" /> Principal
                </span>
                <span className="font-medium tabular-nums">{formatINR(totalPrincipal.toFixed(2))}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <span className="h-2 w-2 rounded-full bg-negative" /> Interest
                </span>
                <span className="font-medium tabular-nums">{formatINR(totalInterest.toFixed(2))}</span>
              </div>
              <div className="flex justify-between items-center border-t pt-1.5 mt-1">
                <span className="text-muted-foreground">Interest as % of cost</span>
                <span className="font-semibold tabular-nums text-negative">{interestPct.toFixed(1)}%</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ── Tax benefit section ───────────────────────────────────────────────

function TaxBenefitPanel({ summary }: { summary: LoanSummaryDTO }) {
  if (!summary.taxBenefit) return null;
  const tb = summary.taxBenefit;
  return (
    <Card className="border-blue-200 bg-blue-50/50 dark:border-blue-800 dark:bg-blue-900/10">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm text-blue-700 dark:text-blue-400">
          Tax benefit — Section {tb.section}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1.5 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Principal deduction (80C)</span>
          <span className="font-medium tabular-nums">{formatINR(tb.principalDeduction)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Interest deduction (24B)</span>
          <span className="font-medium tabular-nums">{formatINR(tb.interestDeduction)}</span>
        </div>
        <div className="flex justify-between border-t pt-1.5 mt-1">
          <span className="text-muted-foreground font-medium">Est. tax saving (30% slab)</span>
          <span className="font-semibold tabular-nums text-positive">{formatINR(tb.estimatedTaxSaving)}</span>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Page ──────────────────────────────────────────────────────────────

export function LoanDetailPage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [prepaymentSavingsMsg, setPrepaymentSavingsMsg] = useState<string | null>(null);

  const { data: loan, isLoading: loanLoading } = useQuery({
    queryKey: ['loan', id],
    queryFn: () => loansApi.get(id!),
    enabled: !!id,
  });

  const { data: summary } = useQuery({
    queryKey: ['loan-summary', id],
    queryFn: () => loansApi.getSummary(id!),
    enabled: !!id,
  });

  const { data: amortization } = useQuery({
    queryKey: ['loan-amortization', id],
    queryFn: () => loansApi.getAmortization(id!),
    enabled: !!id,
  });

  async function onPrepaymentRecorded() {
    // Refetch summary and compute savings message
    const newSummary = await loansApi.getSummary(id!);
    qc.setQueryData(['loan-summary', id], newSummary);
    if (newSummary.prepaymentSavings) {
      setPrepaymentSavingsMsg(
        `This prepayment saves you ${formatINR(newSummary.prepaymentSavings)} in interest!`
      );
    }
  }

  if (loanLoading) {
    return (
      <div>
        <PageHeader title="Loading…" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="h-24 animate-pulse bg-muted/60" />
          ))}
        </div>
      </div>
    );
  }

  if (!loan) return <div className="p-8 text-muted-foreground">Loan not found.</div>;

  // Progress calculations
  const emisPaid = loan.payments.filter((p) => p.paymentType === 'EMI').length;
  const tenureElapsedPct = Math.min(100, Math.round((emisPaid / loan.tenureMonths) * 100));

  const totalPrincipalPaid = loan.payments
    .filter((p) => p.principalPart)
    .reduce((s, p) => s.plus(new Decimal(p.principalPart!)), new Decimal(0));
  const principalRepaidPct = new Decimal(loan.principalAmount).isZero()
    ? 0
    : Math.min(100, totalPrincipalPaid.div(new Decimal(loan.principalAmount)).mul(100).toNumber());

  return (
    <div>
      <PageHeader
        title={loan.lenderName}
        description={`${LOAN_TYPE_LABELS[loan.loanType] ?? loan.loanType} loan · ${loan.borrowerName}${loan.accountNumber ? ` · ●●●● ${loan.accountNumber.slice(-4)}` : ''}`}
        actions={
          <div className="flex gap-2">
            <Button asChild variant="outline" size="sm">
              <Link to="/loans"><ArrowLeft className="h-4 w-4" /> Back</Link>
            </Button>
            <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
              <Pencil className="h-4 w-4" /> Edit
            </Button>
            <Button size="sm" onClick={() => setPaymentOpen(true)}>
              <Plus className="h-4 w-4" /> Record payment
            </Button>
          </div>
        }
      />

      {/* Prepayment savings banner */}
      {prepaymentSavingsMsg && (
        <div className="mb-4 rounded-lg bg-positive/10 border border-positive/20 px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-positive text-sm font-medium">
            <Zap className="h-4 w-4" />
            {prepaymentSavingsMsg}
          </div>
          <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => setPrepaymentSavingsMsg(null)}>
            Dismiss
          </Button>
        </div>
      )}

      {/* Summary metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <MetricCard
          label="Outstanding balance"
          value={summary ? formatINR(summary.outstandingBalance) : '…'}
          sub={summary ? `of ${formatINR(loan.principalAmount)} principal` : undefined}
        />
        <MetricCard
          label="Interest paid"
          value={summary ? formatINR(summary.totalInterestPaid) : '…'}
          sub={summary ? `Principal paid: ${formatINR(summary.totalPrincipalPaid)}` : undefined}
        />
        <MetricCard
          label="Remaining months"
          value={summary ? String(summary.remainingTenureMonths) : '…'}
          sub={summary ? `${summary.remainingEmiCount} EMIs left` : undefined}
        />
        <MetricCard
          label="Next EMI"
          value={summary ? formatINR(summary.nextEmiAmount) : formatINR(loan.emiAmount)}
          sub={summary?.nextEmiDate ? formatDate(summary.nextEmiDate) : undefined}
        />
      </div>

      {/* Progress bars */}
      <Card className="mb-4">
        <CardContent className="px-4 py-4 space-y-3">
          <div>
            <div className="flex items-center justify-between text-xs mb-1.5">
              <span className="text-muted-foreground">Principal repaid</span>
              <span className="font-medium">{principalRepaidPct.toFixed(0)}% of {formatINR(loan.principalAmount)}</span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div className="h-full bg-positive rounded-full transition-all" style={{ width: `${principalRepaidPct}%` }} />
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between text-xs mb-1.5">
              <span className="text-muted-foreground">Tenure elapsed</span>
              <span className="font-medium">{tenureElapsedPct}% ({emisPaid} of {loan.tenureMonths} months)</span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${tenureElapsedPct}%` }} />
            </div>
          </div>
          {summary && (
            <div className="pt-1 border-t flex justify-between text-xs">
              <span className="text-muted-foreground">Total interest payable</span>
              <span className="font-medium tabular-nums text-negative">{formatINR(summary.totalInterestPayable)}</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tax benefit */}
      {summary && summary.taxBenefit && (
        <div className="mb-4">
          <TaxBenefitPanel summary={summary} />
        </div>
      )}

      {/* Linked vehicle / property */}
      {(loan.vehicleId || loan.rentalPropertyId) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
          {loan.vehicleId && (
            <Card>
              <CardContent className="px-4 py-3">
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Car className="h-3 w-3" /> Linked vehicle
                </p>
                <Link
                  to={`/vehicles/${loan.vehicleId}`}
                  className="text-sm font-medium mt-1 text-accent hover:underline block"
                >
                  View vehicle details →
                </Link>
              </CardContent>
            </Card>
          )}
          {loan.rentalPropertyId && (
            <Card>
              <CardContent className="px-4 py-3">
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Building2 className="h-3 w-3" /> Linked property
                </p>
                <Link
                  to={`/rental/${loan.rentalPropertyId}`}
                  className="text-sm font-medium mt-1 text-accent hover:underline block"
                >
                  View property details →
                </Link>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Charts */}
      {amortization && amortization.length > 0 && (
        <LoanCharts rows={amortization} summary={summary} />
      )}

      {/* Payment history */}
      <div className="mb-4">
        <PaymentHistoryTable loan={loan} />
      </div>

      {/* Amortization schedule */}
      {amortization && amortization.length > 0 && (
        <AmortizationTable loan={loan} rows={amortization} />
      )}
      {amortization && amortization.length === 0 && (
        <Card>
          <CardContent className="px-4 py-6 text-center text-xs text-muted-foreground">
            No amortization data available
          </CardContent>
        </Card>
      )}

      <PaymentDialog
        loanId={loan.id}
        open={paymentOpen}
        onOpenChange={setPaymentOpen}
        onPrepaymentRecorded={onPrepaymentRecorded}
      />

      {editOpen && (
        <EditLoanDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          loan={loan}
        />
      )}
    </div>
  );
}
