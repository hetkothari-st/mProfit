import { useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { ArrowLeft, MessageCircle, Share2, Receipt, Trash2, Loader2 } from 'lucide-react';
import { Decimal, formatINR } from '@everypaisa/shared';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/common/EmptyState';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import {
  rentalApi,
  type LedgerRowDTO,
  type LedgerEntryType,
  type CreateLedgerEntryInput,
} from '@/api/rental.api';
import { invalidateRentalCaches } from '@/api/rentalCache';

// ── Entry direction ──────────────────────────────────────────────────
// "You gave" = a charge against the tenant. "You got" = a credit (money in).

type Direction = 'GAVE' | 'GOT';

const ENTRY_TYPES_BY_DIRECTION: Record<Direction, LedgerEntryType[]> = {
  GOT: ['PAYMENT', 'DISCOUNT', 'DEPOSIT'],
  GAVE: ['LATE_FEE', 'OTHER_CHARGE', 'DEPOSIT_REFUND'],
};

/**
 * One grid for the header and every row, so the two cannot drift apart.
 *
 * The three money columns are FIXED width and the date/description column
 * takes whatever is left. Giving every column an `fr` share looked reasonable
 * until a wide screen: the date claimed ~370px it had no use for, each amount
 * sat alone in a ~310px cell, and a 560px void opened between the label and
 * the first figure. Fixed money columns keep the amounts in one tight,
 * scannable block against the right edge — a ledger is read by running down
 * the numbers, not across the row — while long tenant notes get the slack.
 *
 * The trailing 2rem column holds the delete button and is always rendered,
 * even for the receipt rows that have none: when the button shared the balance
 * column, rows that had one sat their balance ~1.5rem left of those that
 * didn't.
 */
const KHATA_GRID =
  'grid-cols-[minmax(0,1fr)_7.5rem_7.5rem_8.5rem_2rem]';

function humanizeEntryType(entryType: string): string {
  const lower = entryType.replace(/_/g, ' ').toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

function formatRowDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ── Add entry dialog ─────────────────────────────────────────────────

function AddEntryDialog({
  open,
  onOpenChange,
  tenancyId,
  direction,
  months,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  tenancyId: string;
  direction: Direction;
  months: string[];
}) {
  const qc = useQueryClient();
  const types = ENTRY_TYPES_BY_DIRECTION[direction];
  const [amount, setAmount] = useState('');
  const [entryDate, setEntryDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [entryType, setEntryType] = useState<LedgerEntryType>(types[0]!);
  const [forMonth, setForMonth] = useState('');
  const [note, setNote] = useState('');

  function resetForm(nextDirection: Direction) {
    setAmount('');
    setEntryDate(new Date().toISOString().slice(0, 10));
    setEntryType(ENTRY_TYPES_BY_DIRECTION[nextDirection][0]!);
    setForMonth('');
    setNote('');
  }

  const mutation = useMutation({
    mutationFn: (input: CreateLedgerEntryInput) => rentalApi.createLedgerEntry(tenancyId, input),
    onSuccess: () => {
      toast.success('Entry added');
      invalidateRentalCaches(qc);
      onOpenChange(false);
      resetForm(direction);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Failed to add entry'),
  });

  function handleOpenChange(v: boolean) {
    onOpenChange(v);
    if (!v) resetForm(direction);
  }

  function handleSubmit() {
    let parsed: Decimal;
    try {
      parsed = new Decimal(amount);
    } catch {
      toast.error('Enter a valid amount');
      return;
    }
    if (!amount.trim() || parsed.lessThanOrEqualTo(0)) {
      toast.error('Enter a valid amount');
      return;
    }
    mutation.mutate({
      entryType,
      amount: parsed.toString(),
      entryDate,
      forMonth: forMonth || null,
      note: note.trim() || null,
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{direction === 'GOT' ? 'You got' : 'You gave'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Amount (₹) *</Label>
              <Input
                inputMode="decimal"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div>
              <Label>Date</Label>
              <Input
                type="date"
                value={entryDate}
                onChange={(e) => setEntryDate(e.target.value)}
              />
            </div>
          </div>
          <div>
            <Label>Type</Label>
            <Select
              value={entryType}
              onChange={(e) => setEntryType(e.target.value as LedgerEntryType)}
            >
              {types.map((t) => (
                <option key={t} value={t}>
                  {humanizeEntryType(t)}
                </option>
              ))}
            </Select>
          </div>
          {months.length > 0 && (
            <div>
              <Label>Apply to month — leave blank to settle oldest first</Label>
              <Select value={forMonth} onChange={(e) => setForMonth(e.target.value)}>
                <option value="">Settle oldest first</option>
                {months.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </Select>
            </div>
          )}
          <div>
            <Label>Note</Label>
            <Input
              placeholder="Optional"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={mutation.isPending}>
            {mutation.isPending ? 'Saving…' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Ledger row ───────────────────────────────────────────────────────

function LedgerRow({
  row,
  onAskDelete,
  isDeleting,
}: {
  row: LedgerRowDTO;
  /** Opens the inline confirm card — deleting is never one click. */
  onAskDelete: () => void;
  isDeleting: boolean;
}) {
  const isReceipt = row.source === 'RECEIPT';
  const subLabel = isReceipt ? `Rent · ${row.forMonth ?? ''}` : row.note || humanizeEntryType(row.entryType);

  return (
    <div className={`grid ${KHATA_GRID} items-start gap-3 py-3 px-4 border-b border-border/60 last:border-b-0`}>
      <div className="min-w-0">
        <p className="text-sm text-foreground whitespace-nowrap">{formatRowDate(row.date)}</p>
        <p className="text-xs text-muted-foreground truncate">{subLabel}</p>
      </div>
      <div className="text-right tabular-nums pt-0.5">
        {row.kind === 'CHARGE' && (
          <span className="text-destructive font-medium">{formatINR(row.amount)}</span>
        )}
      </div>
      <div className="text-right tabular-nums pt-0.5">
        {row.kind === 'CREDIT' && (
          <span className="text-positive font-medium">{formatINR(row.amount)}</span>
        )}
      </div>
      <div className="text-right">
        <p className="text-sm font-medium tabular-nums pt-0.5">{formatINR(row.runningBalance)}</p>
      </div>
      {/* Its own column, always rendered, so a row with a delete button and a
          row without one still line their balances up with the header. */}
      <div className="flex justify-end pt-0.5">
        {!isReceipt && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0 shrink-0 text-muted-foreground hover:text-destructive"
            onClick={onAskDelete}
            disabled={isDeleting}
            title="Delete entry"
          >
            {isDeleting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
          </Button>
        )}
      </div>
    </div>
  );
}

/**
 * Inline confirm for a ledger-entry delete, mirroring the property-delete
 * card on RentalListPage. Deleting an entry removes a money row AND its
 * CashFlow irreversibly, and it is the documented recovery route for
 * `unmarkReceived`'s FIFO-spillover limitation — so it must not be one
 * unguarded click.
 */
function ConfirmDeleteRow({
  row,
  onConfirm,
  onCancel,
  isDeleting,
}: {
  row: LedgerRowDTO;
  onConfirm: () => void;
  onCancel: () => void;
  isDeleting: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 py-3 px-4 border-b border-border/60 last:border-b-0 bg-destructive/5">
      <p className="text-sm font-medium">
        Delete this {humanizeEntryType(row.entryType).toLowerCase()} of {formatINR(row.amount)} on{' '}
        {formatRowDate(row.date)}?
      </p>
      <div className="flex gap-2">
        <Button variant="destructive" size="sm" disabled={isDeleting} onClick={onConfirm}>
          {isDeleting ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Yes, delete'}
        </Button>
        <Button variant="ghost" size="sm" disabled={isDeleting} onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────

export function TenantKhataPage() {
  const { tenancyId } = useParams<{ tenancyId: string }>();
  const qc = useQueryClient();
  const [entryDialog, setEntryDialog] = useState<{ open: boolean; direction: Direction }>({
    open: false,
    direction: 'GOT',
  });

  const { data: ledger, isLoading } = useQuery({
    queryKey: ['tenancy-ledger', tenancyId],
    queryFn: () => rentalApi.getTenancyLedger(tenancyId!),
    enabled: !!tenancyId,
  });

  const remindMutation = useMutation({
    mutationFn: () => rentalApi.getReminderLink(tenancyId!),
    onSuccess: (res) => {
      if (res.waUrl) {
        window.open(res.waUrl, '_blank', 'noopener');
      } else {
        toast.error('Add a phone number for this tenant first');
      }
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Failed to build reminder'),
  });

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const deleteMutation = useMutation({
    mutationFn: (entryId: string) => rentalApi.deleteLedgerEntry(entryId),
    onSuccess: () => {
      toast.success('Entry deleted');
      setConfirmDeleteId(null);
      invalidateRentalCaches(qc);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Failed to delete entry'),
  });

  const statementMutation = useMutation({
    mutationFn: () =>
      rentalApi.downloadStatement(
        tenancyId!,
        `rent-statement-${(ledger?.tenantName ?? 'tenant').replace(/[^\w-]+/g, '-')}.pdf`,
      ),
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : 'Failed to download statement'),
  });

  const months = useMemo(() => {
    if (!ledger) return [];
    const seen = new Set<string>();
    const list: string[] = [];
    for (const row of ledger.rows) {
      if (row.source === 'RECEIPT' && row.forMonth && !seen.has(row.forMonth)) {
        seen.add(row.forMonth);
        list.push(row.forMonth);
      }
    }
    return list;
  }, [ledger]);

  if (isLoading) {
    return (
      <div>
        <PageHeader title="Tenant khata" />
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} className="h-20 animate-pulse bg-muted/60" />
          ))}
        </div>
      </div>
    );
  }

  if (!ledger) {
    return (
      <EmptyState
        icon={Receipt}
        title="Tenancy not found"
        description="This tenancy may have been removed."
      />
    );
  }

  const balance = new Decimal(ledger.balanceDue);
  const deposit = new Decimal(ledger.depositHeld);
  const balanceLabel = balance.greaterThan(0)
    ? 'To collect'
    : balance.lessThan(0)
      ? 'In advance'
      : 'Settled up';
  const balanceColor = balance.greaterThan(0)
    ? 'hsl(var(--destructive))'
    : balance.lessThan(0)
      ? 'hsl(var(--positive))'
      : 'hsl(var(--muted-foreground))';

  return (
    <div>
      <PageHeader
        title={
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm" className="-ml-2">
              <Link to={`/rental/${ledger.propertyId}`}>
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            {ledger.tenantName}
          </div>
        }
        description={ledger.propertyName}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => remindMutation.mutate()}
              disabled={remindMutation.isPending}
            >
              <MessageCircle className="h-4 w-4" /> Remind
            </Button>
            <Button
              variant="outline"
              onClick={() => statementMutation.mutate()}
              disabled={statementMutation.isPending}
            >
              {statementMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Share2 className="h-4 w-4" />
              )}{' '}
              Share statement
            </Button>
          </div>
        }
      />

      <Card className="mb-4">
        <CardContent className="p-5">
          <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
            {balanceLabel}
          </p>
          <p
            className="text-3xl sm:text-4xl font-semibold tabular-nums mt-1"
            style={{ color: balanceColor }}
          >
            {formatINR(balance.abs().toString())}
          </p>
          {!deposit.isZero() && (
            <p className="text-sm text-muted-foreground mt-2">
              Deposit held: {formatINR(deposit.toString())}
            </p>
          )}
        </CardContent>
      </Card>

      {ledger.rows.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title="No entries yet"
          description="Record a payment or a charge to start this tenant's khata."
        />
      ) : (
        <Card className="overflow-hidden">
          <div className={`grid ${KHATA_GRID} gap-3 py-2 px-4 border-b border-border/60 bg-muted/30 text-[11px] uppercase tracking-wider text-muted-foreground font-medium`}>
            <div>Date</div>
            <div className="text-right">You gave</div>
            <div className="text-right">You got</div>
            <div className="text-right">Balance</div>
            <div aria-hidden />
          </div>
          {ledger.rows.map((row) =>
            confirmDeleteId === row.id ? (
              <ConfirmDeleteRow
                key={row.id}
                row={row}
                onConfirm={() => deleteMutation.mutate(row.id)}
                onCancel={() => setConfirmDeleteId(null)}
                isDeleting={deleteMutation.isPending}
              />
            ) : (
              <LedgerRow
                key={row.id}
                row={row}
                onAskDelete={() => setConfirmDeleteId(row.id)}
                isDeleting={false}
              />
            ),
          )}
        </Card>
      )}

      <div className="sticky bottom-0 bg-background/95 backdrop-blur border-t border-border/70 p-3 flex gap-3 mt-4 -mx-4 sm:mx-0">
        <Button
          variant="outline"
          className="flex-1 border-destructive/40 text-destructive hover:bg-destructive/10"
          onClick={() => setEntryDialog({ open: true, direction: 'GAVE' })}
        >
          You gave
        </Button>
        <Button
          className="flex-1"
          onClick={() => setEntryDialog({ open: true, direction: 'GOT' })}
        >
          You got
        </Button>
      </div>

      <AddEntryDialog
        key={entryDialog.direction}
        open={entryDialog.open}
        onOpenChange={(v) => setEntryDialog((d) => ({ ...d, open: v }))}
        tenancyId={ledger.tenancyId}
        direction={entryDialog.direction}
        months={months}
      />
    </div>
  );
}
