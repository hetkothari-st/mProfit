import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Loader2, Wallet, Info, Wifi } from 'lucide-react';
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
import { pfApi } from '@/api/pf';
import { apiErrorMessage } from '@/api/client';
import type { TransactionDTO } from '@portfolioos/shared';
import type { FormDialogProps } from './FDFormDialog';

const n = (v: unknown) => (v === '' || v == null ? undefined : v);
const moneyReq = z.preprocess(n, z.coerce.number().nonnegative());
const moneyOpt = z.preprocess(n, z.coerce.number().nonnegative().optional());

const schema = z.object({
  portfolioId:     z.string().min(1, 'Select a portfolio'),
  transactionType: z.enum(['DEPOSIT', 'INTEREST_RECEIVED', 'WITHDRAWAL', 'OPENING_BALANCE']),
  assetName:       z.string().min(1, 'Enter employer name'),
  isin:            z.string().optional(),
  tradeDate:       z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date'),
  amount:          moneyReq,
  interestRate:    moneyOpt,
  narration:       z.string().optional(),
});
type FormValues = z.input<typeof schema>;
type FormOutput = z.output<typeof schema>;

const TXN_LABELS: Record<string, string> = {
  DEPOSIT:           'Contribution (monthly)',
  INTEREST_RECEIVED: 'Annual interest credit',
  WITHDRAWAL:        'Withdrawal / settlement',
  OPENING_BALANCE:   'Opening / current balance',
};

const AMOUNT_LABELS: Record<string, string> = {
  DEPOSIT:           'Total Contribution (₹)',
  INTEREST_RECEIVED: 'Interest Credited (₹)',
  WITHDRAWAL:        'Amount Withdrawn (₹)',
  OPENING_BALANCE:   'Current Balance (₹)',
};

const AMOUNT_HINTS: Record<string, string> = {
  DEPOSIT:           'Employee + employer share combined',
  INTEREST_RECEIVED: 'Interest at current EPF rate (8.25% for FY 2023-24)',
  WITHDRAWAL:        '',
  OPENING_BALANCE:   'Enter this once to start tracking',
};

// ---------------------------------------------------------------------------
// Auto-fetch sub-form (link UAN to auto-fetch section)
// ---------------------------------------------------------------------------

function AutoFetchForm({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [uan, setUan] = useState('');
  const [holderName, setHolderName] = useState('');
  const [saving, setSaving] = useState(false);
  const [uanError, setUanError] = useState('');

  async function handleLink() {
    setUanError('');
    if (!/^\d{12}$/.test(uan)) {
      setUanError('UAN must be exactly 12 digits');
      return;
    }
    if (!holderName.trim()) return;
    setSaving(true);
    try {
      await pfApi.create({
        type: 'EPF',
        institution: 'EPFO',
        identifier: uan,
        holderName: holderName.trim(),
      });
      toast.success('EPF account linked — use Refresh on the Provident Fund page to fetch data');
      queryClient.invalidateQueries({ queryKey: ['pf-accounts'] });
      onClose();
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Failed to link account'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4 pt-1">
      <div className="rounded-lg border border-dashed border-primary/40 bg-primary/5 p-3 text-xs text-muted-foreground">
        <Wifi className="h-4 w-4 inline-block mr-1 text-primary" />
        Auto-fetch pulls your passbook directly from the EPFO portal. You'll
        be prompted for your password and any CAPTCHA/OTP the portal requires.
      </div>

      <div className="space-y-1">
        <Label>UAN (12 digits) <span className="text-destructive">*</span></Label>
        <Input
          value={uan}
          onChange={(e) => { setUan(e.target.value); setUanError(''); }}
          placeholder="100XXXXXXXXX"
          maxLength={12}
        />
        {uanError && <p className="text-xs text-destructive">{uanError}</p>}
      </div>

      <div className="space-y-1">
        <Label>Holder Name <span className="text-destructive">*</span></Label>
        <Input
          value={holderName}
          onChange={(e) => setHolderName(e.target.value)}
          placeholder="Full name as per EPFO records"
        />
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
        <Button
          type="button"
          disabled={saving || !uan || !holderName}
          onClick={() => void handleLink()}
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Link & enable auto-fetch'}
        </Button>
      </DialogFooter>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main EPFFormDialog
// ---------------------------------------------------------------------------

export function EPFFormDialog({ open, onOpenChange, initial, defaultPortfolioId }: FormDialogProps) {
  const queryClient = useQueryClient();
  const isEdit = !!initial;
  const [mode, setMode] = useState<'manual' | 'autofetch'>('manual');

  const { data: portfolios } = useQuery({ queryKey: ['portfolios'], queryFn: portfoliosApi.list });

  const { register, handleSubmit, watch, reset, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      portfolioId: defaultPortfolioId ?? '',
      transactionType: 'DEPOSIT',
      tradeDate: new Date().toISOString().slice(0, 10),
    },
  });

  const txnType = watch('transactionType');
  const isInterest = txnType === 'INTEREST_RECEIVED';

  useEffect(() => {
    if (open) {
      if (initial) {
        reset({
          portfolioId: initial.portfolioId,
          transactionType: (initial.transactionType as FormValues['transactionType']) ?? 'DEPOSIT',
          assetName: initial.assetName ?? '',
          isin: initial.isin ?? '',
          tradeDate: initial.tradeDate,
          amount: parseFloat(initial.price),
          interestRate: initial.interestRate != null ? parseFloat(initial.interestRate as string) : undefined,
          narration: initial.narration ?? '',
        });
      } else {
        reset({
          portfolioId: defaultPortfolioId ?? portfolios?.[0]?.id ?? '',
          transactionType: 'DEPOSIT',
          tradeDate: new Date().toISOString().slice(0, 10),
        });
      }
    }
  }, [open, initial, defaultPortfolioId, portfolios, reset]);

  const mutation = useMutation({
    mutationFn: (values: FormOutput) => {
      const req = {
        portfolioId: values.portfolioId,
        assetClass: 'EPF' as const,
        transactionType: values.transactionType,
        assetName: values.assetName,
        isin: values.isin || undefined,
        tradeDate: values.tradeDate,
        quantity: 1,
        price: values.amount,
        interestRate: values.interestRate,
        narration: values.narration || undefined,
      };
      return isEdit && initial
        ? transactionsApi.update(initial.id, req)
        : transactionsApi.create(req);
    },
    onSuccess: () => {
      toast.success(isEdit ? 'EPF entry updated' : 'EPF entry added');
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
      toast.success('EPF entry deleted');
      queryClient.invalidateQueries({ queryKey: ['portfolio-holdings'] });
      queryClient.invalidateQueries({ queryKey: ['portfolios'] });
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      onOpenChange(false);
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Failed to delete')),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wallet className="h-5 w-5 text-muted-foreground" />
            {isEdit ? 'Edit EPF Entry' : 'Add EPF Entry'}
          </DialogTitle>
        </DialogHeader>

        {/* Mode toggle — only show when not editing an existing transaction */}
        {!isEdit && (
          <div className="flex border rounded-md overflow-hidden text-sm">
            <button
              type="button"
              className={`flex-1 py-1.5 text-center transition-colors ${
                mode === 'manual'
                  ? 'bg-primary text-primary-foreground font-medium'
                  : 'hover:bg-muted/40'
              }`}
              onClick={() => setMode('manual')}
            >
              Manual entry
            </button>
            <button
              type="button"
              className={`flex-1 py-1.5 text-center transition-colors border-l ${
                mode === 'autofetch'
                  ? 'bg-primary text-primary-foreground font-medium'
                  : 'hover:bg-muted/40'
              }`}
              onClick={() => setMode('autofetch')}
            >
              <Wifi className="h-3.5 w-3.5 inline mr-1" />
              Auto-fetch (UAN)
            </button>
          </div>
        )}

        {/* Auto-fetch mode */}
        {mode === 'autofetch' && !isEdit && (
          <AutoFetchForm onClose={() => onOpenChange(false)} />
        )}

        {/* Manual entry form — existing code */}
        {(mode === 'manual' || isEdit) && (
        <form onSubmit={handleSubmit((v) => mutation.mutate(v as FormOutput))} className="space-y-4 pt-1">
          {/* Portfolio */}
          <div className="space-y-1">
            <Label>Portfolio</Label>
            <Select {...register('portfolioId')} className="w-full">
              <option value="">Select portfolio…</option>
              {(portfolios ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
            {errors.portfolioId && <p className="text-xs text-destructive">{errors.portfolioId.message}</p>}
          </div>

          {/* Employer + UAN */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Employer Name <span className="text-destructive">*</span></Label>
              <Input {...register('assetName')} placeholder="e.g. Tata Consultancy Services" />
              {errors.assetName && <p className="text-xs text-destructive">{errors.assetName.message}</p>}
            </div>
            <div className="space-y-1">
              <Label>UAN Number <span className="text-muted-foreground text-xs">(optional)</span></Label>
              <Input {...register('isin')} placeholder="100XXXXXXXXX" />
            </div>
          </div>

          {/* Transaction type */}
          <div className="space-y-1">
            <Label>Entry Type</Label>
            <div className="grid grid-cols-2 gap-2">
              {(['DEPOSIT', 'INTEREST_RECEIVED', 'WITHDRAWAL', 'OPENING_BALANCE'] as const).map((t) => (
                <label key={t} className={`flex items-center gap-2 rounded-md border px-3 py-2 cursor-pointer text-sm transition-colors
                  ${watch('transactionType') === t ? 'border-primary bg-primary/5' : 'hover:bg-muted/40'}`}>
                  <input type="radio" value={t} {...register('transactionType')} className="sr-only" />
                  {TXN_LABELS[t]}
                </label>
              ))}
            </div>
          </div>

          {/* Date + Amount */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Date <span className="text-destructive">*</span></Label>
              <Input type="date" {...register('tradeDate')} />
              {errors.tradeDate && <p className="text-xs text-destructive">{errors.tradeDate.message}</p>}
            </div>
            <div className="space-y-1">
              <Label>{AMOUNT_LABELS[txnType]} <span className="text-destructive">*</span></Label>
              <Input type="number" step="0.01" min="0" {...register('amount')} placeholder="0.00" />
              {errors.amount && <p className="text-xs text-destructive">{errors.amount.message}</p>}
            </div>
          </div>
          {AMOUNT_HINTS[txnType] && (
            <p className="text-xs text-muted-foreground -mt-2 flex items-center gap-1">
              <Info className="h-3 w-3" /> {AMOUNT_HINTS[txnType]}
            </p>
          )}

          {/* Interest rate for interest credit */}
          {isInterest && (
            <div className="rounded-lg border border-dashed border-border p-3 bg-muted/20 space-y-2">
              <div className="space-y-1">
                <Label>Interest Rate Applied (% p.a.)</Label>
                <Input type="number" step="0.01" min="0" max="20" {...register('interestRate')} placeholder="8.25" />
                <p className="text-xs text-muted-foreground">EPF rate: 8.25% for FY 2023-24</p>
              </div>
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
                  onClick={() => setShowDeleteConfirm(true)}>Delete</Button>
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
                {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : (isEdit ? 'Save changes' : 'Add EPF entry')}
              </Button>
            </div>
          </DialogFooter>
        </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
