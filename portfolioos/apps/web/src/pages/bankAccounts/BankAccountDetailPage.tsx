import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ArrowLeft, ArrowDownRight, ArrowUpRight, Loader2, Pencil, Plus, Trash2 } from 'lucide-react';
import { Decimal, formatINR } from '@portfolioos/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { bankAccountsApi } from '@/api/bankAccounts.api';
import { BankAccountVisual } from '@/components/bankAccounts/BankAccountVisual';
import { BankAccountDialog } from './BankAccountDialog';
import { usePrivacyStore } from '@/stores/privacy.store';

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-2 border-b border-border/40 last:border-0">
      <span className="text-xs uppercase tracking-wider text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-right">{value || '—'}</span>
    </div>
  );
}

function AddSnapshotDialog({
  accountId,
  open,
  onOpenChange,
}: {
  accountId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const [asOfDate, setAsOfDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [balance, setBalance] = useState('');
  const [note, setNote] = useState('');

  const mutation = useMutation({
    mutationFn: () =>
      bankAccountsApi.addSnapshot(accountId, {
        asOfDate,
        balance,
        source: 'manual',
        note: note || null,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bank-account', accountId] });
      qc.invalidateQueries({ queryKey: ['bank-accounts'] });
      toast.success('Balance recorded');
      setBalance('');
      setNote('');
      onOpenChange(false);
    },
    onError: () => toast.error('Failed to save snapshot'),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Record balance</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>As of</Label>
            <Input type="date" value={asOfDate} onChange={(e) => setAsOfDate(e.target.value)} />
          </div>
          <div>
            <Label>Balance (₹)</Label>
            <Input
              placeholder="123456.78"
              value={balance}
              onChange={(e) => setBalance(e.target.value)}
            />
          </div>
          <div>
            <Label>Note (optional)</Label>
            <Input
              placeholder="Monthly statement, etc."
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={
              mutation.isPending || !balance || !/^-?\d+(\.\d+)?$/.test(balance)
            }
          >
            {mutation.isPending ? 'Saving…' : 'Record'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function BankAccountDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const hideSensitive = usePrivacyStore((s) => s.hideSensitive);
  const [editOpen, setEditOpen] = useState(false);
  const [snapshotOpen, setSnapshotOpen] = useState(false);

  const { data: account, isLoading } = useQuery({
    queryKey: ['bank-account', id],
    queryFn: () => bankAccountsApi.get(id!),
    enabled: !!id,
  });

  const { data: cashflows = [] } = useQuery({
    queryKey: ['bank-account-cashflows', id],
    queryFn: () => bankAccountsApi.cashFlows(id!, 50),
    enabled: !!id,
  });

  const deleteSnapshot = useMutation({
    mutationFn: (snapshotId: string) => bankAccountsApi.deleteSnapshot(snapshotId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['bank-account', id] }),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!account) {
    return (
      <div className="py-20 text-center text-muted-foreground">
        Account not found.
        <div className="mt-4">
          <Button variant="ghost" onClick={() => navigate('/bank-accounts')}>
            Back to bank accounts
          </Button>
        </div>
      </div>
    );
  }

  const snapshots = [...(account.snapshots ?? [])].sort((a, b) =>
    a.asOfDate.localeCompare(b.asOfDate),
  );

  // Recharts requires a JS number for plotting. We compute the float once at
  // the Recharts boundary via Decimal.toNumber() (preserving the canonical
  // string for the tooltip's formatINR call below). Per §3.2, JS number math
  // is acceptable for display-only — no totals are derived from `n`.
  const chartData = snapshots.map((s) => ({
    date: s.asOfDate.slice(0, 10),
    balance: new Decimal(s.balance).toNumber(),
    balanceStr: s.balance,
  }));

  return (
    <div>
      {/* Back nav */}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => navigate('/bank-accounts')}
        className="mb-4 -ml-2"
      >
        <ArrowLeft className="h-4 w-4" /> All accounts
      </Button>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,420px)_1fr] gap-8 mb-8">
        {/* Hero: passbook visual + quick actions */}
        <div className="space-y-3">
          <BankAccountVisual account={account} size="lg" />
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
              <Pencil className="h-3.5 w-3.5" /> Edit
            </Button>
            <Button variant="outline" size="sm" onClick={() => setSnapshotOpen(true)}>
              <Plus className="h-3.5 w-3.5" /> Record balance
            </Button>
          </div>
        </div>

        {/* Right column: detail grid */}
        <div className="space-y-4">
          <Card>
            <CardContent className="px-5 py-4">
              <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium mb-1">
                Available balance
              </p>
              <p
                className={`text-4xl font-semibold tabular-nums ${hideSensitive ? 'money-digits' : ''}`}
              >
                {account.currentBalance ? formatINR(account.currentBalance) : '—'}
              </p>
              {account.balanceAsOf && (
                <p className="text-xs text-muted-foreground mt-1">
                  As of{' '}
                  {new Date(account.balanceAsOf).toLocaleDateString('en-IN', {
                    day: '2-digit',
                    month: 'short',
                    year: 'numeric',
                  })}
                  {account.balanceSource === 'auto_event' && (
                    <span className="ml-2 inline-flex items-center gap-1 text-positive">
                      <span className="h-1.5 w-1.5 rounded-full bg-positive animate-pulse" />
                      live from Gmail
                    </span>
                  )}
                </p>
              )}
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Card>
              <CardContent className="px-5 py-4">
                <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium mb-2">
                  Bank details
                </p>
                <DetailRow label="Bank" value={account.bankName} />
                <DetailRow label="Type" value={account.accountType} />
                <DetailRow label="IFSC" value={account.ifsc} />
                <DetailRow label="Branch" value={account.branch} />
                <DetailRow label="Status" value={account.status} />
              </CardContent>
            </Card>
            <Card>
              <CardContent className="px-5 py-4">
                <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium mb-2">
                  Holder & nominee
                </p>
                <DetailRow label="Holder" value={account.accountHolder} />
                <DetailRow
                  label="Joint"
                  value={account.jointHolders.length ? account.jointHolders.join(', ') : null}
                />
                <DetailRow label="Nominee" value={account.nomineeName} />
                <DetailRow label="Relation" value={account.nomineeRelation} />
              </CardContent>
            </Card>
            {(account.debitCardLast4 || account.debitCardExpiry) && (
              <Card className="sm:col-span-2">
                <CardContent className="px-5 py-4">
                  <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium mb-2">
                    Linked debit card
                  </p>
                  <div className="flex items-baseline gap-6">
                    <DetailRow
                      label="Card last 4"
                      value={account.debitCardLast4 ? `•••• ${account.debitCardLast4}` : null}
                    />
                    <DetailRow label="Expires" value={account.debitCardExpiry} />
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>

      {/* Balance history chart */}
      {chartData.length > 1 && (
        <div className="mb-8">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">
            Balance history
          </h2>
          <Card>
            <CardContent className="px-2 py-3">
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData}>
                    <defs>
                      <linearGradient id="balanceGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="hsl(var(--accent))" stopOpacity={0.4} />
                        <stop offset="100%" stopColor="hsl(var(--accent))" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 11 }}
                      tickFormatter={(v) =>
                        new Date(v).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
                      }
                    />
                    <YAxis
                      tick={{ fontSize: 11 }}
                      tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`}
                      width={60}
                    />
                    <Tooltip
                      formatter={(_v: number, _name, item) => {
                        // Use the canonical Decimal string we stashed on each
                        // datum so the tooltip is always exact, even when the
                        // Recharts-visible `v` has been through IEEE-754.
                        const str =
                          (item?.payload as { balanceStr?: string } | undefined)?.balanceStr ??
                          String(_v);
                        return formatINR(str);
                      }}
                      labelFormatter={(v) =>
                        new Date(v).toLocaleDateString('en-IN', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                        })
                      }
                      contentStyle={{
                        background: 'hsl(var(--card))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '6px',
                        fontSize: '12px',
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="balance"
                      stroke="hsl(var(--accent))"
                      strokeWidth={2}
                      fill="url(#balanceGradient)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Snapshots table */}
      {snapshots.length > 0 && (
        <div className="mb-8">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">
            Recorded balances
          </h2>
          <div className="rounded-md border overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40">
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Date</th>
                  <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">
                    Balance
                  </th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">
                    Source
                  </th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Note</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {[...snapshots].reverse().map((s) => (
                  <tr key={s.id} className="border-b last:border-0 hover:bg-muted/20">
                    <td className="px-4 py-2.5 text-muted-foreground">
                      {new Date(s.asOfDate).toLocaleDateString('en-IN', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-medium">
                      {formatINR(s.balance)}
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground capitalize">
                      {s.source.replace('_', ' ')}
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">{s.note ?? '—'}</td>
                    <td className="px-4 py-2.5 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                        onClick={() => deleteSnapshot.mutate(s.id)}
                        disabled={deleteSnapshot.isPending}
                        title="Delete"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Cash activity attributed to this account */}
      {cashflows.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">
            Recent activity
          </h2>
          <div className="rounded-md border overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40">
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Date</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">
                    Description
                  </th>
                  <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">
                    Amount
                  </th>
                </tr>
              </thead>
              <tbody>
                {cashflows.map((cf) => {
                  const isInflow = cf.type === 'INFLOW';
                  return (
                    <tr key={cf.id} className="border-b last:border-0 hover:bg-muted/20">
                      <td className="px-4 py-2.5 text-muted-foreground whitespace-nowrap">
                        {new Date(cf.date).toLocaleDateString('en-IN', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          {isInflow ? (
                            <ArrowDownRight className="h-3.5 w-3.5 text-positive shrink-0" />
                          ) : (
                            <ArrowUpRight className="h-3.5 w-3.5 text-negative shrink-0" />
                          )}
                          <span className="truncate">{cf.description ?? '—'}</span>
                        </div>
                      </td>
                      <td
                        className={`px-4 py-2.5 text-right tabular-nums font-medium ${
                          isInflow ? 'text-positive' : 'text-negative'
                        }`}
                      >
                        {isInflow ? '+' : '−'}
                        {formatINR(new Decimal(cf.amount).abs().toString())}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <BankAccountDialog open={editOpen} onOpenChange={setEditOpen} initial={account} />
      <AddSnapshotDialog accountId={account.id} open={snapshotOpen} onOpenChange={setSnapshotOpen} />
    </div>
  );
}
