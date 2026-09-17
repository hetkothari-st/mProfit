import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import toast from 'react-hot-toast';
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowLeft,
  ArrowUpRight,
  CalendarClock,
  Check,
  CheckCircle2,
  HandCoins,
  HandHeart,
  Loader2,
  MoreHorizontal,
  Pencil,
  Percent,
  Plus,
  RotateCcw,
  Trash2,
  XCircle,
} from 'lucide-react';
import { Decimal, formatINR } from '@everypaisa/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { DocumentVault } from '@/components/documents/DocumentVault';
import { cn } from '@/lib/cn';
import { apiErrorMessage } from '@/api/client';
import {
  LOANS_GIVEN_KEYS,
  loansGivenApi,
  type LoanGivenDTO,
  type LoanGivenEntryKind,
} from '@/api/loansGiven.api';
import { LoanGivenFormDialog } from './LoanGivenFormDialog';
import { EmiScheduleCard } from './EmiScheduleCard';
import { ENTRY_KIND_LABELS, formatDay, relationshipLabel } from './loanGivenFormat';
import { LoanGivenStatusBadge } from './LoanGivenStatusBadge';

const today = () => new Date().toISOString().slice(0, 10);

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return (first + last).toUpperCase();
}

function AddEntryDialog({
  loan,
  open,
  onOpenChange,
}: {
  loan: LoanGivenDTO;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const hasInterest = new Decimal(loan.interestRate).greaterThan(0);
  const [kind, setKind] = useState<LoanGivenEntryKind>('REPAYMENT');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(today());
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () =>
      loansGivenApi.addEntry(loan.id, {
        kind,
        amount: amount.replace(/[,\s₹]/g, ''),
        date,
        notes: notes.trim() || null,
      }),
    onSuccess: () => {
      for (const key of LOANS_GIVEN_KEYS) void qc.invalidateQueries({ queryKey: [...key] });
      toast.success('Entry added');
      setAmount('');
      setNotes('');
      onOpenChange(false);
    },
    onError: (err) => setError(apiErrorMessage(err, 'Could not add the entry')),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const clean = amount.replace(/[,\s₹]/g, '');
    if (!/^\d+(\.\d+)?$/.test(clean) || new Decimal(clean).lessThanOrEqualTo(0)) {
      setError('Enter an amount greater than 0');
      return;
    }
    save.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !save.isPending && onOpenChange(o)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{loan.repaymentMode === 'EMI' ? 'Add entry' : 'Record payment'}</DialogTitle>
          {loan.repaymentMode === 'EMI' && (
            <DialogDescription>
              For a lump sum, extra money lent or interest. Regular EMIs are quicker from the
              schedule.
            </DialogDescription>
          )}
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <Label htmlFor="lge-kind">What happened?</Label>
            <Select
              id="lge-kind"
              className="mt-1"
              value={kind}
              onChange={(e) => setKind(e.target.value as LoanGivenEntryKind)}
            >
              <option value="REPAYMENT">
                {loan.repaymentMode === 'EMI' ? 'Lump-sum repayment' : 'Repayment received'}
              </option>
              {hasInterest && <option value="INTEREST_RECEIVED">Interest received</option>}
              <option value="ADDITIONAL_LENT">Lent more money</option>
              <option value="WAIVER">Forgave part of it</option>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="lge-amount">Amount (₹)</Label>
              <Input
                id="lge-amount"
                className="mt-1"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="lge-date">Date</Label>
              <Input
                id="lge-date"
                className="mt-1"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
          </div>
          <div>
            <Label htmlFor="lge-notes">Note (optional)</Label>
            <Input
              id="lge-notes"
              className="mt-1"
              placeholder="e.g. UPI, cash"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
          {error && (
            <p role="alert" className="text-sm text-negative">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={save.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Add
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function HeroStat({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: 'warn' | 'good';
}) {
  return (
    <div className="min-w-0">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div
        className={cn(
          'mt-1 truncate text-lg font-semibold tabular-nums',
          tone === 'warn' && 'text-negative',
          tone === 'good' && 'text-positive',
        )}
      >
        {value}
      </div>
      {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

const ENTRY_ICON: Record<LoanGivenEntryKind, { icon: typeof ArrowDownLeft; className: string }> = {
  REPAYMENT: { icon: ArrowDownLeft, className: 'bg-positive/12 text-positive' },
  INTEREST_RECEIVED: { icon: Percent, className: 'bg-positive/12 text-positive' },
  ADDITIONAL_LENT: { icon: ArrowUpRight, className: 'bg-accent/15 text-accent-ink' },
  WAIVER: { icon: HandHeart, className: 'bg-muted text-muted-foreground' },
};

function TermRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right tabular-nums">{children}</dd>
    </div>
  );
}

type CloseAction = 'settle' | 'writeOff' | 'delete' | null;

export function LoanGivenDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const [entryOpen, setEntryOpen] = useState(false);
  const [action, setAction] = useState<CloseAction>(null);
  const [actionDate, setActionDate] = useState(today());

  const {
    data: loan,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['loans-given', id],
    queryFn: () => loansGivenApi.get(id!),
    enabled: Boolean(id),
  });

  const refresh = () => {
    for (const key of LOANS_GIVEN_KEYS) void qc.invalidateQueries({ queryKey: [...key] });
  };

  const mutate = useMutation({
    mutationFn: async (kind: 'settle' | 'writeOff' | 'reopen' | 'delete' | { entryId: string }) => {
      if (typeof kind === 'object') return loansGivenApi.removeEntry(kind.entryId);
      if (kind === 'settle') return loansGivenApi.settle(id!, actionDate);
      if (kind === 'writeOff') return loansGivenApi.writeOff(id!, actionDate);
      if (kind === 'reopen') return loansGivenApi.reopen(id!);
      await loansGivenApi.remove(id!);
      return null;
    },
    onSuccess: (_res, kind) => {
      refresh();
      setAction(null);
      if (kind === 'delete') {
        toast.success('Loan deleted');
        navigate('/loans?view=given', { replace: true });
      } else if (typeof kind === 'object') {
        toast.success('Entry removed');
      } else {
        toast.success(
          kind === 'settle' ? 'Marked settled' : kind === 'writeOff' ? 'Written off' : 'Reopened',
        );
      }
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Something went wrong')),
  });

  const payNext = useMutation({
    mutationFn: (no: number) => loansGivenApi.setInstallment(id!, no, { action: 'PAID' }),
    onSuccess: (updated, no) => {
      qc.setQueryData(['loans-given', id], updated);
      refresh();
      toast.success(`EMI ${no} marked paid`);
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Could not update the EMI')),
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (isError || !loan) {
    return (
      <div className="py-16 text-center">
        <p className="text-sm text-muted-foreground">This loan could not be found.</p>
        <Button asChild variant="outline" className="mt-4">
          <Link to="/loans?view=given">Back to loans given</Link>
        </Button>
      </div>
    );
  }

  const { summary, schedule } = loan;
  const active = loan.status === 'ACTIVE';
  const isEmi = loan.repaymentMode === 'EMI';
  const rate = new Decimal(loan.interestRate);
  const lent = new Decimal(summary.principalLent);
  const expected = summary.emi ? new Decimal(summary.emi.expectedTotal) : lent;
  const received = new Decimal(summary.totalReceived).plus(summary.waived);
  const pct = expected.isZero()
    ? 0
    : Math.min(received.dividedBy(expected).times(100).toNumber(), 100);
  const openRow = schedule?.find((r) => r.status !== 'PAID' && r.status !== 'WAIVED') ?? null;
  const overdue = Boolean(active && summary.overdueDays > 0 && summary.nextDue);
  const overdueRows = schedule?.filter((r) => r.overdue).length ?? 0;

  const menuItem =
    'flex cursor-pointer select-none items-center gap-2 rounded-md px-2.5 py-1.5 text-sm outline-none data-[highlighted]:bg-muted';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <Link
          to="/loans?view=given"
          className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-card/60 px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back to loans
        </Link>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3.5">
            <div
              aria-hidden
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500/80 to-teal-700/80 font-display text-lg text-white shadow-md"
            >
              {initials(loan.borrowerName) || <HandCoins className="h-5 w-5" />}
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="truncate font-display text-[26px] leading-tight">
                  {loan.borrowerName}
                </h1>
                <LoanGivenStatusBadge status={loan.status} />
              </div>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {[
                  relationshipLabel(loan.relationship),
                  loan.borrowerContact,
                  isEmi ? 'Monthly EMI' : 'Flexible repayment',
                  rate.greaterThan(0) ? `${rate.toString()}% p.a.` : 'Interest-free',
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {active && (
              <Button variant={isEmi ? 'outline' : 'default'} onClick={() => setEntryOpen(true)}>
                <Plus className="h-4 w-4" /> {isEmi ? 'Add entry' : 'Record payment'}
              </Button>
            )}
            <Button variant="outline" onClick={() => setEditOpen(true)}>
              <Pencil className="h-4 w-4" /> Edit
            </Button>
            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                <Button variant="outline" size="icon" aria-label="More actions">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content
                  align="end"
                  sideOffset={6}
                  className="z-50 min-w-[12rem] rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-elev-lg"
                >
                  {active ? (
                    <>
                      <DropdownMenu.Item
                        className={menuItem}
                        onSelect={() => {
                          setActionDate(today());
                          setAction('settle');
                        }}
                      >
                        <CheckCircle2 className="h-4 w-4" /> Mark settled
                      </DropdownMenu.Item>
                      <DropdownMenu.Item
                        className={menuItem}
                        onSelect={() => {
                          setActionDate(today());
                          setAction('writeOff');
                        }}
                      >
                        <XCircle className="h-4 w-4" /> Write off
                      </DropdownMenu.Item>
                    </>
                  ) : (
                    <DropdownMenu.Item className={menuItem} onSelect={() => mutate.mutate('reopen')}>
                      <RotateCcw className="h-4 w-4" /> Reopen
                    </DropdownMenu.Item>
                  )}
                  <DropdownMenu.Separator className="my-1 h-px bg-border" />
                  <DropdownMenu.Item
                    className={cn(menuItem, 'text-negative')}
                    onSelect={() => setAction('delete')}
                  >
                    <Trash2 className="h-4 w-4" /> Delete loan
                  </DropdownMenu.Item>
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
          </div>
        </div>
      </div>

      {/* Overdue */}
      {overdue && summary.nextDue && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-negative/35 bg-negative/[0.07] px-4 py-3"
        >
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-negative/15">
              <AlertTriangle className="h-4 w-4 text-negative" />
            </div>
            <div className="text-sm">
              <div className="font-medium text-foreground">
                {formatINR(summary.nextDue.amount)} overdue by {summary.overdueDays} day
                {summary.overdueDays === 1 ? '' : 's'}
              </div>
              <div className="text-muted-foreground">
                {isEmi && openRow ? `EMI ${openRow.no} was due` : 'Was due'}{' '}
                {formatDay(summary.nextDue.date)}
                {overdueRows > 1 && ` · ${overdueRows} EMIs behind`}
              </div>
            </div>
          </div>
          {isEmi && openRow && (
            <Button
              size="sm"
              disabled={payNext.isPending}
              onClick={() => payNext.mutate(openRow.no)}
            >
              {payNext.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Check className="h-4 w-4" />
              )}
              Mark EMI {openRow.no} paid
            </Button>
          )}
        </div>
      )}

      {/* Summary */}
      <Card className="overflow-hidden">
        <div className="flex flex-col md:flex-row">
          <div className="relative overflow-hidden bg-gradient-to-br from-emerald-600 via-teal-700 to-slate-800 p-6 text-white md:w-[40%]">
            <HandCoins
              aria-hidden
              strokeWidth={1.1}
              className="pointer-events-none absolute -bottom-6 -right-6 h-36 w-36 text-white/[0.08]"
            />
            <div className="relative">
              <div className="text-sm text-white/75">{active ? 'Still owed to you' : 'Lent'}</div>
              <div className="mt-1 font-display text-[40px] leading-none tabular-nums">
                {formatINR(active ? summary.outstandingPrincipal : summary.principalLent)}
              </div>
              <div className="mt-2 text-sm text-white/75">
                of {formatINR(summary.principalLent)} lent on {formatDay(loan.lentOn)}
              </div>

              <div className="mt-6">
                <div className="h-2 overflow-hidden rounded-full bg-white/20">
                  <div
                    className="h-full rounded-full bg-white transition-[width] duration-500"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <div className="mt-2 flex justify-between text-xs text-white/80">
                  <span>
                    {summary.emi
                      ? `${summary.emi.installmentsPaid} of ${summary.emi.installmentsTotal} EMIs`
                      : `${formatINR(received.toString())} back`}
                  </span>
                  <span className="tabular-nums">{Math.round(pct)}%</span>
                </div>
              </div>
            </div>
          </div>

          <CardContent className="grid flex-1 grid-cols-2 content-center gap-x-6 gap-y-5 p-6">
            <HeroStat
              label={active ? 'Next payment' : 'Closed on'}
              value={
                active
                  ? summary.nextDue
                    ? formatINR(summary.nextDue.amount)
                    : '—'
                  : formatDay(loan.closedOn)
              }
              sub={
                active && summary.nextDue
                  ? `${overdue ? 'was due' : 'due'} ${formatDay(summary.nextDue.date)}`
                  : undefined
              }
              tone={overdue ? 'warn' : undefined}
            />
            <HeroStat label="Received so far" value={formatINR(summary.totalReceived)} tone="good" />
            {summary.emi ? (
              <HeroStat
                label="Left to receive"
                value={formatINR(summary.emi.remainingToReceive)}
                sub={rate.greaterThan(0) ? 'incl. interest' : undefined}
              />
            ) : summary.interestAccrued !== null ? (
              <HeroStat
                label="Interest due"
                value={formatINR(summary.interestDue ?? '0')}
                sub={`${formatINR(summary.interestAccrued)} earned to date`}
              />
            ) : (
              <HeroStat
                label="Expected back by"
                value={loan.dueDate ? formatDay(loan.dueDate) : 'No date set'}
              />
            )}
            {new Decimal(summary.waived).greaterThan(0) ? (
              <HeroStat label="Forgiven" value={formatINR(summary.waived)} />
            ) : summary.emi ? (
              <HeroStat
                label="EMI"
                value={formatINR(loan.emiAmount ?? '0')}
                sub={`${loan.tenureMonths} months`}
              />
            ) : (
              <HeroStat label="Interest received" value={formatINR(summary.interestReceived)} />
            )}
          </CardContent>
        </div>
      </Card>

      {schedule && schedule.length > 0 && <EmiScheduleCard loan={loan} />}

      <div className="grid gap-6 lg:grid-cols-5">
        {/* History */}
        <Card className="lg:col-span-3">
          <CardContent className="p-0">
            <div className="border-b border-border/60 px-5 py-4">
              <h2 className="font-display text-lg">History</h2>
              <p className="text-xs text-muted-foreground">
                Every payment, top-up and write-off, newest first
              </p>
            </div>
            <ol className="px-5 py-3">
              {loan.entries.map((e) => {
                const meta = ENTRY_ICON[e.kind];
                const Icon = meta.icon;
                return (
                  <li key={e.id} className="group flex items-center gap-3 py-2.5 text-sm">
                    <div
                      className={cn(
                        'flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
                        meta.className,
                      )}
                    >
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5 font-medium">
                        {ENTRY_KIND_LABELS[e.kind]}
                        {e.installmentNo && (
                          <span className="rounded-full bg-muted px-1.5 py-px text-[11px] font-normal text-muted-foreground">
                            EMI {e.installmentNo}
                          </span>
                        )}
                      </div>
                      <div className="truncate text-xs text-muted-foreground">
                        {formatDay(e.date)}
                        {e.notes ? ` · ${e.notes}` : ''}
                      </div>
                    </div>
                    <span
                      className={cn(
                        'tabular-nums font-medium',
                        e.kind === 'REPAYMENT' || e.kind === 'INTEREST_RECEIVED'
                          ? 'text-positive'
                          : e.kind === 'WAIVER'
                            ? 'text-muted-foreground'
                            : '',
                      )}
                    >
                      {e.kind === 'ADDITIONAL_LENT' ? '+' : '−'}
                      {formatINR(e.amount)}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100"
                      aria-label="Remove entry"
                      disabled={mutate.isPending}
                      onClick={() => mutate.mutate({ entryId: e.id })}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </li>
                );
              })}
              <li className="flex items-center gap-3 py-2.5 text-sm">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent-ink">
                  <HandCoins className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-medium">Lent</div>
                  <div className="text-xs text-muted-foreground">{formatDay(loan.lentOn)}</div>
                </div>
                <span className="tabular-nums font-medium">+{formatINR(loan.principalAmount)}</span>
                <span className="w-7" />
              </li>
            </ol>
          </CardContent>
        </Card>

        {/* Terms + notes */}
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardContent className="p-5">
              <h2 className="font-display text-lg">Terms</h2>
              <dl className="mt-2 divide-y divide-border/50">
                <TermRow label="Amount lent">{formatINR(loan.principalAmount)}</TermRow>
                <TermRow label="Lent on">{formatDay(loan.lentOn)}</TermRow>
                <TermRow label="Interest">
                  {rate.greaterThan(0) ? `${rate.toString()}% a year` : 'None'}
                </TermRow>
                {isEmi ? (
                  <>
                    <TermRow label="EMI">
                      {formatINR(loan.emiAmount ?? '0')} × {loan.tenureMonths}
                    </TermRow>
                    <TermRow label="First EMI">{formatDay(loan.firstEmiDate)}</TermRow>
                    {schedule && schedule.length > 0 && (
                      <TermRow label="Last EMI">
                        {formatDay(schedule[schedule.length - 1]!.dueDate)}
                      </TermRow>
                    )}
                  </>
                ) : (
                  <TermRow label="Expected back by">
                    <span className="inline-flex items-center gap-1.5">
                      <CalendarClock className="h-3.5 w-3.5 text-muted-foreground" />
                      {loan.dueDate ? formatDay(loan.dueDate) : 'Not set'}
                    </span>
                  </TermRow>
                )}
                {loan.borrowerContact && <TermRow label="Contact">{loan.borrowerContact}</TermRow>}
              </dl>
            </CardContent>
          </Card>

          {loan.notes && (
            <Card>
              <CardContent className="p-5">
                <h2 className="font-display text-lg">Notes</h2>
                <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
                  {loan.notes}
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <DocumentVault ownerType="LOAN_GIVEN" ownerId={loan.id} title="Proof & documents" />

      <AddEntryDialog loan={loan} open={entryOpen} onOpenChange={setEntryOpen} />
      <LoanGivenFormDialog open={editOpen} onOpenChange={setEditOpen} initial={loan} />

      <Dialog
        open={action !== null}
        onOpenChange={(o) => !o && !mutate.isPending && setAction(null)}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {action === 'settle'
                ? 'Mark as settled?'
                : action === 'writeOff'
                  ? 'Write off this loan?'
                  : 'Delete this loan?'}
            </DialogTitle>
            <DialogDescription>
              {action === 'settle'
                ? 'Closes the loan. Record any final repayment first so the history is complete.'
                : action === 'writeOff'
                  ? `Forgives the ${formatINR(summary.outstandingPrincipal)} still owed and closes the loan. You can reopen it later.`
                  : 'Deletes the loan and its whole history. This cannot be undone.'}
            </DialogDescription>
          </DialogHeader>
          {action !== 'delete' && (
            <div>
              <Label htmlFor="lg-action-date">Date</Label>
              <Input
                id="lg-action-date"
                className="mt-1"
                type="date"
                value={actionDate}
                onChange={(e) => setActionDate(e.target.value)}
              />
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setAction(null)} disabled={mutate.isPending}>
              Cancel
            </Button>
            <Button
              variant={action === 'settle' ? 'default' : 'destructive'}
              disabled={mutate.isPending}
              onClick={() => action && mutate.mutate(action)}
            >
              {mutate.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {action === 'settle'
                ? 'Mark settled'
                : action === 'writeOff'
                  ? 'Write off'
                  : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
