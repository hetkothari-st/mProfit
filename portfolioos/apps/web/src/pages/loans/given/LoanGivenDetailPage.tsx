import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { AlertTriangle, ArrowLeft, Loader2, Pencil, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { Decimal, formatINR } from '@everypaisa/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { apiErrorMessage } from '@/api/client';
import {
  LOANS_GIVEN_KEYS,
  loansGivenApi,
  type LoanGivenDTO,
  type LoanGivenEntryKind,
} from '@/api/loansGiven.api';
import { LoanGivenFormDialog } from './LoanGivenFormDialog';
import { ENTRY_KIND_LABELS, formatDay, relationshipLabel } from './loanGivenFormat';
import { LoanGivenStatusBadge } from './LoanGivenStatusBadge';

const today = () => new Date().toISOString().slice(0, 10);

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'warn' | 'good' }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div
        className={`mt-0.5 text-lg font-semibold tabular-nums ${tone === 'warn' ? 'text-negative' : tone === 'good' ? 'text-positive' : ''}`}
      >
        {value}
      </div>
    </div>
  );
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
          <DialogTitle>Add entry</DialogTitle>
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
                {loan.repaymentMode === 'EMI' ? 'EMI / repayment received' : 'Repayment received'}
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

  const { summary } = loan;
  const active = loan.status === 'ACTIVE';

  return (
    <div className="space-y-6">
      <div>
        <Link
          to="/loans?view=given"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Loans given
        </Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-semibold">{loan.borrowerName}</h1>
              <LoanGivenStatusBadge status={loan.status} />
            </div>
            <p className="text-sm text-muted-foreground">
              {[
                relationshipLabel(loan.relationship),
                loan.borrowerContact,
                `Lent ${formatDay(loan.lentOn)}`,
                loan.repaymentMode === 'EMI' ? 'Monthly EMI' : 'Flexible repayment',
                new Decimal(loan.interestRate).greaterThan(0)
                  ? `${new Decimal(loan.interestRate).toString()}% p.a. simple`
                  : 'Interest-free',
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {active && (
              <Button onClick={() => setEntryOpen(true)}>
                <Plus className="h-4 w-4" /> Add entry
              </Button>
            )}
            <Button variant="outline" onClick={() => setEditOpen(true)}>
              <Pencil className="h-4 w-4" /> Edit
            </Button>
            {active ? (
              <>
                <Button
                  variant="outline"
                  onClick={() => {
                    setActionDate(today());
                    setAction('settle');
                  }}
                >
                  Mark settled
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setActionDate(today());
                    setAction('writeOff');
                  }}
                >
                  Write off
                </Button>
              </>
            ) : (
              <Button
                variant="outline"
                disabled={mutate.isPending}
                onClick={() => mutate.mutate('reopen')}
              >
                <RotateCcw className="h-4 w-4" /> Reopen
              </Button>
            )}
            <Button variant="ghost" onClick={() => setAction('delete')} aria-label="Delete loan">
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {active && summary.overdueDays > 0 && summary.nextDue && (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-lg border border-negative/40 bg-negative/10 p-3 text-sm"
        >
          <AlertTriangle className="h-4 w-4 text-negative" />
          {formatINR(summary.nextDue.amount)} was due on {formatDay(summary.nextDue.date)} — overdue
          by {summary.overdueDays} day{summary.overdueDays === 1 ? '' : 's'}.
        </div>
      )}

      <Card>
        <CardContent className="p-5 grid grid-cols-2 md:grid-cols-4 gap-4">
          <Stat
            label="Still owed"
            value={formatINR(summary.outstandingPrincipal)}
            tone={summary.overdueDays > 0 ? 'warn' : undefined}
          />
          <Stat label="Total lent" value={formatINR(summary.principalLent)} />
          <Stat label="Repaid" value={formatINR(summary.repaid)} tone="good" />
          {summary.interestAccrued !== null ? (
            <Stat label="Interest due" value={formatINR(summary.interestDue ?? '0')} />
          ) : summary.emi ? (
            <Stat
              label="EMIs received"
              value={`${summary.emi.installmentsPaid} of ${summary.emi.installmentsTotal}`}
            />
          ) : (
            <Stat
              label="Next due"
              value={summary.nextDue ? formatDay(summary.nextDue.date) : '—'}
            />
          )}
          {summary.interestAccrued !== null && (
            <>
              <Stat label="Interest earned to date" value={formatINR(summary.interestAccrued)} />
              <Stat label="Interest received" value={formatINR(summary.interestReceived)} />
            </>
          )}
          {new Decimal(summary.waived).greaterThan(0) && (
            <Stat label="Forgiven" value={formatINR(summary.waived)} />
          )}
          {summary.emi && (
            <Stat
              label="Left to receive (incl. interest)"
              value={formatINR(summary.emi.remainingToReceive)}
            />
          )}
          {active && summary.nextDue && (
            <Stat
              label="Next payment"
              value={`${formatINR(summary.nextDue.amount)} · ${formatDay(summary.nextDue.date)}`}
            />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="text-base">History</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <ul className="divide-y">
            {loan.entries.map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                <div className="min-w-0">
                  <div className="font-medium">{ENTRY_KIND_LABELS[e.kind]}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {formatDay(e.date)}
                    {e.notes ? ` · ${e.notes}` : ''}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`tabular-nums font-medium ${e.kind === 'ADDITIONAL_LENT' ? '' : 'text-positive'}`}
                  >
                    {e.kind === 'ADDITIONAL_LENT' ? '+' : '−'}
                    {formatINR(e.amount)}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label="Remove entry"
                    disabled={mutate.isPending}
                    onClick={() => mutate.mutate({ entryId: e.id })}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </li>
            ))}
            <li className="flex items-center justify-between px-5 py-3 text-sm">
              <div>
                <div className="font-medium">Lent</div>
                <div className="text-xs text-muted-foreground">{formatDay(loan.lentOn)}</div>
              </div>
              <span className="tabular-nums font-medium">+{formatINR(loan.principalAmount)}</span>
            </li>
          </ul>
        </CardContent>
      </Card>

      {loan.notes && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Notes</CardTitle>
          </CardHeader>
          <CardContent className="text-sm whitespace-pre-wrap">{loan.notes}</CardContent>
        </Card>
      )}

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
