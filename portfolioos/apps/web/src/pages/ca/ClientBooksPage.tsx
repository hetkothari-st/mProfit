import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, BookOpen, Scale, ScrollText, Plus, Pencil, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/common/EmptyState';
import { cn } from '@/lib/cn';
import { caApi, type CaAccountRow } from '@/api/ca.api';
import { apiErrorMessage } from '@/api/client';
import { CaActivityFeed } from '@/components/ca/CaActivityFeed';
import { AccountFormDialog } from '@/components/ca/AccountFormDialog';
import { VoucherFormDialog } from '@/components/ca/VoucherFormDialog';

/**
 * One client's books, as kept by their CA.
 *
 * The header states which kind of client this is, and that is load-bearing
 * rather than decorative. Everything here belongs to somebody else; for a
 * consented client they can read every change and end the arrangement, and
 * for a managed record nobody but the CA can see any of it. A CA should never
 * have to guess which, so the page says so instead of implying it.
 */

type Tab = 'accounts' | 'vouchers' | 'trial-balance' | 'activity';

const TABS: { key: Tab; label: string }[] = [
  { key: 'accounts', label: 'Chart of accounts' },
  { key: 'vouchers', label: 'Vouchers' },
  { key: 'trial-balance', label: 'Trial balance' },
  { key: 'activity', label: 'Activity' },
];

export function ClientBooksPage() {
  const { clientId = '' } = useParams();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>('accounts');
  const [accountDialog, setAccountDialog] = useState<{ open: boolean; account: CaAccountRow | null }>(
    { open: false, account: null },
  );
  const [voucherOpen, setVoucherOpen] = useState(false);

  const removeAccount = useMutation({
    mutationFn: (id: string) => caApi.deleteAccount(clientId, id),
    onSuccess: () => {
      toast.success('Account deleted');
      qc.invalidateQueries({ queryKey: ['ca', clientId] });
    },
    onError: (e) => toast.error(apiErrorMessage(e, 'Could not delete the account')),
  });

  const removeVoucher = useMutation({
    mutationFn: (id: string) => caApi.deleteVoucher(clientId, id),
    onSuccess: () => {
      toast.success('Voucher deleted');
      qc.invalidateQueries({ queryKey: ['ca', clientId] });
    },
    onError: (e) => toast.error(apiErrorMessage(e, 'Could not delete the voucher')),
  });

  const { data: clients } = useQuery({
    queryKey: ['ca', 'clients'],
    queryFn: () => caApi.listClients(),
  });
  const client = (clients ?? []).find((c) => c.id === clientId) ?? null;

  const accounts = useQuery({
    queryKey: ['ca', clientId, 'accounts'],
    queryFn: () => caApi.accountsFlat(clientId),
    enabled: tab === 'accounts' && !!clientId,
  });

  const vouchers = useQuery({
    queryKey: ['ca', clientId, 'vouchers'],
    queryFn: () => caApi.vouchers(clientId),
    enabled: tab === 'vouchers' && !!clientId,
  });

  const trialBalance = useQuery({
    queryKey: ['ca', clientId, 'trial-balance'],
    queryFn: () => caApi.trialBalance(clientId),
    enabled: tab === 'trial-balance' && !!clientId,
  });

  const activity = useQuery({
    queryKey: ['ca', clientId, 'activity'],
    queryFn: () => caApi.activity(clientId),
    enabled: tab === 'activity' && !!clientId,
  });

  return (
    <div>
      <Button asChild variant="ghost" size="sm" className="mb-3 -ml-2 text-muted-foreground">
        <Link to="/ca">
          <ArrowLeft className="h-3.5 w-3.5" /> All clients
        </Link>
      </Button>

      <PageHeader
        eyebrow="Client books"
        title={client?.name ?? 'Client'}
        description={
          client?.kind === 'INVITED'
            ? 'This client granted you access from their own account. They can see everything you do here, and withdraw access at any time.'
            : 'A record you manage. This client has no account of their own, so nobody but you can see these books.'
        }
      />

      <div className="mb-4 flex gap-1 overflow-x-auto border-b border-border scrollbar-none">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={cn(
              'shrink-0 border-b-2 px-3 py-2 text-[13px] transition-colors focus-ring',
              tab === t.key
                ? 'border-accent text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'accounts' && (
        <>
          <div className="mb-3 flex justify-end">
            <Button size="sm" onClick={() => setAccountDialog({ open: true, account: null })}>
              <Plus className="h-4 w-4" /> New account
            </Button>
          </div>
          <LedgerTable
          loading={accounts.isLoading}
          empty={{
            icon: BookOpen,
            title: 'No chart of accounts yet',
            description: 'A default chart is created the first time these books are opened.',
          }}
            columns={['Code', 'Account', 'Type']}
            rows={(accounts.data ?? []).map((a) => [a.code, a.name, a.type])}
            rowActions={(i) => {
              const a = (accounts.data ?? [])[i];
              if (!a) return null;
              return (
                <>
                  <RowButton
                    label={`Edit ${a.name}`}
                    onClick={() => setAccountDialog({ open: true, account: a })}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </RowButton>
                  <RowButton
                    label={`Delete ${a.name}`}
                    danger
                    disabled={removeAccount.isPending}
                    onClick={() => removeAccount.mutate(a.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </RowButton>
                </>
              );
            }}
          />
        </>
      )}

      {tab === 'vouchers' && (
        <>
          <div className="mb-3 flex justify-end">
            <Button size="sm" onClick={() => setVoucherOpen(true)}>
              <Plus className="h-4 w-4" /> Post voucher
            </Button>
          </div>
          <LedgerTable
          loading={vouchers.isLoading}
          empty={{
            icon: ScrollText,
            title: 'No vouchers',
            description: 'Vouchers appear here once posted, or once generated from the client’s activity.',
          }}
            columns={['No.', 'Type', 'Date', 'Narration']}
            rows={(vouchers.data ?? []).map((v) => [
              v.voucherNo,
              v.type,
              new Date(v.date).toLocaleDateString('en-IN', {
                day: '2-digit',
                month: 'short',
                year: 'numeric',
              }),
              v.narration ?? '—',
            ])}
            rowActions={(i) => {
              const v = (vouchers.data ?? [])[i];
              if (!v) return null;
              return (
                <RowButton
                  label={`Delete voucher ${v.voucherNo}`}
                  danger
                  disabled={removeVoucher.isPending}
                  onClick={() => removeVoucher.mutate(v.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </RowButton>
              );
            }}
          />
        </>
      )}

      {tab === 'trial-balance' && (
        <LedgerTable
          loading={trialBalance.isLoading}
          empty={{
            icon: Scale,
            title: 'Nothing to balance yet',
            description: 'The trial balance fills in once vouchers exist.',
          }}
          columns={['Code', 'Account', 'Debit', 'Credit']}
          numericFrom={2}
          rows={(trialBalance.data ?? []).map((r) => [r.code, r.name, r.debit, r.credit])}
        />
      )}

      <AccountFormDialog
        clientId={clientId}
        account={accountDialog.account}
        open={accountDialog.open}
        onOpenChange={(open) => setAccountDialog((d) => ({ ...d, open }))}
      />
      <VoucherFormDialog clientId={clientId} open={voucherOpen} onOpenChange={setVoucherOpen} />

      {tab === 'activity' && (
        <CaActivityFeed
          entries={activity.data ?? []}
          title="Everything you have done here"
          emptyLabel="You haven’t made any changes to these books yet."
        />
      )}
    </div>
  );
}

/** A small icon button for a table row. */
function RowButton({
  label,
  onClick,
  children,
  danger,
  disabled,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'grid h-7 w-7 place-items-center rounded-md text-muted-foreground/70 transition-colors focus-ring disabled:opacity-40',
        danger ? 'hover:bg-negative/10 hover:text-negative' : 'hover:bg-muted hover:text-foreground',
      )}
    >
      {children}
    </button>
  );
}

function LedgerTable({
  loading,
  columns,
  rows,
  empty,
  numericFrom,
  rowActions,
}: {
  loading: boolean;
  columns: string[];
  rows: Array<Array<string | null>>;
  empty: { icon: typeof BookOpen; title: string; description: string };
  /** Column index from which values are figures and should be right-aligned. */
  numericFrom?: number;
  /**
   * Actions for row `i`. Rendered in a trailing column that only exists when
   * this is supplied, so read-only tables keep their full width.
   */
  rowActions?: (index: number) => React.ReactNode;
}) {
  if (loading) {
    return (
      <Card className="overflow-hidden">
        <div className="divide-y divide-border/50">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-[44px] animate-pulse bg-muted/30" />
          ))}
        </div>
      </Card>
    );
  }

  if (rows.length === 0) {
    return <EmptyState icon={empty.icon} title={empty.title} description={empty.description} />;
  }

  return (
    <Card className="overflow-hidden">
      <CardContent className="overflow-x-auto p-0">
        <table className="w-full min-w-[520px]">
          <thead>
            <tr className="border-b border-border/60 bg-muted/40">
              {columns.map((c, i) => (
                <th
                  key={c}
                  className={cn(
                    'px-4 py-2 text-[10px] font-medium uppercase tracking-kerned text-foreground/70',
                    numericFrom !== undefined && i >= numericFrom ? 'text-right' : 'text-left',
                  )}
                >
                  {c}
                </th>
              ))}
              {rowActions && <th className="w-[88px] px-4 py-2" />}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, ri) => (
              <tr key={ri} className="border-b border-border/50 last:border-0 hover:bg-muted/25">
                {r.map((cell, ci) => (
                  <td
                    key={ci}
                    className={cn(
                      'px-4 py-2.5 text-[13px] text-foreground',
                      numericFrom !== undefined && ci >= numericFrom
                        ? 'numeric tabular-nums text-right'
                        : 'text-left',
                    )}
                  >
                    {cell ?? '—'}
                  </td>
                ))}
                {rowActions && (
                  <td className="px-4 py-2.5">
                    <div className="flex items-center justify-end gap-0.5">{rowActions(ri)}</div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
