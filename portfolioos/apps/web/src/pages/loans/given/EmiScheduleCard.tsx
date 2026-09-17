import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import toast from 'react-hot-toast';
import { Check, HandHeart, Loader2, MoreHorizontal, PieChart, RotateCcw } from 'lucide-react';
import { Decimal, formatINR } from '@everypaisa/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/cn';
import { apiErrorMessage } from '@/api/client';
import {
  LOANS_GIVEN_KEYS,
  loansGivenApi,
  type InstallmentAction,
  type InstallmentRow,
  type LoanGivenDTO,
} from '@/api/loansGiven.api';
import { InstallmentStatusChip } from './InstallmentStatusChip';
import { formatDay } from './loanGivenFormat';

const todayIso = () => new Date().toISOString().slice(0, 10);
/** Long schedules start folded to the instalments that matter now. */
const FOLD_AFTER = 12;

function PartialDialog({
  row,
  pending,
  onClose,
  onSave,
}: {
  row: InstallmentRow | null;
  pending: boolean;
  onClose: () => void;
  onSave: (amount: string, date: string) => void;
}) {
  // Remounted per row (keyed by the caller), so initial state is per instalment.
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(() =>
    row && row.dueDate < todayIso() ? row.dueDate : todayIso(),
  );
  const [error, setError] = useState<string | null>(null);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const clean = amount.replace(/[,\s₹]/g, '');
    if (!/^\d+(\.\d+)?$/.test(clean) || new Decimal(clean).lessThanOrEqualTo(0)) {
      setError('Enter the amount received');
      return;
    }
    onSave(clean, date);
  };

  return (
    <Dialog open={row !== null} onOpenChange={(o) => !o && !pending && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Part payment · EMI {row?.no}</DialogTitle>
          <DialogDescription>
            {row &&
              `${formatINR(row.amount)} was due ${formatDay(row.dueDate)}. Anything above the EMI counts toward the next ones.`}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="emi-partial-amount">Received (₹)</Label>
              <Input
                id="emi-partial-amount"
                className="mt-1"
                inputMode="decimal"
                autoFocus
                placeholder="e.g. 5000"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="emi-partial-date">On</Label>
              <Input
                id="emi-partial-date"
                className="mt-1"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
          </div>
          {error && (
            <p role="alert" className="text-sm text-negative">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="h-4 w-4 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RowActions({
  row,
  editable,
  quiet,
  busy,
  onAction,
  onPartial,
}: {
  row: InstallmentRow;
  editable: boolean;
  /** Later instalments: actions appear on hover so the table stays calm. */
  quiet?: boolean;
  busy: boolean;
  onAction: (action: InstallmentAction) => void;
  onPartial: () => void;
}) {
  if (!editable) return null;
  const settled = row.status === 'PAID' || row.status === 'WAIVED';
  const menuItem =
    'flex cursor-pointer select-none items-center gap-2 rounded-md px-2.5 py-1.5 text-sm outline-none data-[highlighted]:bg-muted';

  return (
    <div
      className={cn(
        'flex items-center justify-end gap-1.5 transition-opacity',
        quiet && 'md:opacity-0 md:group-hover:opacity-100 md:focus-within:opacity-100',
      )}
    >
      {settled ? (
        row.marked ? (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2.5 text-xs text-muted-foreground"
            disabled={busy}
            onClick={() => onAction('PENDING')}
          >
            <RotateCcw className="h-3.5 w-3.5" /> Undo
          </Button>
        ) : (
          <span
            className="text-xs text-muted-foreground"
            title="Covered by a repayment logged in History"
          >
            From history
          </span>
        )
      ) : (
        <>
          <Button
            size="sm"
            variant="outline"
            className="h-7 px-2.5 text-xs hover:border-positive/60 hover:text-positive"
            disabled={busy}
            onClick={() => onAction('PAID')}
          >
            <Check className="h-3.5 w-3.5" /> Paid
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 px-2.5 text-xs"
            disabled={busy}
            onClick={onPartial}
          >
            <PieChart className="h-3.5 w-3.5" /> Partial
          </Button>
        </>
      )}
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            aria-label={`More options for EMI ${row.no}`}
            disabled={busy}
          >
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            align="end"
            sideOffset={4}
            className="z-50 min-w-[11rem] rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-elev-lg"
          >
            {settled && (
              <DropdownMenu.Item className={menuItem} onSelect={onPartial}>
                <PieChart className="h-4 w-4" /> Change amount
              </DropdownMenu.Item>
            )}
            {row.status !== 'WAIVED' && (
              <DropdownMenu.Item className={menuItem} onSelect={() => onAction('WAIVED')}>
                <HandHeart className="h-4 w-4" /> Forgive this EMI
              </DropdownMenu.Item>
            )}
            {row.marked && (
              <DropdownMenu.Item className={menuItem} onSelect={() => onAction('PENDING')}>
                <RotateCcw className="h-4 w-4" /> Mark pending
              </DropdownMenu.Item>
            )}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </div>
  );
}

function Received({ row }: { row: InstallmentRow }) {
  const paid = new Decimal(row.paid);
  const waived = new Decimal(row.waived);
  if (paid.isZero() && waived.isZero()) return <span className="text-muted-foreground">—</span>;
  return (
    <div className="leading-tight">
      {paid.greaterThan(0) && <div className="tabular-nums">{formatINR(row.paid)}</div>}
      {waived.greaterThan(0) && (
        <div className="text-xs text-muted-foreground tabular-nums">
          {formatINR(row.waived)} forgiven
        </div>
      )}
      {row.status === 'PARTIAL' && (
        <div className="text-xs text-warning tabular-nums">{formatINR(row.remaining)} left</div>
      )}
    </div>
  );
}

/** Month-by-month EMI schedule with one-click status per instalment. */
export function EmiScheduleCard({ loan }: { loan: LoanGivenDTO }) {
  const qc = useQueryClient();
  const schedule = loan.schedule ?? [];
  const editable = loan.status === 'ACTIVE';
  const hasInterest = schedule.some((r) => r.interest !== null);
  const [partialRow, setPartialRow] = useState<InstallmentRow | null>(null);
  const [busyRow, setBusyRow] = useState<number | null>(null);
  const [showAll, setShowAll] = useState(false);

  const mutation = useMutation({
    mutationFn: (v: { no: number; action: InstallmentAction; amount?: string; date?: string }) =>
      loansGivenApi.setInstallment(loan.id, v.no, {
        action: v.action,
        amount: v.amount,
        date: v.date,
      }),
    onMutate: (v) => setBusyRow(v.no),
    onSuccess: (updated, v) => {
      qc.setQueryData(['loans-given', loan.id], updated);
      for (const key of LOANS_GIVEN_KEYS) void qc.invalidateQueries({ queryKey: [...key] });
      setPartialRow(null);
      toast.success(
        v.action === 'PAID'
          ? `EMI ${v.no} marked paid`
          : v.action === 'PARTIAL'
            ? `EMI ${v.no} updated`
            : v.action === 'WAIVED'
              ? `EMI ${v.no} forgiven`
              : `EMI ${v.no} marked pending`,
      );
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Could not update the EMI')),
    onSettled: () => setBusyRow(null),
  });

  const act = (row: InstallmentRow, action: InstallmentAction) =>
    mutation.mutate({ no: row.no, action });

  const counts = {
    done: schedule.filter((r) => r.status === 'PAID' || r.status === 'WAIVED').length,
    partial: schedule.filter((r) => r.status === 'PARTIAL').length,
    overdue: schedule.filter((r) => r.overdue).length,
  };

  const firstOpen = schedule.findIndex((r) => r.status !== 'PAID' && r.status !== 'WAIVED');
  const foldAt = Math.max(firstOpen === -1 ? schedule.length : firstOpen + 4, 6);
  const folded = !showAll && schedule.length > FOLD_AFTER && foldAt < schedule.length;
  const visible = folded ? schedule.slice(0, foldAt) : schedule;

  const rowTone = (r: InstallmentRow) =>
    r.status === 'PAID' || r.status === 'WAIVED'
      ? 'text-muted-foreground'
      : r.overdue
        ? 'bg-negative/[0.04]'
        : r.status === 'DUE'
          ? 'bg-warning/[0.05]'
          : '';

  return (
    <Card>
      <CardContent className="p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 px-5 py-4">
          <div>
            <h2 className="font-display text-lg">Repayment schedule</h2>
            <p className="text-xs text-muted-foreground">
              {formatINR(schedule[0]?.amount ?? '0')} every month · {schedule.length} EMIs from{' '}
              {formatDay(schedule[0]?.dueDate)}
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5 text-xs">
            <span className="rounded-full bg-positive/12 px-2.5 py-1 font-medium text-positive">
              {counts.done} of {schedule.length} done
            </span>
            {counts.partial > 0 && (
              <span className="rounded-full bg-warning/15 px-2.5 py-1 font-medium text-warning">
                {counts.partial} partial
              </span>
            )}
            {counts.overdue > 0 && (
              <span className="rounded-full bg-negative/12 px-2.5 py-1 font-medium text-negative">
                {counts.overdue} overdue
              </span>
            )}
          </div>
        </div>

        {/* Desktop table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-5 py-2.5 font-medium w-12">#</th>
                <th className="px-3 py-2.5 font-medium">Due</th>
                <th className="px-3 py-2.5 font-medium text-right">EMI</th>
                {hasInterest && (
                  <>
                    <th className="px-3 py-2.5 font-medium text-right">Interest</th>
                    <th className="px-3 py-2.5 font-medium text-right">Principal</th>
                  </>
                )}
                <th className="px-3 py-2.5 font-medium text-right">Received</th>
                <th className="px-3 py-2.5 font-medium">Status</th>
                <th className="px-5 py-2.5 font-medium text-right">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {visible.map((r) => (
                <tr key={r.no} className={cn('group transition-colors hover:bg-muted/30', rowTone(r))}>
                  <td className="px-5 py-3 tabular-nums text-muted-foreground">{r.no}</td>
                  <td className="px-3 py-3 whitespace-nowrap">
                    <div className="text-foreground">{formatDay(r.dueDate)}</div>
                    {r.lastPaidOn && r.lastPaidOn !== r.dueDate && (
                      <div className="text-xs text-muted-foreground">
                        paid {formatDay(r.lastPaidOn)}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-foreground">
                    {formatINR(r.amount)}
                  </td>
                  {hasInterest && (
                    <>
                      <td className="px-3 py-3 text-right tabular-nums">
                        {formatINR(r.interest ?? '0')}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums">
                        {formatINR(r.principal ?? '0')}
                      </td>
                    </>
                  )}
                  <td className="px-3 py-3 text-right text-foreground">
                    <Received row={r} />
                  </td>
                  <td className="px-3 py-3">
                    <InstallmentStatusChip row={r} />
                  </td>
                  <td className="px-5 py-2">
                    {busyRow === r.no ? (
                      <div className="flex justify-end">
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                      </div>
                    ) : (
                      <RowActions
                        row={r}
                        editable={editable}
                        quiet={r.status === 'UPCOMING' && r.no - 1 !== firstOpen}
                        busy={mutation.isPending}
                        onAction={(a) => act(r, a)}
                        onPartial={() => setPartialRow(r)}
                      />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile list */}
        <ul className="md:hidden divide-y divide-border/50">
          {visible.map((r) => (
            <li key={r.no} className={cn('px-4 py-3', rowTone(r))}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-sm text-foreground">
                    <span className="text-muted-foreground tabular-nums">#{r.no}</span>
                    <span>{formatDay(r.dueDate)}</span>
                  </div>
                  <div className="mt-0.5 text-sm tabular-nums text-foreground">
                    {formatINR(r.amount)}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1 text-right text-sm">
                  <InstallmentStatusChip row={r} />
                  {r.status !== 'OVERDUE' && r.status !== 'DUE' && r.status !== 'UPCOMING' && (
                    <Received row={r} />
                  )}
                </div>
              </div>
              {editable && (
                <div className="mt-2">
                  {busyRow === r.no ? (
                    <Loader2 className="ml-auto h-4 w-4 animate-spin text-muted-foreground" />
                  ) : (
                    <RowActions
                      row={r}
                      editable={editable}
                      busy={mutation.isPending}
                      onAction={(a) => act(r, a)}
                      onPartial={() => setPartialRow(r)}
                    />
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>

        {schedule.length > FOLD_AFTER && foldAt < schedule.length && (
          <div className="border-t border-border/60 px-5 py-2.5 text-center">
            <Button variant="ghost" size="sm" onClick={() => setShowAll((v) => !v)}>
              {showAll ? 'Show fewer' : `Show all ${schedule.length} EMIs`}
            </Button>
          </div>
        )}
      </CardContent>

      <PartialDialog
        key={partialRow?.no ?? 'closed'}
        row={partialRow}
        pending={mutation.isPending}
        onClose={() => setPartialRow(null)}
        onSave={(amount, date) =>
          partialRow && mutation.mutate({ no: partialRow.no, action: 'PARTIAL', amount, date })
        }
      />
    </Card>
  );
}
