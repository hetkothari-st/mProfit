import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  Landmark,
  Plus,
  ArrowUpRight,
  AlertTriangle,
  Loader2,
  Trash2,
  Pencil,
  Calculator,
  Calendar,
  Home,
  Car,
  GraduationCap,
  Briefcase,
  Coins,
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

interface LoanTypeStyle {
  icon: LucideIcon;
  /** Engraved-tone label color, drawn from theme. */
  accent: 'brass' | 'forest' | 'oxblood' | 'plum' | 'teal' | 'ink';
}

const LOAN_TYPE_STYLES: Record<string, LoanTypeStyle> = {
  HOME:      { icon: Home,          accent: 'ink' },
  CAR:       { icon: Car,           accent: 'oxblood' },
  PERSONAL:  { icon: Wallet,        accent: 'brass' },
  EDUCATION: { icon: GraduationCap, accent: 'plum' },
  BUSINESS:  { icon: Briefcase,     accent: 'forest' },
  GOLD:      { icon: Coins,         accent: 'brass' },
  LAS:       { icon: TrendingUp,    accent: 'teal' },
  OTHER:     { icon: Landmark,      accent: 'ink' },
};

function getLoanStyle(type: string): LoanTypeStyle {
  return LOAN_TYPE_STYLES[type] ?? LOAN_TYPE_STYLES.OTHER!;
}

function accentColor(a: LoanTypeStyle['accent']): string {
  switch (a) {
    case 'brass':   return 'hsl(var(--accent))';
    case 'forest':  return 'hsl(var(--positive))';
    case 'oxblood': return 'hsl(var(--negative))';
    case 'plum':    return 'hsl(260 28% 38%)';
    case 'teal':    return 'hsl(195 40% 32%)';
    case 'ink':
    default:        return 'hsl(var(--primary))';
  }
}

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: 'text-positive',
  CLOSED: 'text-muted-foreground',
  FORECLOSED: 'text-muted-foreground',
  DEFAULT: 'text-negative',
};

function formatDate(iso: string | null | undefined) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function daysUntil(isoDate: string): number {
  const due = new Date(isoDate).getTime();
  return Math.ceil((due - Date.now()) / (1000 * 60 * 60 * 24));
}

function emiCountdownBadge(nextEmiDate: string | null | undefined) {
  if (!nextEmiDate) return null;
  const days = daysUntil(nextEmiDate);
  let cls = 'bg-muted text-muted-foreground';
  let label = `in ${days}d`;
  if (days < 0) { cls = 'bg-negative/10 text-negative'; label = 'Overdue'; }
  else if (days === 0) { cls = 'bg-negative/10 text-negative'; label = 'Today'; }
  else if (days <= 7) { cls = 'bg-amber-100 text-amber-700'; label = `in ${days}d`; }
  return (
    <span className={`text-xs font-medium px-1.5 py-0.5 rounded-full ${cls}`}>
      EMI {label}
    </span>
  );
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
    <div className="grid grid-cols-3 gap-3 mb-6">
      {[
        { label: 'Total disbursed', value: formatINR(totalOutstanding.toString()), sub: 'original principal (active loans)' },
        { label: 'Monthly EMI', value: formatINR(monthlyEmi.toString()), sub: 'combined across active loans' },
        { label: 'Active loans', value: String(active.length), sub: `of ${loans.length} total` },
      ].map((m) => (
        <Card key={m.label}>
          <CardContent className="px-4 py-3">
            <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">{m.label}</p>
            <p className="text-xl font-semibold tabular-nums mt-1">{m.value}</p>
            <p className="text-xs text-muted-foreground">{m.sub}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ── Loan card ─────────────────────────────────────────────────────────

// ── Amortization ring (SVG) ───────────────────────────────────────────

function AmortizationRing({
  pct, color, emiCount, tenure,
}: { pct: number; color: string; emiCount: number; tenure: number }) {
  const size = 96;
  const stroke = 6;
  const radius = (size - stroke) / 2;
  const circ = 2 * Math.PI * radius;
  const dash = (Math.min(100, Math.max(0, pct)) / 100) * circ;

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          fill="none" stroke="hsl(var(--border))" strokeWidth={stroke}
        />
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          fill="none" stroke={color} strokeWidth={stroke}
          strokeDasharray={`${dash} ${circ}`}
          strokeLinecap="round"
          style={{ transition: 'stroke-dasharray 600ms cubic-bezier(0.22, 0.61, 0.36, 1)' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="font-display text-2xl leading-none tracking-tight" style={{ color }}>
          {pct.toFixed(0)}%
        </span>
        <span className="text-[9px] uppercase tracking-[0.18em] text-muted-foreground mt-0.5 font-mono">
          {emiCount}/{tenure}
        </span>
      </div>
    </div>
  );
}

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
  const emiCount = loan.payments.filter((p) => p.paymentType === 'EMI').length;
  const tenure = loan.tenureMonths || 1;
  const progressPct = Math.min(100, Math.max(0, (emiCount / tenure) * 100));

  const nextEmiDateStr: string | null = (() => {
    if (loan.status !== 'ACTIVE') return null;
    try {
      const base = new Date(loan.firstEmiDate);
      base.setMonth(base.getMonth() + emiCount);
      return base.toISOString().slice(0, 10);
    } catch {
      return null;
    }
  })();

  const style = getLoanStyle(loan.loanType);
  const TypeIcon = style.icon;
  const typeLabel = LOAN_TYPE_LABELS[loan.loanType] ?? loan.loanType;
  const ringColor = accentColor(style.accent);

  // Bond serial — pseudo-certificate marker.
  const serial = loan.id.replace(/[^A-Z0-9]/gi, '').slice(-8).toUpperCase();
  const isClosed = loan.status === 'CLOSED' || loan.status === 'FORECLOSED';
  const isDefault = loan.status === 'DEFAULT';

  const stop = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  return (
    <Link
      to={`/loans/${loan.id}`}
      className="block group focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:ring-offset-2 rounded-lg"
    >
      <Card
        className={`overflow-hidden p-0 cursor-pointer transition-all duration-300 paper relative
          group-hover:shadow-elev-lg group-hover:-translate-y-0.5
          ${isClosed ? 'opacity-70' : ''}`}
        style={{ borderTop: `3px solid ${ringColor}` }}
      >
        {/* Engraved bond header */}
        <div className="relative px-5 pt-3 pb-2 border-b border-border/70">
          <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.22em] font-medium">
            <span className="flex items-center gap-1.5" style={{ color: ringColor }}>
              <TypeIcon className="h-3 w-3" strokeWidth={1.8} />
              {typeLabel} loan
            </span>
            <span className="font-mono normal-case tracking-normal text-muted-foreground">
              № {serial}
            </span>
          </div>
          {/* Lender + borrower */}
          <div className="mt-2 flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <h3 className="font-sans font-semibold text-[28px] leading-[1.1] tracking-[-0.02em] text-foreground truncate">
                {loan.lenderName}
              </h3>
              <div className="flex items-center gap-1.5 mt-2.5 text-base text-muted-foreground">
                {loan.accountNumber && (
                  <>
                    <span className="font-mono tabular-nums">●●●● {loan.accountNumber.slice(-4)}</span>
                    <span className="text-accent/60">·</span>
                  </>
                )}
                <span className="font-display-italic truncate">{loan.borrowerName}</span>
              </div>
            </div>
            <div className="flex items-center gap-0.5 shrink-0 -mr-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0"
                onClick={(e) => { stop(e); onEdit(); }} title="Edit">
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button variant="ghost" size="sm"
                className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                onClick={(e) => { stop(e); onDelete(); }} disabled={isDeleting} title="Delete">
                {isDeleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              </Button>
            </div>
          </div>
        </div>

        {/* Body — ring + ledger grid */}
        <CardContent className="p-5 relative">
          <div className="grid grid-cols-[auto_1fr] gap-5 items-center">
            <AmortizationRing
              pct={progressPct} color={ringColor}
              emiCount={emiCount} tenure={tenure}
            />
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground font-medium">
                Principal
              </p>
              <p className="numeric-display-lg money-digits text-2xl mt-0.5">
                {formatINR(loan.principalAmount)}
              </p>
              <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                <div>
                  <p className="text-[9px] uppercase tracking-[0.18em] text-muted-foreground/80 font-mono">EMI</p>
                  <p className="font-medium tabular-nums">{formatINR(loan.emiAmount)}</p>
                </div>
                <div>
                  <p className="text-[9px] uppercase tracking-[0.18em] text-muted-foreground/80 font-mono">Rate</p>
                  <p className="font-medium tabular-nums">{loan.interestRate}%</p>
                </div>
                <div>
                  <p className="text-[9px] uppercase tracking-[0.18em] text-muted-foreground/80 font-mono">Tenure</p>
                  <p className="font-medium tabular-nums">{loan.tenureMonths}m</p>
                </div>
                <div>
                  <p className="text-[9px] uppercase tracking-[0.18em] text-muted-foreground/80 font-mono">Status</p>
                  <p className={`font-medium capitalize ${STATUS_COLORS[loan.status] ?? ''}`}>
                    {loan.status.toLowerCase()}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Footer rule + next EMI / status */}
          <div className="mt-4 pt-3 border-t border-dashed border-border/70 flex items-center justify-between text-xs">
            {nextEmiDateStr ? (
              <>
                <span className="text-muted-foreground flex items-center gap-1.5">
                  <Calendar className="h-3 w-3" />
                  <span className="font-display-italic">Next EMI</span>
                  <span className="tabular-nums text-foreground">{formatDate(nextEmiDateStr)}</span>
                </span>
                {emiCountdownBadge(nextEmiDateStr)}
              </>
            ) : (
              <span className="text-muted-foreground font-display-italic">
                {isClosed ? 'Loan closed' : isDefault ? 'In default' : '—'}
              </span>
            )}
            <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground/60 group-hover:text-accent transition-colors ml-auto" />
          </div>

          {/* DEFAULT stamp overlay */}
          {isDefault && (
            <div className="absolute top-3 right-3 -rotate-6 border-2 border-negative px-2 py-0.5 rounded-sm font-display text-xs tracking-[0.18em] text-negative pointer-events-none flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" />
              DEFAULT
            </div>
          )}
          {isClosed && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <span className="font-display text-3xl tracking-[0.25em] text-muted-foreground/50 -rotate-12 border-4 border-muted-foreground/40 px-3 py-1 rounded-sm">
                CLOSED
              </span>
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
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
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 opacity-60">
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
