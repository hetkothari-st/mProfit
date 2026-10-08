// apps/web/src/pages/split/SettleUpDialog.tsx
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Decimal } from '@everypaisa/shared';
import type { SplitGroupDto, SplitSettleMethodDto } from '@everypaisa/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { splitErrorMessage } from './errors';
import { SPLIT_KEYS, splitApi } from '@/api/split.api';
import { todayLocal } from '@/lib/localDate';
import { memberName } from '@/lib/splitFormat';
import { cleanAmount, MONEY } from './expenseForm';

export function SettleUpDialog({ open, onOpenChange, group, from, to, amount }: {
  open: boolean; onOpenChange: (o: boolean) => void; group: SplitGroupDto; from?: string; to?: string; amount?: string;
}) {
  const qc = useQueryClient();
  const active = group.members.filter((m) => !m.leftAt);
  const me = active.find((m) => m.isMe);
  const [payer, setPayer] = useState('');
  const [receiver, setReceiver] = useState('');
  const [value, setValue] = useState('');
  const [method, setMethod] = useState<SplitSettleMethodDto>('CASH');
  const [date, setDate] = useState(todayLocal());
  const [error, setError] = useState<string | null>(null);

  const wasOpen = useRef(false);
  useEffect(() => {
    // Reset only on the closed -> open transition, so a background refetch can't wipe typing.
    if (open && !wasOpen.current) {
      setPayer(from ?? me?.id ?? '');
      setReceiver(to ?? active.find((m) => m.id !== (from ?? me?.id))?.id ?? '');
      setValue(amount ? new Decimal(amount).toFixed(2).replace(/\.00$/, '') : '');
      setMethod('CASH');
      setDate(todayLocal());
      setError(null);
    }
    wasOpen.current = open;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally keyed on `open` alone (see above)
  }, [open]);

  const save = useMutation({
    mutationFn: () => splitApi.createSettlement({
      groupId: group.id, fromMemberId: payer, toMemberId: receiver, amount: cleanAmount(value),
      currency: group.baseCurrency, method, date,
    }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: SPLIT_KEYS.all });
      toast.success('Payment recorded');
      onOpenChange(false);
    },
    onError: (err) => setError(splitErrorMessage(err, 'Could not record the payment')),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const v = cleanAmount(value);
    if (payer === receiver) return setError('Pick two different people');
    if (!MONEY.test(v) || new Decimal(v).lte(0)) return setError('Enter an amount above 0 with at most 2 decimals');
    save.mutate();
  };

  const label = (id: string) => memberName(active, id);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Settle up</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="settle-from">Paid by</Label>
              <Select id="settle-from" value={payer} onChange={(e) => setPayer(e.target.value)}>
                {active.map((m) => <option key={m.id} value={m.id}>{label(m.id)}</option>)}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="settle-to">Paid to</Label>
              <Select id="settle-to" value={receiver} onChange={(e) => setReceiver(e.target.value)}>
                {active.map((m) => <option key={m.id} value={m.id}>{label(m.id)}</option>)}
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="settle-amount">{`Amount (${group.baseCurrency})`}</Label>
            <Input id="settle-amount" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="settle-method">Method</Label>
              <Select id="settle-method" value={method} onChange={(e) => setMethod(e.target.value as SplitSettleMethodDto)}>
                <option value="CASH">Cash</option>
                <option value="UPI">UPI</option>
                <option value="OTHER">Other</option>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="settle-date">Date</Label>
              <Input id="settle-date" type="date" value={date} max={todayLocal()} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={save.isPending}>Record payment</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
