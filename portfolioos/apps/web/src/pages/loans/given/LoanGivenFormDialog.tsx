import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Loader2 } from 'lucide-react';
import { Decimal } from '@everypaisa/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { apiErrorMessage } from '@/api/client';
import {
  LOANS_GIVEN_KEYS,
  loansGivenApi,
  type LoanGivenDTO,
  type LoanGivenInput,
  type LoanGivenMode,
  type Relationship,
} from '@/api/loansGiven.api';

const RELATIONSHIPS: Array<{ value: Relationship; label: string }> = [
  { value: 'FRIEND', label: 'Friend' },
  { value: 'FAMILY', label: 'Family' },
  { value: 'COLLEAGUE', label: 'Colleague' },
  { value: 'BUSINESS', label: 'Business' },
  { value: 'OTHER', label: 'Other' },
];

const today = () => new Date().toISOString().slice(0, 10);
const cleanAmount = (v: string) => v.replace(/[,\s₹]/g, '');
const isAmount = (v: string) => /^\d+(\.\d+)?$/.test(v) && new Decimal(v).greaterThan(0);
/** "50000.0000" → "50000" for editing. */
const plain = (v: string | null | undefined) => (v ? new Decimal(v).toString() : '');

interface FormState {
  borrowerName: string;
  borrowerContact: string;
  relationship: Relationship | '';
  principalAmount: string;
  lentOn: string;
  interestRate: string;
  repaymentMode: LoanGivenMode;
  dueDate: string;
  emiAmount: string;
  tenureMonths: string;
  firstEmiDate: string;
  notes: string;
}

function initialState(loan: LoanGivenDTO | null): FormState {
  return {
    borrowerName: loan?.borrowerName ?? '',
    borrowerContact: loan?.borrowerContact ?? '',
    relationship: loan?.relationship ?? '',
    principalAmount: plain(loan?.principalAmount),
    lentOn: loan?.lentOn ?? today(),
    interestRate:
      loan && new Decimal(loan.interestRate).greaterThan(0) ? plain(loan.interestRate) : '',
    repaymentMode: loan?.repaymentMode ?? 'FLEXIBLE',
    dueDate: loan?.dueDate ?? '',
    emiAmount: plain(loan?.emiAmount),
    tenureMonths: loan?.tenureMonths ? String(loan.tenureMonths) : '',
    firstEmiDate: loan?.firstEmiDate ?? '',
    notes: loan?.notes ?? '',
  };
}

/** Add or edit a loan given. */
export function LoanGivenFormDialog({
  open,
  onOpenChange,
  initial,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: LoanGivenDTO | null;
  onSaved?: (loan: LoanGivenDTO) => void;
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState<FormState>(() => initialState(initial));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setForm(initialState(initial));
      setError(null);
    }
  }, [open, initial]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const save = useMutation({
    mutationFn: (input: LoanGivenInput) =>
      initial ? loansGivenApi.update(initial.id, input) : loansGivenApi.create(input),
    onSuccess: (loan) => {
      for (const key of LOANS_GIVEN_KEYS) void qc.invalidateQueries({ queryKey: [...key] });
      toast.success(initial ? 'Loan updated' : 'Loan added');
      onOpenChange(false);
      onSaved?.(loan);
    },
    onError: (err) => setError(apiErrorMessage(err, 'Could not save the loan')),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const principal = cleanAmount(form.principalAmount);
    const rate = cleanAmount(form.interestRate);
    const emi = cleanAmount(form.emiAmount);
    if (!form.borrowerName.trim()) return setError('Enter who you lent to');
    if (!isAmount(principal)) return setError('Enter the amount lent');
    if (rate && !/^\d+(\.\d+)?$/.test(rate))
      return setError('Enter the interest rate as a number, e.g. 12');
    if (form.repaymentMode === 'EMI') {
      if (!isAmount(emi)) return setError('Enter the EMI amount');
      if (!/^\d+$/.test(form.tenureMonths) || Number.parseInt(form.tenureMonths, 10) < 1)
        return setError('Enter the number of monthly instalments');
      if (!form.firstEmiDate) return setError('Pick the first EMI date');
    }
    save.mutate({
      borrowerName: form.borrowerName.trim(),
      borrowerContact: form.borrowerContact.trim() || null,
      relationship: form.relationship || null,
      principalAmount: principal,
      lentOn: form.lentOn,
      interestRate: rate || '0',
      repaymentMode: form.repaymentMode,
      dueDate: form.repaymentMode === 'FLEXIBLE' ? form.dueDate || null : null,
      emiAmount: form.repaymentMode === 'EMI' ? emi : null,
      tenureMonths: form.repaymentMode === 'EMI' ? Number.parseInt(form.tenureMonths, 10) : null,
      firstEmiDate: form.repaymentMode === 'EMI' ? form.firstEmiDate : null,
      notes: form.notes.trim() || null,
    });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !save.isPending && onOpenChange(o)}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{initial ? 'Edit loan given' : 'Lend money'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label htmlFor="lg-borrower">Lent to</Label>
              <Input
                id="lg-borrower"
                className="mt-1"
                placeholder="e.g. Rahul Sharma"
                value={form.borrowerName}
                onChange={(e) => set('borrowerName', e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="lg-relationship">Relationship (optional)</Label>
              <Select
                id="lg-relationship"
                className="mt-1"
                value={form.relationship}
                onChange={(e) => set('relationship', e.target.value as Relationship | '')}
              >
                <option value="">—</option>
                {RELATIONSHIPS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <div>
            <Label htmlFor="lg-contact">Phone or email (optional)</Label>
            <Input
              id="lg-contact"
              className="mt-1"
              value={form.borrowerContact}
              onChange={(e) => set('borrowerContact', e.target.value)}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <Label htmlFor="lg-amount">Amount lent (₹)</Label>
              <Input
                id="lg-amount"
                className="mt-1"
                inputMode="decimal"
                placeholder="e.g. 50000"
                value={form.principalAmount}
                onChange={(e) => set('principalAmount', e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="lg-lent-on">Lent on</Label>
              <Input
                id="lg-lent-on"
                className="mt-1"
                type="date"
                value={form.lentOn}
                onChange={(e) => set('lentOn', e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="lg-rate">Interest % / yr</Label>
              <Input
                id="lg-rate"
                className="mt-1"
                inputMode="decimal"
                placeholder="0 = interest-free"
                value={form.interestRate}
                onChange={(e) => set('interestRate', e.target.value)}
              />
            </div>
          </div>

          <div>
            <Label>How will it be repaid?</Label>
            <div className="mt-1 grid grid-cols-2 gap-2">
              {(
                [
                  ['FLEXIBLE', 'Whenever', 'Repaid in any amounts, any time'],
                  ['EMI', 'Monthly EMI', 'Fixed amount every month'],
                ] as const
              ).map(([mode, title, hint]) => (
                <button
                  key={mode}
                  type="button"
                  aria-pressed={form.repaymentMode === mode}
                  onClick={() => set('repaymentMode', mode)}
                  className={`rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                    form.repaymentMode === mode
                      ? 'border-primary bg-primary/10'
                      : 'border-border hover:border-foreground/30'
                  }`}
                >
                  <div className="font-medium">{title}</div>
                  <div className="text-xs text-muted-foreground">{hint}</div>
                </button>
              ))}
            </div>
          </div>

          {form.repaymentMode === 'FLEXIBLE' ? (
            <div>
              <Label htmlFor="lg-due">Expected back by (optional)</Label>
              <Input
                id="lg-due"
                className="mt-1"
                type="date"
                min={form.lentOn}
                value={form.dueDate}
                onChange={(e) => set('dueDate', e.target.value)}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                You'll get reminders before this date.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <Label htmlFor="lg-emi">EMI (₹)</Label>
                <Input
                  id="lg-emi"
                  className="mt-1"
                  inputMode="decimal"
                  value={form.emiAmount}
                  onChange={(e) => set('emiAmount', e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="lg-tenure">Months</Label>
                <Input
                  id="lg-tenure"
                  className="mt-1"
                  inputMode="numeric"
                  value={form.tenureMonths}
                  onChange={(e) => set('tenureMonths', e.target.value.replace(/\D/g, ''))}
                />
              </div>
              <div>
                <Label htmlFor="lg-first-emi">First EMI on</Label>
                <Input
                  id="lg-first-emi"
                  className="mt-1"
                  type="date"
                  min={form.lentOn}
                  value={form.firstEmiDate}
                  onChange={(e) => set('firstEmiDate', e.target.value)}
                />
              </div>
            </div>
          )}

          <div>
            <Label htmlFor="lg-notes">Notes (optional)</Label>
            <Textarea
              id="lg-notes"
              className="mt-1"
              rows={2}
              placeholder="Purpose, terms, anything to remember"
              value={form.notes}
              onChange={(e) => set('notes', e.target.value)}
            />
          </div>

          {error && (
            <p role="alert" className="text-sm text-negative">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={save.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {initial ? 'Save changes' : 'Add loan'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
