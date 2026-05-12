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
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  bankAccountsApi,
  type BankAccountDTO,
  type CreateBankAccountInput,
} from '@/api/bankAccounts.api';

const ACCOUNT_TYPES = ['SAVINGS', 'CURRENT', 'SALARY', 'NRE', 'NRO', 'OD'] as const;
const STATUSES = ['ACTIVE', 'DORMANT', 'CLOSED'] as const;

function emptyForm(): CreateBankAccountInput {
  return {
    bankName: '',
    accountType: 'SAVINGS',
    accountHolder: '',
    last4: '',
    ifsc: null,
    branch: null,
    nickname: null,
    jointHolders: [],
    nomineeName: null,
    nomineeRelation: null,
    debitCardLast4: null,
    debitCardExpiry: null,
    currentBalance: null,
    balanceAsOf: null,
    status: 'ACTIVE',
  };
}

function fromAccount(a: BankAccountDTO): CreateBankAccountInput {
  return {
    bankName: a.bankName,
    accountType: a.accountType,
    accountHolder: a.accountHolder,
    last4: a.last4,
    portfolioId: a.portfolioId,
    ifsc: a.ifsc,
    branch: a.branch,
    nickname: a.nickname,
    jointHolders: a.jointHolders,
    nomineeName: a.nomineeName,
    nomineeRelation: a.nomineeRelation,
    debitCardLast4: a.debitCardLast4,
    debitCardExpiry: a.debitCardExpiry,
    currentBalance: a.currentBalance,
    balanceAsOf: a.balanceAsOf?.slice(0, 10) ?? null,
    status: a.status,
    openedOn: a.openedOn?.slice(0, 10) ?? null,
    closedOn: a.closedOn?.slice(0, 10) ?? null,
  };
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial?: BankAccountDTO | null;
}

export function BankAccountDialog({ open, onOpenChange, initial }: Props) {
  const qc = useQueryClient();
  const isEdit = !!initial;
  const [form, setForm] = useState<CreateBankAccountInput>(emptyForm());
  const [errors, setErrors] = useState<Partial<Record<string, string>>>({});
  const [jointHoldersText, setJointHoldersText] = useState('');

  useEffect(() => {
    if (open) {
      const next = initial ? fromAccount(initial) : emptyForm();
      setForm(next);
      setJointHoldersText((next.jointHolders ?? []).join(', '));
      setErrors({});
    }
  }, [open, initial]);

  const mutation = useMutation({
    mutationFn: (input: CreateBankAccountInput) =>
      isEdit ? bankAccountsApi.update(initial!.id, input) : bankAccountsApi.create(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bank-accounts'] });
      qc.invalidateQueries({ queryKey: ['bank-account', initial?.id] });
      toast.success(isEdit ? 'Account updated' : 'Account added');
      onOpenChange(false);
    },
    onError: () => toast.error(isEdit ? 'Failed to update account' : 'Failed to add account'),
  });

  function set<K extends keyof CreateBankAccountInput>(key: K, value: CreateBankAccountInput[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function validate(): boolean {
    const errs: Record<string, string> = {};
    if (!form.bankName.trim()) errs['bankName'] = 'Required';
    if (!form.accountHolder.trim()) errs['accountHolder'] = 'Required';
    if (!form.last4 || !/^\d{4}$/.test(form.last4)) errs['last4'] = 'Must be 4 digits';
    if (form.debitCardLast4 && !/^\d{4}$/.test(form.debitCardLast4))
      errs['debitCardLast4'] = 'Must be 4 digits';
    if (form.debitCardExpiry && !/^(0[1-9]|1[0-2])\/\d{2}$/.test(form.debitCardExpiry))
      errs['debitCardExpiry'] = 'MM/YY';
    if (form.currentBalance && !/^-?\d+(\.\d+)?$/.test(form.currentBalance))
      errs['currentBalance'] = 'Must be a number';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function handleSubmit() {
    if (!validate()) return;
    const jointHolders = jointHoldersText
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    mutation.mutate({
      ...form,
      bankName: form.bankName.trim(),
      accountHolder: form.accountHolder.trim(),
      jointHolders,
      ifsc: form.ifsc?.trim() || null,
      branch: form.branch?.trim() || null,
      nickname: form.nickname?.trim() || null,
      nomineeName: form.nomineeName?.trim() || null,
      nomineeRelation: form.nomineeRelation?.trim() || null,
      debitCardLast4: form.debitCardLast4?.trim() || null,
      debitCardExpiry: form.debitCardExpiry?.trim() || null,
      currentBalance: form.currentBalance?.trim() || null,
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit bank account' : 'Add bank account'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Bank *</Label>
              <Input
                placeholder="HDFC, ICICI, SBI…"
                value={form.bankName}
                onChange={(e) => set('bankName', e.target.value)}
                className={errors['bankName'] ? 'border-negative' : ''}
              />
              {errors['bankName'] && (
                <p className="text-xs text-negative mt-1">{errors['bankName']}</p>
              )}
            </div>
            <div>
              <Label>Type</Label>
              <select
                className="w-full mt-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={form.accountType}
                onChange={(e) => set('accountType', e.target.value as CreateBankAccountInput['accountType'])}
              >
                {ACCOUNT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t.charAt(0) + t.slice(1).toLowerCase()}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Account holder *</Label>
              <Input
                placeholder="Name on account"
                value={form.accountHolder}
                onChange={(e) => set('accountHolder', e.target.value)}
                className={errors['accountHolder'] ? 'border-negative' : ''}
              />
              {errors['accountHolder'] && (
                <p className="text-xs text-negative mt-1">{errors['accountHolder']}</p>
              )}
            </div>
            <div>
              <Label>Last 4 digits *</Label>
              <Input
                placeholder="1234"
                maxLength={4}
                value={form.last4}
                onChange={(e) => set('last4', e.target.value)}
                className={errors['last4'] ? 'border-negative' : ''}
              />
              {errors['last4'] && <p className="text-xs text-negative mt-1">{errors['last4']}</p>}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>IFSC</Label>
              <Input
                placeholder="HDFC0001234"
                value={form.ifsc ?? ''}
                onChange={(e) => set('ifsc', e.target.value || null)}
              />
            </div>
            <div>
              <Label>Branch</Label>
              <Input
                placeholder="Andheri East"
                value={form.branch ?? ''}
                onChange={(e) => set('branch', e.target.value || null)}
              />
            </div>
          </div>

          <div>
            <Label>Nickname (optional)</Label>
            <Input
              placeholder="Primary salary, Emergency fund…"
              value={form.nickname ?? ''}
              onChange={(e) => set('nickname', e.target.value || null)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Current balance (₹)</Label>
              <Input
                placeholder="100000"
                value={form.currentBalance ?? ''}
                onChange={(e) => set('currentBalance', e.target.value || null)}
                className={errors['currentBalance'] ? 'border-negative' : ''}
              />
              {errors['currentBalance'] && (
                <p className="text-xs text-negative mt-1">{errors['currentBalance']}</p>
              )}
            </div>
            <div>
              <Label>As of</Label>
              <Input
                type="date"
                value={form.balanceAsOf ?? ''}
                onChange={(e) => set('balanceAsOf', e.target.value || null)}
              />
            </div>
          </div>

          <div className="border-t pt-3 space-y-3">
            <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">
              Nominee & joint holders
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Nominee name</Label>
                <Input
                  value={form.nomineeName ?? ''}
                  onChange={(e) => set('nomineeName', e.target.value || null)}
                />
              </div>
              <div>
                <Label>Relation</Label>
                <Input
                  placeholder="Spouse, Parent…"
                  value={form.nomineeRelation ?? ''}
                  onChange={(e) => set('nomineeRelation', e.target.value || null)}
                />
              </div>
            </div>
            <div>
              <Label>Joint holders (comma-separated)</Label>
              <Input
                placeholder="Jane Doe, John Doe"
                value={jointHoldersText}
                onChange={(e) => setJointHoldersText(e.target.value)}
              />
            </div>
          </div>

          <div className="border-t pt-3 space-y-3">
            <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">
              Linked debit card (optional)
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Card last 4</Label>
                <Input
                  placeholder="5678"
                  maxLength={4}
                  value={form.debitCardLast4 ?? ''}
                  onChange={(e) => set('debitCardLast4', e.target.value || null)}
                  className={errors['debitCardLast4'] ? 'border-negative' : ''}
                />
                {errors['debitCardLast4'] && (
                  <p className="text-xs text-negative mt-1">{errors['debitCardLast4']}</p>
                )}
              </div>
              <div>
                <Label>Expiry (MM/YY)</Label>
                <Input
                  placeholder="08/29"
                  value={form.debitCardExpiry ?? ''}
                  onChange={(e) => set('debitCardExpiry', e.target.value || null)}
                  className={errors['debitCardExpiry'] ? 'border-negative' : ''}
                />
                {errors['debitCardExpiry'] && (
                  <p className="text-xs text-negative mt-1">{errors['debitCardExpiry']}</p>
                )}
              </div>
            </div>
          </div>

          <div>
            <Label>Status</Label>
            <select
              className="w-full mt-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={form.status}
              onChange={(e) => set('status', e.target.value as CreateBankAccountInput['status'])}
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s.charAt(0) + s.slice(1).toLowerCase()}
                </option>
              ))}
            </select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={mutation.isPending}>
            {mutation.isPending ? 'Saving…' : isEdit ? 'Save changes' : 'Add account'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
