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
import { apiErrorMessage } from '@/api/client';
import { caApi, type CaTransactionRow } from '@/api/ca.api';

/**
 * Correct one of the client's transactions.
 *
 * Only fields that were recorded wrongly are editable. What the trade WAS —
 * its portfolio, asset class and buy/sell direction — is shown but fixed,
 * because changing those is inventing a different transaction rather than
 * correcting this one, and the server refuses them regardless.
 *
 * Gross and net are not editable either: the server re-derives them from
 * quantity, price and charges. A form that let someone type a total which
 * disagreed with the numbers above it would be offering a way to make the
 * books lie.
 *
 * Only changed fields are sent, so the audit entry records an actual edit
 * rather than a full-row overwrite that looks like everything moved.
 */

const isMoney = (v: string) => /^\d+(\.\d+)?$/.test(v);

export function CorrectTransactionDialog({
  clientId,
  transaction,
  open,
  onOpenChange,
}: {
  clientId: string;
  transaction: CaTransactionRow | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const [tradeDate, setTradeDate] = useState('');
  const [quantity, setQuantity] = useState('');
  const [price, setPrice] = useState('');
  const [assetName, setAssetName] = useState('');
  const [narration, setNarration] = useState('');

  useEffect(() => {
    if (!open || !transaction) return;
    setTradeDate(transaction.tradeDate);
    setQuantity(transaction.quantity);
    setPrice(transaction.price);
    setAssetName(transaction.assetName ?? '');
    setNarration(transaction.narration ?? '');
  }, [open, transaction]);

  const save = useMutation({
    mutationFn: () => {
      const t = transaction!;
      const patch: Record<string, string> = {};
      if (tradeDate !== t.tradeDate) patch.tradeDate = tradeDate;
      if (quantity !== t.quantity) patch.quantity = quantity;
      if (price !== t.price) patch.price = price;
      if (assetName !== (t.assetName ?? '')) patch.assetName = assetName;
      if (narration !== (t.narration ?? '')) patch.narration = narration;
      return caApi.correctTransaction(clientId, t.id, patch);
    },
    onSuccess: () => {
      toast.success('Transaction corrected');
      qc.invalidateQueries({ queryKey: ['ca', clientId] });
      onOpenChange(false);
    },
    onError: (e) => toast.error(apiErrorMessage(e, 'Could not save the correction')),
  });

  if (!transaction) return null;

  const quantityInvalid = quantity !== '' && !isMoney(quantity);
  const priceInvalid = price !== '' && !isMoney(price);
  const changed =
    tradeDate !== transaction.tradeDate ||
    quantity !== transaction.quantity ||
    price !== transaction.price ||
    assetName !== (transaction.assetName ?? '') ||
    narration !== (transaction.narration ?? '');
  const canSave = changed && !quantityInvalid && !priceInvalid && tradeDate !== '';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Correct transaction</DialogTitle>
          <DialogDescription>
            Fix what was recorded wrongly. Your client can see this correction and what it changed.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <p className="text-[11.5px] leading-relaxed text-muted-foreground">
            <span className="text-foreground">
              {transaction.transactionType} · {transaction.assetClass}
            </span>{' '}
            — these cannot be changed here. Correcting what a trade was, rather than what was
            recorded about it, means entering a different transaction.
          </p>

          <div>
            <Label>Trade date</Label>
            <Input type="date" value={tradeDate} onChange={(e) => setTradeDate(e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Quantity</Label>
              <Input
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
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
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                inputMode="decimal"
                className="numeric tabular-nums text-right"
              />
              {priceInvalid && (
                <p className="mt-1 text-[11.5px] text-negative">Digits and one decimal point.</p>
              )}
            </div>
          </div>

          <div>
            <Label>Asset name</Label>
            <Input
              value={assetName}
              onChange={(e) => setAssetName(e.target.value)}
              maxLength={200}
            />
          </div>

          <div>
            <Label>Narration</Label>
            <Input
              value={narration}
              onChange={(e) => setNarration(e.target.value)}
              maxLength={500}
              placeholder="Why this was corrected"
            />
          </div>

          <p className="text-[11.5px] leading-relaxed text-muted-foreground">
            The net amount is recalculated from quantity, price and the recorded charges. Your
            client can see this correction and what it changed.
          </p>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => save.mutate()} disabled={!canSave || save.isPending}>
            {save.isPending ? 'Saving…' : 'Save correction'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
