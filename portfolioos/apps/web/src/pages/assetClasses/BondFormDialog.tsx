import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Loader2, Landmark, Info } from 'lucide-react';
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
import type { TransactionDTO } from '@portfolioos/shared';
import type { FormDialogProps } from './FDFormDialog';

const n = (v: unknown) => (v === '' || v == null ? undefined : v);
const moneyReq = z.preprocess(n, z.coerce.number().nonnegative());
const moneyOpt = z.preprocess(n, z.coerce.number().nonnegative().optional());
const qtyReq = z.preprocess(n, z.coerce.number().positive('Must be > 0'));

const schema = z.object({
  portfolioId:       z.string().min(1, 'Select a portfolio'),
  assetClass:        z.enum(['BOND', 'GOVT_BOND', 'CORPORATE_BOND']),
  transactionType:   z.enum(['BUY', 'SELL', 'INTEREST_RECEIVED', 'MATURITY', 'REDEMPTION']),
  assetName:         z.string().min(1, 'Enter bond name / issuer'),
  isin:              z.string().optional(),
  tradeDate:         z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date'),
  quantity:          qtyReq,
  price:             moneyReq,
  interestRate:      moneyOpt,
  interestFrequency: z.string().optional(),
  maturityDate:      z.string().optional(),
  narration:         z.string().optional(),
});
type FormValues = z.input<typeof schema>;
type FormOutput = z.output<typeof schema>;

const BOND_TYPES = [
  { value: 'GOVT_BOND',      label: 'Government Bond' },
  { value: 'CORPORATE_BOND', label: 'Corporate Bond' },
  { value: 'BOND',           label: 'Other Bond' },
] as const;

const TXN_TYPES = [
  { value: 'BUY',               label: 'Buy' },
  { value: 'SELL',              label: 'Sell' },
  { value: 'INTEREST_RECEIVED', label: 'Coupon received' },
  { value: 'MATURITY',          label: 'Maturity' },
  { value: 'REDEMPTION',        label: 'Redemption' },
] as const;

const FREQ_OPTIONS = [
  { value: 'MONTHLY',     label: 'Monthly' },
  { value: 'QUARTERLY',   label: 'Quarterly' },
  { value: 'SEMI_ANNUAL', label: 'Semi-annual' },
  { value: 'ANNUAL',      label: 'Annual' },
] as const;

export function BondFormDialog({ open, onOpenChange, initial, defaultPortfolioId }: FormDialogProps) {
  const queryClient = useQueryClient();
  const isEdit = !!initial;

  const { data: portfolios } = useQuery({ queryKey: ['portfolios'], queryFn: portfoliosApi.list });

  const { register, handleSubmit, watch, reset, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      portfolioId: defaultPortfolioId ?? '',
      assetClass: 'GOVT_BOND',
      transactionType: 'BUY',
      tradeDate: new Date().toISOString().slice(0, 10),
      quantity: undefined,
      interestFrequency: 'SEMI_ANNUAL',
    },
  });

  const txnType = watch('transactionType');
  const isBuy = txnType === 'BUY';

  useEffect(() => {
    if (open) {
      if (initial) {
        reset({
          portfolioId: initial.portfolioId,
          assetClass: (initial.assetClass as FormValues['assetClass']) ?? 'GOVT_BOND',
          transactionType: (initial.transactionType as FormValues['transactionType']) ?? 'BUY',
          assetName: initial.assetName ?? '',
          isin: initial.isin ?? '',
          tradeDate: initial.tradeDate,
          quantity: parseFloat(initial.quantity),
          price: parseFloat(initial.price),
          interestRate: initial.interestRate != null ? parseFloat(initial.interestRate as string) : undefined,
          interestFrequency: initial.interestFrequency ?? 'SEMI_ANNUAL',
          maturityDate: initial.maturityDate ?? '',
          narration: initial.narration ?? '',
        });
      } else {
        reset({
          portfolioId: defaultPortfolioId ?? portfolios?.[0]?.id ?? '',
          assetClass: 'GOVT_BOND',
          transactionType: 'BUY',
          tradeDate: new Date().toISOString().slice(0, 10),
          interestFrequency: 'SEMI_ANNUAL',
        });
      }
    }
  }, [open, initial, defaultPortfolioId, portfolios, reset]);

  const mutation = useMutation({
    mutationFn: (values: FormOutput) => {
      const req = {
        portfolioId: values.portfolioId,
        assetClass: values.assetClass,
        transactionType: values.transactionType,
        assetName: values.assetName,
        isin: values.isin || undefined,
        tradeDate: values.tradeDate,
        quantity: values.quantity,
        price: values.price,
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
      toast.success(isEdit ? 'Bond entry updated' : 'Bond added');
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
      toast.success('Bond entry deleted');
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
            <Landmark className="h-5 w-5 text-muted-foreground" />
            {isEdit ? 'Edit Bond Entry' : 'Add Bond'}
          </DialogTitle>
        </DialogHeader>

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

          {/* Bond type + Transaction type */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Bond Type</Label>
              <Select {...register('assetClass')} className="w-full">
                {BOND_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Transaction</Label>
              <Select {...register('transactionType')} className="w-full">
                {TXN_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </Select>
            </div>
          </div>

          {/* Bond name + ISIN */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1 col-span-2 sm:col-span-1">
              <Label>Bond Name / Issuer <span className="text-destructive">*</span></Label>
              <Input {...register('assetName')} placeholder="e.g. 7.26% GOI 2033" />
              {errors.assetName && <p className="text-xs text-destructive">{errors.assetName.message}</p>}
            </div>
            <div className="space-y-1">
              <Label>ISIN <span className="text-muted-foreground text-xs">(optional)</span></Label>
              <Input {...register('isin')} placeholder="IN0000000000" />
            </div>
          </div>

          {/* Date + Quantity + Price */}
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label>Date <span className="text-destructive">*</span></Label>
              <Input type="date" {...register('tradeDate')} />
              {errors.tradeDate && <p className="text-xs text-destructive">{errors.tradeDate.message}</p>}
            </div>
            <div className="space-y-1">
              <Label>Units <span className="text-destructive">*</span></Label>
              <Input type="number" step="1" min="1" {...register('quantity')} placeholder="100" />
              {errors.quantity && <p className="text-xs text-destructive">{errors.quantity.message}</p>}
            </div>
            <div className="space-y-1">
              <Label>
                {txnType === 'INTEREST_RECEIVED' ? 'Coupon Received (₹)' : 'Price / Unit (₹)'}
                <span className="text-destructive"> *</span>
              </Label>
              <Input type="number" step="0.01" min="0" {...register('price')} placeholder="1000.00" />
              {errors.price && <p className="text-xs text-destructive">{errors.price.message}</p>}
            </div>
          </div>

          {/* Bond details (only for BUY) */}
          {isBuy && (
            <div className="rounded-lg border border-dashed border-border p-3 space-y-3 bg-muted/20">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                <Info className="h-3.5 w-3.5" /> Bond Details
              </p>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label>Coupon Rate (% p.a.)</Label>
                  <Input type="number" step="0.01" min="0" max="100" {...register('interestRate')} placeholder="7.26" />
                </div>
                <div className="space-y-1">
                  <Label>Coupon Frequency</Label>
                  <Select {...register('interestFrequency')} className="w-full">
                    {FREQ_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Maturity Date</Label>
                  <Input type="date" {...register('maturityDate')} />
                </div>
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
                {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : (isEdit ? 'Save changes' : 'Add bond')}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
