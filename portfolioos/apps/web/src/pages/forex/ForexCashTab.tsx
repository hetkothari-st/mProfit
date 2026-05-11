import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, Pencil, Trash2, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { formatCurrency, formatINR, Decimal } from '@portfolioos/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { EmptyState } from '@/components/common/EmptyState';
import { forexApi, type ForexBalanceDTO } from '@/api/forex.api';
import { apiErrorMessage } from '@/api/client';
import { SUPPORTED_CCY } from './constants';

const schema = z.object({
  currency: z.string().min(3).max(3),
  balance: z.string().regex(/^-?\d+(\.\d+)?$/, 'Decimal expected'),
  accountLabel: z.string().max(120).optional(),
  accountNumber: z.string().max(64).optional(),
  bankName: z.string().max(160).optional(),
  country: z.string().max(80).optional(),
  notes: z.string().max(2000).optional(),
});
type FormValues = z.infer<typeof schema>;

export function ForexCashTab() {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<ForexBalanceDTO | null>(null);
  const [open, setOpen] = useState(false);

  const balancesQ = useQuery({
    queryKey: ['forex', 'balances'],
    queryFn: () => forexApi.listBalances(),
  });

  const tickerQ = useQuery({
    queryKey: ['forex', 'ticker'],
    queryFn: () => forexApi.ticker(),
    refetchInterval: 30_000,
    staleTime: 0,
  });

  function inrEquiv(currency: string, balance: string): string | null {
    const row = tickerQ.data?.find((r) => r.base === currency && r.quote === 'INR');
    if (!row) return null;
    return new Decimal(balance).times(new Decimal(row.rate)).toFixed(2);
  }

  const totalInr = (balancesQ.data ?? []).reduce((acc, b) => {
    const inr = inrEquiv(b.currency, b.balance);
    return inr ? acc.plus(inr) : acc;
  }, new Decimal(0));

  const createMut = useMutation({
    mutationFn: (v: FormValues) =>
      forexApi.createBalance({
        currency: v.currency.toUpperCase(),
        balance: v.balance,
        accountLabel: v.accountLabel || null,
        accountNumber: v.accountNumber || null,
        bankName: v.bankName || null,
        country: v.country || null,
        notes: v.notes || null,
      }),
    onSuccess: () => {
      toast.success('Balance saved');
      queryClient.invalidateQueries({ queryKey: ['forex', 'balances'] });
      setOpen(false);
      setEditing(null);
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Save failed')),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, v }: { id: string; v: FormValues }) =>
      forexApi.updateBalance(id, {
        currency: v.currency.toUpperCase(),
        balance: v.balance,
        accountLabel: v.accountLabel || null,
        accountNumber: v.accountNumber || null,
        bankName: v.bankName || null,
        country: v.country || null,
        notes: v.notes || null,
      }),
    onSuccess: () => {
      toast.success('Balance updated');
      queryClient.invalidateQueries({ queryKey: ['forex', 'balances'] });
      setOpen(false);
      setEditing(null);
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Update failed')),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => forexApi.deleteBalance(id),
    onSuccess: () => {
      toast.success('Deleted');
      queryClient.invalidateQueries({ queryKey: ['forex', 'balances'] });
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Delete failed')),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-medium text-foreground">Foreign currency balances</h3>
          <p className="text-xs text-muted-foreground">
            Total: {formatINR(totalInr.toFixed(2))} across {balancesQ.data?.length ?? 0} accounts
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => {
            setEditing(null);
            setOpen(true);
          }}
        >
          <Plus className="mr-1 h-3 w-3" /> Add balance
        </Button>
      </div>

      {balancesQ.isLoading ? (
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      ) : !balancesQ.data || balancesQ.data.length === 0 ? (
        <EmptyState
          title="No foreign-currency cash"
          description="Track USD/EUR/GBP balances in Wise, foreign bank, or forex card accounts."
          action={
            <Button
              onClick={() => {
                setEditing(null);
                setOpen(true);
              }}
            >
              <Plus className="mr-1 h-4 w-4" /> Add balance
            </Button>
          }
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-muted/30 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Currency</th>
                  <th className="px-3 py-2">Account</th>
                  <th className="px-3 py-2">Bank</th>
                  <th className="px-3 py-2 text-right">Balance</th>
                  <th className="px-3 py-2 text-right">INR equivalent</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {balancesQ.data.map((b) => {
                  const inr = inrEquiv(b.currency, b.balance);
                  return (
                    <tr key={b.id} className="border-b border-border/50 last:border-0">
                      <td className="px-3 py-2 font-medium">{b.currency}</td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {b.accountLabel ?? '—'}
                        {b.accountLast4 && (
                          <span className="ml-2 font-mono text-xs">·· {b.accountLast4}</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">{b.bankName ?? '—'}</td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums">
                        {formatCurrency(b.balance, b.currency)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums">
                        {inr ? formatINR(inr) : '—'}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2"
                          onClick={() => {
                            setEditing(b);
                            setOpen(true);
                          }}
                        >
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-destructive"
                          onClick={() => {
                            if (confirm(`Delete ${b.currency} ${b.balance}?`)) {
                              deleteMut.mutate(b.id);
                            }
                          }}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      <BalanceDialog
        key={editing?.id ?? 'new'}
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) setEditing(null);
        }}
        editing={editing}
        onSubmit={(v) =>
          editing ? updateMut.mutate({ id: editing.id, v }) : createMut.mutate(v)
        }
        submitting={createMut.isPending || updateMut.isPending}
      />
    </div>
  );
}

interface DialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: ForexBalanceDTO | null;
  onSubmit: (v: FormValues) => void;
  submitting: boolean;
}

function BalanceDialog({ open, onOpenChange, editing, onSubmit, submitting }: DialogProps) {
  // Parent passes `key={editing?.id ?? 'new'}` so this component remounts
  // whenever the edit target changes — `useForm`'s `defaultValues` capture
  // the right values at mount, no reset workaround needed.
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: editing
      ? {
          currency: editing.currency,
          balance: editing.balance,
          accountLabel: editing.accountLabel ?? '',
          bankName: editing.bankName ?? '',
          country: editing.country ?? '',
          notes: editing.notes ?? '',
          accountNumber: '',
        }
      : { currency: 'USD', balance: '0' },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit balance' : 'Add forex balance'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="currency">Currency</Label>
              <select
                id="currency"
                className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                {...register('currency')}
              >
                {SUPPORTED_CCY.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              {errors.currency && (
                <p className="text-xs text-destructive">{errors.currency.message}</p>
              )}
            </div>
            <div>
              <Label htmlFor="balance">Balance</Label>
              <Input id="balance" {...register('balance')} />
              {errors.balance && (
                <p className="text-xs text-destructive">{errors.balance.message}</p>
              )}
            </div>
          </div>
          <div>
            <Label htmlFor="accountLabel">Account label</Label>
            <Input id="accountLabel" placeholder="Wise USD" {...register('accountLabel')} />
          </div>
          <div>
            <Label htmlFor="accountNumber">
              Account number {editing && '(leave blank to keep existing)'}
            </Label>
            <Input
              id="accountNumber"
              type="password"
              autoComplete="off"
              {...register('accountNumber')}
            />
            <p className="mt-1 text-[10px] text-muted-foreground">
              Encrypted at rest; only last 4 digits shown in the table.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="bankName">Bank</Label>
              <Input id="bankName" {...register('bankName')} />
            </div>
            <div>
              <Label htmlFor="country">Country</Label>
              <Input id="country" {...register('country')} />
            </div>
          </div>
          <div>
            <Label htmlFor="notes">Notes</Label>
            <Input id="notes" {...register('notes')} />
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" type="button">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={submitting}>
              {submitting && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
              {editing ? 'Save' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

