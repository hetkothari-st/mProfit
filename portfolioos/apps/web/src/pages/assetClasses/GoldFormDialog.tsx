import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Loader2, Coins, Info } from 'lucide-react';
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
  portfolioId:     z.string().min(1, 'Select a portfolio'),
  assetClass:      z.enum(['PHYSICAL_GOLD', 'GOLD_BOND', 'GOLD_ETF', 'PHYSICAL_SILVER']),
  transactionType: z.enum(['BUY', 'SELL', 'INTEREST_RECEIVED', 'MATURITY']),
  assetName:       z.string().min(1, 'Enter a name or description'),
  isin:            z.string().optional(),
  tradeDate:       z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date'),
  quantity:        qtyReq,
  price:           moneyReq,
  interestRate:    moneyOpt,
  maturityDate:    z.string().optional(),
  narration:       z.string().optional(),
});
type FormValues = z.input<typeof schema>;
type FormOutput = z.output<typeof schema>;

const GOLD_TYPES = [
  { value: 'PHYSICAL_GOLD',   label: 'Physical Gold', unit: 'grams' },
  { value: 'GOLD_BOND',       label: 'Sovereign Gold Bond (SGB)', unit: 'units' },
  { value: 'GOLD_ETF',        label: 'Gold ETF', unit: 'units' },
  { value: 'PHYSICAL_SILVER', label: 'Physical Silver', unit: 'grams' },
] as const;

const TXN_BY_TYPE = {
  PHYSICAL_GOLD:   [{ value: 'BUY', label: 'Buy' }, { value: 'SELL', label: 'Sell' }],
  PHYSICAL_SILVER: [{ value: 'BUY', label: 'Buy' }, { value: 'SELL', label: 'Sell' }],
  GOLD_ETF:        [{ value: 'BUY', label: 'Buy' }, { value: 'SELL', label: 'Sell' }],
  GOLD_BOND: [
    { value: 'BUY',               label: 'Buy / Subscribe' },
    { value: 'SELL',              label: 'Sell' },
    { value: 'INTEREST_RECEIVED', label: 'Interest received (2.5%)' },
    { value: 'MATURITY',          label: 'Maturity / Redemption' },
  ],
};

const QUANTITY_LABEL: Record<string, string> = {
  PHYSICAL_GOLD:   'Weight (grams)',
  PHYSICAL_SILVER: 'Weight (grams)',
  GOLD_BOND:       'Units',
  GOLD_ETF:        'Units',
};

const PRICE_LABEL: Record<string, string> = {
  PHYSICAL_GOLD:   'Price per gram (₹)',
  PHYSICAL_SILVER: 'Price per gram (₹)',
  GOLD_BOND:       'Issue / Market Price (₹/unit)',
  GOLD_ETF:        'NAV / Price (₹/unit)',
};

export function GoldFormDialog({ open, onOpenChange, initial, defaultPortfolioId }: FormDialogProps) {
  const queryClient = useQueryClient();
  const isEdit = !!initial;

  const { data: portfolios } = useQuery({ queryKey: ['portfolios'], queryFn: portfoliosApi.list });

  const { register, handleSubmit, watch, reset, setValue, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      portfolioId: defaultPortfolioId ?? '',
      assetClass: 'PHYSICAL_GOLD',
      transactionType: 'BUY',
      tradeDate: new Date().toISOString().slice(0, 10),
    },
  });

  const assetClass = watch('assetClass');
  const txnType = watch('transactionType');
  const isSgbBuy = assetClass === 'GOLD_BOND' && txnType === 'BUY';

  // Reset txnType when assetClass changes to ensure valid combination
  useEffect(() => {
    const validTypes = TXN_BY_TYPE[assetClass as keyof typeof TXN_BY_TYPE] ?? TXN_BY_TYPE.PHYSICAL_GOLD;
    const current = watch('transactionType');
    if (!validTypes.some((t) => t.value === current)) {
      setValue('transactionType', 'BUY' as FormValues['transactionType']);
    }
  }, [assetClass, setValue, watch]);

  useEffect(() => {
    if (open) {
      if (initial) {
        reset({
          portfolioId: initial.portfolioId,
          assetClass: (initial.assetClass as FormValues['assetClass']) ?? 'PHYSICAL_GOLD',
          transactionType: (initial.transactionType as FormValues['transactionType']) ?? 'BUY',
          assetName: initial.assetName ?? '',
          isin: initial.isin ?? '',
          tradeDate: initial.tradeDate,
          quantity: parseFloat(initial.quantity),
          price: parseFloat(initial.price),
          interestRate: initial.interestRate != null ? parseFloat(initial.interestRate as string) : undefined,
          maturityDate: initial.maturityDate ?? '',
          narration: initial.narration ?? '',
        });
      } else {
        reset({
          portfolioId: defaultPortfolioId ?? portfolios?.[0]?.id ?? '',
          assetClass: 'PHYSICAL_GOLD',
          transactionType: 'BUY',
          tradeDate: new Date().toISOString().slice(0, 10),
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
        interestRate: values.interestRate,
        maturityDate: values.maturityDate || undefined,
        narration: values.narration || undefined,
      };
      return isEdit && initial
        ? transactionsApi.update(initial.id, req)
        : transactionsApi.create(req);
    },
    onSuccess: () => {
      toast.success(isEdit ? 'Entry updated' : 'Entry added');
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

  const availableTxns = TXN_BY_TYPE[assetClass as keyof typeof TXN_BY_TYPE] ?? TXN_BY_TYPE.PHYSICAL_GOLD;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Coins className="h-5 w-5 text-muted-foreground" />
            {isEdit ? 'Edit Gold / Silver Entry' : 'Add Gold / Silver'}
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

          {/* Type selector (visual cards) */}
          <div className="space-y-1">
            <Label>Type</Label>
            <div className="grid grid-cols-2 gap-2">
              {GOLD_TYPES.map((t) => (
                <label key={t.value} className={`flex flex-col rounded-md border px-3 py-2 cursor-pointer text-sm transition-colors
                  ${watch('assetClass') === t.value ? 'border-primary bg-primary/5' : 'hover:bg-muted/40'}`}>
                  <input type="radio" value={t.value} {...register('assetClass')} className="sr-only" />
                  <span className="font-medium">{t.label}</span>
                  <span className="text-xs text-muted-foreground">tracked in {t.unit}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Transaction type */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Transaction</Label>
              <Select {...register('transactionType')} className="w-full">
                {availableTxns.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Date <span className="text-destructive">*</span></Label>
              <Input type="date" {...register('tradeDate')} />
              {errors.tradeDate && <p className="text-xs text-destructive">{errors.tradeDate.message}</p>}
            </div>
          </div>

          {/* Name + ISIN */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Name / Description <span className="text-destructive">*</span></Label>
              <Input {...register('assetName')}
                placeholder={assetClass === 'GOLD_BOND' ? 'e.g. SGB 2024-25 Series I' :
                  assetClass === 'GOLD_ETF' ? 'e.g. GOLDBEES' : 'e.g. 22K Gold bar'} />
              {errors.assetName && <p className="text-xs text-destructive">{errors.assetName.message}</p>}
            </div>
            {(assetClass === 'GOLD_BOND' || assetClass === 'GOLD_ETF') && (
              <div className="space-y-1">
                <Label>ISIN <span className="text-muted-foreground text-xs">(optional)</span></Label>
                <Input {...register('isin')} placeholder="IN0000000000" />
              </div>
            )}
          </div>

          {/* Quantity + Price */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>
                {txnType === 'INTEREST_RECEIVED' ? 'Units held' : QUANTITY_LABEL[assetClass]}
                <span className="text-destructive"> *</span>
              </Label>
              <Input type="number" step="0.001" min="0" {...register('quantity')}
                placeholder={assetClass === 'PHYSICAL_GOLD' || assetClass === 'PHYSICAL_SILVER' ? '10.000' : '1'} />
              {errors.quantity && <p className="text-xs text-destructive">{errors.quantity.message}</p>}
            </div>
            <div className="space-y-1">
              <Label>
                {txnType === 'INTEREST_RECEIVED' ? 'Interest per unit (₹)' : PRICE_LABEL[assetClass]}
                <span className="text-destructive"> *</span>
              </Label>
              <Input type="number" step="0.01" min="0" {...register('price')} placeholder="0.00" />
              {errors.price && <p className="text-xs text-destructive">{errors.price.message}</p>}
            </div>
          </div>

          {/* SGB-specific details */}
          {isSgbBuy && (
            <div className="rounded-lg border border-dashed border-border p-3 space-y-3 bg-muted/20">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                <Info className="h-3.5 w-3.5" /> SGB Details
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Interest Rate (% p.a.)</Label>
                  <Input type="number" step="0.01" min="0" max="100" {...register('interestRate')} placeholder="2.50" />
                  <p className="text-xs text-muted-foreground">RBI pays 2.5% p.a. semi-annually</p>
                </div>
                <div className="space-y-1">
                  <Label>Maturity Date</Label>
                  <Input type="date" {...register('maturityDate')} />
                  <p className="text-xs text-muted-foreground">8 years from issue date</p>
                </div>
              </div>
            </div>
          )}

          {/* Notes */}
          <div className="space-y-1">
            <Label>Notes <span className="text-muted-foreground text-xs">(optional)</span></Label>
            <Textarea {...register('narration')} placeholder="Storage location, purity, etc." rows={2} />
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
                {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : (isEdit ? 'Save changes' : 'Add entry')}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
