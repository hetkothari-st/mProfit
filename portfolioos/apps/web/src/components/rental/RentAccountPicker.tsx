import { useQuery } from '@tanstack/react-query';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { bankAccountsApi } from '@/api/bankAccounts.api';

/**
 * Which account a tenant's rent lands in. Knowing it is what turns a rent
 * receipt into money moving through a named bank — in the app's cash flow and
 * in the Tally export, where an unattributed receipt otherwise sits in
 * suspense.
 */
export function RentAccountPicker({
  value,
  onChange,
  label = 'Rent credited to',
  hint,
}: {
  value: string | null | undefined;
  onChange: (bankAccountId: string | null) => void;
  label?: string;
  hint?: string;
}) {
  const { data: accounts, isLoading } = useQuery({
    queryKey: ['bank-accounts'],
    queryFn: () => bankAccountsApi.list(),
  });

  const open = (accounts ?? []).filter((a) => a.status !== 'CLOSED');

  return (
    <div>
      <Label>{label}</Label>
      <Select
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value || null)}
        disabled={isLoading}
      >
        <option value="">Not tracked</option>
        {open.map((a) => (
          <option key={a.id} value={a.id}>
            {a.nickname?.trim() || `${a.bankName} ${a.accountType.toLowerCase()}`} ••{a.last4}
          </option>
        ))}
      </Select>
      <p className="text-[10px] text-muted-foreground mt-1">
        {hint ??
          (open.length === 0
            ? 'Add a bank account first to track where this rent lands.'
            : 'Rent then shows as a credit to this account, here and in the Tally export.')}
      </p>
    </div>
  );
}
