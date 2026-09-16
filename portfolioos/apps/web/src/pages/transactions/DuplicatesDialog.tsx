import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { AlertTriangle, CheckCircle2, Loader2, Trash2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { transactionsApi } from '@/api/transactions.api';
import { apiErrorMessage } from '@/api/client';
import { formatINR, type DuplicateGroupDTO, type DuplicateRowDTO } from '@everypaisa/shared';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * The same trade can reach the books from a CAS, a contract note and a typed
 * entry — three sources, one event. This lists what looks repeated and removes
 * only the rows the user ticks. Nothing is deleted without that tick.
 */
export function DuplicatesDialog({ open, onOpenChange }: Props) {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState(false);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['transaction-duplicates'],
    queryFn: () => transactionsApi.duplicates(),
    enabled: open,
  });

  // Pre-tick what we are confident about; a group we are unsure of starts
  // empty, so an unread dialog can never delete a real trade.
  useEffect(() => {
    if (!data) return;
    setSelected(new Set(data.groups.flatMap((g) => g.suggestedRemovalIds)));
    setConfirming(false);
  }, [data]);

  const byId = useMemo(() => {
    const map = new Map<string, DuplicateRowDTO['kind']>();
    for (const group of data?.groups ?? []) {
      for (const row of group.rows) map.set(row.id, row.kind);
    }
    return map;
  }, [data]);

  const removeMutation = useMutation({
    mutationFn: () => {
      const transactionIds: string[] = [];
      const rentEntryIds: string[] = [];
      for (const id of selected) {
        if (byId.get(id) === 'RENT_ENTRY') rentEntryIds.push(id);
        else transactionIds.push(id);
      }
      return transactionsApi.removeDuplicates({ transactionIds, rentEntryIds });
    },
    onSuccess: (res) => {
      const parts = [
        res.removedTransactions ? `${res.removedTransactions} transaction${res.removedTransactions === 1 ? '' : 's'}` : null,
        res.removedRentEntries ? `${res.removedRentEntries} rent entr${res.removedRentEntries === 1 ? 'y' : 'ies'}` : null,
      ].filter(Boolean);
      toast.success(`Removed ${parts.join(' and ')}`);
      for (const key of [
        'transaction-duplicates',
        'transactions',
        'portfolios',
        'portfolio-summary',
        'portfolio-holdings',
        'rental-properties',
      ]) {
        queryClient.invalidateQueries({ queryKey: [key] });
      }
      setConfirming(false);
    },
    onError: (err) => {
      setConfirming(false);
      toast.error(apiErrorMessage(err, 'Could not remove the selected rows'));
    },
  });

  const toggle = (id: string) => {
    setConfirming(false);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const groups = data?.groups ?? [];
  const selectedCount = selected.size;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Duplicates</DialogTitle>
          <DialogDescription>
            Rows that record the same money twice. The oldest row in each set is kept; tick
            anything else you want removed. Holdings, gains and the rent khata are recalculated
            after.
          </DialogDescription>
        </DialogHeader>

        {isLoading && (
          <div className="flex items-center gap-2 py-10 justify-center text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Looking through your books…
          </div>
        )}

        {isError && (
          <p className="py-10 text-center text-sm text-destructive">
            {apiErrorMessage(error, 'Could not read your transactions')}
          </p>
        )}

        {data && groups.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <CheckCircle2 className="h-8 w-8 text-positive" />
            <p className="text-sm">
              Nothing is recorded twice across {data.scanned.transactions} transactions and{' '}
              {data.scanned.rentEntries} rent entries.
            </p>
          </div>
        )}

        {groups.length > 0 && (
          <div className="space-y-4">
            {groups.map((group) => (
              <GroupCard
                key={group.fingerprint}
                group={group}
                selected={selected}
                onToggle={toggle}
              />
            ))}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          {groups.length > 0 && (
            <Button
              variant="destructive"
              disabled={selectedCount === 0 || removeMutation.isPending}
              onClick={() => (confirming ? removeMutation.mutate() : setConfirming(true))}
            >
              {removeMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
              {confirming
                ? `Yes — remove ${selectedCount} row${selectedCount === 1 ? '' : 's'}`
                : `Remove ${selectedCount} selected`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function GroupCard({
  group,
  selected,
  onToggle,
}: {
  group: DuplicateGroupDTO;
  selected: Set<string>;
  onToggle: (id: string) => void;
}) {
  return (
    <div className="rounded-lg border p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium">{group.label}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{group.reason}</p>
        </div>
        {group.confidence === 'high' ? (
          <Badge variant="destructive" className="shrink-0">
            <AlertTriangle className="h-3 w-3" /> Duplicate
          </Badge>
        ) : (
          <Badge variant="outline" className="shrink-0">Probably fine</Badge>
        )}
      </div>

      <ul className="mt-3 space-y-1">
        {group.rows.map((row) => {
          const isKeeper = row.id === group.keepId;
          return (
            <li
              key={row.id}
              className="flex items-center gap-3 rounded-md px-2 py-1.5 text-sm odd:bg-muted/40"
            >
              <input
                type="checkbox"
                className="h-4 w-4 accent-destructive"
                checked={selected.has(row.id)}
                onChange={() => onToggle(row.id)}
                aria-label={`Remove ${describeRow(row)}`}
              />
              <span className="flex-1">{describeRow(row)}</span>
              {isKeeper && (
                <span className="text-xs text-muted-foreground shrink-0">oldest — kept</span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function describeRow(row: DuplicateRowDTO): string {
  const added = `added ${row.createdAt.slice(0, 10)}`;
  if (row.kind === 'RENT_ENTRY') {
    return `${row.entryType?.toLowerCase()} ${formatINR(row.amount ?? '0')} on ${row.entryDate}${
      row.note ? ` — ${row.note}` : ''
    } (${added})`;
  }
  const source =
    row.importFileName ?? row.sourceAdapter ?? (row.broker ? `${row.broker} sync` : 'entered by hand');
  const tradeRef = row.orderNo && row.tradeNo ? ` · order ${row.orderNo}/${row.tradeNo}` : '';
  return `${formatINR(row.netAmount ?? '0')} · ${source}${tradeRef} (${added})`;
}
