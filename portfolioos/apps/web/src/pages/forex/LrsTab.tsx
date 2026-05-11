import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, Trash2, Loader2, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';
import { formatINR, formatCurrency, Decimal } from '@portfolioos/shared';
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
import { forexApi, type LrsRemittanceDTO } from '@/api/forex.api';
import { apiErrorMessage } from '@/api/client';
import { SUPPORTED_CCY, LRS_PURPOSES as PURPOSES } from './constants';

const lrsSchema = z.object({
  remittanceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  currency: z.string().min(3).max(3),
  foreignAmount: z.string().regex(/^-?\d+(\.\d+)?$/),
  fxRate: z.string().regex(/^-?\d+(\.\d+)?$/).optional(),
  purpose: z.enum(PURPOSES),
  bankName: z.string().max(160).optional(),
  remittanceRef: z.string().max(200).optional(),
  tcsDeducted: z.string().regex(/^-?\d+(\.\d+)?$/).optional(),
  notes: z.string().max(2000).optional(),
});
type LrsForm = z.infer<typeof lrsSchema>;

export function LrsTab() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  // limitWarning carries the server's "LRS limit exceeded" message + the last
  // form payload. When set, the dialog renders a banner with "Confirm anyway"
  // which re-submits with forceConfirmed: true.
  const [limitWarning, setLimitWarning] = useState<{ message: string; payload: LrsForm } | null>(null);

  const utilQ = useQuery({
    queryKey: ['forex', 'lrs', 'util'],
    queryFn: () => forexApi.lrsUtilisation(),
    staleTime: 30_000,
  });
  const remittancesQ = useQuery({
    queryKey: ['forex', 'lrs'],
    queryFn: () => forexApi.listLrs(),
  });
  const tcsQ = useQuery({
    queryKey: ['forex', 'tcs'],
    queryFn: () => forexApi.listTcs(),
  });

  const createMut = useMutation({
    mutationFn: (v: LrsForm & { forceConfirmed?: boolean }) =>
      forexApi.createLrs({
        remittanceDate: v.remittanceDate,
        currency: v.currency.toUpperCase(),
        foreignAmount: v.foreignAmount,
        fxRate: v.fxRate || null,
        purpose: v.purpose,
        bankName: v.bankName || null,
        remittanceRef: v.remittanceRef || null,
        tcsDeducted: v.tcsDeducted || null,
        notes: v.notes || null,
        forceConfirmed: v.forceConfirmed,
      }),
    onSuccess: () => {
      toast.success('Remittance recorded');
      queryClient.invalidateQueries({ queryKey: ['forex', 'lrs'] });
      queryClient.invalidateQueries({ queryKey: ['forex', 'lrs', 'util'] });
      setOpen(false);
      setLimitWarning(null);
    },
    onError: (err, vars) => {
      const msg = apiErrorMessage(err);
      // Backend returns "LRS limit exceeded: …" when the projected USD usage
      // would cross 250k. Capture the payload so the user can re-submit with
      // forceConfirmed: true after explicit acknowledgement.
      if (msg.includes('LRS limit exceeded') && !vars.forceConfirmed) {
        setLimitWarning({ message: msg, payload: vars });
      } else {
        toast.error(msg);
      }
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => forexApi.deleteLrs(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['forex', 'lrs'] });
      queryClient.invalidateQueries({ queryKey: ['forex', 'lrs', 'util'] });
      toast.success('Deleted');
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });

  const util = utilQ.data;
  const usagePct = util?.pctUsed ?? 0;
  const overThreshold = util?.warning ?? false;

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-medium text-foreground">LRS utilisation</h3>
              {util && (
                <p className="text-xs text-muted-foreground">
                  FY {util.fy} · ${util.usedUsd} of ${util.limitUsd} used
                </p>
              )}
            </div>
            <Button size="sm" onClick={() => setOpen(true)}>
              <Plus className="mr-1 h-3 w-3" /> Record remittance
            </Button>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={`h-full transition-all ${
                usagePct >= 100
                  ? 'bg-destructive'
                  : overThreshold
                    ? 'bg-amber-500'
                    : 'bg-green-500'
              }`}
              style={{ width: `${Math.min(usagePct, 100)}%` }}
            />
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {usagePct.toFixed(1)}% of annual LRS limit (USD 250,000 per individual / FY)
          </p>
          {overThreshold && (
            <div className="mt-2 flex items-start gap-2 rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-200">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
              <span>Above 80% — verify before further remittances. TCS at 20% applies above ₹7L cumulative this FY.</span>
            </div>
          )}
        </CardContent>
      </Card>

      <div>
        <h3 className="mb-2 text-sm font-medium text-foreground">Remittances</h3>
        {remittancesQ.isLoading ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : !remittancesQ.data || remittancesQ.data.length === 0 ? (
          <EmptyState
            title="No LRS remittances yet"
            description="Outward remittances under the Liberalised Remittance Scheme will appear here for ITR Schedule FA reporting."
            action={
              <Button onClick={() => setOpen(true)}>
                <Plus className="mr-1 h-4 w-4" /> Record remittance
              </Button>
            }
          />
        ) : (
          <Card>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead className="border-b border-border bg-muted/30 text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">Date</th>
                    <th className="px-3 py-2">Purpose</th>
                    <th className="px-3 py-2">Bank</th>
                    <th className="px-3 py-2 text-right">Foreign</th>
                    <th className="px-3 py-2 text-right">INR equiv</th>
                    <th className="px-3 py-2 text-right">TCS</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {remittancesQ.data.map((r: LrsRemittanceDTO) => (
                    <tr key={r.id} className="border-b border-border/50 last:border-0">
                      <td className="px-3 py-2 font-mono text-xs">{r.remittanceDate.slice(0, 10)}</td>
                      <td className="px-3 py-2">{r.purpose}</td>
                      <td className="px-3 py-2 text-muted-foreground">{r.bankName ?? '—'}</td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums">
                        {formatCurrency(r.foreignAmount, r.currency)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums">
                        {formatINR(r.inrEquivalent)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums">
                        {new Decimal(r.tcsDeducted).gt(0) ? formatINR(r.tcsDeducted) : '—'}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-destructive"
                          onClick={() => {
                            if (confirm('Delete remittance?')) deleteMut.mutate(r.id);
                          }}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        )}
      </div>

      {tcsQ.data && tcsQ.data.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-medium text-foreground">TCS credits</h3>
          <Card>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead className="border-b border-border bg-muted/30 text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">FY</th>
                    <th className="px-3 py-2">Collector</th>
                    <th className="px-3 py-2">TAN</th>
                    <th className="px-3 py-2 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {tcsQ.data.map((t) => (
                    <tr key={t.id} className="border-b border-border/50 last:border-0">
                      <td className="px-3 py-2 font-mono text-xs">{t.financialYear}</td>
                      <td className="px-3 py-2 text-muted-foreground">{t.collectorName ?? '—'}</td>
                      <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                        {t.tan ?? '—'}
                      </td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums">
                        {formatINR(t.tcsAmount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </div>
      )}

      <LrsDialog
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) setLimitWarning(null);
        }}
        onSubmit={(v) => createMut.mutate({ ...v, forceConfirmed: false })}
        submitting={createMut.isPending}
        warning={limitWarning}
        onConfirmOverride={() => {
          if (limitWarning) createMut.mutate({ ...limitWarning.payload, forceConfirmed: true });
        }}
        onDismissWarning={() => setLimitWarning(null)}
      />
    </div>
  );
}

function LrsDialog({
  open,
  onOpenChange,
  onSubmit,
  submitting,
  warning,
  onConfirmOverride,
  onDismissWarning,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSubmit: (v: LrsForm) => void;
  submitting: boolean;
  warning: { message: string; payload: LrsForm } | null;
  onConfirmOverride: () => void;
  onDismissWarning: () => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LrsForm>({
    resolver: zodResolver(lrsSchema),
    defaultValues: { remittanceDate: today, currency: 'USD', purpose: 'INVESTMENT' },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record LRS remittance</DialogTitle>
        </DialogHeader>
        {warning && (
          <div className="rounded border border-amber-400 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-200">
            <p className="mb-2 font-medium">LRS limit warning</p>
            <p>{warning.message}</p>
            <div className="mt-2 flex gap-2">
              <Button
                size="sm"
                variant="outline"
                type="button"
                onClick={onDismissWarning}
                disabled={submitting}
              >
                Adjust
              </Button>
              <Button size="sm" type="button" onClick={onConfirmOverride} disabled={submitting}>
                Confirm anyway
              </Button>
            </div>
          </div>
        )}
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="remittanceDate">Date</Label>
              <Input id="remittanceDate" type="date" {...register('remittanceDate')} />
              {errors.remittanceDate && (
                <p className="text-xs text-destructive">{errors.remittanceDate.message}</p>
              )}
            </div>
            <div>
              <Label htmlFor="purpose">Purpose</Label>
              <select
                id="purpose"
                className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                {...register('purpose')}
              >
                {PURPOSES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
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
            </div>
            <div>
              <Label htmlFor="foreignAmount">Amount</Label>
              <Input id="foreignAmount" {...register('foreignAmount')} />
              {errors.foreignAmount && (
                <p className="text-xs text-destructive">{errors.foreignAmount.message}</p>
              )}
            </div>
            <div>
              <Label htmlFor="fxRate">FX rate (optional)</Label>
              <Input id="fxRate" placeholder="auto" {...register('fxRate')} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="bankName">Bank</Label>
              <Input id="bankName" {...register('bankName')} />
            </div>
            <div>
              <Label htmlFor="remittanceRef">Reference</Label>
              <Input id="remittanceRef" {...register('remittanceRef')} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="tcsDeducted">TCS deducted</Label>
              <Input id="tcsDeducted" placeholder="0" {...register('tcsDeducted')} />
            </div>
            <div>
              <Label htmlFor="notes">Notes</Label>
              <Input id="notes" {...register('notes')} />
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" type="button">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={submitting}>
              {submitting && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
              Record
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
