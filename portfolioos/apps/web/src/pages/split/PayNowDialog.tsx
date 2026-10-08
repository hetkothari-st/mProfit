// apps/web/src/pages/split/PayNowDialog.tsx
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import QRCode from 'qrcode';
import { toDecimal } from '@everypaisa/shared';
import type { SplitGroupDto } from '@everypaisa/shared';
import { buttonVariants, Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { splitErrorMessage } from './errors';
import { copyText } from './clipboard';
import { SPLIT_KEYS, splitApi } from '@/api/split.api';
import { todayLocal } from '@/lib/localDate';
import { formatSplitMoney, memberName } from '@/lib/splitFormat';

export function PayNowDialog({ open, onOpenChange, group, toMemberId, amount }: {
  open: boolean; onOpenChange: (o: boolean) => void; group: SplitGroupDto; toMemberId: string; amount: string;
}) {
  const qc = useQueryClient();
  const me = group.members.find((m) => m.isMe);
  const amount2 = toDecimal(amount).toFixed(2);
  const [qr, setQr] = useState<string | null>(null);
  const [asked, setAsked] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The payee's UPI ID is only revealed to someone who owes them, so never cache it past this dialog.
  const link = useQuery({
    queryKey: ['split', 'upi-link', group.id, toMemberId, amount2],
    queryFn: () => splitApi.upiLink(group.id, toMemberId, amount2),
    enabled: open, retry: false, gcTime: 0, staleTime: 0,
  });
  const uri = link.data?.uri;

  useEffect(() => {
    if (!open) { setQr(null); setAsked(false); setError(null); }
  }, [open]);

  useEffect(() => {
    if (!uri) return undefined;
    let live = true;
    QRCode.toDataURL(uri, { margin: 1, width: 220 }).then((u) => { if (live) setQr(u); }, () => { if (live) setQr(null); });
    return () => { live = false; };
  }, [uri]);

  // With the QR on screen the user is probably paying from another phone: ask after a beat.
  useEffect(() => {
    if (!qr) return undefined;
    const t = setTimeout(() => setAsked(true), 1000);
    return () => clearTimeout(t);
  }, [qr]);

  const record = useMutation({
    mutationFn: () => splitApi.createSettlement({
      groupId: group.id, fromMemberId: me!.id, toMemberId, amount: toDecimal(amount).toDecimalPlaces(2).toString(),
      currency: group.baseCurrency, method: 'UPI', date: todayLocal(),
    }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: SPLIT_KEYS.all });
      toast.success('Payment recorded');
      onOpenChange(false);
    },
    onError: (err) => setError(splitErrorMessage(err, 'Could not record the payment')),
  });

  const loadError = link.isError ? splitErrorMessage(link.error, 'Could not prepare the payment') : null;
  const noUpi = loadError !== null && /UPI ID/i.test(loadError);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>{`Pay ${memberName(group.members, toMemberId)}`}</DialogTitle></DialogHeader>
        {link.isPending && open && <p className="text-sm text-muted-foreground">Loading…</p>}
        {loadError && (
          <div role="alert" className="space-y-1 text-sm">
            <p className="text-destructive">{loadError}</p>
            {noUpi && <p className="text-muted-foreground">Ask them to add a UPI ID in Split settings</p>}
          </div>
        )}
        {link.data && (
          <div className="space-y-4">
            <div className="text-center space-y-0.5">
              <p className="text-2xl font-semibold tabular-nums">{formatSplitMoney(link.data.amount, group.baseCurrency)}</p>
              <p className="text-sm">{link.data.payeeName}</p>
              <p className="text-sm text-muted-foreground break-all">{link.data.payeeVpa}</p>
            </div>
            <a href={link.data.uri} onClick={() => setAsked(true)} className={`${buttonVariants({ variant: 'default' })} w-full`}>Open UPI app</a>
            <Button variant="outline" className="w-full" onClick={() => void copyText(link.data.uri).then((ok) => (ok ? toast.success('Pay link copied') : toast.error("Couldn't copy - long-press the QR or use Open UPI app")))}>Copy pay link</Button>
            {qr && (
              <div className="flex flex-col items-center gap-1">
                <img src={qr} alt="UPI QR code" width={220} height={220} className="rounded bg-white" />
                <p className="text-xs text-muted-foreground">Scan with any UPI app</p>
              </div>
            )}
            {asked && (
              <div className="space-y-2 border-t pt-3">
                <p className="text-sm font-medium">Did the payment go through?</p>
                {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
                <div className="flex gap-2">
                  <Button className="flex-1" onClick={() => { setError(null); record.mutate(); }} disabled={record.isPending || !me}>Yes, record it</Button>
                  <Button className="flex-1" variant="outline" onClick={() => onOpenChange(false)}>Not yet</Button>
                </div>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
