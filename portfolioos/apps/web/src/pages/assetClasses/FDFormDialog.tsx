import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Loader2, PiggyBank, CalendarClock, Info } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { transactionsApi } from '@/api/transactions.api';
import { portfoliosApi } from '@/api/portfolios.api';
import { apiErrorMessage } from '@/api/client';
import type { AssetClass, TransactionDTO } from '@portfolioos/shared';

const n = (v: unknown) => (v === '' || v == null ? undefined : v);
const moneyReq = z.preprocess(n, z.coerce.number().nonnegative());
const moneyOpt = z.preprocess(n, z.coerce.number().nonnegative().optional());
const intOpt   = z.preprocess(n, z.coerce.number().int().positive().optional());

type DepositKind = 'FIXED_DEPOSIT' | 'RECURRING_DEPOSIT';

const schema = z.object({
  portfolioId:        z.string().min(1, 'Select a portfolio'),
  depositKind:        z.enum(['FIXED_DEPOSIT', 'RECURRING_DEPOSIT']),
  transactionType:    z.enum(['DEPOSIT', 'WITHDRAWAL', 'INTEREST_RECEIVED', 'MATURITY']),
  assetName:          z.string().min(1, 'Enter bank / issuer name'),
  isin:               z.string().optional(),
  tradeDate:          z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date'),
  amount:             moneyReq,
  interestRate:       moneyOpt,
  interestFrequency:  z.string().optional(),
  tenureMonths:       intOpt,
  maturityDate:       z.string().optional(),
  narration:          z.string().optional(),
});
type FormValues = z.input<typeof schema>;
type FormOutput = z.output<typeof schema>;

export interface FormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial?: TransactionDTO | null;
  defaultPortfolioId?: string;
  /** Pre-select FD vs RD when adding a new entry. Edits derive from `initial.assetClass`. */
  defaultAssetClass?: AssetClass;
}

const FREQ_OPTIONS = [
  { value: 'MONTHLY',      label: 'Monthly' },
  { value: 'QUARTERLY',    label: 'Quarterly' },
  { value: 'HALF_YEARLY',  label: 'Half-yearly' },
  { value: 'ANNUAL',       label: 'Annual' },
  { value: 'AT_MATURITY',  label: 'At maturity' },
];

const TXN_LABELS: Record<string, string> = {
  DEPOSIT:           'Deposit',
  WITHDRAWAL:        'Premature withdrawal',
  INTEREST_RECEIVED: 'Interest credited',
  MATURITY:          'Maturity payout',
};

function amountLabel(kind: DepositKind, txn: string): string {
  if (txn === 'WITHDRAWAL')        return 'Withdrawn Amount (₹)';
  if (txn === 'INTEREST_RECEIVED') return 'Interest Credited (₹)';
  if (txn === 'MATURITY')          return 'Maturity Amount (₹)';
  return kind === 'RECURRING_DEPOSIT' ? 'Monthly Installment (₹)' : 'Principal Amount (₹)';
}

function txnLabel(kind: DepositKind, txn: string): string {
  if (kind === 'RECURRING_DEPOSIT' && txn === 'DEPOSIT') return 'Monthly installment';
  if (kind === 'FIXED_DEPOSIT' && txn === 'DEPOSIT')      return 'New / top-up deposit';
  return TXN_LABELS[txn] ?? txn;
}

function addMonths(iso: string, months: number): string {
  const d = new Date(`${iso}T00:00:00.000Z`);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}

export function FDFormDialog({
  open, onOpenChange, initial, defaultPortfolioId, defaultAssetClass,
}: FormDialogProps) {
  const queryClient = useQueryClient();
  const isEdit = !!initial;

  const initialKind: DepositKind = useMemo(() => {
    if (initial?.assetClass === 'RECURRING_DEPOSIT') return 'RECURRING_DEPOSIT';
    if (initial?.assetClass === 'FIXED_DEPOSIT')     return 'FIXED_DEPOSIT';
    if (defaultAssetClass === 'RECURRING_DEPOSIT')   return 'RECURRING_DEPOSIT';
    return 'FIXED_DEPOSIT';
  }, [initial, defaultAssetClass]);

  const { data: portfolios } = useQuery({ queryKey: ['portfolios'], queryFn: portfoliosApi.list });

  const { register, handleSubmit, watch, reset, setValue, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      portfolioId: defaultPortfolioId ?? '',
      depositKind: initialKind,
      transactionType: 'DEPOSIT',
      tradeDate: new Date().toISOString().slice(0, 10),
      interestFrequency: 'QUARTERLY',
      tenureMonths: undefined,
    },
  });

  const depositKind = watch('depositKind') as DepositKind;
  const txnType     = watch('transactionType');
  const tradeDate   = watch('tradeDate');
  const tenure      = watch('tenureMonths');
  const isRD        = depositKind === 'RECURRING_DEPOSIT';
  const isDeposit   = txnType === 'DEPOSIT';

  // Auto-derive maturity from start + tenure (RD only, when user types a tenure).
  useEffect(() => {
    if (!isRD || !isDeposit || isEdit) return;
    const months = typeof tenure === 'number' ? tenure : Number(tenure);
    if (!months || !tradeDate) return;
    setValue('maturityDate', addMonths(tradeDate, months));
  }, [tenure, tradeDate, isRD, isDeposit, isEdit, setValue]);

  useEffect(() => {
    if (open) {
      if (initial) {
        reset({
          portfolioId: initial.portfolioId,
          depositKind: (initial.assetClass as DepositKind) === 'RECURRING_DEPOSIT'
            ? 'RECURRING_DEPOSIT' : 'FIXED_DEPOSIT',
          transactionType: (initial.transactionType as FormValues['transactionType']) ?? 'DEPOSIT',
          assetName: initial.assetName ?? '',
          isin: initial.isin ?? '',
          tradeDate: initial.tradeDate,
          amount: parseFloat(initial.price),
          interestRate: initial.interestRate != null ? parseFloat(initial.interestRate as string) : undefined,
          interestFrequency: initial.interestFrequency ?? 'QUARTERLY',
          maturityDate: initial.maturityDate ?? '',
          narration: initial.narration ?? '',
        });
      } else {
        reset({
          portfolioId: defaultPortfolioId ?? portfolios?.[0]?.id ?? '',
          depositKind: initialKind,
          transactionType: 'DEPOSIT',
          tradeDate: new Date().toISOString().slice(0, 10),
          interestFrequency: 'QUARTERLY',
          tenureMonths: undefined,
        });
      }
    }
  }, [open, initial, defaultPortfolioId, portfolios, reset, initialKind]);

  const mutation = useMutation({
    mutationFn: (values: FormOutput) => {
      const req = {
        portfolioId: values.portfolioId,
        assetClass: values.depositKind,
        transactionType: values.transactionType,
        assetName: values.assetName,
        isin: values.isin || undefined,
        tradeDate: values.tradeDate,
        quantity: 1,
        price: values.amount,
        maturityDate: values.maturityDate || undefined,
        interestRate: values.interestRate,
        interestFrequency: values.interestFrequency || undefined,
        narration: values.narration || undefined,
      };
      return isEdit && initial
        ? transactionsApi.update(initial.id, req)
        : transactionsApi.create(req);
    },
    onSuccess: () => {
      const noun = depositKind === 'RECURRING_DEPOSIT' ? 'RD' : 'FD';
      toast.success(isEdit ? `${noun} entry updated` : `${noun} entry added`);
      queryClient.invalidateQueries({ queryKey: ['portfolio-holdings'] });
      queryClient.invalidateQueries({ queryKey: ['portfolios'] });
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      onOpenChange(false);
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Failed to save')),
  });

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const deleteMutation = useMutation({
    mutationFn: () => transactionsApi.remove(initial!.id),
    onSuccess: () => {
      toast.success('Entry deleted');
      queryClient.invalidateQueries({ queryKey: ['portfolio-holdings'] });
      queryClient.invalidateQueries({ queryKey: ['portfolios'] });
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      onOpenChange(false);
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Failed to delete')),
  });

  const titleNoun = depositKind === 'RECURRING_DEPOSIT' ? 'Recurring Deposit' : 'Fixed Deposit';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isRD
              ? <CalendarClock className="h-5 w-5 text-muted-foreground" />
              : <PiggyBank className="h-5 w-5 text-muted-foreground" />}
            {isEdit ? `Edit ${titleNoun} Entry` : `Add ${titleNoun}`}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit((v) => mutation.mutate(v as FormOutput))} className="space-y-4 pt-1">
          {/* Deposit kind selector — large, visual, only when adding */}
          {!isEdit && (
            <div className="space-y-1.5">
              <Label>Deposit type</Label>
              <div className="grid grid-cols-2 gap-2">
                {([
                  { kind: 'FIXED_DEPOSIT' as const,     label: 'Fixed Deposit',     hint: 'One-time lump-sum',  Icon: PiggyBank },
                  { kind: 'RECURRING_DEPOSIT' as const, label: 'Recurring Deposit', hint: 'Monthly installments', Icon: CalendarClock },
                ]).map(({ kind, label, hint, Icon }) => {
                  const selected = depositKind === kind;
                  return (
                    <label
                      key={kind}
                      className={`relative flex items-start gap-3 rounded-lg border-2 p-3 cursor-pointer transition-all
                        ${selected
                          ? 'border-primary bg-primary/5 shadow-sm'
                          : 'border-border hover:border-primary/40 hover:bg-muted/30'}`}
                    >
                      <input type="radio" value={kind} {...register('depositKind')} className="sr-only" />
                      <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md
                        ${selected ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
                        <Icon className="h-5 w-5" />
                      </div>
                      <div className="min-w-0">
                        <p className={`text-sm font-medium ${selected ? 'text-foreground' : 'text-foreground/90'}`}>
                          {label}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>
                      </div>
                      {selected && (
                        <span className="absolute top-2 right-2 h-2 w-2 rounded-full bg-primary" />
                      )}
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          {/* Portfolio */}
          <div className="space-y-1">
            <Label>Portfolio</Label>
            <Select {...register('portfolioId')} className="w-full">
              <option value="">Select portfolio…</option>
              {(portfolios ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
            {errors.portfolioId && <p className="text-xs text-destructive">{errors.portfolioId.message}</p>}
          </div>

          {/* Transaction type */}
          <div className="space-y-1">
            <Label>Entry type</Label>
            <div className="grid grid-cols-2 gap-2">
              {(['DEPOSIT', 'INTEREST_RECEIVED', 'WITHDRAWAL', 'MATURITY'] as const).map((t) => (
                <label key={t} className={`flex items-center gap-2 rounded-md border px-3 py-2 cursor-pointer text-sm transition-colors
                  ${txnType === t ? 'border-primary bg-primary/5' : 'hover:bg-muted/40'}`}>
                  <input type="radio" value={t} {...register('transactionType')} className="sr-only" />
                  {txnLabel(depositKind, t)}
                </label>
              ))}
            </div>
            {isRD && isDeposit && (
              <p className="text-xs text-muted-foreground flex items-start gap-1 mt-1">
                <Info className="h-3 w-3 shrink-0 mt-0.5" />
                Each monthly installment is logged as its own entry. Add new installments
                as you pay them; the maturity projection updates automatically.
              </p>
            )}
          </div>

          {/* Bank / account info */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Bank / Issuer <span className="text-destructive">*</span></Label>
              <Input {...register('assetName')} placeholder="e.g. HDFC Bank" />
              {errors.assetName && <p className="text-xs text-destructive">{errors.assetName.message}</p>}
            </div>
            <div className="space-y-1">
              <Label>{isRD ? 'RD Account No.' : 'Account / FD No.'}{' '}
                <span className="text-muted-foreground text-xs">(optional)</span></Label>
              <Input {...register('isin')} placeholder={isRD ? 'RD account number' : 'FD reference no.'} />
            </div>
          </div>

          {/* Date + Amount */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>{isRD && isDeposit ? 'Installment date' : 'Date'} <span className="text-destructive">*</span></Label>
              <Input type="date" {...register('tradeDate')} />
              {errors.tradeDate && <p className="text-xs text-destructive">{errors.tradeDate.message}</p>}
            </div>
            <div className="space-y-1">
              <Label>{amountLabel(depositKind, txnType)} <span className="text-destructive">*</span></Label>
              <Input type="number" step="0.01" min="0" {...register('amount')} placeholder="0.00" />
              {errors.amount && <p className="text-xs text-destructive">{errors.amount.message}</p>}
            </div>
          </div>

          {/* Deposit-specific block (only when adding a DEPOSIT row) */}
          {isDeposit && (
            <div className="rounded-lg border border-dashed border-border p-3 space-y-3 bg-muted/20">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                <Info className="h-3.5 w-3.5" /> {isRD ? 'RD Details' : 'FD Details'}
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Interest Rate (% p.a.)</Label>
                  <Input type="number" step="0.01" min="0" max="100" {...register('interestRate')} placeholder="7.25" />
                </div>
                <div className="space-y-1">
                  <Label>{isRD ? 'Compounding' : 'Interest Payout'}</Label>
                  <Select {...register('interestFrequency')} className="w-full">
                    {FREQ_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {isRD && (
                  <div className="space-y-1">
                    <Label>Tenure (months)</Label>
                    <Input type="number" step="1" min="1" max="240" {...register('tenureMonths')}
                           placeholder="e.g. 12, 24, 60" />
                  </div>
                )}
                <div className={`space-y-1 ${isRD ? '' : 'col-span-2'}`}>
                  <Label>Maturity Date{isRD ? ' (auto-filled)' : ''}</Label>
                  <Input type="date" {...register('maturityDate')} />
                </div>
              </div>
              {isRD && (
                <p className="text-[11px] text-muted-foreground leading-snug">
                  Bank RDs typically compound quarterly. Standard tenures are 6/12/24/36/60 months.
                </p>
              )}
            </div>
          )}

          {/* Notes */}
          <div className="space-y-1">
            <Label>Notes <span className="text-muted-foreground text-xs">(optional)</span></Label>
            <Textarea {...register('narration')} placeholder="Optional notes…" rows={2} />
          </div>

          <DialogFooter className="flex items-center justify-between pt-2">
            <div>
              {isEdit && !showDeleteConfirm && (
                <Button type="button" variant="ghost" size="sm" className="text-destructive hover:text-destructive"
                  onClick={() => setShowDeleteConfirm(true)}>
                  Delete
                </Button>
              )}
              {isEdit && showDeleteConfirm && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Sure?</span>
                  <Button type="button" variant="destructive" size="sm"
                    onClick={() => deleteMutation.mutate()} disabled={deleteMutation.isPending}>
                    {deleteMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Yes, delete'}
                  </Button>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setShowDeleteConfirm(false)}>Cancel</Button>
                </div>
              )}
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : isEdit
                    ? 'Save changes'
                    : `Add ${depositKind === 'RECURRING_DEPOSIT' ? 'RD' : 'FD'} entry`}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
