import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
import { Select } from '@/components/ui/select';
import { SuggestInput, type SuggestOption } from '@/components/common/SuggestInput';
import { INDIAN_BANKS, bankForIfsc, findBankByName } from '@/data/indianBanks';
import { useAuthStore } from '@/stores/auth.store';
import {
  bankAccountsApi,
  type BankAccountDTO,
  type CreateBankAccountInput,
} from '@/api/bankAccounts.api';

const ACCOUNT_TYPES = ['SAVINGS', 'CURRENT', 'SALARY', 'NRE', 'NRO', 'OD'] as const;
const STATUSES = ['ACTIVE', 'DORMANT', 'CLOSED'] as const;
const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;
/** What the Bank picker pre-fills: the bank's four letters plus the fixed 0. */
const IFSC_PREFIX_ONLY_RE = /^[A-Z]{4}0?$/;

const BANK_OPTIONS: SuggestOption[] = INDIAN_BANKS.map((b) => ({
  value: b.name,
  hint: b.ifscPrefix,
  keywords: b.keywords,
}));

const RELATION_OPTIONS: SuggestOption[] = [
  'Spouse',
  'Father',
  'Mother',
  'Son',
  'Daughter',
  'Brother',
  'Sister',
  'Grandfather',
  'Grandmother',
  'Grandson',
  'Granddaughter',
  'Guardian',
  'Other',
].map((value) => ({ value }));

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS = MONTH_NAMES.map((name, i) => {
  const mm = String(i + 1).padStart(2, '0');
  return { value: mm, label: `${mm} · ${name}` };
});

/** Card expiry years (YY) from this year forward, plus a saved year if older. */
function expiryYears(saved: string): string[] {
  const now = new Date().getFullYear() % 100;
  const years = Array.from({ length: 21 }, (_, i) => String((now + i) % 100).padStart(2, '0'));
  if (saved && !years.includes(saved)) years.unshift(saved);
  return years;
}

/** Today in the user's timezone as YYYY-MM-DD (not UTC, which lags IST until 05:30). */
function localToday(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function emptyForm(accountHolder = ''): CreateBankAccountInput {
  return {
    bankName: '',
    accountType: 'SAVINGS',
    accountHolder,
    last4: '',
    customerId: null,
    ifsc: null,
    branch: null,
    branchAddress: null,
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
    customerId: a.customerId,
    portfolioId: a.portfolioId,
    ifsc: a.ifsc,
    branch: a.branch,
    branchAddress: a.branchAddress,
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

/** Mirrors the server's normalisation: users paste numbers with spaces/hyphens. */
function normaliseAccountNumber(v: string): string {
  return v.replace(/[\s-]/g, '');
}

type IfscLookupState = 'idle' | 'loading' | 'not_found' | 'failed';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial?: BankAccountDTO | null;
}

export function BankAccountDialog({ open, onOpenChange, initial }: Props) {
  const qc = useQueryClient();
  const uid = useId();
  const fid = (name: string) => `${uid}-${name}`;
  const isEdit = !!initial;
  const userName = useAuthStore((s) => s.user?.name ?? '');

  const [form, setForm] = useState<CreateBankAccountInput>(emptyForm());
  const [errors, setErrors] = useState<Partial<Record<string, string>>>({});
  const [jointHoldersText, setJointHoldersText] = useState('');
  // Kept outside `form`: the saved number is never sent to the client, so on
  // edit this starts empty and an empty value means "keep what's stored".
  const [accountNumber, setAccountNumber] = useState('');
  const [ifscLookup, setIfscLookup] = useState<IfscLookupState>('idle');
  const [customerIdSource, setCustomerIdSource] = useState<string | null>(null);
  const [expMonth, setExpMonth] = useState('');
  const [expYear, setExpYear] = useState('');
  const lastLookedUp = useRef<string | null>(null);

  // The user's other accounts feed the suggestions (holders, nominees, CIFs).
  // Same key as the list page, so it's usually already cached.
  const { data: accounts = [] } = useQuery({
    queryKey: ['bank-accounts'],
    queryFn: () => bankAccountsApi.list(),
    enabled: open,
  });
  const otherAccounts = useMemo(
    () => accounts.filter((a) => a.id !== initial?.id),
    [accounts, initial?.id],
  );

  const holderOptions = useMemo<SuggestOption[]>(() => {
    const names = new Map<string, string>();
    for (const n of [userName, ...otherAccounts.map((a) => a.accountHolder)]) {
      const name = n.trim();
      if (name && !names.has(name.toLowerCase())) names.set(name.toLowerCase(), name);
    }
    return [...names.values()].map((value) => ({ value }));
  }, [userName, otherAccounts]);

  // Nominee suggestions: nominees, joint holders and holders from other
  // accounts; the hint carries a known relation so picking one fills it.
  const nomineeOptions = useMemo<SuggestOption[]>(() => {
    const byName = new Map<string, SuggestOption>();
    const add = (raw: string | null, relation: string | null) => {
      const name = raw?.trim();
      if (!name) return;
      const key = name.toLowerCase();
      const prev = byName.get(key);
      if (!prev || (!prev.hint && relation)) byName.set(key, { value: name, hint: relation ?? undefined });
    };
    for (const a of otherAccounts) {
      add(a.nomineeName, a.nomineeRelation);
      for (const j of a.jointHolders) add(j, null);
      add(a.accountHolder, null);
    }
    return [...byName.values()];
  }, [otherAccounts]);

  useEffect(() => {
    if (open) {
      const next = initial ? fromAccount(initial) : emptyForm(userName);
      setForm(next);
      setJointHoldersText((next.jointHolders ?? []).join(', '));
      setAccountNumber('');
      setErrors({});
      setIfscLookup('idle');
      setCustomerIdSource(null);
      const [month = '', year = ''] = (next.debitCardExpiry ?? '').split('/');
      setExpMonth(month);
      setExpYear(year);
      lastLookedUp.current = null;
    }
  }, [open, initial, userName]);

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

  /**
   * A recognised bank pre-fills the IFSC prefix (when IFSC is empty) and the
   * customer ID from another account at the same bank — CIFs are per bank,
   * not per account.
   */
  function withBankAutofill(f: CreateBankAccountInput, bankName: string): CreateBankAccountInput {
    const next = { ...f, bankName };
    const bank = findBankByName(bankName);
    if (bank && !f.ifsc) next.ifsc = `${bank.ifscPrefix}0`;
    if (!f.customerId?.trim()) {
      const key = bankName.trim().toLowerCase();
      const sibling = otherAccounts.find(
        (a) => a.customerId && a.bankName.trim().toLowerCase() === key,
      );
      if (sibling) next.customerId = sibling.customerId;
    }
    return next;
  }

  function applyForm(next: CreateBankAccountInput, bankName: string) {
    if (next.customerId !== form.customerId) setCustomerIdSource(bankName);
    setForm(next);
  }

  function onBankChange(v: string) {
    const known = findBankByName(v);
    if (known) applyForm(withBankAutofill(form, known.name), known.name);
    else set('bankName', v);
  }

  function onIfscChange(raw: string) {
    const code = raw.toUpperCase().replace(/\s/g, '');
    let next: CreateBankAccountInput = { ...form, ifsc: code || null };
    // The first four letters identify the bank — no network needed.
    const bank = bankForIfsc(code);
    if (bank && !form.bankName.trim()) next = withBankAutofill(next, bank.name);
    applyForm(next, next.bankName);
    setIfscLookup('idle');
    if (IFSC_RE.test(code)) void autofillFromIfsc(code);
  }

  /**
   * A complete IFSC pulls branch name + address. A new account only fills
   * empty fields; editing an account to a different IFSC replaces them, since
   * the old branch no longer applies.
   */
  async function autofillFromIfsc(code: string) {
    if (code === lastLookedUp.current) return;
    lastLookedUp.current = code;
    const replace = !!initial && code !== (initial.ifsc ?? '').toUpperCase();

    setIfscLookup('loading');
    try {
      const info = await bankAccountsApi.lookupIfsc(code);
      if (lastLookedUp.current !== code) return; // user moved on to another IFSC
      setForm((f) => ({
        ...f,
        bankName: f.bankName.trim() ? f.bankName : (bankForIfsc(code)?.name ?? info.bank ?? ''),
        branch: (replace || !f.branch ? info.branch : f.branch) ?? f.branch,
        branchAddress: (replace || !f.branchAddress ? info.address : f.branchAddress) ?? f.branchAddress,
      }));
      setIfscLookup('idle');
    } catch (err) {
      if (lastLookedUp.current !== code) return;
      const status = (err as { response?: { status?: number } }).response?.status;
      setIfscLookup(status === 404 ? 'not_found' : 'failed');
    }
  }

  function onAccountNumberChange(v: string) {
    setAccountNumber(v);
    // Last 4 always follows the full number so the two can't disagree.
    const digits = v.replace(/\D/g, '');
    if (digits.length >= 4) set('last4', digits.slice(-4));
  }

  function onBalanceChange(v: string) {
    setForm((f) => ({
      ...f,
      currentBalance: v || null,
      balanceAsOf: v && !f.balanceAsOf ? localToday() : f.balanceAsOf,
    }));
  }

  function setExpiry(month: string, year: string) {
    setExpMonth(month);
    setExpYear(year);
    set('debitCardExpiry', month && year ? `${month}/${year}` : null);
  }

  const hasFullNumber = normaliseAccountNumber(accountNumber) !== '';
  const ifscCode = (form.ifsc ?? '').trim().toUpperCase();
  const ifscIsPrefixOnly = IFSC_PREFIX_ONLY_RE.test(ifscCode);

  function validate(): boolean {
    const errs: Record<string, string> = {};
    if (!form.bankName.trim()) errs['bankName'] = 'Required';
    if (!form.accountHolder.trim()) errs['accountHolder'] = 'Required';
    if (!form.last4 || !/^\d{4}$/.test(form.last4)) errs['last4'] = 'Must be 4 digits';
    if (hasFullNumber && !/^\d{6,18}$/.test(normaliseAccountNumber(accountNumber)))
      errs['accountNumber'] = 'Must be 6–18 digits';
    if (ifscCode && !ifscIsPrefixOnly && !IFSC_RE.test(ifscCode))
      errs['ifsc'] = '11 characters, e.g. HDFC0001234';
    if (!form.customerId?.trim()) errs['customerId'] = 'Required';
    if (form.debitCardLast4 && !/^\d{4}$/.test(form.debitCardLast4))
      errs['debitCardLast4'] = 'Must be 4 digits';
    if (!!expMonth !== !!expYear) errs['debitCardExpiry'] = 'Pick both month and year';
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
      ...(hasFullNumber ? { accountNumber: normaliseAccountNumber(accountNumber) } : {}),
      bankName: form.bankName.trim(),
      accountHolder: form.accountHolder.trim(),
      jointHolders,
      customerId: form.customerId?.trim() || null,
      // A bare "HDFC0" left by the Bank picker means "IFSC not entered".
      ifsc: ifscCode && !ifscIsPrefixOnly ? ifscCode : null,
      branch: form.branch?.trim() || null,
      branchAddress: form.branchAddress?.trim() || null,
      nickname: form.nickname?.trim() || null,
      nomineeName: form.nomineeName?.trim() || null,
      nomineeRelation: form.nomineeRelation?.trim() || null,
      debitCardLast4: form.debitCardLast4?.trim() || null,
      debitCardExpiry: form.debitCardExpiry,
      currentBalance: form.currentBalance?.trim() || null,
    });
  }

  const errorText = (key: string) =>
    errors[key] ? <p className="text-xs text-negative mt-1">{errors[key]}</p> : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit bank account' : 'Add bank account'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor={fid('bank')}>Bank *</Label>
              <SuggestInput
                id={fid('bank')}
                placeholder="Search HDFC, SBI, Kotak…"
                value={form.bankName}
                onValueChange={onBankChange}
                options={BANK_OPTIONS}
                className={errors['bankName'] ? 'border-negative' : ''}
              />
              {errorText('bankName')}
            </div>
            <div>
              <Label htmlFor={fid('type')}>Type</Label>
              <Select
                id={fid('type')}
                className="mt-1"
                value={form.accountType}
                onChange={(e) => set('accountType', e.target.value as CreateBankAccountInput['accountType'])}
              >
                {ACCOUNT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t.charAt(0) + t.slice(1).toLowerCase()}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor={fid('holder')}>Account holder *</Label>
              <SuggestInput
                id={fid('holder')}
                placeholder="Name on account"
                value={form.accountHolder}
                onValueChange={(v) => set('accountHolder', v)}
                options={holderOptions}
                className={errors['accountHolder'] ? 'border-negative' : ''}
              />
              {errorText('accountHolder')}
            </div>
            <div>
              <Label htmlFor={fid('last4')}>Last 4 digits *</Label>
              <Input
                id={fid('last4')}
                placeholder="1234"
                maxLength={4}
                inputMode="numeric"
                value={form.last4}
                onChange={(e) => set('last4', e.target.value)}
                readOnly={hasFullNumber}
                title={hasFullNumber ? 'Taken from the full account number' : undefined}
                className={`${errors['last4'] ? 'border-negative' : ''} ${hasFullNumber ? 'bg-muted/50' : ''}`}
              />
              {errorText('last4')}
            </div>
          </div>

          <div>
            <Label htmlFor={fid('number')}>Full account number (optional)</Label>
            <Input
              id={fid('number')}
              placeholder={
                initial?.hasAccountNumber ? 'Saved — type a new one to replace it' : '50100123456789'
              }
              inputMode="numeric"
              autoComplete="off"
              spellCheck={false}
              value={accountNumber}
              onChange={(e) => onAccountNumberChange(e.target.value)}
              className={errors['accountNumber'] ? 'border-negative' : ''}
            />
            {errorText('accountNumber') ?? (
              <p className="text-xs text-muted-foreground mt-1">
                Stored encrypted. Cards show only the last 4 digits until you tap the eye.
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor={fid('ifsc')}>IFSC</Label>
              <Input
                id={fid('ifsc')}
                placeholder="HDFC0001234"
                maxLength={11}
                autoCapitalize="characters"
                autoComplete="off"
                spellCheck={false}
                value={form.ifsc ?? ''}
                onChange={(e) => onIfscChange(e.target.value)}
                className={errors['ifsc'] ? 'border-negative' : ''}
              />
              {errorText('ifsc') ??
                (ifscLookup === 'loading' ? (
                  <p className="text-xs text-muted-foreground mt-1">Looking up branch…</p>
                ) : ifscLookup === 'not_found' ? (
                  <p className="text-xs text-amber-600 mt-1">IFSC not found — check the code.</p>
                ) : ifscLookup === 'failed' ? (
                  <p className="text-xs text-muted-foreground mt-1">
                    Couldn't look up the branch. Fill it in below.
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground mt-1">
                    Fills bank, branch and address.
                  </p>
                ))}
            </div>
            <div>
              <Label htmlFor={fid('branch')}>Branch</Label>
              <Input
                id={fid('branch')}
                placeholder="Andheri East"
                value={form.branch ?? ''}
                onChange={(e) => set('branch', e.target.value || null)}
              />
            </div>
          </div>

          <div>
            <Label htmlFor={fid('address')}>Branch address</Label>
            <Input
              id={fid('address')}
              placeholder="Filled from the IFSC — edit if needed"
              value={form.branchAddress ?? ''}
              onChange={(e) => set('branchAddress', e.target.value || null)}
            />
          </div>

          <div>
            <Label htmlFor={fid('cif')}>Customer ID *</Label>
            <Input
              id={fid('cif')}
              placeholder="Bank-issued CIF / Customer ID"
              value={form.customerId ?? ''}
              onChange={(e) => {
                set('customerId', e.target.value || null);
                setCustomerIdSource(null);
              }}
              className={errors['customerId'] ? 'border-negative' : ''}
            />
            {errorText('customerId') ??
              (customerIdSource && form.customerId ? (
                <p className="text-xs text-muted-foreground mt-1">
                  From your other {customerIdSource} account.
                </p>
              ) : null)}
          </div>

          <div>
            <Label htmlFor={fid('nickname')}>Nickname (optional)</Label>
            <Input
              id={fid('nickname')}
              placeholder="Primary salary, Emergency fund…"
              value={form.nickname ?? ''}
              onChange={(e) => set('nickname', e.target.value || null)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor={fid('balance')}>Current balance (₹)</Label>
              <Input
                id={fid('balance')}
                placeholder="100000"
                inputMode="decimal"
                value={form.currentBalance ?? ''}
                onChange={(e) => onBalanceChange(e.target.value)}
                className={errors['currentBalance'] ? 'border-negative' : ''}
              />
              {errorText('currentBalance')}
            </div>
            <div>
              <Label htmlFor={fid('asof')}>As of</Label>
              <Input
                id={fid('asof')}
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
                <Label htmlFor={fid('nominee')}>Nominee name</Label>
                <SuggestInput
                  id={fid('nominee')}
                  value={form.nomineeName ?? ''}
                  onValueChange={(v) => set('nomineeName', v || null)}
                  options={nomineeOptions}
                  onPick={(o) =>
                    setForm((f) => ({
                      ...f,
                      nomineeName: o.value,
                      nomineeRelation: f.nomineeRelation || o.hint || null,
                    }))
                  }
                />
              </div>
              <div>
                <Label htmlFor={fid('relation')}>Relation</Label>
                <SuggestInput
                  id={fid('relation')}
                  placeholder="Spouse, Parent…"
                  value={form.nomineeRelation ?? ''}
                  onValueChange={(v) => set('nomineeRelation', v || null)}
                  options={RELATION_OPTIONS}
                  maxResults={RELATION_OPTIONS.length}
                />
              </div>
            </div>
            <div>
              <Label htmlFor={fid('joint')}>Joint holders (comma-separated)</Label>
              <Input
                id={fid('joint')}
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
                <Label htmlFor={fid('card4')}>Card last 4</Label>
                <Input
                  id={fid('card4')}
                  placeholder="5678"
                  maxLength={4}
                  inputMode="numeric"
                  value={form.debitCardLast4 ?? ''}
                  onChange={(e) => set('debitCardLast4', e.target.value || null)}
                  className={errors['debitCardLast4'] ? 'border-negative' : ''}
                />
                {errorText('debitCardLast4')}
              </div>
              <div>
                <Label htmlFor={fid('expmonth')}>Expiry</Label>
                <div className="mt-1 flex gap-2">
                  <Select
                    id={fid('expmonth')}
                    aria-label="Card expiry month"
                    value={expMonth}
                    onChange={(e) => setExpiry(e.target.value, expYear)}
                    className={errors['debitCardExpiry'] ? 'border-negative' : ''}
                  >
                    <option value="">MM</option>
                    {MONTHS.map((m) => (
                      <option key={m.value} value={m.value}>
                        {m.label}
                      </option>
                    ))}
                  </Select>
                  <Select
                    aria-label="Card expiry year"
                    value={expYear}
                    onChange={(e) => setExpiry(expMonth, e.target.value)}
                    className={errors['debitCardExpiry'] ? 'border-negative' : ''}
                  >
                    <option value="">YY</option>
                    {expiryYears(expYear).map((y) => (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    ))}
                  </Select>
                </div>
                {errorText('debitCardExpiry')}
              </div>
            </div>
          </div>

          <div>
            <Label htmlFor={fid('status')}>Status</Label>
            <Select
              id={fid('status')}
              className="mt-1"
              value={form.status}
              onChange={(e) => set('status', e.target.value as CreateBankAccountInput['status'])}
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s.charAt(0) + s.slice(1).toLowerCase()}
                </option>
              ))}
            </Select>
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
