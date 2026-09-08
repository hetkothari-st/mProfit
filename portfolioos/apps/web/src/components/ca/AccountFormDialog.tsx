import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { apiErrorMessage } from '@/api/client';
import { caApi, ACCOUNT_TYPES, type CaAccountRow, type CaAccountInput } from '@/api/ca.api';

/**
 * Create or rename an account in a client's chart.
 *
 * Editing an existing account deliberately does not offer a type change: an
 * account's type decides which side of every statement its balance lands on,
 * so changing it silently re-files history rather than correcting it. Delete
 * and re-create if the type was genuinely wrong — that leaves two audit
 * entries saying what happened, instead of one that looks like a rename.
 */
export function AccountFormDialog({
  clientId,
  account,
  open,
  onOpenChange,
}: {
  clientId: string;
  /** Present when editing; absent when creating. */
  account?: CaAccountRow | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const isEdit = !!account;

  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [type, setType] = useState<CaAccountInput['type']>('ASSET');
  const [openingBalance, setOpeningBalance] = useState('');

  useEffect(() => {
    if (!open) return;
    setCode(account?.code ?? '');
    setName(account?.name ?? '');
    setType((account?.type as CaAccountInput['type']) ?? 'ASSET');
    setOpeningBalance('');
  }, [open, account]);

  const save = useMutation({
    mutationFn: () =>
      isEdit
        ? caApi.updateAccount(clientId, account!.id, { code, name })
        : caApi.createAccount(clientId, {
            code,
            name,
            type,
            ...(openingBalance ? { openingBalance } : {}),
          }),
    onSuccess: () => {
      toast.success(isEdit ? 'Account updated' : 'Account created');
      qc.invalidateQueries({ queryKey: ['ca', clientId] });
      onOpenChange(false);
    },
    onError: (e) => toast.error(apiErrorMessage(e, 'Could not save the account')),
  });

  // The server requires a positive decimal string; catching it here means the
  // CA sees the problem beside the field instead of as a toast after a round
  // trip.
  const balanceInvalid = openingBalance !== '' && !/^\d+(\.\d+)?$/.test(openingBalance);
  const canSave = code.trim() !== '' && name.trim() !== '' && !balanceInvalid;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit account' : 'New account'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid grid-cols-[110px_minmax(0,1fr)] gap-3">
            <div>
              <Label>Code</Label>
              <Input value={code} onChange={(e) => setCode(e.target.value)} maxLength={20} />
            </div>
            <div>
              <Label>Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={200} />
            </div>
          </div>

          {isEdit ? (
            <p className="text-[11.5px] leading-relaxed text-muted-foreground">
              Type is <span className="text-foreground">{account!.type}</span> and cannot be
              changed here — it decides which side of the statements this balance falls on.
              Delete and re-create if it was wrong.
            </p>
          ) : (
            <>
              <div>
                <Label>Type</Label>
                <Select
                  className="mt-1"
                  value={type}
                  onChange={(e) => setType(e.target.value as CaAccountInput['type'])}
                >
                  {ACCOUNT_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t.charAt(0) + t.slice(1).toLowerCase()}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label>Opening balance (optional)</Label>
                <Input
                  value={openingBalance}
                  onChange={(e) => setOpeningBalance(e.target.value)}
                  placeholder="0.00"
                  inputMode="decimal"
                />
                {balanceInvalid && (
                  <p className="mt-1 text-[11.5px] text-negative">
                    Enter a positive amount, digits and an optional decimal point only.
                  </p>
                )}
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => save.mutate()} disabled={!canSave || save.isPending}>
            {save.isPending ? 'Saving…' : isEdit ? 'Save changes' : 'Create account'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
