import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Loader2, Boxes } from 'lucide-react';
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
import type { TransactionDTO, AssetClass } from '@portfolioos/shared';
import type { FormDialogProps } from './FDFormDialog';

const n = (v: unknown) => (v === '' || v == null ? undefined : v);
const moneyReq = z.preprocess(n, z.coerce.number().nonnegative());
const qtyReq = z.preprocess(n, z.coerce.number().positive('Must be > 0'));

const OTHER_CLASSES = [
  { value: 'PMS',             label: 'PMS (Portfolio Management Service)' },
  { value: 'AIF',             label: 'AIF (Alternative Investment Fund)' },
  { value: 'ULIP',            label: 'ULIP (Unit-linked Insurance Plan)' },
  { value: 'CRYPTOCURRENCY',  label: 'Cryptocurrency' },
  { value: 'REIT',            label: 'REIT (Real Estate Investment Trust)' },
  { value: 'INVIT',           label: 'InvIT (Infrastructure Inv. Trust)' },
  { value: 'ART_COLLECTIBLES', label: 'Art & Collectibles' },
  { value: 'CASH',            label: 'Cash / Liquid Savings' },
  { value: 'OTHER',           label: 'Other' },
] as const;

const TXN_BY_CLASS = {
  PMS:             [{ value: 'BUY', label: 'Invest / top-up' }, { value: 'SELL', label: 'Withdraw / exit' }],
  AIF:             [{ value: 'BUY', label: 'Invest' }, { value: 'SELL', label: 'Redeem' }],
  ULIP:            [{ value: 'DEPOSIT', label: 'Premium paid' }, { value: 'WITHDRAWAL', label: 'Surrender / withdrawal' }, { value: 'MATURITY', label: 'Maturity' }],
  CRYPTOCURRENCY:  [{ value: 'BUY', label: 'Buy' }, { value: 'SELL', label: 'Sell' }],
  REIT:            [{ value: 'BUY', label: 'Buy units' }, { value: 'SELL', label: 'Sell units' }, { value: 'INTEREST_RECEIVED', label: 'Distribution received' }],
  INVIT:           [{ value: 'BUY', label: 'Buy units' }, { value: 'SELL', label: 'Sell units' }, { value: 'INTEREST_RECEIVED', label: 'Distribution received' }],
  REAL_ESTATE:     [{ value: 'BUY', label: 'Purchase property' }, { value: 'SELL', label: 'Sell property' }],
  ART_COLLECTIBLES:[{ value: 'BUY', label: 'Buy' }, { value: 'SELL', label: 'Sell' }],
  CASH:            [{ value: 'DEPOSIT', label: 'Deposit / credit' }, { value: 'WITHDRAWAL', label: 'Withdrawal / debit' }, { value: 'OPENING_BALANCE', label: 'Opening balance' }],
  OTHER:           [{ value: 'BUY', label: 'Buy / invest' }, { value: 'SELL', label: 'Sell / exit' }, { value: 'DEPOSIT', label: 'Deposit' }, { value: 'WITHDRAWAL', label: 'Withdrawal' }],
};

const QTY_LABEL: Record<string, string> = {
  PMS:             'Capital Invested (₹)',
  AIF:             'Capital Invested (₹)',
  ULIP:            'Premium Amount (₹)',
  CRYPTOCURRENCY:  'Quantity / tokens',
  REIT:            'Units',
  INVIT:           'Units',
  REAL_ESTATE:     'No. of properties',
  ART_COLLECTIBLES:'Quantity',
  CASH:            'Amount (₹)',
  OTHER:           'Quantity',
};

const PRICE_LABEL: Record<string, string> = {
  PMS:             'NAV / unit value (₹) — use 1 if entering lump sum',
  AIF:             'Unit value (₹)',
  ULIP:            'NAV per unit (₹)',
  CRYPTOCURRENCY:  'Price per token (₹)',
  REIT:            'Price per unit (₹)',
  INVIT:           'Price per unit (₹)',
  REAL_ESTATE:     'Purchase price (₹)',
  ART_COLLECTIBLES:'Purchase price (₹)',
  CASH:            'Use 1 (enter amount in Quantity)',
  OTHER:           'Price per unit (₹)',
};

const schema = z.object({
  portfolioId:     z.string().min(1, 'Select a portfolio'),
  assetClass:      z.string().min(1),
  transactionType: z.string().min(1),
  assetName:       z.string().min(1, 'Enter asset name'),
  isin:            z.string().optional(),
  tradeDate:       z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date'),
  quantity:        qtyReq,
  price:           moneyReq,
  narration:       z.string().optional(),
});
type FormValues = z.input<typeof schema>;
type FormOutput = z.output<typeof schema>;

export function OtherAssetFormDialog({ open, onOpenChange, initial, defaultPortfolioId }: FormDialogProps) {
  const queryClient = useQueryClient();
  const isEdit = !!initial;

  const { data: portfolios } = useQuery({ queryKey: ['portfolios'], queryFn: portfoliosApi.list });

  const { register, handleSubmit, watch, reset, setValue, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      portfolioId: defaultPortfolioId ?? '',
      assetClass: 'OTHER',
      transactionType: 'BUY',
      quantity: undefined,
      price: undefined,
      tradeDate: new Date().toISOString().slice(0, 10),
    },
  });

  const assetClass = watch('assetClass');
  const availableTxns = TXN_BY_CLASS[assetClass as keyof typeof TXN_BY_CLASS] ?? TXN_BY_CLASS.OTHER;

  // Reset txnType when assetClass changes
  useEffect(() => {
    const current = watch('transactionType');
    if (!availableTxns.some((t) => t.value === current)) {
      setValue('transactionType', availableTxns[0]?.value ?? 'BUY');
    }
  }, [assetClass, availableTxns, setValue, watch]);

  useEffect(() => {
    if (open) {
      if (initial) {
        reset({
          portfolioId: initial.portfolioId,
          assetClass: initial.assetClass ?? 'OTHER',
          transactionType: initial.transactionType ?? 'BUY',
          assetName: initial.assetName ?? '',
          isin: initial.isin ?? '',
          tradeDate: initial.tradeDate,
          quantity: parseFloat(initial.quantity),
          price: parseFloat(initial.price),
          narration: initial.narration ?? '',
        });
      } else {
        reset({
          portfolioId: defaultPortfolioId ?? portfolios?.[0]?.id ?? '',
          assetClass: 'OTHER',
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
        assetClass: values.assetClass as AssetClass,
        transactionType: values.transactionType as TransactionDTO['transactionType'],
        assetName: values.assetName,
        isin: values.isin || undefined,
        tradeDate: values.tradeDate,
        quantity: values.quantity,
        price: values.price,
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Boxes className="h-5 w-5 text-muted-foreground" />
            {isEdit ? 'Edit Other Asset' : 'Add Other Asset'}
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

          {/* Asset Class */}
          <div className="space-y-1">
            <Label>Asset Type</Label>
            <Select {...register('assetClass')} className="w-full">
              {OTHER_CLASSES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </Select>
          </div>

          {/* Transaction type */}
          <div className="space-y-1">
            <Label>Transaction</Label>
            <div className="grid grid-cols-2 gap-2">
              {availableTxns.map((t) => (
                <label key={t.value} className={`flex items-center gap-2 rounded-md border px-3 py-2 cursor-pointer text-sm transition-colors
                  ${watch('transactionType') === t.value ? 'border-primary bg-primary/5' : 'hover:bg-muted/40'}`}>
                  <input type="radio" value={t.value} {...register('transactionType')} className="sr-only" />
                  {t.label}
                </label>
              ))}
            </div>
          </div>

          {/* Name + ISIN */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Asset Name <span className="text-destructive">*</span></Label>
              <Input {...register('assetName')} placeholder="e.g. Helios Capital PMS" />
              {errors.assetName && <p className="text-xs text-destructive">{errors.assetName.message}</p>}
            </div>
            <div className="space-y-1">
              <Label>ISIN / Identifier <span className="text-muted-foreground text-xs">(optional)</span></Label>
              <Input {...register('isin')} placeholder="ISIN or reference" />
            </div>
          </div>

          {/* Date + Qty + Price */}
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label>Date <span className="text-destructive">*</span></Label>
              <Input type="date" {...register('tradeDate')} />
              {errors.tradeDate && <p className="text-xs text-destructive">{errors.tradeDate.message}</p>}
            </div>
            <div className="space-y-1">
              <Label>{QTY_LABEL[assetClass] ?? 'Quantity'} <span className="text-destructive">*</span></Label>
              <Input type="number" step="0.0001" min="0" {...register('quantity')} placeholder="1" />
              {errors.quantity && <p className="text-xs text-destructive">{errors.quantity.message}</p>}
            </div>
            <div className="space-y-1">
              <Label>Price (₹) <span className="text-destructive">*</span></Label>
              <Input type="number" step="0.01" min="0" {...register('price')} placeholder="0.00" />
              {errors.price && <p className="text-xs text-destructive">{errors.price.message}</p>}
            </div>
          </div>
          {PRICE_LABEL[assetClass] && (
            <p className="text-xs text-muted-foreground -mt-2">{PRICE_LABEL[assetClass]}</p>
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
                {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : (isEdit ? 'Save changes' : 'Add entry')}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
