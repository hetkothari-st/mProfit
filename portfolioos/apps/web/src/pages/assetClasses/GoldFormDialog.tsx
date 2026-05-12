import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Loader2, Coins, Info, Camera, X, ImageIcon } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Decimal } from '@portfolioos/shared';
import { transactionsApi } from '@/api/transactions.api';
import { portfoliosApi } from '@/api/portfolios.api';
import { assetsApi } from '@/api/assets.api';
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
  purity:          z.string().optional(),
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

const GOLD_CARATS = ['24K', '22K', '18K', '14K'];
const SILVER_PURITIES = ['999', '925', '800'];

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

// Parse purity prefix from assetName: "22K Gold bracelet" → { purity: "22K", name: "Gold bracelet" }
function parsePurityFromName(name: string | null | undefined, assetClass: string): { purity: string; name: string } {
  if (!name) return { purity: assetClass === 'PHYSICAL_SILVER' ? '999' : '24K', name: '' };
  const goldMatch = name.match(/^(\d{2}[kK])\s*/);
  if (goldMatch && assetClass !== 'PHYSICAL_SILVER') {
    const caratStr = goldMatch[1]!.toUpperCase();
    return { purity: caratStr, name: name.slice(goldMatch[0].length) };
  }
  const silverMatch = name.match(/^(999|925|800)\s*/);
  if (silverMatch && assetClass === 'PHYSICAL_SILVER') {
    return { purity: silverMatch[1]!, name: name.slice(silverMatch[0].length) };
  }
  return { purity: assetClass === 'PHYSICAL_SILVER' ? '999' : '24K', name };
}

interface PendingPhoto {
  file: File;
  preview: string;
}

interface ExistingPhoto {
  id: string;
  fileName: string;
  txnId: string;
}

export function GoldFormDialog({ open, onOpenChange, initial, defaultPortfolioId }: FormDialogProps) {
  const queryClient = useQueryClient();
  const isEdit = !!initial;

  const [purity, setPurity] = useState('24K');
  const [pendingPhotos, setPendingPhotos] = useState<PendingPhoto[]>([]);
  const [existingPhotos, setExistingPhotos] = useState<ExistingPhoto[]>([]);
  const [deletingPhotoId, setDeletingPhotoId] = useState<string | null>(null);
  const [livePriceApplied, setLivePriceApplied] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: portfolios } = useQuery({ queryKey: ['portfolios'], queryFn: portfoliosApi.list });

  const { data: live, isFetching: isPriceFetching } = useQuery({
    queryKey: ['commodities-live'],
    queryFn: () => assetsApi.commoditiesLive(),
    refetchInterval: 60_000,
    staleTime: 60_000,
  });

  const { register, handleSubmit, watch, reset, setValue, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      portfolioId: defaultPortfolioId ?? '',
      assetClass: 'PHYSICAL_GOLD',
      transactionType: 'BUY',
      tradeDate: new Date().toISOString().slice(0, 10),
      purity: '24K',
    },
  });

  const assetClass = watch('assetClass');
  const txnType = watch('transactionType');
  const isSgbBuy = assetClass === 'GOLD_BOND' && txnType === 'BUY';
  const isPhysical = assetClass === 'PHYSICAL_GOLD' || assetClass === 'PHYSICAL_SILVER';

  const purities = assetClass === 'PHYSICAL_SILVER' ? SILVER_PURITIES : GOLD_CARATS;

  useEffect(() => {
    const validTypes = TXN_BY_TYPE[assetClass as keyof typeof TXN_BY_TYPE] ?? TXN_BY_TYPE.PHYSICAL_GOLD;
    const current = watch('transactionType');
    if (!validTypes.some((t) => t.value === current)) {
      setValue('transactionType', 'BUY' as FormValues['transactionType']);
    }
    // Reset purity when switching asset class
    const newPurity = assetClass === 'PHYSICAL_SILVER' ? '999' : '24K';
    setPurity(newPurity);
    setLivePriceApplied(false);
    // Clear price so the previously-filled value from another class (e.g. the
    // 24K gold per-gram rate) doesn't bleed into silver / ETF / SGB. Edit mode
    // intentionally skips this — the form was initialised from `initial`.
    if (!isEdit) {
      setValue('price', undefined as unknown as FormValues['price']);
    }
  }, [assetClass, isEdit, setValue, watch]);

  useEffect(() => {
    if (open) {
      setPendingPhotos([]);
      if (initial) {
        const ac = (initial.assetClass as string) ?? 'PHYSICAL_GOLD';
        const parsed = parsePurityFromName(initial.assetName, ac);
        setPurity(parsed.purity);
        setExistingPhotos((initial.photos ?? []).map((p) => ({
          id: p.id,
          fileName: p.fileName,
          txnId: initial.id,
        })));
        reset({
          portfolioId: initial.portfolioId,
          assetClass: (ac as FormValues['assetClass']),
          transactionType: (initial.transactionType as FormValues['transactionType']) ?? 'BUY',
          purity: parsed.purity,
          assetName: parsed.name,
          isin: initial.isin ?? '',
          tradeDate: initial.tradeDate,
          quantity: parseFloat(initial.quantity),
          price: parseFloat(initial.price),
          interestRate: initial.interestRate != null ? parseFloat(initial.interestRate as string) : undefined,
          maturityDate: initial.maturityDate ?? '',
          narration: initial.narration ?? '',
        });
      } else {
        setExistingPhotos([]);
        reset({
          portfolioId: defaultPortfolioId ?? portfolios?.[0]?.id ?? '',
          assetClass: 'PHYSICAL_GOLD',
          transactionType: 'BUY',
          purity: '24K',
          tradeDate: new Date().toISOString().slice(0, 10),
        });
        setPurity('24K');
        setLivePriceApplied(false);
      }
    }
  }, [open, initial, defaultPortfolioId, portfolios, reset]);

  // Auto-fill price from live rates when creating new entry. Each asset class
  // uses its own pricing dimension — physical gold scales by carat, SGB is
  // pure-gold per-gram, ETFs trade at a NAV per unit (NOT per-gram), and
  // silver scales by purity grade.
  const watchedAssetName = watch('assetName') ?? '';
  useEffect(() => {
    if (!live || !open || isEdit) return;
    let price: string | null = null;
    let available = false; // did this class have a live source?
    if (assetClass === 'PHYSICAL_GOLD') {
      available = !!live.GOLD;
      if (live.GOLD) {
        const caratNum = parseInt(purity.replace(/[kK]/, ''), 10);
        const multiplier = !isNaN(caratNum) ? caratNum / 24 : 1;
        price = new Decimal(live.GOLD).times(multiplier).toFixed(2);
      }
    } else if (assetClass === 'GOLD_BOND') {
      available = !!live.GOLD;
      if (live.GOLD) price = new Decimal(live.GOLD).toFixed(2);
    } else if (assetClass === 'GOLD_ETF') {
      const ticker = (watchedAssetName.toUpperCase().match(/\b(GOLDBEES|GOLDIETF|AXISGOLD|HDFCGOLD|KOTAKGOLD|SETFGOLD|LICMFGOLD|QGOLDHALF)\b/) ?? [])[1];
      const nav = ticker ? live.etfNavs?.[ticker] : null;
      available = !!nav;
      if (nav) price = new Decimal(nav).toFixed(2);
    } else if (assetClass === 'PHYSICAL_SILVER') {
      available = !!live.SILVER;
      if (live.SILVER) {
        const purityMap: Record<string, string> = { '999': '1', '925': '0.925', '800': '0.8' };
        const mult = purityMap[purity] ?? '1';
        price = new Decimal(live.SILVER).times(mult).toFixed(2);
      }
    }

    if (price) {
      setValue('price', parseFloat(price) as any);
      setLivePriceApplied(true);
    } else if (!available) {
      // No live source for this class — clear any stale value carried over
      // from a previous class so the user knows they must enter manually.
      setValue('price', undefined as any);
      setLivePriceApplied(false);
    }
  }, [live, purity, assetClass, watchedAssetName, open, isEdit, setValue]);

  const mutation = useMutation({
    mutationFn: async (values: FormOutput) => {
      const finalName = isPhysical && values.purity
        ? `${purity} ${values.assetName}`.trim()
        : values.assetName;

      const req = {
        portfolioId: values.portfolioId,
        assetClass: values.assetClass,
        transactionType: values.transactionType,
        assetName: finalName,
        isin: values.isin || undefined,
        tradeDate: values.tradeDate,
        quantity: values.quantity,
        price: values.price,
        interestRate: values.interestRate,
        maturityDate: values.maturityDate || undefined,
        narration: values.narration || undefined,
      };

      const txn = isEdit && initial
        ? await transactionsApi.update(initial.id, req)
        : await transactionsApi.create(req);

      // Upload any pending photos
      if (pendingPhotos.length > 0) {
        await Promise.all(
          pendingPhotos.map((p) => transactionsApi.uploadPhoto(txn.id, p.file).catch(() => null)),
        );
      }
      return txn;
    },
    onSuccess: () => {
      toast.success(isEdit ? 'Entry updated' : 'Entry added');
      setPendingPhotos([]);
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

  const deletePhotoMutation = useMutation({
    mutationFn: ({ txnId, photoId }: { txnId: string; photoId: string }) =>
      transactionsApi.deletePhoto(txnId, photoId),
    onSuccess: (_, { photoId }) => {
      setExistingPhotos((p) => p.filter((x) => x.id !== photoId));
      setDeletingPhotoId(null);
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Failed to delete photo')),
  });

  function handleFiles(files: FileList | null) {
    if (!files) return;
    const allowed = Array.from(files).filter((f) =>
      ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'].includes(f.type),
    );
    if (pendingPhotos.length + existingPhotos.length + allowed.length > 5) {
      toast.error('Max 5 photos per entry');
      return;
    }
    const newPending = allowed.map((f) => ({ file: f, preview: URL.createObjectURL(f) }));
    setPendingPhotos((p) => [...p, ...newPending]);
  }

  function removePending(idx: number) {
    setPendingPhotos((p) => {
      URL.revokeObjectURL(p[idx]!.preview);
      return p.filter((_, i) => i !== idx);
    });
  }

  const availableTxns = TXN_BY_TYPE[assetClass as keyof typeof TXN_BY_TYPE] ?? TXN_BY_TYPE.PHYSICAL_GOLD;
  const totalPhotos = existingPhotos.length + pendingPhotos.length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
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

          {/* Type selector */}
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

          {/* Transaction type + date */}
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

          {/* Purity / Carat (physical only) */}
          {isPhysical && (
            <div className="space-y-1">
              <Label>{assetClass === 'PHYSICAL_SILVER' ? 'Purity' : 'Carat'}</Label>
              <div className="flex gap-2 flex-wrap">
                {purities.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => { setPurity(p); setValue('purity', p); }}
                    className={`px-3 py-1.5 rounded-md border text-sm font-medium transition-colors
                      ${purity === p
                        ? 'border-amber-500 bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-600'
                        : 'border-border hover:bg-muted/50 text-muted-foreground'
                      }`}
                  >
                    {assetClass === 'PHYSICAL_SILVER' ? `${p} purity` : p}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                {assetClass === 'PHYSICAL_SILVER'
                  ? 'Affects current value calculation'
                  : 'Current value computed at this carat × live gold price'}
              </p>
            </div>
          )}

          {/* Name + ISIN */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Name / Description <span className="text-destructive">*</span></Label>
              <Input {...register('assetName')}
                placeholder={assetClass === 'GOLD_BOND' ? 'e.g. SGB 2024-25 Series I' :
                  assetClass === 'GOLD_ETF' ? 'e.g. GOLDBEES' :
                  assetClass === 'PHYSICAL_SILVER' ? 'e.g. Silver chain' : 'e.g. Gold bracelet'} />
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
              <div className="flex items-center gap-2">
                <Label>
                  {txnType === 'INTEREST_RECEIVED' ? 'Interest per unit (₹)' : PRICE_LABEL[assetClass]}
                  <span className="text-destructive"> *</span>
                </Label>
                {isPriceFetching && !isEdit && isPhysical && !livePriceApplied && (
                  <span className="flex items-center gap-1 text-[10px] text-muted-foreground font-medium">
                    <Loader2 className="h-2.5 w-2.5 animate-spin" />
                    Fetching…
                  </span>
                )}
                {livePriceApplied && !isEdit && (
                  <span className="flex items-center gap-0.5 text-[10px] text-amber-600 dark:text-amber-400 font-medium">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
                    live
                  </span>
                )}
              </div>
              <Input
                type="number"
                step="0.01"
                min="0"
                {...register('price', { onChange: () => setLivePriceApplied(false) })}
                placeholder="0.00"
              />
              {errors.price && <p className="text-xs text-destructive">{errors.price.message}</p>}
            </div>
          </div>

          {/* SGB details */}
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
            <Textarea {...register('narration')} placeholder="Storage location, purchase source, etc." rows={2} />
          </div>

          {/* Photo upload */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Photos <span className="text-muted-foreground text-xs">(optional, max 5)</span></Label>
              {totalPhotos < 5 && (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  <Camera className="h-3.5 w-3.5" />
                  Add photo
                </button>
              )}
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
              multiple
              className="hidden"
              onChange={(e) => handleFiles(e.target.files)}
            />

            {totalPhotos === 0 ? (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full border border-dashed rounded-lg p-4 flex flex-col items-center gap-2 text-muted-foreground hover:border-primary hover:text-primary transition-colors"
              >
                <ImageIcon className="h-6 w-6" />
                <span className="text-xs">Click to add photos of your jewellery, coins, etc.</span>
              </button>
            ) : (
              <div className="flex flex-wrap gap-2">
                {/* Existing photos */}
                {existingPhotos.map((photo) => (
                  <div key={photo.id} className="relative h-16 w-16 rounded-md overflow-hidden border bg-muted/30">
                    <ExistingPhotoThumb txnId={photo.txnId} photoId={photo.id} />
                    <button
                      type="button"
                      disabled={deletingPhotoId === photo.id}
                      onClick={() => {
                        setDeletingPhotoId(photo.id);
                        deletePhotoMutation.mutate({ txnId: photo.txnId, photoId: photo.id });
                      }}
                      className="absolute top-0.5 right-0.5 h-4 w-4 rounded-full bg-black/60 flex items-center justify-center hover:bg-destructive transition-colors"
                    >
                      {deletingPhotoId === photo.id
                        ? <Loader2 className="h-2.5 w-2.5 text-white animate-spin" />
                        : <X className="h-2.5 w-2.5 text-white" />}
                    </button>
                  </div>
                ))}
                {/* Pending photos */}
                {pendingPhotos.map((p, idx) => (
                  <div key={idx} className="relative h-16 w-16 rounded-md overflow-hidden border">
                    <img src={p.preview} alt="" className="h-full w-full object-cover" />
                    <button
                      type="button"
                      onClick={() => removePending(idx)}
                      className="absolute top-0.5 right-0.5 h-4 w-4 rounded-full bg-black/60 flex items-center justify-center hover:bg-destructive transition-colors"
                    >
                      <X className="h-2.5 w-2.5 text-white" />
                    </button>
                    <div className="absolute bottom-0 left-0 right-0 bg-black/40 text-[9px] text-white text-center py-0.5">
                      pending
                    </div>
                  </div>
                ))}
                {totalPhotos < 5 && (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="h-16 w-16 rounded-md border border-dashed flex items-center justify-center text-muted-foreground hover:border-primary hover:text-primary transition-colors"
                  >
                    <Camera className="h-5 w-5" />
                  </button>
                )}
              </div>
            )}
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
                  ? <><Loader2 className="h-4 w-4 animate-spin mr-1" /> Saving…</>
                  : (isEdit ? 'Save changes' : 'Add entry')}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// Fetches existing photo via authenticated endpoint, renders as blob URL
function ExistingPhotoThumb({ txnId, photoId }: { txnId: string; photoId: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    const url = transactionsApi.photoUrl(txnId, photoId);
    // Fetch with auth header via axios — axios interceptor adds Bearer token
    import('@/api/client').then(({ api }) =>
      api.get(url.replace(/^https?:\/\/[^/]+/, ''), { responseType: 'blob' })
        .then(({ data }) => setSrc(URL.createObjectURL(data)))
        .catch(() => setSrc(null)),
    );
    return () => { if (src) URL.revokeObjectURL(src); };
  }, [txnId, photoId]);

  if (!src) return <div className="h-full w-full bg-muted/40 flex items-center justify-center"><ImageIcon className="h-4 w-4 text-muted-foreground" /></div>;
  return <img src={src} alt="" className="h-full w-full object-cover" />;
}
