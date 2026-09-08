import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { apiErrorMessage } from '@/api/client';
import { caApi, type CaFmvRow } from '@/api/ca.api';

/**
 * Set the 31-Jan-2018 fair market value for a scrip.
 *
 * Under Section 55(2)(ac) the cost of a pre-2018 equity holding is the higher
 * of what was paid and its FMV on that date, so this single figure decides how
 * much of a long-term gain is taxable. It is a judgement made from historical
 * quotes, which is why a CA sets it — and why the dialog says plainly that
 * changing it changes the client's tax, rather than presenting it as one more
 * editable field.
 */

const isMoney = (v: string) => /^\d+(\.\d+)?$/.test(v);
const isIsin = (v: string) => /^[A-Z]{2}[A-Z0-9]{9}\d$/.test(v);

export function FmvFormDialog({
  clientId,
  existing,
  open,
  onOpenChange,
}: {
  clientId: string;
  /** Present when editing an override; absent when adding one. */
  existing?: CaFmvRow | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const isEdit = !!existing;

  const [isin, setIsin] = useState('');
  const [scripName, setScripName] = useState('');
  const [fmvPerUnit, setFmvPerUnit] = useState('');

  useEffect(() => {
    if (!open) return;
    setIsin(existing?.isin ?? '');
    setScripName(existing?.scripName ?? '');
    setFmvPerUnit(existing?.fmvPerUnit ?? '');
  }, [open, existing]);

  const save = useMutation({
    mutationFn: () =>
      caApi.setFmv(clientId, isin.trim().toUpperCase(), {
        fmvPerUnit,
        ...(scripName ? { scripName } : {}),
      }),
    onSuccess: () => {
      toast.success('Fair market value saved');
      qc.invalidateQueries({ queryKey: ['ca', clientId] });
      onOpenChange(false);
    },
    onError: (e) => toast.error(apiErrorMessage(e, 'Could not save the value')),
  });

  const isinInvalid = isin !== '' && !isIsin(isin.trim().toUpperCase());
  const fmvInvalid = fmvPerUnit !== '' && !isMoney(fmvPerUnit);
  const canSave = !isinInvalid && !fmvInvalid && isin.trim() !== '' && fmvPerUnit !== '';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit fair market value' : 'Set a fair market value'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <p className="text-[12.5px] leading-relaxed text-muted-foreground">
            The value on 31 January 2018, used to grandfather long-term equity gains under
            Section 55(2)(ac). Changing it changes your client&apos;s taxable gain, so the
            previous figure is kept on the record.
          </p>

          <div>
            <Label>ISIN</Label>
            <Input
              value={isin}
              onChange={(e) => setIsin(e.target.value.toUpperCase())}
              maxLength={12}
              disabled={isEdit}
              placeholder="INE009A01021"
            />
            {isinInvalid && (
              <p className="mt-1 text-[11.5px] text-negative">
                An ISIN is 12 characters: two letters, then nine alphanumerics, then a digit.
              </p>
            )}
          </div>

          <div>
            <Label>Scrip name (optional)</Label>
            <Input
              value={scripName}
              onChange={(e) => setScripName(e.target.value)}
              maxLength={200}
              placeholder="For your own reference"
            />
          </div>

          <div>
            <Label>FMV per unit</Label>
            <Input
              value={fmvPerUnit}
              onChange={(e) => setFmvPerUnit(e.target.value)}
              inputMode="decimal"
              className="numeric tabular-nums text-right"
              placeholder="0.00"
            />
            {fmvInvalid && (
              <p className="mt-1 text-[11.5px] text-negative">
                Digits and an optional decimal point only.
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => save.mutate()} disabled={!canSave || save.isPending}>
            {save.isPending ? 'Saving…' : 'Save value'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
