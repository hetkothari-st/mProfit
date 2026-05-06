/**
 * Shared form dialog for PPF and NPS — both are government-backed
 * retirement/savings accounts with similar transaction patterns.
 *
 * PPF mode has two tabs:
 *  - "Manual entry" — add individual transactions (existing behaviour)
 *  - "Auto-fetch" — register a PPF account at any of 7 supported banks for
 *    server-headless scraping (SBI, India Post, HDFC, ICICI, Axis, PNB, BoB)
 */
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Loader2, BookOpen, ShieldCheck, Info, RefreshCw } from 'lucide-react';
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
import type { TransactionDTO, AssetClass } from '@portfolioos/shared';
import type { FormDialogProps } from './FDFormDialog';

const n = (v: unknown) => (v === '' || v == null ? undefined : v);
const moneyReq = z.preprocess(n, z.coerce.number().nonnegative());
const moneyOpt = z.preprocess(n, z.coerce.number().nonnegative().optional());

const schema = z.object({
  portfolioId:     z.string().min(1, 'Select a portfolio'),
  transactionType: z.enum(['DEPOSIT', 'INTEREST_RECEIVED', 'WITHDRAWAL', 'OPENING_BALANCE', 'MATURITY']),
  assetName:       z.string().min(1, 'Enter account name'),
  isin:            z.string().optional(),
  tradeDate:       z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date'),
  amount:          moneyReq,
  interestRate:    moneyOpt,
  maturityDate:    z.string().optional(),
  narration:       z.string().optional(),
});
type FormValues = z.input<typeof schema>;
type FormOutput = z.output<typeof schema>;

interface Props extends FormDialogProps {
  mode: 'PPF' | 'NPS';
}

// ---------------------------------------------------------------------------
// PPF auto-fetch sub-form — supports all 7 PPF institutions
// ---------------------------------------------------------------------------

/** Maps PfInstitution enum value → user-friendly display name */
const PPF_INSTITUTIONS = [
  { value: 'SBI',        label: 'SBI (State Bank of India)' },
  { value: 'INDIA_POST', label: 'India Post (Post Office)' },
  { value: 'HDFC',       label: 'HDFC Bank' },
  { value: 'ICICI',      label: 'ICICI Bank' },
  { value: 'AXIS',       label: 'Axis Bank' },
  { value: 'PNB',        label: 'Punjab National Bank (PNB)' },
  { value: 'BOB',        label: 'Bank of Baroda (BoB)' },
] as const;

type PpfInstitution = typeof PPF_INSTITUTIONS[number]['value'];

const autoFetchSchema = z.object({
  institution: z.enum(
    PPF_INSTITUTIONS.map((i) => i.value) as [PpfInstitution, ...PpfInstitution[]],
  ),
  pfAcct: z
    .string()
    .regex(/^\d{8,17}$/, 'Enter 8–17 digit PPF account number'),
  holderName: z.string().min(1, 'Enter account holder name'),
});
type AutoFetchFormValues = z.infer<typeof autoFetchSchema>;

function PpfAutoFetchForm({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<AutoFetchFormValues>({
    resolver: zodResolver(autoFetchSchema),
    defaultValues: { institution: 'SBI' },
  });

  const selectedInstitution = watch('institution');
  const institutionLabel =
    PPF_INSTITUTIONS.find((i) => i.value === selectedInstitution)?.label ?? selectedInstitution;

  const mutation = useMutation({
    mutationFn: (v: AutoFetchFormValues) =>
      pfApi.create({
        type: 'PPF',
        institution: v.institution,
        identifier: v.pfAcct,
        holderName: v.holderName,
      }),
    onSuccess: () => {
      toast.success(`${institutionLabel} PPF account linked — click Refresh to fetch passbook`);
      void queryClient.invalidateQueries({ queryKey: ['pf-accounts'] });
      onClose();
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Failed to link account')),
  });

  return (
    <form
      onSubmit={handleSubmit((v) => mutation.mutate(v))}
      className="space-y-4 pt-1"
    >
      <div className="rounded-lg border border-dashed border-border p-3 bg-muted/20 space-y-1">
        <p className="text-xs text-muted-foreground flex items-center gap-1">
          <RefreshCw className="h-3 w-3" />
          Register your PPF account. After linking, use the{' '}
          <strong>Refresh</strong> button on the Provident Fund page to fetch
          your passbook via the bank&apos;s net-banking portal.
        </p>
      </div>

      <div className="space-y-1">
        <Label>
          Bank / Institution <span className="text-destructive">*</span>
        </Label>
        <Select {...register('institution')} className="w-full">
          {PPF_INSTITUTIONS.map((inst) => (
            <option key={inst.value} value={inst.value}>
              {inst.label}
            </option>
          ))}
        </Select>
        {errors.institution && (
          <p className="text-xs text-destructive">{errors.institution.message}</p>
        )}
      </div>

      <div className="space-y-1">
        <Label>
          PPF Account Number <span className="text-destructive">*</span>
        </Label>
        <Input
          {...register('pfAcct')}
          placeholder="e.g. 12345678901"
          inputMode="numeric"
        />
        {errors.pfAcct && (
          <p className="text-xs text-destructive">{errors.pfAcct.message}</p>
        )}
      </div>

      <div className="space-y-1">
        <Label>
          Account Holder Name <span className="text-destructive">*</span>
        </Label>
        <Input
          {...register('holderName')}
          placeholder="Full name as per bank records"
        />
        {errors.holderName && (
          <p className="text-xs text-destructive">{errors.holderName.message}</p>
        )}
      </div>

      <DialogFooter className="pt-2">
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            'Link PPF account'
          )}
        </Button>
      </DialogFooter>
    </form>
  );
}

const CONFIG = {
  PPF: {
    icon: BookOpen,
    title: 'PPF Entry',
    assetClass: 'PPF' as AssetClass,
    accountLabel: 'Bank / Post Office',
    accountPlaceholder: 'e.g. SBI Branch, Andheri',
    accountIdLabel: 'PPF Account Number',
    accountIdPlaceholder: 'PPF account no.',
    txnTypes: ['DEPOSIT', 'INTEREST_RECEIVED', 'WITHDRAWAL', 'OPENING_BALANCE', 'MATURITY'] as const,
    txnLabels: {
      DEPOSIT:           'Annual / partial deposit',
      INTEREST_RECEIVED: 'Yearly interest (31 Mar)',
      WITHDRAWAL:        'Partial / full withdrawal',
      OPENING_BALANCE:   'Opening balance',
      MATURITY:          'Account matured (15 yr)',
    },
    amountLabels: {
      DEPOSIT:           'Deposit Amount (₹)',
      INTEREST_RECEIVED: 'Interest Credited (₹)',
      WITHDRAWAL:        'Amount Withdrawn (₹)',
      OPENING_BALANCE:   'Current Balance (₹)',
      MATURITY:          'Maturity Proceeds (₹)',
    },
    showMaturityDate: true,
    rateHint: 'PPF rate: 7.1% p.a. for Q1 FY 2024-25',
  },
  NPS: {
    icon: ShieldCheck,
    title: 'NPS Entry',
    assetClass: 'NPS' as AssetClass,
    accountLabel: 'Fund Manager / Scheme',
    accountPlaceholder: 'e.g. SBI Pension Funds – Tier I',
    accountIdLabel: 'PRAN Number',
    accountIdPlaceholder: '12-digit PRAN',
    txnTypes: ['DEPOSIT', 'INTEREST_RECEIVED', 'WITHDRAWAL', 'OPENING_BALANCE'] as const,
    txnLabels: {
      DEPOSIT:           'Contribution',
      INTEREST_RECEIVED: 'Growth / returns',
      WITHDRAWAL:        'Exit / partial withdrawal',
      OPENING_BALANCE:   'Opening balance',
    },
    amountLabels: {
      DEPOSIT:           'Contribution Amount (₹)',
      INTEREST_RECEIVED: 'Returns Credited (₹)',
      WITHDRAWAL:        'Amount Withdrawn (₹)',
      OPENING_BALANCE:   'Current Corpus (₹)',
    },
    showMaturityDate: false,
    rateHint: '',
  },
} as const;

export function PPFNpsFormDialog({ open, onOpenChange, initial, defaultPortfolioId, mode }: Props) {
  const queryClient = useQueryClient();
  const isEdit = !!initial;
  const cfg = CONFIG[mode];
  const IconComp = cfg.icon;

  // PPF-only: tab between manual entry and auto-fetch (all 7 banks)
  const [ppfTab, setPpfTab] = useState<'manual' | 'autofetch'>('manual');
  // Reset tab to manual when dialog closes or mode changes
  useEffect(() => {
    if (!open) setPpfTab('manual');
  }, [open]);

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
  const isDeposit = txnType === 'DEPOSIT';

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
          maturityDate: initial.maturityDate ?? '',
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
        assetClass: cfg.assetClass,
        transactionType: values.transactionType,
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
      toast.success(isEdit ? `${mode} entry updated` : `${mode} entry added`);
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
      toast.success(`${mode} entry deleted`);
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
            <IconComp className="h-5 w-5 text-muted-foreground" />
            {isEdit ? `Edit ${cfg.title}` : `Add ${cfg.title}`}
          </DialogTitle>
        </DialogHeader>

        {/* PPF-only tab bar — not shown when editing an existing entry */}
        {mode === 'PPF' && !isEdit && (
          <div className="flex gap-1 rounded-lg border border-border bg-muted/30 p-1">
            <button
              type="button"
              onClick={() => setPpfTab('manual')}
              className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                ppfTab === 'manual'
                  ? 'bg-background shadow-sm text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Manual entry
            </button>
            <button
              type="button"
              onClick={() => setPpfTab('autofetch')}
              className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                ppfTab === 'autofetch'
                  ? 'bg-background shadow-sm text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Auto-fetch
            </button>
          </div>
        )}

        {/* Auto-fetch tab content (PPF-only, all 7 institutions) */}
        {mode === 'PPF' && !isEdit && ppfTab === 'autofetch' && (
          <PpfAutoFetchForm onClose={() => onOpenChange(false)} />
        )}

        {/* Manual entry form — shown for NPS, for PPF-edit, and for PPF manual tab */}
        {(mode === 'NPS' || isEdit || ppfTab === 'manual') && (
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

          {/* Account name + ID */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>{cfg.accountLabel} <span className="text-destructive">*</span></Label>
              <Input {...register('assetName')} placeholder={cfg.accountPlaceholder} />
              {errors.assetName && <p className="text-xs text-destructive">{errors.assetName.message}</p>}
            </div>
            <div className="space-y-1">
              <Label>{cfg.accountIdLabel} <span className="text-muted-foreground text-xs">(optional)</span></Label>
              <Input {...register('isin')} placeholder={cfg.accountIdPlaceholder} />
            </div>
          </div>

          {/* Transaction type */}
          <div className="space-y-1">
            <Label>Entry Type</Label>
            <div className="grid grid-cols-2 gap-2">
              {(cfg.txnTypes as readonly string[]).map((t) => (
                <label key={t} className={`flex items-center gap-2 rounded-md border px-3 py-2 cursor-pointer text-sm transition-colors
                  ${watch('transactionType') === t ? 'border-primary bg-primary/5' : 'hover:bg-muted/40'}`}>
                  <input type="radio" value={t} {...register('transactionType')} className="sr-only" />
                  {(cfg.txnLabels as Record<string, string>)[t]}
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
              <Label>{(cfg.amountLabels as Record<string, string>)[txnType] ?? 'Amount (₹)'} <span className="text-destructive">*</span></Label>
              <Input type="number" step="0.01" min="0" {...register('amount')} placeholder="0.00" />
              {errors.amount && <p className="text-xs text-destructive">{errors.amount.message}</p>}
            </div>
          </div>

          {/* Interest rate section */}
          {isInterest && (
            <div className="rounded-lg border border-dashed border-border p-3 bg-muted/20 space-y-2">
              <div className="space-y-1">
                <Label>Interest / Return Rate (% p.a.)</Label>
                <Input type="number" step="0.01" min="0" max="30" {...register('interestRate')} placeholder={mode === 'PPF' ? '7.10' : '0.00'} />
                {cfg.rateHint && <p className="text-xs text-muted-foreground flex items-center gap-1"><Info className="h-3 w-3" />{cfg.rateHint}</p>}
              </div>
            </div>
          )}

          {/* Maturity date for PPF deposit */}
          {cfg.showMaturityDate && isDeposit && (
            <div className="space-y-1">
              <Label>Account Maturity Date <span className="text-muted-foreground text-xs">(optional)</span></Label>
              <Input type="date" {...register('maturityDate')} />
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Info className="h-3 w-3" /> PPF matures 15 years from account opening
              </p>
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
                {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : (isEdit ? 'Save changes' : `Add ${mode} entry`)}
              </Button>
            </div>
          </DialogFooter>
        </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Thin wrappers so SimpleAssetPage can use them as drop-in FormComponents */
export function PPFFormDialog(props: FormDialogProps) {
  return <PPFNpsFormDialog {...props} mode="PPF" />;
}

export function NpsFormDialog(props: FormDialogProps) {
  return <PPFNpsFormDialog {...props} mode="NPS" />;
}
