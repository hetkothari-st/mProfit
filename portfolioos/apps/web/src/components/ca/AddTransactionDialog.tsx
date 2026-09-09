import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { apiErrorMessage } from '@/api/client';
import {
  caApi,
  CA_ASSET_CLASSES,
  CA_TRANSACTION_TYPES,
  type CaTransactionInput,
} from '@/api/ca.api';

/**
 * Record a transaction directly in a client's books.
 *
 * Same fields and validation the app's own "Add transaction" dialog uses
 * (`apps/web/src/pages/transactions/TransactionFormDialog.tsx`) for the
 * asset classes this workspace supports today — no portfolio picker,
 * because the server resolves (and bootstraps, on a client's very first
 * write) the one portfolio these books use; nothing here for a CA to choose.
 *
 * Amounts stay decimal STRINGS from the input box to the request body, the
 * same discipline `VoucherFormDialog` and `CorrectTransactionDialog` follow
 * — never parsed into a JavaScript number in this file.
 */

const isMoney = (v: string) => /^\d+(\.\d+)?$/.test(v);

const empty = (): CaTransactionInput => ({
  transactionType: 'BUY',
  assetClass: 'EQUITY',
  tradeDate: new Date().toISOString().slice(0, 10),
  quantity: '',
  price: '',
});

export function AddTransactionDialog({
  clientId,
  open,
  onOpenChange,
}: {
  clientId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState<CaTransactionInput>(empty());
  const [showCharges, setShowCharges] = useState(false);

  useEffect(() => {
    if (!open) {
      setForm(empty());
      setShowCharges(false);
    }
  }, [open]);

  const set = <K extends keyof CaTransactionInput>(key: K, value: CaTransactionInput[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const isFund = form.assetClass === 'MUTUAL_FUND';
  const isStockLike = form.assetClass === 'EQUITY' || form.assetClass === 'ETF' || form.assetClass === 'FOREIGN_EQUITY';

  const quantityInvalid = form.quantity !== '' && !isMoney(form.quantity);
  const priceInvalid = form.price !== '' && !isMoney(form.price);
  const nameProvided = isFund
    ? Boolean(form.schemeName?.trim())
    : isStockLike
      ? Boolean(form.stockSymbol?.trim() || form.stockName?.trim())
      : Boolean(form.assetName?.trim());
  const canSave =
    form.tradeDate !== '' &&
    form.quantity !== '' &&
    !quantityInvalid &&
    form.price !== '' &&
    !priceInvalid &&
    nameProvided;

  const save = useMutation({
    mutationFn: () => {
      const payload: CaTransactionInput = { ...form };
      if (!isFund) {
        delete payload.schemeCode;
        delete payload.schemeName;
        delete payload.amcName;
      }
      if (!isStockLike) {
        delete payload.stockSymbol;
        delete payload.stockName;
        delete payload.exchange;
      }
      return caApi.createTransaction(clientId, payload);
    },
    onSuccess: () => {
      toast.success('Transaction recorded');
      qc.invalidateQueries({ queryKey: ['ca', clientId] });
      onOpenChange(false);
    },
    onError: (e) => toast.error(apiErrorMessage(e, 'Could not record the transaction')),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add transaction</DialogTitle>
          <DialogDescription>
            Record a trade directly in this client's books. Holdings and capital gains
            recalculate automatically.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Type</Label>
              <Select
                value={form.transactionType}
                onChange={(e) => set('transactionType', e.target.value)}
              >
                {CA_TRANSACTION_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t.replace(/_/g, ' ')}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Asset class</Label>
              <Select value={form.assetClass} onChange={(e) => set('assetClass', e.target.value)}>
                {CA_ASSET_CLASSES.map((ac) => (
                  <option key={ac} value={ac}>
                    {ac.replace(/_/g, ' ')}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          {isFund ? (
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label>Scheme name</Label>
                <Input
                  value={form.schemeName ?? ''}
                  onChange={(e) => set('schemeName', e.target.value)}
                  placeholder="e.g. Parag Parikh Flexi Cap Fund"
                />
              </div>
              <div>
                <Label>AMC</Label>
                <Input value={form.amcName ?? ''} onChange={(e) => set('amcName', e.target.value)} />
              </div>
              <div>
                <Label>ISIN (optional)</Label>
                <Input
                  className="uppercase"
                  maxLength={12}
                  value={form.isin ?? ''}
                  onChange={(e) => set('isin', e.target.value)}
                />
              </div>
            </div>
          ) : isStockLike ? (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Symbol</Label>
                <Input
                  className="uppercase"
                  value={form.stockSymbol ?? ''}
                  onChange={(e) => set('stockSymbol', e.target.value)}
                  placeholder="e.g. RELIANCE"
                />
              </div>
              <div>
                <Label>Name</Label>
                <Input value={form.stockName ?? ''} onChange={(e) => set('stockName', e.target.value)} />
              </div>
              <div className="col-span-2">
                <Label>ISIN (optional)</Label>
                <Input
                  className="uppercase"
                  maxLength={12}
                  value={form.isin ?? ''}
                  onChange={(e) => set('isin', e.target.value)}
                />
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Asset name</Label>
                <Input value={form.assetName ?? ''} onChange={(e) => set('assetName', e.target.value)} />
              </div>
              <div>
                <Label>ISIN (optional)</Label>
                <Input
                  className="uppercase"
                  maxLength={12}
                  value={form.isin ?? ''}
                  onChange={(e) => set('isin', e.target.value)}
                />
              </div>
            </div>
          )}

          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>Trade date</Label>
              <Input
                type="date"
                value={form.tradeDate}
                onChange={(e) => set('tradeDate', e.target.value)}
              />
            </div>
            <div>
              <Label>Quantity</Label>
              <Input
                value={form.quantity}
                onChange={(e) => set('quantity', e.target.value)}
                inputMode="decimal"
                className="numeric tabular-nums text-right"
              />
              {quantityInvalid && (
                <p className="mt-1 text-[11.5px] text-negative">Digits and one decimal point.</p>
              )}
            </div>
            <div>
              <Label>Price</Label>
              <Input
                value={form.price}
                onChange={(e) => set('price', e.target.value)}
                inputMode="decimal"
                className="numeric tabular-nums text-right"
              />
              {priceInvalid && (
                <p className="mt-1 text-[11.5px] text-negative">Digits and one decimal point.</p>
              )}
            </div>
          </div>

          <button
            type="button"
            className="text-[11.5px] text-muted-foreground underline underline-offset-2"
            onClick={() => setShowCharges((v) => !v)}
          >
            {showCharges ? 'Hide charges' : 'Add charges (optional)'}
          </button>

          {showCharges && (
            <div className="grid grid-cols-3 gap-3">
              {(
                [
                  ['brokerage', 'Brokerage'],
                  ['stt', 'STT'],
                  ['stampDuty', 'Stamp duty'],
                  ['exchangeCharges', 'Exchange'],
                  ['gst', 'GST'],
                  ['sebiCharges', 'SEBI'],
                  ['otherCharges', 'Other'],
                ] as const
              ).map(([key, label]) => (
                <div key={key}>
                  <Label className="text-xs">{label}</Label>
                  <Input
                    value={form[key] ?? ''}
                    onChange={(e) => set(key, e.target.value)}
                    inputMode="decimal"
                    className="numeric tabular-nums text-right"
                  />
                </div>
              ))}
              <div className="col-span-3">
                <Label className="text-xs">Broker</Label>
                <Input value={form.broker ?? ''} onChange={(e) => set('broker', e.target.value)} />
              </div>
            </div>
          )}

          <div>
            <Label>Narration (optional)</Label>
            <Input value={form.narration ?? ''} onChange={(e) => set('narration', e.target.value)} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => save.mutate()} disabled={!canSave || save.isPending}>
            {save.isPending ? 'Saving…' : 'Add transaction'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
