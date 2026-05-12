import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  Landmark,
  Plus,
  ArrowUpRight,
  Loader2,
  Trash2,
  Pencil,
} from 'lucide-react';
import { Decimal, formatINR } from '@portfolioos/shared';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/common/EmptyState';
import { bankAccountsApi, type BankAccountDTO } from '@/api/bankAccounts.api';
import { BankAccountVisual } from '@/components/bankAccounts/BankAccountVisual';
import { BankAccountDialog } from './BankAccountDialog';

const STATUS_TONE: Record<string, string> = {
  ACTIVE: 'text-positive',
  DORMANT: 'text-amber-600',
  CLOSED: 'text-muted-foreground',
};

function SummaryStrip({ accounts }: { accounts: BankAccountDTO[] }) {
  const active = accounts.filter((a) => a.status === 'ACTIVE');
  const totalBalance = active.reduce(
    (s, a) => (a.currentBalance ? s.plus(new Decimal(a.currentBalance)) : s),
    new Decimal(0),
  );
  const dormantOrClosed = accounts.length - active.length;

  return (
    <div className="grid grid-cols-3 gap-3 mb-6">
      {[
        {
          label: 'Total balance',
          value: formatINR(totalBalance.toString()),
          sub: `across ${active.length} active account${active.length === 1 ? '' : 's'}`,
        },
        {
          label: 'Active accounts',
          value: String(active.length),
          sub: 'with known balances',
        },
        {
          label: 'Inactive',
          value: String(dormantOrClosed),
          sub: 'dormant or closed',
          className: dormantOrClosed > 0 ? 'text-muted-foreground' : '',
        },
      ].map((m) => (
        <Card key={m.label}>
          <CardContent className="px-4 py-3">
            <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">
              {m.label}
            </p>
            <p className={`text-xl font-semibold tabular-nums mt-1 ${m.className ?? ''}`}>
              {m.value}
            </p>
            <p className="text-xs text-muted-foreground">{m.sub}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function AccountTile({
  account,
  onEdit,
  onDelete,
  isDeleting,
}: {
  account: BankAccountDTO;
  onEdit: () => void;
  onDelete: () => void;
  isDeleting: boolean;
}) {
  return (
    <div className="group relative">
      <div className="absolute top-2 right-2 z-10 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0 bg-black/30 backdrop-blur text-white hover:bg-black/50 hover:text-white"
          onClick={onEdit}
          title="Edit"
        >
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0 bg-black/30 backdrop-blur text-white hover:bg-negative/80 hover:text-white"
          onClick={onDelete}
          disabled={isDeleting}
          title="Delete"
        >
          {isDeleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
        </Button>
        <Button
          asChild
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0 bg-black/30 backdrop-blur text-white hover:bg-black/50 hover:text-white"
          title="Open"
        >
          <Link to={`/bank-accounts/${account.id}`}>
            <ArrowUpRight className="h-4 w-4" />
          </Link>
        </Button>
      </div>

      <Link
        to={`/bank-accounts/${account.id}`}
        className="block hover:-translate-y-0.5 transition-transform"
      >
        <BankAccountVisual account={account} />
      </Link>

      <div className="mt-3 px-1 space-y-1.5">
        {account.ifsc && (
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">IFSC</span>
            <span className="font-mono tabular-nums tracking-wide">{account.ifsc}</span>
          </div>
        )}
        {account.branch && (
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Branch</span>
            <span className="truncate max-w-[180px]" title={account.branch}>
              {account.branch}
            </span>
          </div>
        )}
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Status</span>
          <span className={`font-medium capitalize ${STATUS_TONE[account.status] ?? ''}`}>
            {account.status.toLowerCase()}
          </span>
        </div>
        {account.balanceAsOf && (
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">As of</span>
            <span className="text-muted-foreground">
              {new Date(account.balanceAsOf).toLocaleDateString('en-IN', {
                day: '2-digit',
                month: 'short',
                year: 'numeric',
              })}
              {account.balanceSource === 'auto_event' && (
                <span className="ml-1.5 text-[10px] text-positive">· live</span>
              )}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

export function BankAccountListPage() {
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<BankAccountDTO | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const { data: accounts = [], isLoading } = useQuery({
    queryKey: ['bank-accounts'],
    queryFn: () => bankAccountsApi.list(),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => bankAccountsApi.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bank-accounts'] });
      toast.success('Account deleted');
      setConfirmDeleteId(null);
    },
    onError: () => toast.error('Failed to delete account'),
  });

  function openAdd() {
    setEditing(null);
    setDialogOpen(true);
  }
  function openEdit(account: BankAccountDTO) {
    setEditing(account);
    setDialogOpen(true);
  }

  return (
    <div>
      <PageHeader
        title="Bank Accounts"
        description="Your savings, current, and salary accounts in one place — branch, IFSC, balance, nominee, and linked debit card details."
        actions={
          <Button onClick={openAdd}>
            <Plus className="h-4 w-4" /> Add account
          </Button>
        }
      />

      {isLoading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="aspect-[1.586/1] rounded-xl bg-muted/40 animate-pulse" />
          ))}
        </div>
      )}

      {!isLoading && accounts.length === 0 && (
        <EmptyState
          icon={Landmark}
          title="No bank accounts yet"
          description="Add your first bank account to see balances, branch details, and linked transactions."
          action={
            <Button onClick={openAdd}>
              <Plus className="h-4 w-4" /> Add first account
            </Button>
          }
        />
      )}

      {!isLoading && accounts.length > 0 && (
        <>
          <SummaryStrip accounts={accounts} />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-5 gap-y-7">
            {accounts.map((a) => (
              <div key={a.id}>
                {confirmDeleteId === a.id ? (
                  <div className="aspect-[1.586/1] rounded-xl border border-destructive/40 bg-destructive/5 flex flex-col items-center justify-center gap-3 p-4">
                    <p className="text-sm text-center">
                      Delete <span className="font-medium">{a.bankName}</span> account ending{' '}
                      <span className="font-mono">{a.last4}</span>?
                    </p>
                    <div className="flex gap-2">
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => deleteMutation.mutate(a.id)}
                        disabled={deleteMutation.isPending}
                      >
                        {deleteMutation.isPending ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          'Delete'
                        )}
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setConfirmDeleteId(null)}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <AccountTile
                    account={a}
                    onEdit={() => openEdit(a)}
                    onDelete={() => setConfirmDeleteId(a.id)}
                    isDeleting={deleteMutation.isPending && confirmDeleteId === a.id}
                  />
                )}
              </div>
            ))}
          </div>
        </>
      )}

      <BankAccountDialog
        open={dialogOpen}
        onOpenChange={(v) => {
          setDialogOpen(v);
          if (!v) setEditing(null);
        }}
        initial={editing}
      />
    </div>
  );
}
