import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Loader2, Info, Landmark } from 'lucide-react';
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
import type { AssetClass, TransactionType } from '@everypaisa/shared';
import type { FormDialogProps } from './FDFormDialog';
import { SCHEMES, SCHEME_ORDER, assetClassToScheme, schemeForAssetClass, type SchemeType } from '@/lib/poSchemes';

const n = (v: unknown) => (v === '' || v == null ? undefined : v);
const moneyReq = z.preprocess(n, z.coerce.number().nonnegative('Enter amount'));
const moneyOpt = z.preprocess(n, z.coerce.number().nonnegative().optional());

const schema = z.object({
  portfolioId:     z.string().min(1, 'Select a portfolio'),
  schemeType:      z.string().min(1) as z.ZodType<SchemeType>,
  transactionType: z.string().min(1),
  assetName:       z.string().min(1, 'Enter account / branch name'),
  isin:            z.string().optional(),
  tradeDate:       z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date'),
  amount:          moneyReq,
  interestRate:    moneyOpt,
  maturityDate:    z.string().optional(),
  narration:       z.string().optional(),
});
type FormValues = z.input<typeof schema>;
type FormOutput = z.output<typeof schema>;

export function PostOfficeFormDialog({ open, onOpenChange, initial, defaultPortfolioId, defaultAssetClass }: FormDialogProps) {
  const queryClient = useQueryClient();
  const isEdit = !!initial;

  // For new entries opened from a per-scheme "Add" button, preselect that scheme.
  const defaultScheme: SchemeType =
    (defaultAssetClass ? schemeForAssetClass(defaultAssetClass) : undefined) ?? 'NSC';
  const defaultTxnType = SCHEMES[defaultScheme].txnTypes[0]!;

  const { data: portfolios } = useQuery({ queryKey: ['portfolios'], queryFn: portfoliosApi.list });

  const { register, handleSubmit, watch, reset, setValue, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      portfolioId: defaultPortfolioId ?? '',
      schemeType: defaultScheme,
      transactionType: defaultTxnType,
      tradeDate: new Date().toISOString().slice(0, 10),
    },
  });

  const schemeType = watch('schemeType') as SchemeType;
  const txnType = watch('transactionType');
  const cfg = SCHEMES[schemeType] ?? SCHEMES.NSC;
  const showInterestRate = ['BUY', 'DEPOSIT', 'OPENING_BALANCE'].includes(txnType);
  const showMaturityDate = cfg.showMaturityDate && ['BUY', 'DEPOSIT', 'OPENING_BALANCE'].includes(txnType);

  // Auto-populate maturity date when scheme or trade date changes (new form only)
  const tradeDate = watch('tradeDate');
  useEffect(() => {
    if (isEdit || !cfg.defaultMaturityYears || !tradeDate) return;
    const date = new Date(`${tradeDate}T00:00:00.000Z`);
    date.setFullYear(date.getFullYear() + cfg.defaultMaturityYears);
    setValue('maturityDate', date.toISOString().slice(0, 10));
  }, [schemeType, tradeDate, cfg.defaultMaturityYears, isEdit, setValue]);

  // Reset transaction type when scheme changes (if current type not valid)
  useEffect(() => {
    const validTypes = cfg.txnTypes as string[];
    if (!validTypes.includes(txnType)) {
      setValue('transactionType', validTypes[0]!);
    }
  }, [schemeType, cfg.txnTypes, txnType, setValue]);

  useEffect(() => {
    if (open) {
      if (initial) {
        const scheme = assetClassToScheme(initial.assetClass as AssetClass);
        reset({
          portfolioId: initial.portfolioId,
          schemeType: scheme,
          transactionType: initial.transactionType,
          assetName: initial.assetName ?? '',
          isin: initial.isin ?? '',
          tradeDate: initial.tradeDate,
          amount: parseFloat(initial.price),
          interestRate: initial.interestRate != null ? parseFloat(initial.interestRate as string) : undefined,
          maturityDate: initial.maturityDate ?? '',
          narration: initial.narration ?? '',
        });
      } else {
        reset({
          portfolioId: defaultPortfolioId ?? portfolios?.[0]?.id ?? '',
          schemeType: defaultScheme,
          transactionType: defaultTxnType,
          tradeDate: new Date().toISOString().slice(0, 10),
        });
      }
    }
  }, [open, initial, defaultPortfolioId, portfolios, reset, defaultScheme, defaultTxnType]);

  const mutation = useMutation({
    mutationFn: (values: FormOutput) => {
      const scheme = SCHEMES[values.schemeType as SchemeType];
      const req = {
        portfolioId: values.portfolioId,
        assetClass: scheme.assetClass,
        transactionType: values.transactionType as TransactionType,
        assetName: values.assetName,
        isin: values.isin || undefined,
        tradeDate: values.tradeDate,
        quantity: 1,
        price: values.amount,
        interestRate: values.interestRate,
        maturityDate: values.maturityDate || undefined,
        narration: values.narration || undefined,
      };
      return isEdit && initial
        ? transactionsApi.update(initial.id, req)
        : transactionsApi.create(req);
    },
    onSuccess: () => {
      toast.success(isEdit ? 'Entry updated' : 'Post Office entry added');
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
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Landmark className="h-5 w-5 text-muted-foreground" />
            {isEdit ? 'Edit Post Office Entry' : 'Add Post Office Entry'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit((v) => mutation.mutate(v as FormOutput))} className="space-y-4 pt-1">
          {/* Scheme selector */}
          {!isEdit && (
            <div className="space-y-1.5">
              <Label>Scheme</Label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                {SCHEME_ORDER.map((s) => (
                  <label
                    key={s}
                    className={`flex flex-col items-center justify-center rounded-md border px-2 py-2 cursor-pointer text-xs text-center transition-colors
                      ${watch('schemeType') === s
                        ? 'border-primary bg-primary/5 text-foreground font-medium'
                        : 'hover:bg-muted/40 text-muted-foreground'}`}
                  >
                    <input type="radio" value={s} {...register('schemeType')} className="sr-only" />
                    <span className="font-medium text-[11px] leading-tight">{SCHEMES[s].label}</span>
                    <span className="text-[9px] leading-tight mt-0.5 text-muted-foreground">
                      {SCHEMES[s].fullName.replace('Post Office ', '').replace('Senior ', '').replace('National ', '')}
                    </span>
                  </label>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-1">{cfg.fullName}</p>
            </div>
          )}

          {isEdit && (
            <div className="rounded-md border border-dashed border-border/60 bg-muted/20 px-3 py-2 text-sm">
              <span className="text-muted-foreground">Scheme: </span>
              <span className="font-medium">{cfg.fullName}</span>
            </div>
          )}

          {/* Portfolio */}
          <div className="space-y-1">
            <Label>Portfolio <span className="text-destructive">*</span></Label>
            <Select {...register('portfolioId')} className="w-full">
              <option value="">Select portfolio…</option>
              {(portfolios ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
            {errors.portfolioId && <p className="text-xs text-destructive">{errors.portfolioId.message}</p>}
          </div>

          {/* Account name + ID */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>{cfg.accountLabel} <span className="text-destructive">*</span></Label>
              <Input {...register('assetName')} placeholder="e.g. Andheri PO" />
              {errors.assetName && <p className="text-xs text-destructive">{errors.assetName.message}</p>}
            </div>
            <div className="space-y-1">
              <Label>{cfg.accountIdLabel} <span className="text-muted-foreground text-xs">(optional)</span></Label>
              <Input {...register('isin')} placeholder={cfg.accountIdPlaceholder} />
            </div>
          </div>

          {/* Transaction type */}
          <div className="space-y-1">
            <Label>Entry type</Label>
            <div className="grid grid-cols-2 gap-2">
              {(cfg.txnTypes as string[]).map((t) => (
                <label
                  key={t}
                  className={`flex items-center gap-2 rounded-md border px-3 py-2 cursor-pointer text-sm transition-colors
                    ${txnType === t ? 'border-primary bg-primary/5' : 'hover:bg-muted/40'}`}
                >
                  <input type="radio" value={t} {...register('transactionType')} className="sr-only" />
                  {cfg.txnLabels[t] ?? t}
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
              <Label>
                {cfg.amountLabels[txnType] ?? 'Amount (₹)'}
                <span className="text-destructive"> *</span>
              </Label>
              <Input type="number" step="0.01" min="0.01" {...register('amount')} placeholder="0.00" />
              {errors.amount && <p className="text-xs text-destructive">{errors.amount.message}</p>}
            </div>
          </div>

          {/* Interest rate section */}
          {showInterestRate && (
            <div className="rounded-lg border border-dashed border-border p-3 bg-muted/20 space-y-2">
              <div className="space-y-1">
                <Label>Interest rate (% p.a.) <span className="text-muted-foreground text-xs">(optional)</span></Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  max="30"
                  {...register('interestRate')}
                  placeholder={cfg.defaultRate}
                />
                {cfg.rateHint && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Info className="h-3 w-3 shrink-0" />{cfg.rateHint}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Maturity date */}
          {showMaturityDate && (
            <div className="space-y-1">
              <Label>Maturity date <span className="text-muted-foreground text-xs">(optional)</span></Label>
              <Input type="date" {...register('maturityDate')} />
              {cfg.defaultMaturityYears && (
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Info className="h-3 w-3 shrink-0" />
                  Auto-filled {cfg.defaultMaturityYears} years from issue date
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
                {mutation.isPending
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : isEdit ? 'Save changes' : 'Add entry'}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
