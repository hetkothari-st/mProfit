import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import type { SplitExpenseDto, SplitGroupDto, SplitModeDto } from '@everypaisa/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { splitErrorMessage } from './errors';
import { SPLIT_KEYS, splitApi } from '@/api/split.api';
import { formatSplitMoney } from '@/lib/splitFormat';
import { todayLocal } from '@/lib/localDate';
import { cn } from '@/lib/cn';
import { checkForm, emptyForm, formFromExpense, toPayload, type ExpenseFormState } from './expenseForm';
import { CURRENCIES } from './NewGroupDialog';

const MODES: Array<{ value: SplitModeDto; label: string; field: string }> = [
  { value: 'EQUAL', label: 'Equally', field: '' },
  { value: 'EXACT', label: 'Exact', field: 'Exact amount' },
  { value: 'PERCENT', label: 'Percent', field: 'Percent' },
  { value: 'SHARES', label: 'Shares', field: 'Shares' },
];

export function AddExpenseDialog({ open, onOpenChange, group, expense }: {
  open: boolean; onOpenChange: (o: boolean) => void; group: SplitGroupDto; expense?: SplitExpenseDto | null;
}) {
  const qc = useQueryClient();
  const members = useMemo(() => group.members.filter((m) => !m.leftAt), [group.members]);
  const [form, setForm] = useState<ExpenseFormState>(() =>
    expense ? formFromExpense(expense, members) : emptyForm(members, group.baseCurrency, todayLocal()));
  const [serverError, setServerError] = useState<string | null>(null);

  const wasOpen = useRef(open);
  useEffect(() => {
    // Reset only on the closed -> open transition, so a refetch or a new props identity never wipes typing.
    if (open && !wasOpen.current) {
      setForm(expense ? formFromExpense(expense, members) : emptyForm(members, group.baseCurrency, todayLocal()));
      setServerError(null);
    }
    wasOpen.current = open;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally keyed on `open` alone (see above)
  }, [open]);

  const set = <K extends keyof ExpenseFormState>(k: K, v: ExpenseFormState[K]) => { setServerError(null); setForm((f) => ({ ...f, [k]: v })); };
  const setIn = (k: 'payerAmounts' | 'included' | 'values', id: string, v: string | boolean) =>
    { setServerError(null); setForm((f) => ({ ...f, [k]: { ...f[k], [id]: v } })); };

  const check = checkForm(form, members, group.baseCurrency);
  const nameOf = (id: string) => (members.find((m) => m.id === id)?.isMe ? 'You' : members.find((m) => m.id === id)?.displayName ?? '');
  const previewOf = (id: string) => check.preview.find((p) => p.memberId === id)?.amount ?? null;

  const save = useMutation({
    mutationFn: () => {
      const payload = toPayload(form, members, group.baseCurrency);
      return expense ? splitApi.updateExpense(expense.id, payload) : splitApi.createExpense({ groupId: group.id, ...payload });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: SPLIT_KEYS.all });
      toast.success(expense ? 'Expense updated' : 'Expense added');
      onOpenChange(false);
    },
    onError: (err) => setServerError(splitErrorMessage(err, 'Could not save the expense')),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setServerError(null);
    if (check.ok) save.mutate();
  };

  const mode = MODES.find((m) => m.value === form.splitMode)!;
  // Only show an error once the user has started filling the essentials.
  const showCheckError = !check.ok && form.description.trim() !== '' && form.amount.trim() !== '';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90dvh] overflow-y-auto">
        <DialogHeader><DialogTitle>{expense ? 'Edit expense' : 'Add expense'}</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="exp-desc">Description</Label>
            <Input id="exp-desc" value={form.description} onChange={(e) => set('description', e.target.value)} placeholder="Dinner at Thalassa" autoComplete="off" />
          </div>
          <div className="grid grid-cols-[1fr_auto] gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="exp-amount">Amount</Label>
              <Input id="exp-amount" inputMode="decimal" value={form.amount} onChange={(e) => set('amount', e.target.value)} placeholder="0.00" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="exp-ccy">Currency</Label>
              <Select id="exp-ccy" value={form.currency} onChange={(e) => set('currency', e.target.value)} className="w-24">
                {Array.from(new Set([group.baseCurrency, form.currency, ...CURRENCIES])).map((c) => <option key={c} value={c}>{c}</option>)}
              </Select>
            </div>
          </div>
          {form.currency !== group.baseCurrency && (
            <div className="space-y-1.5">
              <Label htmlFor="exp-fx">{`1 ${form.currency} in ${group.baseCurrency}`}</Label>
              <Input id="exp-fx" inputMode="decimal" value={form.fxRate} onChange={(e) => set('fxRate', e.target.value)} placeholder="83.10" />
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="exp-date">Date</Label>
            <Input id="exp-date" type="date" value={form.date} max={todayLocal()} onChange={(e) => set('date', e.target.value)} />
          </div>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Paid by</legend>
            <div className="flex gap-2">
              <Select aria-label="Payer" value={form.payerMode === 'single' ? form.singlePayerId : '__multi'}
                onChange={(e) => {
                  if (e.target.value === '__multi') set('payerMode', 'multiple');
                  else setForm((f) => ({ ...f, payerMode: 'single', singlePayerId: e.target.value }));
                }}>
                {form.payerMode === 'single' && form.singlePayerId && !members.some((m) => m.id === form.singlePayerId) && (
                  <option value={form.singlePayerId}>
                    {`${group.members.find((m) => m.id === form.singlePayerId)?.displayName ?? 'Former member'} (left the group)`}
                  </option>
                )}
                {members.map((m) => <option key={m.id} value={m.id}>{m.isMe ? 'You' : m.displayName}</option>)}
                <option value="__multi">Multiple people</option>
              </Select>
            </div>
            {form.payerMode === 'multiple' && members.map((m) => (
              <div key={m.id} className="flex items-center gap-2">
                <Label htmlFor={`paid-${m.id}`} className="flex-1 text-sm font-normal">{nameOf(m.id)}</Label>
                <Input id={`paid-${m.id}`} aria-label={`Paid by ${nameOf(m.id)}`} inputMode="decimal" className="w-32"
                  value={form.payerAmounts[m.id] ?? ''} onChange={(e) => setIn('payerAmounts', m.id, e.target.value)} />
              </div>
            ))}
          </fieldset>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Split</legend>
            <div role="tablist" className="grid grid-cols-4 gap-1 rounded-md bg-muted p-1">
              {MODES.map((m) => (
                <button key={m.value} type="button" role="tab" aria-selected={form.splitMode === m.value}
                  onClick={() => set('splitMode', m.value)}
                  className={cn('rounded px-2 py-1.5 text-xs font-medium', form.splitMode === m.value ? 'bg-background shadow-sm' : 'text-muted-foreground')}>
                  {m.label}
                </button>
              ))}
            </div>
            <ul className="space-y-1.5">
              {members.map((m) => {
                const label = nameOf(m.id);
                const preview = previewOf(m.id);
                return (
                  <li key={m.id} className="flex items-center gap-2">
                    {form.splitMode === 'EQUAL' ? (
                      <label className="flex flex-1 items-center gap-2 text-sm">
                        <input type="checkbox" checked={!!form.included[m.id]} onChange={(e) => setIn('included', m.id, e.target.checked)} aria-label={`Include ${label}`} />
                        {label}
                      </label>
                    ) : (
                      <>
                        <span className="flex-1 text-sm">{label}</span>
                        <Input aria-label={`${mode.field} for ${label}`} inputMode="decimal" className="w-24"
                          value={form.values[m.id] ?? ''} onChange={(e) => setIn('values', m.id, e.target.value)} />
                      </>
                    )}
                    <span data-testid={`share-${m.id}`} className="w-24 text-right text-sm tabular-nums text-muted-foreground">
                      {preview ? formatSplitMoney(preview, form.currency) : '—'}
                    </span>
                  </li>
                );
              })}
            </ul>
          </fieldset>

          {(showCheckError || serverError) && (
            <p role="alert" className="text-sm text-destructive">{serverError ?? check.error}</p>
          )}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={!check.ok || save.isPending}>Save expense</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
