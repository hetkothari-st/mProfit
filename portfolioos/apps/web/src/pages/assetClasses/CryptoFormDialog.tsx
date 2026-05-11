import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Loader2, Bitcoin, Search, Sparkles, Info, X } from 'lucide-react';
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
import { assetsApi, type CryptoSearchHit } from '@/api/assets.api';
import { apiErrorMessage } from '@/api/client';
import { Decimal } from '@portfolioos/shared';
import type { TransactionDTO, AssetClass } from '@portfolioos/shared';
import type { FormDialogProps } from './FDFormDialog';
import { buildCryptoNarration, parseCryptoNarration } from './cryptoUtils';

const n = (v: unknown) => (v === '' || v == null ? undefined : v);
const moneyReq = z.preprocess(n, z.coerce.number().nonnegative());
const qtyReq = z.preprocess(n, z.coerce.number().positive('Must be > 0'));

const TXN_TYPES = [
  { value: 'BUY', label: 'Buy' },
  { value: 'SELL', label: 'Sell' },
  { value: 'INTEREST_RECEIVED', label: 'Staking Reward' },
  { value: 'DEPOSIT', label: 'Transfer In' },
  { value: 'WITHDRAWAL', label: 'Transfer Out' },
] as const;

const EXCHANGES = [
  'Coinbase', 'Binance', 'WazirX', 'CoinDCX', 'Kraken',
  'KuCoin', 'Bybit', 'Upbit', 'Mudrex', 'Self-custody', 'Other',
];

const NETWORKS = [
  'Bitcoin', 'Ethereum', 'Binance Smart Chain', 'Solana', 'Polygon',
  'Avalanche', 'Cardano', 'Polkadot', 'Tron', 'Other',
];

const schema = z.object({
  portfolioId:     z.string().min(1, 'Select a portfolio'),
  transactionType: z.enum(['BUY', 'SELL', 'INTEREST_RECEIVED', 'DEPOSIT', 'WITHDRAWAL']),
  coinGeckoId:     z.string().optional(),
  assetName:       z.string().min(1, 'Select or enter a coin'),
  symbol:          z.string().optional(),
  exchange:        z.string().optional(),
  walletAddress:   z.string().optional(),
  network:         z.string().optional(),
  tradeDate:       z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date'),
  quantity:        qtyReq,
  price:           moneyReq,
  narration:       z.string().optional(),
});
type FormValues = z.input<typeof schema>;
type FormOutput = z.output<typeof schema>;

export function CryptoFormDialog({
  open, onOpenChange, initial, defaultPortfolioId,
}: FormDialogProps) {
  const queryClient = useQueryClient();
  const isEdit = !!initial;

  const { data: portfolios } = useQuery({ queryKey: ['portfolios'], queryFn: portfoliosApi.list });

  const { register, handleSubmit, watch, reset, setValue, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      portfolioId: defaultPortfolioId ?? '',
      transactionType: 'BUY',
      tradeDate: new Date().toISOString().slice(0, 10),
    },
  });

  const txnType = watch('transactionType');
  const assetName = watch('assetName');
  const coinGeckoId = watch('coinGeckoId');

  // ── Coin search dropdown ─────────────────────────────────────────
  const [coinQuery, setCoinQuery] = useState('');
  const [showResults, setShowResults] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  const { data: coinHits = [] } = useQuery({
    queryKey: ['crypto-search', coinQuery],
    queryFn: () => assetsApi.cryptoSearch(coinQuery, 12),
    enabled: coinQuery.length >= 1,
    staleTime: 30_000,
  });

  useEffect(() => {
    if (!showResults) return;
    function handler(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowResults(false);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showResults]);

  function pickCoin(hit: CryptoSearchHit) {
    setValue('coinGeckoId', hit.coinGeckoId);
    setValue('assetName', hit.name);
    setValue('symbol', hit.symbol);
    setCoinQuery(`${hit.name} (${hit.symbol})`);
    setShowResults(false);
  }

  // ── Live price pre-fill ──────────────────────────────────────────
  const { data: live } = useQuery({
    queryKey: ['crypto-live'],
    queryFn: () => assetsApi.cryptoLive(),
    staleTime: 30_000,
    enabled: open,
  });

  const livePriceForSelected = coinGeckoId
    ? live?.coins.find((c) => c.coinGeckoId === coinGeckoId)?.priceInr ?? null
    : null;

  function applyLivePrice() {
    if (livePriceForSelected) {
      setValue('price', parseFloat(livePriceForSelected));
    }
  }

  // ── Init / reset ─────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    if (initial) {
      const parsed = parseCryptoNarration(initial.narration);
      reset({
        portfolioId: initial.portfolioId,
        transactionType: (initial.transactionType as FormValues['transactionType']) ?? 'BUY',
        coinGeckoId: initial.isin ?? '',
        assetName: initial.assetName ?? '',
        symbol: initial.symbol ?? '',
        exchange: parsed.exchange,
        network: parsed.network,
        walletAddress: parsed.walletAddress,
        tradeDate: initial.tradeDate,
        quantity: parseFloat(initial.quantity),
        price: parseFloat(initial.price),
        narration: parsed.narration,
      });
      setCoinQuery(initial.assetName ?? '');
    } else {
      reset({
        portfolioId: defaultPortfolioId ?? portfolios?.[0]?.id ?? '',
        transactionType: 'BUY',
        tradeDate: new Date().toISOString().slice(0, 10),
      });
      setCoinQuery('');
    }
  }, [open, initial, defaultPortfolioId, portfolios, reset]);

  // ── Submit ───────────────────────────────────────────────────────
  const mutation = useMutation({
    mutationFn: (values: FormOutput) => {
      const req = {
        portfolioId: values.portfolioId,
        assetClass: 'CRYPTOCURRENCY' as AssetClass,
        transactionType: values.transactionType as TransactionDTO['transactionType'],
        assetName: values.assetName,
        isin: values.coinGeckoId || undefined,
        tradeDate: values.tradeDate,
        quantity: values.quantity,
        price: values.price,
        narration: buildCryptoNarration(values),
      };
      return isEdit && initial
        ? transactionsApi.update(initial.id, req)
        : transactionsApi.create(req);
    },
    onSuccess: () => {
      toast.success(isEdit ? 'Crypto entry updated' : 'Crypto entry added');
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
      <DialogContent className="max-w-lg max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bitcoin className="h-5 w-5 text-amber-500" />
            {isEdit ? 'Edit Crypto Entry' : 'Add Cryptocurrency'}
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

          {/* Transaction type */}
          <div className="space-y-1">
            <Label>Transaction</Label>
            <div className="grid grid-cols-3 gap-2">
              {TXN_TYPES.map((t) => (
                <label key={t.value} className={`flex items-center justify-center gap-1 rounded-md border px-2 py-2 cursor-pointer text-xs transition-colors
                  ${txnType === t.value ? 'border-primary bg-primary/5 font-medium' : 'hover:bg-muted/40'}`}>
                  <input type="radio" value={t.value} {...register('transactionType')} className="sr-only" />
                  {t.label}
                </label>
              ))}
            </div>
          </div>

          {/* Coin search */}
          <div className="space-y-1" ref={searchRef}>
            <Label>Coin <span className="text-destructive">*</span></Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
              <Input
                value={coinQuery}
                onChange={(e) => {
                  setCoinQuery(e.target.value);
                  setShowResults(true);
                  // Free-text mode: clear coinGeckoId if user diverges
                  if (coinGeckoId && e.target.value !== `${watch('assetName')} (${watch('symbol')})`) {
                    setValue('coinGeckoId', '');
                  }
                  setValue('assetName', e.target.value);
                }}
                onFocus={() => setShowResults(true)}
                placeholder="Search Bitcoin, ETH, SOL…"
                className="pl-9"
              />
              {coinQuery && (
                <button
                  type="button"
                  onClick={() => {
                    setCoinQuery('');
                    setValue('coinGeckoId', '');
                    setValue('assetName', '');
                    setValue('symbol', '');
                  }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded-full hover:bg-muted text-muted-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
              {showResults && coinHits.length > 0 && (
                <div className="absolute z-30 mt-1 w-full rounded-md border bg-popover shadow-lg max-h-64 overflow-y-auto">
                  {coinHits.map((hit) => (
                    <button
                      key={hit.id}
                      type="button"
                      onClick={() => pickCoin(hit)}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-muted/60 transition-colors flex items-center justify-between border-b last:border-0"
                    >
                      <div className="min-w-0">
                        <p className="font-medium truncate">{hit.name}</p>
                        <p className="text-xs text-muted-foreground">{hit.symbol.toUpperCase()}</p>
                      </div>
                      <span className="text-[10px] text-muted-foreground font-mono ml-2">{hit.coinGeckoId}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            {coinGeckoId ? (
              <p className="text-[11px] text-emerald-600 dark:text-emerald-400 flex items-center gap-1 mt-0.5">
                <Sparkles className="h-3 w-3" /> Linked to CoinGecko · live prices enabled
              </p>
            ) : (
              <p className="text-[11px] text-muted-foreground flex items-start gap-1 mt-0.5">
                <Info className="h-3 w-3 shrink-0 mt-0.5" />
                Free-text coin name. Live prices only available when matched from search.
              </p>
            )}
            {errors.assetName && <p className="text-xs text-destructive">{errors.assetName.message}</p>}
          </div>

          {/* Exchange + Network */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Exchange / Platform</Label>
              <Select {...register('exchange')} className="w-full">
                <option value="">— select —</option>
                {EXCHANGES.map((e) => <option key={e} value={e}>{e}</option>)}
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Network / Chain</Label>
              <Select {...register('network')} className="w-full">
                <option value="">— select —</option>
                {NETWORKS.map((n) => <option key={n} value={n}>{n}</option>)}
              </Select>
            </div>
          </div>

          {/* Wallet address */}
          <div className="space-y-1">
            <Label>Wallet Address / Account ID <span className="text-muted-foreground text-xs">(optional)</span></Label>
            <Input {...register('walletAddress')} placeholder="0x… or exchange account ID" className="font-mono text-xs" />
          </div>

          {/* Date + Qty + Price */}
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label>Date <span className="text-destructive">*</span></Label>
              <Input type="date" {...register('tradeDate')} />
              {errors.tradeDate && <p className="text-xs text-destructive">{errors.tradeDate.message}</p>}
            </div>
            <div className="space-y-1">
              <Label>Quantity <span className="text-destructive">*</span></Label>
              <Input type="number" step="0.00000001" min="0" {...register('quantity')} placeholder="0.5" />
              {errors.quantity && <p className="text-xs text-destructive">{errors.quantity.message}</p>}
            </div>
            <div className="space-y-1">
              <Label>Price ₹ <span className="text-destructive">*</span></Label>
              <Input type="number" step="0.0001" min="0" {...register('price')} placeholder="0.00" />
              {errors.price && <p className="text-xs text-destructive">{errors.price.message}</p>}
            </div>
          </div>

          {/* Live price hint */}
          {livePriceForSelected && (
            <button
              type="button"
              onClick={applyLivePrice}
              className="w-full rounded-md border border-dashed border-amber-300 dark:border-amber-700 bg-amber-50/50 dark:bg-amber-950/20 px-3 py-2 text-xs flex items-center justify-between hover:bg-amber-50 dark:hover:bg-amber-950/40 transition-colors"
            >
              <span className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-muted-foreground">Live price:</span>
                <span className="font-semibold tabular-nums">₹{new Decimal(livePriceForSelected).toFixed(2)}</span>
              </span>
              <span className="text-amber-700 dark:text-amber-400 font-medium">Use this →</span>
            </button>
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
