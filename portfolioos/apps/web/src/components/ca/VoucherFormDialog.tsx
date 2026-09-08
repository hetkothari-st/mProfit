import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { apiErrorMessage } from '@/api/client';
import { caApi, VOUCHER_TYPES, type CaVoucherEntryInput, type CaVoucherInput } from '@/api/ca.api';

/**
 * Post a voucher to a client's books.
 *
 * Amounts stay decimal STRINGS from the input box to the request body — never
 * parsed into a JavaScript number anywhere in this file. That is the money
 * rule the whole codebase runs on, and a form is exactly where it usually gets
 * broken.
 *
 * Entries are debit/credit pairs, so a voucher is balanced by construction:
 * there is no way to enter a debit without the credit that answers it, and
 * therefore no way to post something that will not balance.
 */

const emptyEntry = (): CaVoucherEntryInput => ({
  debitAccountId: '',
  creditAccountId: '',
  amount: '',
});

const isMoney = (v: string) => /^\d+(\.\d+)?$/.test(v);

export function VoucherFormDialog({
  clientId,
  open,
  onOpenChange,
}: {
  clientId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const [type, setType] = useState<CaVoucherInput['type']>('JOURNAL');
  const [voucherNo, setVoucherNo] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [narration, setNarration] = useState('');
  const [entries, setEntries] = useState<CaVoucherEntryInput[]>([emptyEntry()]);

  const accounts = useQuery({
    queryKey: ['ca', clientId, 'accounts'],
    queryFn: () => caApi.accountsFlat(clientId),
    enabled: open,
  });

  // The next number is per (client, type), so it is fetched rather than
  // guessed — two CAs numbering the same book by hand would collide.
  const nextNo = useQuery({
    queryKey: ['ca', clientId, 'next-voucher-no', type],
    queryFn: () => caApi.nextVoucherNo(clientId, type),
    enabled: open,
  });

  useEffect(() => {
    if (open && nextNo.data) setVoucherNo(nextNo.data);
  }, [open, nextNo.data]);

  useEffect(() => {
    if (!open) {
      setNarration('');
      setEntries([emptyEntry()]);
    }
  }, [open]);

  const post = useMutation({
    mutationFn: () =>
      caApi.createVoucher(clientId, {
        type,
        voucherNo,
        date,
        ...(narration ? { narration } : {}),
        entries,
      }),
    onSuccess: () => {
      toast.success('Voucher posted');
      qc.invalidateQueries({ queryKey: ['ca', clientId] });
      onOpenChange(false);
    },
    onError: (e) => toast.error(apiErrorMessage(e, 'Could not post the voucher')),
  });

  function patchEntry(i: number, patch: Partial<CaVoucherEntryInput>) {
    setEntries((rows) => rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  const rows = accounts.data ?? [];
  const entriesValid =
    entries.length > 0 &&
    entries.every(
      (e) =>
        e.debitAccountId !== '' &&
        e.creditAccountId !== '' &&
        e.debitAccountId !== e.creditAccountId &&
        isMoney(e.amount),
    );
  const canPost = voucherNo.trim() !== '' && date !== '' && entriesValid;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Post a voucher</DialogTitle>
          <DialogDescription>
            Each entry is a debit and the credit that answers it, so the voucher balances by
            construction.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div>
              <Label>Type</Label>
              <Select
                className="mt-1"
                value={type}
                onChange={(e) => setType(e.target.value as CaVoucherInput['type'])}
              >
                {VOUCHER_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t.charAt(0) + t.slice(1).toLowerCase()}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Number</Label>
              <Input value={voucherNo} onChange={(e) => setVoucherNo(e.target.value)} />
            </div>
            <div>
              <Label>Date</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>

          <div>
            <Label>Narration (optional)</Label>
            <Input
              value={narration}
              onChange={(e) => setNarration(e.target.value)}
              placeholder="What this voucher records"
            />
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <Label>Entries</Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setEntries((r) => [...r, emptyEntry()])}
              >
                <Plus className="h-3.5 w-3.5" /> Add entry
              </Button>
            </div>

            {rows.length === 0 ? (
              <p className="text-[12.5px] text-muted-foreground">
                This client has no chart of accounts yet. Open the Chart of accounts tab once to
                create the defaults.
              </p>
            ) : (
              <div className="space-y-2">
                {entries.map((e, i) => (
                  <div
                    key={i}
                    className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_120px_auto] items-end gap-2"
                  >
                    <div>
                      {i === 0 && (
                        <span className="mb-1 block text-[10px] uppercase tracking-kerned text-muted-foreground">
                          Debit
                        </span>
                      )}
                      <Select
                        value={e.debitAccountId}
                        onChange={(ev) => patchEntry(i, { debitAccountId: ev.target.value })}
                      >
                        <option value="">— account —</option>
                        {rows.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.code} · {a.name}
                          </option>
                        ))}
                      </Select>
                    </div>
                    <div>
                      {i === 0 && (
                        <span className="mb-1 block text-[10px] uppercase tracking-kerned text-muted-foreground">
                          Credit
                        </span>
                      )}
                      <Select
                        value={e.creditAccountId}
                        onChange={(ev) => patchEntry(i, { creditAccountId: ev.target.value })}
                      >
                        <option value="">— account —</option>
                        {rows.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.code} · {a.name}
                          </option>
                        ))}
                      </Select>
                    </div>
                    <div>
                      {i === 0 && (
                        <span className="mb-1 block text-[10px] uppercase tracking-kerned text-muted-foreground">
                          Amount
                        </span>
                      )}
                      <Input
                        value={e.amount}
                        onChange={(ev) => patchEntry(i, { amount: ev.target.value })}
                        placeholder="0.00"
                        inputMode="decimal"
                        className="numeric tabular-nums text-right"
                      />
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={entries.length === 1}
                      onClick={() => setEntries((r) => r.filter((_, idx) => idx !== i))}
                      className="text-muted-foreground hover:text-negative"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}

                {entries.some(
                  (e) => e.debitAccountId && e.debitAccountId === e.creditAccountId,
                ) && (
                  <p className="text-[11.5px] text-negative">
                    An entry cannot debit and credit the same account.
                  </p>
                )}
                {entries.some((e) => e.amount !== '' && !isMoney(e.amount)) && (
                  <p className="text-[11.5px] text-negative">
                    Amounts take digits and an optional decimal point only.
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => post.mutate()} disabled={!canPost || post.isPending}>
            {post.isPending ? 'Posting…' : 'Post voucher'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
