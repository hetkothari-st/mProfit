// apps/web/src/pages/split/GroupPage.tsx
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { ArrowLeft, Plus, HandCoins, Trash2 } from 'lucide-react';
import { Decimal, toDecimal, formatDateIST, formatDateTimeIST } from '@everypaisa/shared';
import type { SplitExpenseDto, SplitGroupDto, SplitSettlementDto } from '@everypaisa/shared';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { splitErrorMessage } from './errors';
import { SPLIT_KEYS, splitApi } from '@/api/split.api';
import { formatSplitMoney, memberName, transferLabel } from '@/lib/splitFormat';
import { BalancePill } from './BalancePill';
import { AddExpenseDialog } from './AddExpenseDialog';
import { SettleUpDialog } from './SettleUpDialog';
import { ContactDialog } from './ContactDialog';
import { ConfirmDialog } from './ConfirmDialog';
import { LoadError } from './LoadError';
import { isNotFound } from './queryErrors';
import { activityText } from './SplitHomePage';

function myLine(e: SplitExpenseDto, myId: string | undefined, currency: string): string {
  if (!myId) return '';
  const paid = e.payers.filter((p) => p.memberId === myId).reduce((a, p) => a.plus(toDecimal(p.baseAmount)), new Decimal(0));
  const share = e.shares.filter((s) => s.memberId === myId).reduce((a, s) => a.plus(toDecimal(s.baseAmount)), new Decimal(0));
  const diff = paid.minus(share);
  if (diff.isZero()) return paid.isZero() ? 'not involved' : 'settled';
  return diff.gt(0) ? `you lent ${formatSplitMoney(diff, currency)}` : `you borrowed ${formatSplitMoney(diff.abs(), currency)}`;
}

type DayItem = { kind: 'expense'; e: SplitExpenseDto } | { kind: 'payment'; s: SplitSettlementDto };
const dayOf = (iso: string) => iso.slice(0, 10);

function ExpensesTab({ group, expenses, settlements, status, onRetry, onDeletePayment }: {
  group: SplitGroupDto; expenses: SplitExpenseDto[]; settlements: SplitSettlementDto[];
  status: 'pending' | 'error' | 'success'; onRetry: () => void; onDeletePayment: (s: SplitSettlementDto) => void;
}) {
  const me = group.members.find((m) => m.isMe);
  if (status === 'pending') return <p className="text-sm text-muted-foreground py-6 text-center">Loading…</p>;
  if (status === 'error') return <LoadError text="Couldn't load expenses." onRetry={onRetry} />;
  const payments = settlements.filter((s) => !s.deletedAt);
  if (expenses.length === 0 && payments.length === 0) return <p className="text-sm text-muted-foreground py-6 text-center">No expenses yet.</p>;
  // Group by day, newest first. The API returns each list ordered by date desc; expenses lead within a day.
  const byDay = new Map<string, DayItem[]>();
  const push = (date: string, item: DayItem) => { byDay.set(date, [...(byDay.get(date) ?? []), item]); };
  for (const e of expenses) push(dayOf(e.date), { kind: 'expense', e });
  for (const s of payments) push(dayOf(s.date), { kind: 'payment', s });
  const days = [...byDay.entries()].sort((a, b) => (a[0] < b[0] ? 1 : a[0] > b[0] ? -1 : 0));
  return (
    <div className="space-y-3">
      {days.map(([date, items]) => (
        <section key={date}>
          <h3 data-testid="expense-day" className="px-1 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{formatDateIST(`${date}T00:00:00+05:30`)}</h3>
          <Card><CardContent className="p-0 divide-y">
            {items.map((it) => it.kind === 'expense' ? (
              <Link key={it.e.id} to={`/split/expenses/${it.e.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-muted/40">
                <div className="min-w-0">
                  <p className="font-medium truncate">{it.e.description}</p>
                  <p className="text-xs text-muted-foreground">
                    {it.e.payers.length === 1 ? `${memberName(group.members, it.e.payers[0]!.memberId)} paid` : `${it.e.payers.length} people paid`} {formatSplitMoney(it.e.amount, it.e.currency)}
                  </p>
                </div>
                <span className="text-sm text-muted-foreground whitespace-nowrap">{myLine(it.e, me?.id, group.baseCurrency)}</span>
              </Link>
            ) : (
              <div key={it.s.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0 flex items-center gap-2">
                  <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase text-muted-foreground">Payment</span>
                  <p className="text-sm truncate">{`${memberName(group.members, it.s.fromMemberId)} paid ${memberName(group.members, it.s.toMemberId)} ${formatSplitMoney(it.s.baseAmount, group.baseCurrency)}`}</p>
                </div>
                <Button variant="ghost" size="sm" aria-label="Delete payment" onClick={() => onDeletePayment(it.s)}><Trash2 className="h-4 w-4" /></Button>
              </div>
            ))}
          </CardContent></Card>
        </section>
      ))}
    </div>
  );
}

function SettingsTab({ group, nets }: { group: SplitGroupDto; nets: Array<{ net: string }> | undefined }) {
  const qc = useQueryClient();
  const [name, setName] = useState(group.name);
  const [addPerson, setAddPerson] = useState(false);
  const [removing, setRemoving] = useState<SplitGroupDto['members'][number] | null>(null);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const contacts = useQuery({ queryKey: SPLIT_KEYS.contacts, queryFn: splitApi.listContacts });
  const refresh = () => void qc.invalidateQueries({ queryKey: SPLIT_KEYS.all });
  const onErr = (fallback: string) => (err: unknown) => toast.error(splitErrorMessage(err, fallback));

  const update = useMutation({ mutationFn: (p: Parameters<typeof splitApi.updateGroup>[1]) => splitApi.updateGroup(group.id, p), onSuccess: () => { refresh(); toast.success('Saved'); }, onError: onErr('Could not save') });
  const add = useMutation({ mutationFn: (contactId: string) => splitApi.addMember(group.id, contactId), onSuccess: refresh, onError: onErr('Could not add') });
  const remove = useMutation({ mutationFn: (memberId: string) => splitApi.removeMember(group.id, memberId), onSuccess: () => { refresh(); toast.success('Removed'); }, onError: onErr('Could not remove') });

  const direct = group.type === 'DIRECT';
  const memberContactIds = new Set(group.members.filter((m) => !m.leftAt).map((m) => m.contactId));
  const addable = (contacts.data ?? []).filter((c) => !memberContactIds.has(c.id));

  return (
    <div className="space-y-4">
      {!direct && (
        <Card><CardContent className="p-4 space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="g-name">Group name</Label>
            <div className="flex gap-2">
              <Input id="g-name" value={name} onChange={(e) => setName(e.target.value)} />
              <Button variant="outline" onClick={() => update.mutate({ name: name.trim() })} disabled={!name.trim() || name.trim() === group.name}>Rename</Button>
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={group.simplifyDebts} onChange={(e) => update.mutate({ simplifyDebts: e.target.checked })} />
            Simplify debts (fewest payments to settle)
          </label>
          <p className="text-xs text-muted-foreground">Currency: {group.baseCurrency} (fixed once a group is created)</p>
        </CardContent></Card>
      )}
      <Card><CardContent className="p-0 divide-y">
        {group.members.filter((m) => !m.leftAt).map((m) => (
          <div key={m.id} className="flex items-center justify-between px-4 py-3">
            <span className="text-sm">{m.isMe ? `${m.displayName} (you)` : m.displayName}</span>
            {!direct && <Button variant="ghost" size="sm" aria-label={`Remove ${m.isMe ? 'yourself' : m.displayName}`} onClick={() => setRemoving(m)}>Remove</Button>}
          </div>
        ))}
      </CardContent></Card>
      {!direct && (
        <div className="flex flex-wrap items-center gap-2">
          <Select aria-label="Add a person" value="" onChange={(e) => e.target.value && add.mutate(e.target.value)} className="w-56">
            <option value="">Add someone…</option>
            {addable.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
          <Button variant="link" size="sm" onClick={() => setAddPerson(true)}>+ New person</Button>
          <Button variant="outline" size="sm" className="ml-auto" onClick={() => {
            const unsettled = (nets ?? []).some((n) => !toDecimal(n.net).isZero());
            if (!group.archivedAt && unsettled) setConfirmArchive(true);
            else update.mutate({ archived: !group.archivedAt });
          }}>
            {group.archivedAt ? 'Unarchive group' : 'Archive group'}
          </Button>
        </div>
      )}
      <ContactDialog open={addPerson} onOpenChange={setAddPerson} onSaved={(c) => add.mutate(c.id)} />
      <ConfirmDialog
        open={removing !== null} onOpenChange={(o) => !o && setRemoving(null)}
        title={removing?.isMe ? 'Leave group' : 'Remove member'}
        description={removing?.isMe
          ? "Leave this group? You'll lose access to its history unless someone adds you back."
          : `Remove ${removing?.displayName ?? ''} from the group?`}
        confirmLabel={removing?.isMe ? 'Leave' : 'Remove'} destructive
        onConfirm={() => removing && remove.mutate(removing.id)}
      />
      <ConfirmDialog
        open={confirmArchive} onOpenChange={setConfirmArchive}
        title="Archive this group"
        description="This group still has unsettled balances. Archive anyway?"
        confirmLabel="Archive" destructive
        onConfirm={() => update.mutate({ archived: true })}
      />
    </div>
  );
}

export function GroupPage() {
  const { id = '' } = useParams();
  const [adding, setAdding] = useState(false);
  const [settle, setSettle] = useState<{ from?: string; to?: string; amount?: string } | null>(null);
  const group = useQuery({ queryKey: SPLIT_KEYS.group(id), queryFn: () => splitApi.getGroup(id),
    retry: (count, err) => !isNotFound(err) && count < 2 });
  const expenses = useQuery({ queryKey: SPLIT_KEYS.expenses(id), queryFn: () => splitApi.listExpenses(id) });
  const balances = useQuery({ queryKey: SPLIT_KEYS.balances(id), queryFn: () => splitApi.balances(id) });
  const settlements = useQuery({ queryKey: SPLIT_KEYS.settlements(id), queryFn: () => splitApi.listSettlements(id) });
  const [deletingPayment, setDeletingPayment] = useState<SplitSettlementDto | null>(null);
  const qc = useQueryClient();
  const deletePayment = useMutation({
    mutationFn: (sid: string) => splitApi.deleteSettlement(sid),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: SPLIT_KEYS.all }); toast.success('Payment deleted'); },
    onError: (err) => toast.error(splitErrorMessage(err, 'Could not delete the payment')),
  });
  const activity = useQuery({ queryKey: SPLIT_KEYS.activity(id), queryFn: () => splitApi.activity(id) });

  if (group.isError) {
    return isNotFound(group.error)
      ? <p className="text-sm text-muted-foreground">This group doesn’t exist or you’re no longer in it. <Link className="underline" to="/split">Back to Split Expenses</Link></p>
      : <LoadError text="Couldn't load this group." onRetry={() => void group.refetch()} />;
  }
  if (!group.data) return <p className="text-sm text-muted-foreground">Loading…</p>;
  const g = group.data;

  return (
    <div className="space-y-5 pb-24">
      <Link to="/split" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" />Split Expenses</Link>
      <PageHeader
        eyebrow="Split Expenses"
        title={g.name}
        description={g.type === 'DIRECT' ? 'Your 1:1 expenses' : `${g.members.filter((m) => !m.leftAt).length} people · ${g.baseCurrency}`}
        actions={
          <>
            <Button variant="outline" onClick={() => setSettle({})}><HandCoins className="h-4 w-4 mr-1.5" />Settle up</Button>
            <Button onClick={() => setAdding(true)}><Plus className="h-4 w-4 mr-1.5" />Add expense</Button>
          </>
        }
      />
      <Card><CardContent className="p-4 flex items-center justify-between">
        <span className="text-sm text-muted-foreground">Your balance</span>
        <BalancePill net={g.myNet} currency={g.baseCurrency} phrases={{ owed: 'you are owed', owe: 'you owe' }} className="text-base" />
      </CardContent></Card>

      <Tabs defaultValue="expenses">
        <TabsList>
          <TabsTrigger value="expenses">Expenses</TabsTrigger>
          <TabsTrigger value="balances">Balances</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>
        <TabsContent value="expenses" className="pt-3"><ExpensesTab group={g} expenses={expenses.data ?? []} settlements={settlements.data ?? []} status={expenses.status} onRetry={() => void expenses.refetch()} onDeletePayment={setDeletingPayment} /></TabsContent>
        <TabsContent value="balances" className="pt-3 space-y-3">
          {balances.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
          {balances.isError && <LoadError text="Couldn't load balances." onRetry={() => void balances.refetch()} />}
          {balances.isSuccess && <>
          <Card><CardContent className="p-0 divide-y">
            {(balances.data?.nets ?? []).filter((n) => !toDecimal(n.net).isZero() || !g.members.find((m) => m.id === n.memberId)?.leftAt).map((n) => (
              <div key={n.memberId} className="flex items-center justify-between px-4 py-3">
                <span className="text-sm">{memberName(g.members, n.memberId)}</span>
                <BalancePill net={n.net} currency={g.baseCurrency} phrases={g.members.find((m) => m.id === n.memberId)?.isMe ? { owed: 'you are owed', owe: 'you owe' } : { owed: 'is owed', owe: 'owes' }} />
              </div>
            ))}
          </CardContent></Card>
          <h3 className="text-sm font-semibold">{balances.data?.simplified ? 'Suggested payments' : 'Who owes whom'}</h3>
          {balances.data.transfers.length === 0 && <p className="text-sm text-muted-foreground">Everyone is settled up.</p>}
          <Card><CardContent className="p-0 divide-y">
            {(balances.data?.transfers ?? []).map((t, i) => (
              <div key={i} className="flex items-center justify-between gap-3 px-4 py-3">
                <span className="text-sm">{transferLabel(g.members, t, g.baseCurrency)}</span>
                <Button size="sm" variant="outline" onClick={() => setSettle({ from: t.fromMemberId, to: t.toMemberId, amount: t.amount })}>Settle</Button>
              </div>
            ))}
          </CardContent></Card>
          </>}
        </TabsContent>
        <TabsContent value="activity" className="pt-3">
          {activity.isError && <LoadError text="Couldn't load activity." onRetry={() => void activity.refetch()} />}
          <Card><CardContent className="p-0 divide-y">
            {(activity.data ?? []).map((a) => (
              <div key={a.id} className="px-4 py-3">
                <p className="text-sm">{activityText(a, g.members)}</p>
                <p className="text-xs text-muted-foreground">{formatDateTimeIST(a.createdAt)}</p>
              </div>
            ))}
          </CardContent></Card>
        </TabsContent>
        <TabsContent value="settings" className="pt-3"><SettingsTab group={g} nets={balances.data?.nets} /></TabsContent>
      </Tabs>

      <ConfirmDialog
        open={deletingPayment !== null} onOpenChange={(o) => !o && setDeletingPayment(null)}
        title="Delete payment" description="Delete this payment? Balances will change back."
        confirmLabel="Delete" destructive
        onConfirm={() => deletingPayment && deletePayment.mutate(deletingPayment.id)}
      />
      <AddExpenseDialog open={adding} onOpenChange={setAdding} group={g} />
      <SettleUpDialog open={settle !== null} onOpenChange={(o) => !o && setSettle(null)} group={g} {...(settle ?? {})} />
    </div>
  );
}
