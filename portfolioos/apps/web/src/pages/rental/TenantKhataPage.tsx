import { useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { ArrowLeft, MessageCircle, Share2, Receipt, Trash2, Loader2 } from 'lucide-react';
import { Decimal, formatINR } from '@portfolioos/shared';
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

// ── Entry direction ──────────────────────────────────────────────────
// "You gave" = a charge against the tenant. "You got" = a credit (money in).

type Direction = 'GAVE' | 'GOT';

const ENTRY_TYPES_BY_DIRECTION: Record<Direction, LedgerEntryType[]> = {
  GOT: ['PAYMENT', 'DISCOUNT', 'DEPOSIT'],
  GAVE: ['LATE_FEE', 'OTHER_CHARGE', 'DEPOSIT_REFUND'],
};

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
      qc.invalidateQueries({ queryKey: ['tenancy-ledger', tenancyId] });
      qc.invalidateQueries({ queryKey: ['rental-collections'] });
      onOpenChange(false);
      resetForm(direction);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Failed to add entry'),
  });

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
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) resetForm(direction);
      }}
    >
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
          <Button variant="outline" onClick={() => onOpenChange(false)}>
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
  onDelete,
  isDeleting,
}: {
  row: LedgerRowDTO;
  onDelete: () => void;
  isDeleting: boolean;
}) {
  const isReceipt = row.source === 'RECEIPT';
  const subLabel = isReceipt ? `Rent · ${row.forMonth ?? ''}` : row.note || humanizeEntryType(row.entryType);

  return (
    <div className="grid grid-cols-[1fr_1fr_1fr_auto] items-start gap-3 py-3 px-4 border-b border-border/60 last:border-b-0">
      <div>
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
      <div className="flex items-center justify-end gap-2 min-w-[6rem]">
        <p className="text-sm font-medium tabular-nums pt-0.5">{formatINR(row.runningBalance)}</p>
        {!isReceipt && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0 shrink-0 text-muted-foreground hover:text-destructive"
            onClick={onDelete}
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

  const deleteMutation = useMutation({
    mutationFn: (entryId: string) => rentalApi.deleteLedgerEntry(entryId),
    onSuccess: () => {
      toast.success('Entry deleted');
      qc.invalidateQueries({ queryKey: ['tenancy-ledger', tenancyId] });
      qc.invalidateQueries({ queryKey: ['rental-collections'] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Failed to delete entry'),
  });

  const [deletingId, setDeletingId] = useState<string | null>(null);

  function handleDelete(id: string) {
    setDeletingId(id);
    deleteMutation.mutate(id, { onSettled: () => setDeletingId(null) });
  }

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
            <Button asChild variant="outline">
              <a href={rentalApi.statementUrl(ledger.tenancyId)} target="_blank" rel="noopener noreferrer">
                <Share2 className="h-4 w-4" /> Share statement
              </a>
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
          <div className="grid grid-cols-[1fr_1fr_1fr_auto] gap-3 py-2 px-4 border-b border-border/60 bg-muted/30 text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
            <div>Date</div>
            <div className="text-right">You gave</div>
            <div className="text-right">You got</div>
            <div className="text-right min-w-[6rem]">Balance</div>
          </div>
          {ledger.rows.map((row) => (
            <LedgerRow
              key={row.id}
              row={row}
              onDelete={() => handleDelete(row.id)}
              isDeleting={deletingId === row.id && deleteMutation.isPending}
            />
          ))}
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
        open={entryDialog.open}
        onOpenChange={(v) => setEntryDialog((d) => ({ ...d, open: v }))}
        tenancyId={ledger.tenancyId}
        direction={entryDialog.direction}
        months={months}
      />
    </div>
  );
}
