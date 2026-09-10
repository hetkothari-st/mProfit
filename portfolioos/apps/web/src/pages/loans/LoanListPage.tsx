import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  Briefcase,
  Calculator,
  Car,
  Coins,
  GraduationCap,
  Home,
  Landmark,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Decimal, formatINR } from '@portfolioos/shared';
import { PageHeader } from '@/components/layout/PageHeader';
import { DownloadReportButton } from '@/components/reports/DownloadReportButton';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/common/EmptyState';
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
import { Figure, ReceiptShell } from '@/components/receipt/Receipt';
import { BankLogo } from '@/components/bankAccounts/BankLogo';
import { useReceiptLook } from '@/components/receipt/useReceiptLook';
import {
  loansApi,
  type LoanDTO,
  type CreateLoanInput,
} from '@/api/loans.api';

// ── Helpers ───────────────────────────────────────────────────────────

const LOAN_TYPE_LABELS: Record<string, string> = {
  HOME: 'Home',
  CAR: 'Car',
  PERSONAL: 'Personal',
  EDUCATION: 'Education',
  BUSINESS: 'Business',
  GOLD: 'Gold',
  LAS: 'LAS',
  OTHER: 'Other',
};

function formatDate(iso: string | null | undefined) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function daysUntil(isoDate: string): number {
  const due = new Date(isoDate).getTime();
  return Math.ceil((due - Date.now()) / (1000 * 60 * 60 * 24));
}

function addMonthsIso(iso: string, months: number): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}

// ── Summary strip ─────────────────────────────────────────────────────

function SummaryStrip({ loans }: { loans: LoanDTO[] }) {
  const active = loans.filter((l) => l.status === 'ACTIVE');
  const totalOutstanding = active.reduce(
    (s, l) => s.plus(new Decimal(l.principalAmount)),
    new Decimal(0),
  );
  const monthlyEmi = active.reduce(
    (s, l) => s.plus(new Decimal(l.emiAmount)),
    new Decimal(0),
  );

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
      {[
        { label: 'Total disbursed', value: formatINR(totalOutstanding.toString()), sub: 'original principal (active loans)' },
        { label: 'Monthly EMI', value: formatINR(monthlyEmi.toString()), sub: 'combined across active loans' },
        { label: 'Active loans', value: String(active.length), sub: `of ${loans.length} total` },
      ].map((m) => (
        <Card key={m.label}>
          <CardContent className="px-4 py-3">
            <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">{m.label}</p>
            <p className="text-lg sm:text-xl font-semibold tabular-nums mt-1 break-words">{m.value}</p>
            <p className="text-xs text-muted-foreground">{m.sub}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ── Loan card ─────────────────────────────────────────────────────────
//
// An EMI coupon: a loan is repaid slip by slip, so the card is a slip with a
// tear-off stub. The stub is printed in the lender's brand (logo, loan type,
// rate, a watermark of what the loan bought); a perforated edge with notches
// separates it from the body, which tracks the payoff — outstanding, a
// segmented bar that fills as EMIs are paid, and the terms.

const LOAN_FALLBACK = '#475569'; // slate, for lenders outside the bank list
const PAYOFF_SEGMENTS = 40;

const LOAN_TYPE_ICONS: Record<string, LucideIcon> = {
  HOME: Home,
  CAR: Car,
  PERSONAL: Wallet,
  EDUCATION: GraduationCap,
  BUSINESS: Briefcase,
  GOLD: Coins,
  LAS: TrendingUp,
  OTHER: Landmark,
};

function PayoffBar({ pct, accent }: { pct: number; accent: string }) {
  const p = Math.min(100, Math.max(0, pct));
  const filled = Math.round((p / 100) * PAYOFF_SEGMENTS);
  return (
    <div
      role="img"
      aria-label={`${Math.round(p)}% repaid`}
      title={`${Math.round(p)}% repaid`}
      className="flex gap-[3px]"
    >
      {Array.from({ length: PAYOFF_SEGMENTS }, (_, i) => (
        <span
          key={i}
          className={`h-2.5 flex-1 rounded-[2px] ${i < filled ? '' : 'bg-muted'}`}
          style={i < filled ? { background: accent } : undefined}
        />
      ))}
    </div>
  );
}

const STUB_BUTTON =
  '-m-1 rounded p-1 text-white/65 transition-colors hover:bg-white/15 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 disabled:opacity-60';

function LoanCard({
  loan,
  onEdit,
  onDelete,
  isDeleting,
}: {
  loan: LoanDTO;
  onEdit: () => void;
  onDelete: () => void;
  isDeleting: boolean;
}) {
  const navigate = useNavigate();
  const { panel, accent } = useReceiptLook(loan.lenderName, LOAN_FALLBACK);
  const active = loan.status === 'ACTIVE';

  // Outstanding balance, next due date, EMIs left and amounts paid come from
  // the server's amortization (prepayments included), not re-derived here.
  const { data: summary } = useQuery({
    queryKey: ['loans', loan.id, 'summary'],
    queryFn: () => loansApi.getSummary(loan.id),
    enabled: active,
  });

  const emiCount = loan.payments.filter((p) => p.paymentType === 'EMI').length;
  const tenure = loan.tenureMonths;
  // A prepayment that reduces tenure shortens the plan; count against that.
  const plan = summary ? emiCount + summary.remainingEmiCount : tenure;
  const progress = active ? (plan > 0 ? Math.min(100, (emiCount / plan) * 100) : 0) : 100;
  const emisLeft = summary ? summary.remainingEmiCount : Math.max(0, tenure - emiCount);

  const firstEmi = loan.firstEmiDate.slice(0, 10);
  const nextEmi = !active
    ? null
    : summary
      ? (summary.nextEmiDate?.slice(0, 10) ?? null)
      : emiCount < tenure
        ? addMonthsIso(firstEmi, emiCount)
        : null;
  const lastEmi = summary?.effectiveEndDate?.slice(0, 10) ?? (tenure > 0 ? addMonthsIso(firstEmi, tenure - 1) : null);
  const dueIn = nextEmi ? daysUntil(nextEmi) : null;
  const paidSoFar = summary
    ? new Decimal(summary.totalPrincipalPaid).plus(summary.totalInterestPaid)
    : null;

  const typeLabel = LOAN_TYPE_LABELS[loan.loanType] ?? loan.loanType;
  const TypeIcon = LOAN_TYPE_ICONS[loan.loanType] ?? Landmark;
  const stamp = loan.status === 'DEFAULT' ? 'Default' : active ? null : 'Closed';
  const rate = loan.interestRate ? new Decimal(loan.interestRate).toString() : null;
  const owner = [
    loan.borrowerName,
    loan.accountNumber ? `a/c ending ${loan.accountNumber.slice(-4)}` : null,
  ]
    .filter(Boolean)
    .join(', ');

  // The card is a link; its buttons must not also open it.
  const act = (fn: () => void) => (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    fn();
  };

  return (
    <ReceiptShell
      label={`${loan.lenderName} ${typeLabel.toLowerCase()} loan`}
      onClick={() => navigate(`/loans/${loan.id}`)}
    >
      <div className="flex flex-col sm:flex-row">
        {/* Stub */}
        <div
          className="relative flex flex-col justify-between gap-5 overflow-hidden p-5 text-white sm:w-[38%] sm:shrink-0"
          style={{
            backgroundImage: `linear-gradient(160deg, ${panel.from} 0%, ${panel.via} 55%, ${panel.to} 100%)`,
          }}
        >
          <TypeIcon
            aria-hidden
            strokeWidth={1.1}
            className="pointer-events-none absolute -bottom-5 -right-5 h-32 w-32 text-white/[0.09]"
          />
          <div className="relative space-y-3">
            <BankLogo bankName={loan.lenderName} size={28} maxWidth={130} className="shadow-md" />
            <div>
              <h3 className="break-words font-display text-[22px] leading-tight">{loan.lenderName}</h3>
              <p className="mt-1 text-[13px] text-white/75">{typeLabel} loan</p>
            </div>
          </div>
          <div className="relative flex items-end justify-between gap-2">
            {rate ? (
              <div>
                <p className="font-display text-[34px] leading-none tabular-nums">
                  {rate}
                  <span className="text-xl">%</span>
                </p>
                <p className="mt-1 text-xs text-white/70">interest a year</p>
              </div>
            ) : (
              <span />
            )}
            <div className="flex items-center gap-2">
              <button type="button" onClick={act(onEdit)} aria-label="Edit loan" className={STUB_BUTTON}>
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={act(onDelete)}
                disabled={isDeleting}
                aria-label="Delete loan"
                className={STUB_BUTTON}
              >
                {isDeleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              </button>
            </div>
          </div>
          {stamp && (
            <div className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 rotate-12 rounded-sm border-2 border-white/75 px-2 py-0.5 font-display text-sm text-white/90">
              {stamp}
            </div>
          )}
        </div>

        {/* Perforation: dashed tear line with a notch bitten out at each edge */}
        <div aria-hidden className="relative hidden sm:block">
          <div className="absolute inset-y-3 left-0 border-l-2 border-dashed border-border" />
          <span className="absolute -left-2.5 -top-2.5 h-5 w-5 rounded-full bg-background" />
          <span className="absolute -bottom-2.5 -left-2.5 h-5 w-5 rounded-full bg-background" />
        </div>

        {/* Body */}
        <div className="min-w-0 flex-1 space-y-4 p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm text-muted-foreground">{active ? 'Outstanding' : 'Loan amount'}</p>
              <p className="money-digits truncate font-display text-[28px] leading-tight tabular-nums text-foreground">
                {active ? (summary ? formatINR(summary.outstandingBalance) : '—') : formatINR(loan.principalAmount)}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p className="font-display text-[28px] leading-tight tabular-nums" style={{ color: accent }}>
                {Math.round(progress)}%
              </p>
              <p className="text-xs text-muted-foreground">repaid</p>
            </div>
          </div>

          <div>
            <PayoffBar pct={progress} accent={accent} />
            <div className="mt-2 flex items-baseline justify-between gap-3 text-xs text-muted-foreground">
              <span>First EMI {formatDate(firstEmi)}</span>
              {lastEmi && <span>Last EMI {formatDate(lastEmi)}</span>}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-x-4 gap-y-3">
            <Figure label="Principal">
              <span className="money-digits">{formatINR(loan.principalAmount)}</span>
            </Figure>
            <Figure label="Tenure">{tenure ? `${tenure} months` : '—'}</Figure>
            <Figure label="EMI">
              <span className="money-digits">{formatINR(loan.emiAmount)}</span>
            </Figure>
            <Figure
              label="Next EMI"
              hint={
                dueIn == null
                  ? undefined
                  : dueIn < 0
                    ? 'Overdue — record the payment once made'
                    : dueIn === 0
                      ? 'Due today'
                      : dueIn <= 7
                        ? `Due in ${dueIn} days`
                        : undefined
              }
              className={dueIn != null && dueIn <= 7 ? (dueIn < 0 ? 'text-negative' : 'text-warning') : undefined}
            >
              {nextEmi ? formatDate(nextEmi) : active ? '—' : 'None'}
            </Figure>
            <Figure label="EMIs left">{active ? emisLeft : 0}</Figure>
            <Figure label="Paid so far">
              <span className="money-digits">{paidSoFar ? formatINR(paidSoFar.toString()) : '—'}</span>
            </Figure>
          </div>

          <p className="truncate border-t border-dashed border-border/70 pt-3 text-xs text-muted-foreground">
            {owner}
          </p>
        </div>
      </div>
    </ReceiptShell>
  );
}

// ── Create / Edit dialog ──────────────────────────────────────────────

function calcEmi(principal: string, rate: string, tenure: string): string {
  try {
    const p = new Decimal(principal);
    const r = new Decimal(rate).div(12).div(100);
    const n = new Decimal(tenure);
    if (r.isZero()) return p.div(n).toFixed(2);
    // EMI = P * r * (1+r)^n / ((1+r)^n - 1)
    const onePlusR = r.plus(1);
    const pow = onePlusR.pow(n.toNumber());
    const emi = p.mul(r).mul(pow).div(pow.minus(1));
    return emi.toFixed(2);
  } catch {
    return '';
  }
}

function CreateLoanDialog({
  open,
  onOpenChange,
  initial,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial?: LoanDTO | null;
}) {
  const qc = useQueryClient();
  const isEdit = !!initial;

  const [form, setForm] = useState<CreateLoanInput>({
    lenderName: initial?.lenderName ?? '',
    loanType: initial?.loanType ?? 'HOME',
    borrowerName: initial?.borrowerName ?? '',
    accountNumber: initial?.accountNumber ?? '',
    principalAmount: initial?.principalAmount ?? '',
    interestRate: initial?.interestRate ?? '',
    tenureMonths: initial?.tenureMonths ?? 0,
    emiAmount: initial?.emiAmount ?? '',
    emiDueDay: initial?.emiDueDay ?? 1,
    disbursementDate: initial?.disbursementDate ?? '',
    firstEmiDate: initial?.firstEmiDate ?? '',
    prepaymentOption: initial?.prepaymentOption ?? 'REDUCE_TENURE',
    taxBenefitSection: initial?.taxBenefitSection ?? null,
    status: initial?.status ?? 'ACTIVE',
    portfolioId: initial?.portfolioId ?? null,
  });

  const [errors, setErrors] = useState<Partial<Record<string, string>>>({});

  // Re-sync form when dialog opens with a different initial loan
  useEffect(() => {
    if (open) {
      const toDateInput = (v: string | null | undefined) => (v ? v.slice(0, 10) : '');
      setForm({
        lenderName: initial?.lenderName ?? '',
        loanType: initial?.loanType ?? 'HOME',
        borrowerName: initial?.borrowerName ?? '',
        accountNumber: initial?.accountNumber ?? '',
        principalAmount: initial?.principalAmount ?? '',
        interestRate: initial?.interestRate ?? '',
        tenureMonths: initial?.tenureMonths ?? 0,
        emiAmount: initial?.emiAmount ?? '',
        emiDueDay: initial?.emiDueDay ?? 1,
        disbursementDate: toDateInput(initial?.disbursementDate),
        firstEmiDate: toDateInput(initial?.firstEmiDate),
        prepaymentOption: initial?.prepaymentOption ?? 'REDUCE_TENURE',
        taxBenefitSection: initial?.taxBenefitSection ?? null,
        status: initial?.status ?? 'ACTIVE',
        portfolioId: initial?.portfolioId ?? null,
      });
      setErrors({});
    }
  }, [open, initial]);

  const mutation = useMutation({
    mutationFn: (input: CreateLoanInput) =>
      isEdit ? loansApi.update(initial!.id, input) : loansApi.create(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['loans'] });
      toast.success(isEdit ? 'Loan updated' : 'Loan added');
      onOpenChange(false);
    },
    onError: () => toast.error(isEdit ? 'Failed to update loan' : 'Failed to add loan'),
  });

  function set<K extends keyof CreateLoanInput>(key: K, value: CreateLoanInput[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function handleCalcEmi() {
    const emi = calcEmi(form.principalAmount, form.interestRate, String(form.tenureMonths));
    if (emi) set('emiAmount', emi);
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

  function handleSubmit() {
    if (!validate()) return;
    mutation.mutate({
      ...form,
      lenderName: form.lenderName.trim(),
      borrowerName: form.borrowerName.trim(),
      accountNumber: form.accountNumber?.trim() || null,
      taxBenefitSection: form.taxBenefitSection || null,
    });
  }

  const inp = (key: keyof CreateLoanInput, type = 'text') => ({
    type,
    value: String(form[key] ?? ''),
    onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
      set(key, (type === 'number' ? (e.target.value === '' ? 0 : Number(e.target.value)) : e.target.value) as CreateLoanInput[typeof key]),
    className: `w-full${errors[key] ? ' border-negative' : ''}`,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit loan' : 'Add loan'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Lender name *</Label>
              <Input placeholder="HDFC Bank, SBI…" {...inp('lenderName')} />
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
              <Label>Borrower name *</Label>
              <Input placeholder="Full name" {...inp('borrowerName')} />
              {errors['borrowerName'] && <p className="text-xs text-negative mt-1">{errors['borrowerName']}</p>}
            </div>
            <div>
              <Label>Account number</Label>
              <Input placeholder="Optional" {...inp('accountNumber')} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Principal amount (₹) *</Label>
              <Input placeholder="1000000" {...inp('principalAmount')} />
              {errors['principalAmount'] && <p className="text-xs text-negative mt-1">{errors['principalAmount']}</p>}
            </div>
            <div>
              <Label>Interest rate (% p.a.) *</Label>
              <Input placeholder="8.50" step="0.01" {...inp('interestRate')} />
              {errors['interestRate'] && <p className="text-xs text-negative mt-1">{errors['interestRate']}</p>}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Tenure (months) *</Label>
              <Input placeholder="240" type="number" min="1"
                value={form.tenureMonths || ''}
                onChange={(e) => set('tenureMonths', Number(e.target.value))}
                className={errors['tenureMonths'] ? 'border-negative' : ''} />
              {errors['tenureMonths'] && <p className="text-xs text-negative mt-1">{errors['tenureMonths']}</p>}
            </div>
            <div>
              <Label>EMI amount (₹) *</Label>
              <div className="flex gap-1.5">
                <Input placeholder="9000" {...inp('emiAmount')}
                  className={`flex-1${errors['emiAmount'] ? ' border-negative' : ''}`} />
                <Button type="button" variant="outline" size="sm" className="shrink-0 px-2" onClick={handleCalcEmi} title="Auto-calculate">
                  <Calculator className="h-3.5 w-3.5" />
                </Button>
              </div>
              {errors['emiAmount'] && <p className="text-xs text-negative mt-1">{errors['emiAmount']}</p>}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>EMI due day (1-28)</Label>
              <Input type="number" min="1" max="28"
                value={form.emiDueDay}
                onChange={(e) => set('emiDueDay', Number(e.target.value))} />
            </div>
            <div>
              <Label>Prepayment option</Label>
              <select
                className="w-full mt-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={form.prepaymentOption}
                onChange={(e) => set('prepaymentOption', e.target.value)}
              >
                <option value="REDUCE_TENURE">Reduce tenure</option>
                <option value="REDUCE_EMI">Reduce EMI</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Disbursement date *</Label>
              <Input {...inp('disbursementDate', 'date')} />
              {errors['disbursementDate'] && <p className="text-xs text-negative mt-1">{errors['disbursementDate']}</p>}
            </div>
            <div>
              <Label>First EMI date *</Label>
              <Input {...inp('firstEmiDate', 'date')} />
              {errors['firstEmiDate'] && <p className="text-xs text-negative mt-1">{errors['firstEmiDate']}</p>}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
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
          </div>

          <div>
            <Label>Portfolio</Label>
            <PortfolioSelect
              value={form.portfolioId ?? null}
              onChange={(v) => set('portfolioId', v)}
            />
            <p className="text-xs text-muted-foreground mt-1">
              Optional — assign this loan to a portfolio to group it with related assets.
            </p>
          </div>
        </div>

        {mutation.isError && (
          <p className="text-sm text-negative">
            {mutation.error instanceof Error ? mutation.error.message : 'Failed to save loan'}
          </p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={mutation.isPending}>
            {mutation.isPending ? 'Saving…' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Page ──────────────────────────────────────────────────────────────

export function LoanListPage() {
  const [createOpen, setCreateOpen] = useState(false);
  const [editLoan, setEditLoan] = useState<LoanDTO | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const qc = useQueryClient();

  const { data: loans, isLoading } = useQuery({
    queryKey: ['loans'],
    queryFn: () => loansApi.list(),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => loansApi.remove(id),
    onSuccess: () => {
      toast.success('Loan deleted');
      setConfirmDeleteId(null);
      qc.invalidateQueries({ queryKey: ['loans'] });
    },
    onError: () => toast.error('Failed to delete loan'),
  });

  const list = loans ?? [];
  const active = list.filter((l) => l.status === 'ACTIVE');
  const inactive = list.filter((l) => l.status !== 'ACTIVE');

  return (
    <div>
      <PageHeader
        title="Loans"
        description="Track home, car, personal, and other loans"
        actions={
          <div className="flex gap-2">
            <DownloadReportButton type="loans" />
            <Button onClick={() => { setEditLoan(null); setCreateOpen(true); }}>
              <Plus className="h-4 w-4" /> Add loan
            </Button>
          </div>
        }
      />

      {!isLoading && list.length > 0 && <SummaryStrip loans={list} />}

      {isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} className="h-44 animate-pulse bg-muted/60" />
          ))}
        </div>
      )}

      {!isLoading && list.length === 0 && (
        <EmptyState
          icon={Landmark}
          title="No loans yet"
          description="Track your home, car, personal, and education loans — payments, amortization, and tax benefits."
          action={
            <Button onClick={() => { setEditLoan(null); setCreateOpen(true); }}>
              <Plus className="h-4 w-4" /> Add first loan
            </Button>
          }
        />
      )}

      {!isLoading && active.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {active.map((loan) =>
            confirmDeleteId === loan.id ? (
              <Card key={loan.id} className="border-destructive">
                <CardContent className="p-5 flex items-center justify-between gap-3">
                  <p className="text-sm font-medium truncate">Delete "{loan.lenderName}" loan?</p>
                  <div className="flex gap-2 shrink-0">
                    <Button
                      variant="destructive"
                      size="sm"
                      disabled={deleteMutation.isPending}
                      onClick={() => deleteMutation.mutate(loan.id)}
                    >
                      {deleteMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Yes'}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setConfirmDeleteId(null)}>No</Button>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <LoanCard
                key={loan.id}
                loan={loan}
                onEdit={() => { setEditLoan(loan); setCreateOpen(true); }}
                onDelete={() => setConfirmDeleteId(loan.id)}
                isDeleting={deleteMutation.isPending && confirmDeleteId === loan.id}
              />
            )
          )}
        </div>
      )}

      {!isLoading && inactive.length > 0 && (
        <>
          <h2 className="text-sm font-medium text-muted-foreground mt-8 mb-3">Closed / Foreclosed</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 opacity-60">
            {inactive.map((loan) =>
              confirmDeleteId === loan.id ? (
                <Card key={loan.id} className="border-destructive">
                  <CardContent className="p-5 flex items-center justify-between gap-3">
                    <p className="text-sm font-medium truncate">Delete "{loan.lenderName}"?</p>
                    <div className="flex gap-2 shrink-0">
                      <Button
                        variant="destructive"
                        size="sm"
                        disabled={deleteMutation.isPending}
                        onClick={() => deleteMutation.mutate(loan.id)}
                      >
                        {deleteMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Yes'}
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setConfirmDeleteId(null)}>No</Button>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <LoanCard
                  key={loan.id}
                  loan={loan}
                  onEdit={() => { setEditLoan(loan); setCreateOpen(true); }}
                  onDelete={() => setConfirmDeleteId(loan.id)}
                  isDeleting={deleteMutation.isPending && confirmDeleteId === loan.id}
                />
              )
            )}
          </div>
        </>
      )}

      <CreateLoanDialog
        open={createOpen}
        onOpenChange={(v) => { setCreateOpen(v); if (!v) setEditLoan(null); }}
        initial={editLoan}
      />
    </div>
  );
}
