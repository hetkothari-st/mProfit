import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { DateInput } from '@/components/ui/date-input';
import { Label } from '@/components/ui/label';
import { apiErrorMessage } from '@/api/client';
import { insuranceApi, type AddPremiumInput } from '@/api/insurance/insurance.api';

const MONEY = /^\d+(\.\d+)?$/;
const EMPTY: AddPremiumInput = { paidOn: '', amount: '', periodFrom: '', periodTo: '' };

/** Record a premium as paid; the policy's next due date moves on from it. */
export function RecordPremiumDialog({
  policyId,
  open,
  onOpenChange,
  initial,
}: {
  policyId: string | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial?: Partial<AddPremiumInput> | null;
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState<AddPremiumInput>(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<keyof AddPremiumInput, string>>>({});

  useEffect(() => {
    if (open) {
      setForm({
        paidOn: initial?.paidOn ?? new Date().toISOString().slice(0, 10),
        amount: initial?.amount ?? '',
        periodFrom: initial?.periodFrom ?? '',
        periodTo: initial?.periodTo ?? '',
      });
      setErrors({});
    }
  }, [open, initial]);

  const mutation = useMutation({
    mutationFn: (input: AddPremiumInput) => insuranceApi.addPremium(policyId!, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['insurance-policies'] });
      qc.invalidateQueries({ queryKey: ['insurance-policy', policyId] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      toast.success('Premium recorded');
      onOpenChange(false);
    },
  });

  function validate(): boolean {
    const errs: Partial<Record<keyof AddPremiumInput, string>> = {};
    if (!form.paidOn) errs.paidOn = 'Required';
    if (!MONEY.test(form.amount.trim())) errs.amount = 'Enter the amount paid, like 25000';
    if (!form.periodFrom) errs.periodFrom = 'Required';
    if (!form.periodTo) errs.periodTo = 'Required';
    if (form.periodFrom && form.periodTo && form.periodTo < form.periodFrom) errs.periodTo = 'Ends before it starts';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  const field = (key: keyof AddPremiumInput) => ({
    value: form[key] ?? '',
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [key]: e.target.value })),
    className: errors[key] ? 'border-negative' : '',
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Record premium payment</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label htmlFor="premium-paid-on">Paid on</Label>
            <DateInput id="premium-paid-on" {...field('paidOn')} />
          </div>
          <div>
            <Label htmlFor="premium-amount">Amount (₹)</Label>
            <Input id="premium-amount" inputMode="decimal" placeholder="25000" {...field('amount')} />
            {errors.amount && <p className="mt-1 text-xs text-negative">{errors.amount}</p>}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label htmlFor="premium-from">Covers from</Label>
              <DateInput id="premium-from" {...field('periodFrom')} />
            </div>
            <div>
              <Label htmlFor="premium-to">Until</Label>
              <DateInput id="premium-to" {...field('periodTo')} />
              {errors.periodTo && <p className="mt-1 text-xs text-negative">{errors.periodTo}</p>}
            </div>
          </div>
        </div>
        {mutation.isError && (
          <p className="text-sm text-negative">{apiErrorMessage(mutation.error, 'Could not record the payment')}</p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => validate() && mutation.mutate(form)} disabled={mutation.isPending || !policyId}>
            {mutation.isPending ? 'Saving…' : 'Record payment'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
