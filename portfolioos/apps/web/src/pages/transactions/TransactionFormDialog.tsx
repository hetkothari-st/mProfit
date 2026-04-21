import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Loader2, Trash2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { AssetSearch } from '@/components/common/AssetSearch';
import { transactionsApi } from '@/api/transactions.api';
import { portfoliosApi } from '@/api/portfolios.api';
import { apiErrorMessage } from '@/api/client';
import {
  AssetClass,
  TransactionType,
  type AssetSearchHit,
  type TransactionDTO,
  type CreateTransactionRequest,
  Exchange,
} from '@portfolioos/shared';

const schema = z.object({
  portfolioId: z.string().min(1, 'Select a portfolio'),
  transactionType: z.nativeEnum(TransactionType),
  assetClass: z.nativeEnum(AssetClass),
  stockSymbol: z.string().optional(),
  stockName: z.string().optional(),
  exchange: z.nativeEnum(Exchange).optional(),
  schemeCode: z.string().optional(),
  schemeName: z.string().optional(),
  amcName: z.string().optional(),
  assetName: z.string().optional(),
  isin: z.string().optional(),
  tradeDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  settlementDate: z.string().optional(),
  quantity: z.coerce.number().positive('Must be > 0'),
  price: z.coerce.number().nonnegative(),
  brokerage: z.coerce.number().nonnegative().optional(),
  stt: z.coerce.number().nonnegative().optional(),
  stampDuty: z.coerce.number().nonnegative().optional(),
  exchangeCharges: z.coerce.number().nonnegative().optional(),
  gst: z.coerce.number().nonnegative().optional(),
  sebiCharges: z.coerce.number().nonnegative().optional(),
  otherCharges: z.coerce.number().nonnegative().optional(),
  broker: z.string().optional(),
  narration: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial?: TransactionDTO | null;
  defaultPortfolioId?: string;
}

const ASSET_CLASS_OPTIONS: AssetClass[] = ['EQUITY', 'MUTUAL_FUND', 'ETF', 'BOND', 'FIXED_DEPOSIT'];

const TXN_TYPE_OPTIONS: TransactionType[] = [
  'BUY',
  'SELL',
  'SIP',
  'SWITCH_IN',
  'SWITCH_OUT',
  'DIVIDEND_PAYOUT',
  'DIVIDEND_REINVEST',
  'BONUS',
  'SPLIT',
  'REDEMPTION',
];

export function TransactionFormDialog({ open, onOpenChange, initial, defaultPortfolioId }: Props) {
  const queryClient = useQueryClient();
  const isEdit = Boolean(initial);
  const [selectedAsset, setSelectedAsset] = useState<AssetSearchHit | null>(null);

  const { data: portfolios } = useQuery({
    queryKey: ['portfolios'],
    queryFn: () => portfoliosApi.list(),
    enabled: open,
  });

  const { register, handleSubmit, reset, watch, setValue, formState } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      portfolioId: defaultPortfolioId ?? '',
      transactionType: 'BUY',
      assetClass: 'EQUITY',
      tradeDate: new Date().toISOString().slice(0, 10),
      quantity: 0,
      price: 0,
      exchange: 'NSE',
    },
  });

  const assetClass = watch('assetClass');

  useEffect(() => {
    if (!open) return;
    if (initial) {
      reset({
        portfolioId: initial.portfolioId,
        transactionType: initial.transactionType,
        assetClass: initial.assetClass,
        stockSymbol: initial.symbol ?? '',
        stockName: initial.assetName ?? '',
        exchange: (initial.exchange ?? 'NSE') as Exchange,
        schemeCode: initial.schemeCode ?? '',
        schemeName: initial.assetName ?? '',
        amcName: initial.amcName ?? '',
        assetName: initial.assetName ?? '',
        isin: initial.isin ?? '',
        tradeDate: initial.tradeDate,
        settlementDate: initial.settlementDate ?? '',
        quantity: initial.quantity,
        price: initial.price,
        brokerage: initial.brokerage,
        stt: initial.stt,
        stampDuty: initial.stampDuty,
        exchangeCharges: initial.exchangeCharges,
        gst: initial.gst,
        sebiCharges: initial.sebiCharges,
        otherCharges: initial.otherCharges,
        broker: initial.broker ?? '',
        narration: initial.narration ?? '',
      });
      setSelectedAsset(null);
    } else {
      reset({
        portfolioId: defaultPortfolioId ?? portfolios?.[0]?.id ?? '',
        transactionType: 'BUY',
        assetClass: 'EQUITY',
        tradeDate: new Date().toISOString().slice(0, 10),
        quantity: 0,
        price: 0,
        exchange: 'NSE',
      });
      setSelectedAsset(null);
    }
  }, [open, initial, defaultPortfolioId, portfolios, reset]);

  const saveMutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const payload: CreateTransactionRequest = {
        portfolioId: values.portfolioId,
        transactionType: values.transactionType,
        assetClass: values.assetClass,
        tradeDate: values.tradeDate,
        settlementDate: values.settlementDate || undefined,
        quantity: values.quantity,
        price: values.price,
        brokerage: values.brokerage,
        stt: values.stt,
        stampDuty: values.stampDuty,
        exchangeCharges: values.exchangeCharges,
        gst: values.gst,
        sebiCharges: values.sebiCharges,
        otherCharges: values.otherCharges,
        broker: values.broker || undefined,
        narration: values.narration || undefined,
      };

      if (values.assetClass === 'MUTUAL_FUND') {
        payload.schemeCode = values.schemeCode;
        payload.schemeName = values.schemeName;
        payload.amcName = values.amcName;
        payload.isin = values.isin || undefined;
      } else if (values.assetClass === 'EQUITY' || values.assetClass === 'ETF') {
        payload.stockSymbol = values.stockSymbol;
        payload.stockName = values.stockName;
        payload.exchange = values.exchange;
        payload.isin = values.isin || undefined;
      } else {
        payload.assetName = values.assetName;
        payload.isin = values.isin || undefined;
      }

      if (isEdit && initial) return transactionsApi.update(initial.id, payload);
      return transactionsApi.create(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['portfolios'] });
      queryClient.invalidateQueries({ queryKey: ['portfolio-summary'] });
      queryClient.invalidateQueries({ queryKey: ['portfolio-holdings'] });
      toast.success(isEdit ? 'Transaction updated' : 'Transaction added');
      onOpenChange(false);
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Save failed')),
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!initial) return;
      await transactionsApi.remove(initial.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['portfolio-summary'] });
      queryClient.invalidateQueries({ queryKey: ['portfolio-holdings'] });
      toast.success('Transaction deleted');
      onOpenChange(false);
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Delete failed')),
  });

  const handleAssetPick = (hit: AssetSearchHit) => {
    setSelectedAsset(hit);
    if (hit.kind === 'STOCK') {
      setValue('assetClass', 'EQUITY');
      setValue('stockSymbol', hit.symbol ?? '');
      setValue('stockName', hit.name);
      setValue('exchange', (hit.exchange ?? 'NSE') as Exchange);
      setValue('isin', hit.isin ?? '');
    } else {
      setValue('assetClass', 'MUTUAL_FUND');
      setValue('schemeCode', hit.schemeCode ?? '');
      setValue('schemeName', hit.name);
      setValue('amcName', hit.amcName ?? '');
      setValue('isin', hit.isin ?? '');
    }
  };

  const qty = Number(watch('quantity') || 0);
  const price = Number(watch('price') || 0);
  const gross = qty * price;
  const charges =
    Number(watch('brokerage') || 0) +
    Number(watch('stt') || 0) +
    Number(watch('stampDuty') || 0) +
    Number(watch('exchangeCharges') || 0) +
    Number(watch('gst') || 0) +
    Number(watch('sebiCharges') || 0) +
    Number(watch('otherCharges') || 0);
  const txType = watch('transactionType');
  const isBuyish = ['BUY', 'SWITCH_IN', 'SIP', 'DIVIDEND_REINVEST', 'RIGHTS_ISSUE'].includes(txType);
  const net = isBuyish ? gross + charges : gross - charges;

  const handleDelete = () => {
    if (!initial) return;
    if (!window.confirm('Delete this transaction? Holdings will recalculate.')) return;
    deleteMutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit transaction' : 'Add transaction'}</DialogTitle>
          <DialogDescription>
            Record a buy, sell, SIP, dividend, or corporate action. Holdings recalculate automatically.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit((v) => saveMutation.mutate(v))} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="portfolioId">Portfolio</Label>
              <Select id="portfolioId" className="mt-1" {...register('portfolioId')}>
                <option value="">Select portfolio…</option>
                {portfolios?.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </Select>
              {formState.errors.portfolioId && (
                <p className="text-xs text-negative mt-1">{formState.errors.portfolioId.message}</p>
              )}
            </div>
            <div>
              <Label htmlFor="transactionType">Type</Label>
              <Select id="transactionType" className="mt-1" {...register('transactionType')}>
                {TXN_TYPE_OPTIONS.map((t) => (
                  <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>
                ))}
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label htmlFor="assetClass">Asset class</Label>
              <Select id="assetClass" className="mt-1" {...register('assetClass')}>
                {ASSET_CLASS_OPTIONS.map((ac) => (
                  <option key={ac} value={ac}>{ac.replace(/_/g, ' ')}</option>
                ))}
              </Select>
            </div>
            <div className="col-span-2">
              <Label>Asset</Label>
              <div className="mt-1">
                <AssetSearch
                  kind={assetClass === 'MUTUAL_FUND' ? 'mf' : assetClass === 'EQUITY' || assetClass === 'ETF' ? 'stock' : 'all'}
                  onSelect={handleAssetPick}
                  placeholder={
                    assetClass === 'MUTUAL_FUND'
                      ? 'Search scheme name / code / ISIN…'
                      : 'Search symbol, name, or ISIN…'
                  }
                />
                {selectedAsset && (
                  <p className="mt-1 text-xs text-muted-foreground truncate">
                    Selected: <span className="font-medium">{selectedAsset.name}</span>
                  </p>
                )}
              </div>
            </div>
          </div>

          {assetClass !== 'EQUITY' && assetClass !== 'ETF' && assetClass !== 'MUTUAL_FUND' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="assetName">Asset name</Label>
                <Input id="assetName" className="mt-1" {...register('assetName')} />
              </div>
              <div>
                <Label htmlFor="isin">ISIN (optional)</Label>
                <Input id="isin" className="mt-1 uppercase" maxLength={12} {...register('isin')} />
              </div>
            </div>
          )}

          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label htmlFor="tradeDate">Trade date</Label>
              <Input id="tradeDate" type="date" className="mt-1" {...register('tradeDate')} />
            </div>
            <div>
              <Label htmlFor="quantity">Quantity</Label>
              <Input id="quantity" type="number" step="0.0001" className="mt-1 tabular-nums" {...register('quantity')} />
              {formState.errors.quantity && (
                <p className="text-xs text-negative mt-1">{formState.errors.quantity.message}</p>
              )}
            </div>
            <div>
              <Label htmlFor="price">Price</Label>
              <Input id="price" type="number" step="0.0001" className="mt-1 tabular-nums" {...register('price')} />
            </div>
          </div>

          <details className="rounded-md border px-3 py-2 text-sm">
            <summary className="cursor-pointer font-medium">Charges (optional)</summary>
            <div className="mt-3 grid grid-cols-3 gap-3">
              <div>
                <Label htmlFor="brokerage" className="text-xs">Brokerage</Label>
                <Input id="brokerage" type="number" step="0.01" className="mt-1 tabular-nums" {...register('brokerage')} />
              </div>
              <div>
                <Label htmlFor="stt" className="text-xs">STT</Label>
                <Input id="stt" type="number" step="0.01" className="mt-1 tabular-nums" {...register('stt')} />
              </div>
              <div>
                <Label htmlFor="stampDuty" className="text-xs">Stamp duty</Label>
                <Input id="stampDuty" type="number" step="0.01" className="mt-1 tabular-nums" {...register('stampDuty')} />
              </div>
              <div>
                <Label htmlFor="exchangeCharges" className="text-xs">Exchange</Label>
                <Input id="exchangeCharges" type="number" step="0.01" className="mt-1 tabular-nums" {...register('exchangeCharges')} />
              </div>
              <div>
                <Label htmlFor="gst" className="text-xs">GST</Label>
                <Input id="gst" type="number" step="0.01" className="mt-1 tabular-nums" {...register('gst')} />
              </div>
              <div>
                <Label htmlFor="sebiCharges" className="text-xs">SEBI</Label>
                <Input id="sebiCharges" type="number" step="0.01" className="mt-1 tabular-nums" {...register('sebiCharges')} />
              </div>
              <div>
                <Label htmlFor="otherCharges" className="text-xs">Other</Label>
                <Input id="otherCharges" type="number" step="0.01" className="mt-1 tabular-nums" {...register('otherCharges')} />
              </div>
              <div className="col-span-2">
                <Label htmlFor="broker" className="text-xs">Broker</Label>
                <Input id="broker" className="mt-1" {...register('broker')} />
              </div>
            </div>
          </details>

          <div>
            <Label htmlFor="narration">Narration (optional)</Label>
            <Textarea id="narration" rows={2} className="mt-1" {...register('narration')} />
          </div>

          <div className="rounded-md bg-muted/40 px-3 py-2 text-sm grid grid-cols-3 gap-2">
            <div>
              <div className="text-xs text-muted-foreground">Gross</div>
              <div className="tabular-nums font-medium">{gross.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Charges</div>
              <div className="tabular-nums font-medium">{charges.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Net {isBuyish ? '(outflow)' : '(inflow)'}</div>
              <div className="tabular-nums font-semibold">{net.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}</div>
            </div>
          </div>

          <DialogFooter className="pt-2 gap-2 sm:justify-between">
            {isEdit ? (
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={handleDelete}
                disabled={deleteMutation.isPending}
              >
                <Trash2 className="h-4 w-4" /> Delete
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={saveMutation.isPending}>
                {saveMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                {isEdit ? 'Save changes' : 'Add transaction'}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
