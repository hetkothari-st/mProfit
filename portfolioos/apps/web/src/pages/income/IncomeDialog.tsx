import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { incomeApi, type IncomeDTO, type IncomeInput, type IncomeType } from '@/api/income.api';
import { INCOME_TYPE_LABEL, INCOME_TYPE_SOURCE_LABEL, INCOME_TYPE_SOURCE_PLACEHOLDER } from './incomeTypeMeta';
import { apiErrorMessage } from '@/api/client';
import { toDecimal } from '@portfolioos/shared';

interface Props {
  open: boolean;
  existing: IncomeDTO | null;
  onClose: () => void;
  onSaved: () => void;
}

export function IncomeDialog({ open, existing, onClose, onSaved }: Props) {
  const isEdit = !!existing;
  const [type, setType] = useState<IncomeType>(existing?.type ?? 'SALARY');
  const [sourceName, setSourceName] = useState(existing?.sourceName ?? '');
  const [monthlyAmount, setMonthlyAmount] = useState(existing?.monthlyAmount ?? '');
  const [payDay, setPayDay] = useState(existing?.payDay ?? 1);
  const [isActive, setIsActive] = useState(existing?.isActive ?? true);
  const [notes, setNotes] = useState(existing?.notes ?? '');

  const saveMut = useMutation({
    mutationFn: (input: IncomeInput) =>
      isEdit ? incomeApi.update(existing!.id, input) : incomeApi.create(input),
    onSuccess: () => {
      toast.success(isEdit ? 'Income updated' : 'Income added');
      onSaved();
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });

  const submit = () => {
    if (!sourceName.trim()) return toast.error(`${INCOME_TYPE_SOURCE_LABEL[type]} required`);
    if (!monthlyAmount || toDecimal(monthlyAmount).lessThanOrEqualTo(0)) {
      return toast.error('Monthly amount required');
    }
    if (payDay < 1 || payDay > 31) return toast.error('Pay day must be between 1 and 31');
    saveMut.mutate({
      type,
      sourceName: sourceName.trim(),
      monthlyAmount,
      payDay,
      isActive,
      notes: notes.trim() || null,
    });
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit income' : 'Add income'}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-3 py-2">
          <div>
            <Label htmlFor="type">Income type</Label>
            <Select
              id="type"
              className="mt-1"
              value={type}
              onChange={(e) => setType(e.target.value as IncomeType)}
            >
              {Object.entries(INCOME_TYPE_LABEL).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </Select>
          </div>

          <div>
            <Label htmlFor="sourceName">{INCOME_TYPE_SOURCE_LABEL[type]}</Label>
            <Input
              id="sourceName"
              placeholder={INCOME_TYPE_SOURCE_PLACEHOLDER[type]}
              value={sourceName}
              onChange={(e) => setSourceName(e.target.value)}
              className="mt-1"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label htmlFor="monthlyAmount">Monthly amount (₹)</Label>
              <Input
                id="monthlyAmount"
                type="number"
                min="0"
                step="1"
                value={monthlyAmount}
                onChange={(e) => setMonthlyAmount(e.target.value)}
                className="mt-1"
              />
              <p className="text-[10px] text-muted-foreground mt-0.5">
                For irregular income (trading, freelance), use your recent average.
              </p>
            </div>
            <div>
              <Label htmlFor="payDay">Typical credit day</Label>
              <Input
                id="payDay"
                type="number"
                min="1"
                max="31"
                value={payDay}
                onChange={(e) => setPayDay(Number(e.target.value))}
                className="mt-1"
              />
              <p className="text-[10px] text-muted-foreground mt-0.5">Day of month this is usually credited</p>
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
            Currently active
          </label>

          <div>
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              className="mt-1"
              rows={2}
              value={notes ?? ''}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={saveMut.isPending}>
            {saveMut.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {isEdit ? 'Save' : 'Add'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
